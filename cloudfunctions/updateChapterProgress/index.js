// 云函数：更新章节进度
const cloud = require('wx-server-sdk')

cloud.init({
 env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 获取章节信息（chapterId 是字段值，不是文档 _id，必须用 where 查询）
async function getChapterInfo(chapterId) {
 try {
 const result = await db.collection('chapters').where({ chapterId }).get()
 return result.data && result.data.length > 0 ? result.data[0] : null
 } catch (error) {
 console.error('获取章节信息失败:', error)
 return null
 }
}

// 检查是否已有进度记录
async function hasProgressRecord(userId, chapterId) {
 try {
 const result = await db.collection('user_chapter_progress')
 .where({
 userId,
 chapterId
 })
 .get()
 return result.data.length > 0
 } catch (error) {
 console.error('检查进度记录失败:', error)
 return false
 }
}

// 创建新的进度记录
async function createProgressRecord(userId, bankId, chapterId, chapterName, totalQuestions) {
 try {
 const now = Date.now()
 const progressData = {
 userId,
 bankId,
 chapterId,
 chapterName,
 totalQuestions,
 completedQuestions: 0,
 correctCount: 0,
 wrongCount: 0,
 accuracy: 0,
 progress: 0,
 lastStudyTime: now,
 isCompleted: false,
 studyTime: 0,
 completedQuestionsList: []
 }

 const result = await db.collection('user_chapter_progress').add({
 data: progressData
 })

 console.log('创建进度记录成功:', result._id)
 return { _id: result._id, ...progressData }
 } catch (error) {
 console.error('创建进度记录失败:', error)
 throw error
 }
}

// 更新进度记录
async function updateProgressRecord(userId, chapterId, updateData) {
 try {
 const result = await db.collection('user_chapter_progress')
 .where({
 userId,
 chapterId
 })
 .get()

 if (result.data.length > 0) {
 const recordId = result.data[0]._id
 const currentProgress = result.data[0]

 // 计算新的进度
 let newTotalQuestions = updateData.totalQuestions !== undefined ? updateData.totalQuestions : currentProgress.totalQuestions
 let newCompletedQuestions = updateData.completedQuestions !== undefined ? updateData.completedQuestions : currentProgress.completedQuestions
 let newCorrectCount = updateData.correctCount !== undefined ? updateData.correctCount : currentProgress.correctCount
 let newWrongCount = updateData.wrongCount !== undefined ? updateData.wrongCount : currentProgress.wrongCount
 let newProgress = newTotalQuestions > 0 ? Math.round(newCompletedQuestions / newTotalQuestions * 100) : 0
 let newIsCompleted = newProgress >= 100

 // 合并更新数据
 const mergedData = {
 ...updateData,
 lastStudyTime: Date.now(),
 progress: newProgress,
 isCompleted: newIsCompleted
 }

 await db.collection('user_chapter_progress').doc(recordId).update({
 data: mergedData
 })

 console.log('更新进度记录成功:', recordId)
 return { _id: recordId, ...currentProgress, ...mergedData }
 }

 return null
 } catch (error) {
 console.error('更新进度记录失败:', error)
 throw error
 }
}

// 批量更新进度（根据答题记录）
async function batchUpdateProgressFromAnswers(userId, bankId, chapterId) {
 try {
 // 获取该章节的所有答题记录
 const answersResult = await db.collection('user_answers')
 .where({
 userId,
 chapterId
 })
 .get()

 if (answersResult.data.length === 0) {
 console.log('该章节暂无答题记录')
 return null
 }

 // 统计答题情况
 const answers = answersResult.data
 const completedQuestions = answers.length
 const correctCount = answers.filter(a => a.isCorrect).length
 const wrongCount = answers.filter(a => !a.isCorrect).length
 const questionIds = answers.map(a => a.questionId)

 // 获取章节信息
 const chapterInfo = await getChapterInfo(chapterId)
 const totalQuestions = chapterInfo ? chapterInfo.questionCount || completedQuestions : completedQuestions

 // 更新进度记录
 const hasRecord = await hasProgressRecord(userId, chapterId)

 if (hasRecord) {
 // 更新现有记录
 return await updateProgressRecord(userId, chapterId, {
 completedQuestions,
 correctCount,
 wrongCount,
 accuracy: Math.round(correctCount / completedQuestions * 100),
 completedQuestionsList: questionIds
 })
 } else {
 // 创建新记录
 const chapterName = chapterInfo ? chapterInfo.chapterName : ''
 return await createProgressRecord(userId, bankId, chapterId, chapterName, totalQuestions)
 }
 } catch (error) {
 console.error('批量更新进度失败:', error)
 throw error
 }
}

// 云函数入口函数
exports.main = async (event, context) => {
 const wxContext = cloud.getWXContext()
 const { userId, bankId, chapterId } = event

 try {
 console.log('更新章节进度（权威数据源：user_answers count）...')
 console.log('参数:', { userId, chapterId, bankId })

 if (!userId || !chapterId) {
 return {
 success: false,
 message: '用户ID和章节ID不能为空'
 }
 }

 // 1. 先查该章节有多少条真实答题记录（权威数据源）
 const answersResult = await db.collection('user_answers')
 .where({ userId, chapterId })
 .get()

 const answers = answersResult.data || []
 const completedQuestions = answers.length
 const correctCount = answers.filter(function(a) { return a.isCorrect; }).length
 const wrongCount = answers.filter(function(a) { return !a.isCorrect; }).length
 const accuracy = completedQuestions > 0 ? Math.round(correctCount / completedQuestions * 100) : 0
 const questionIds = answers.map(function(a) { return a.questionId; })

 // 2. 查 chapters 表拿章节元数据
 const chapterInfo = await getChapterInfo(chapterId)
 const chapterName = chapterInfo ? chapterInfo.chapterName : ''
 const totalQuestions = chapterInfo ? chapterInfo.questionCount : completedQuestions
 const progress = totalQuestions > 0 ? Math.round(completedQuestions / totalQuestions * 100) : 0
 const isCompleted = progress >= 100

 // 3. 更新或创建 user_chapter_progress 记录（用真实 count 覆盖前端传值）
 const progressData = {
 bankId: bankId,
 chapterName: chapterName,
 totalQuestions: totalQuestions,
 completedQuestions: completedQuestions,
 correctCount: correctCount,
 wrongCount: wrongCount,
 accuracy: accuracy,
 progress: progress,
 isCompleted: isCompleted,
 completedQuestionsList: questionIds,
 lastStudyTime: Date.now()
 }

 const hasRecord = await hasProgressRecord(userId, chapterId)
 let result = null

 if (hasRecord) {
 result = await updateProgressRecord(userId, chapterId, progressData)
 } else {
 result = await createProgressRecord(userId, bankId, chapterId, chapterName || chapterId, totalQuestions)
 result = await updateProgressRecord(userId, chapterId, progressData)
 }

 console.log('权威进度计算结果:', { completed: completedQuestions, correct: correctCount, wrong: wrongCount, total: totalQuestions, progress: progress })

 return {
 success: true,
 message: '章节进度更新成功',
 data: result
 }
 } catch (error) {
 console.error('更新章节进度失败:', error)
 return {
 success: false,
 message: '更新章节进度失败',
 error: error.message
 }
 }
}
