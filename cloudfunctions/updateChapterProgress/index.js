// 云函数：更新章节进度
const cloud = require('wx-server-sdk')

cloud.init({
 env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 获取章节信息
async function getChapterInfo(chapterId) {
 try {
 const result = await db.collection('chapters').doc(chapterId).get()
 return result.data
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
 let newCompletedQuestions = updateData.completedQuestions !== undefined ? updateData.completedQuestions : currentProgress.completedQuestions
 let newCorrectCount = updateData.correctCount !== undefined ? updateData.correctCount : currentProgress.correctCount
 let newWrongCount = updateData.wrongCount !== undefined ? updateData.wrongCount : currentProgress.wrongCount
 let newProgress = Math.round(newCompletedQuestions / (currentProgress.totalQuestions || 1) * 100)
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
 const { userId, bankId, chapterId, progressData, completed, total, progress, batchUpdate = false } = event

 try {
 console.log('更新章节进度...')
 console.log('参数:', { userId, chapterId, batchUpdate, completed, total, progress })

 if (!userId || !chapterId) {
 return {
 success: false,
 message: '用户ID和章节ID不能为空'
 }
 }

 let result = null

 if (batchUpdate) {
 // 批量更新：根据答题记录计算进度
 result = await batchUpdateProgressFromAnswers(userId, bankId, chapterId)
 } else if (progressData || (completed !== undefined && total !== undefined)) {
 // 单独更新：使用提供的进度数据
 const actualProgressData = progressData || {
 completedQuestions: completed,
 totalQuestions: total,
 progress: progress
 };

 const hasRecord = await hasProgressRecord(userId, chapterId)

 if (hasRecord) {
 // 更新现有记录
 result = await updateProgressRecord(userId, chapterId, actualProgressData)
 } else {
 // 创建新记录
 const chapterInfo = await getChapterInfo(chapterId)
 const chapterName = chapterInfo ? chapterInfo.chapterName : ''
 const totalQuestions = chapterInfo ? chapterInfo.questionCount || total || 0 : total || 0
 result = await createProgressRecord(userId, bankId, chapterId, chapterName, totalQuestions)
 // 然后更新进度
 result = await updateProgressRecord(userId, chapterId, actualProgressData)
 }
 } else {
 return {
 success: false,
 message: '请提供进度数据或启用批量更新'
 }
 }

 if (!result) {
 return {
 success: false,
 message: '更新进度失败'
 }
 }

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
