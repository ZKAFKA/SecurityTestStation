// 云函数：批量导入题目数据
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    const { questions } = event
    
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return {
        success: false,
        message: '没有提供有效的题目数据'
      }
    }
    
    console.log('开始批量导入题目，共', questions.length, '道题')
    
    // 批量插入题目数据
    const insertPromises = questions.map((question, index) => {
      // 生成题目ID
      const questionId = `${question.chapterId}_q${index + 1}`
      
      // 准备题目数据（不包含_id）
      const questionData = {
        questionId: questionId,
        questionContent: question.questionContent,
        options: question.options,
        answer: question.answer,
        explanation: question.explanation || '',
        imageUrl: question.imageUrl || '',
        questionOrder: index + 1,
        chapterId: question.chapterId,
        quizId: question.quizId
      }
      
      // 使用题目ID作为文档ID
      return db.collection('quizQuestions').doc(questionId).set({
        data: questionData
      })
    })
    
    // 等待所有插入完成
    await Promise.all(insertPromises)
    
    console.log('题目批量导入成功，共', questions.length, '道题')
    
    // 更新对应章节的题目数量
    const chapterQuestionCounts = {}
    questions.forEach(question => {
      if (!chapterQuestionCounts[question.chapterId]) {
        chapterQuestionCounts[question.chapterId] = 0
      }
      chapterQuestionCounts[question.chapterId]++
    })
    
    // 更新chapters集合中的questionCount
    for (let chapterId in chapterQuestionCounts) {
      await db.collection('chapters').where({
        chapterId: chapterId
      }).update({
        data: {
          questionCount: chapterQuestionCounts[chapterId]
        }
      })
    }
    
    console.log('章节题目数量更新成功')
    
    return {
      success: true,
      message: `成功导入 ${questions.length} 道题目`,
      data: {
        importedCount: questions.length,
        updatedChapters: Object.keys(chapterQuestionCounts)
      }
    }
    
  } catch (error) {
    console.error('批量导入题目失败:', error)
    
    return {
      success: false,
      message: '批量导入题目失败',
      error: error.message
    }
  }
}
