// 云函数：根据题库名称获取章节
const cloud = require('wx-server-sdk')

cloud.init({
 env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
 try {
 const { bankName } = event
 
 console.log('根据题库名称获取章节，bankName:', bankName)
 
 // 根据题库名称从chapters集合获取章节
 const result = await db.collection('chapters').where({
 bankName: bankName
 }).orderBy('chapterOrder', 'asc').get()
 
 const chapters = result.data
 
 console.log('获取到章节数量:', chapters.length)
 
 // 格式化章节数据
 const formattedChapters = chapters.map(chapter => ({
 chapterId: chapter.chapterId,
 chapterName: chapter.chapterName,
 questionCount: chapter.questionCount || 0,
 bankId: chapter.bankId,
 bankName: chapter.bankName,
 chapterOrder: chapter.chapterOrder
 }))
 
 console.log('格式化后的章节数据:', formattedChapters)
 
 return {
 success: true,
 data: formattedChapters
 }
 
 } catch (error) {
 console.error('获取章节失败:', error)
 
 return {
 success: false,
 message: '获取章节失败',
 error: error.message
 }
 }
}
