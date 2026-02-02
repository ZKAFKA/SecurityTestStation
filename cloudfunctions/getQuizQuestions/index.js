// 云函数：获取题目内容
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const { chapterId } = event
    
    console.log('获取题目内容，chapterId:', chapterId)
    
    // 从数据库中获取题目内容
    const result = await db.collection('quizQuestions').where({
      chapterId: chapterId
    }).orderBy('questionOrder', 'asc').get()
    
    console.log('查询到题目数量:', result.data.length)
    
    const questions = result.data.map(question => {
      // 格式化选项为数组
      let options = []
      
      // 检查数据库中是否有options字段（格式：[{key: 'A', value: '内容'}, ...]）
      if (question.options && Array.isArray(question.options)) {
        options = question.options.map(opt => ({
          id: opt.key || opt.id,
          content: opt.value || opt.content
        }))
      } else if (question.optionA) {
        // 兼容旧格式：optionA/B/C/D字段
        if (question.optionA) options.push({ id: 'A', content: question.optionA })
        if (question.optionB) options.push({ id: 'B', content: question.optionB })
        if (question.optionC) options.push({ id: 'C', content: question.optionC })
        if (question.optionD) options.push({ id: 'D', content: question.optionD })
      }
      
      // 格式化正确答案为数组
      let correctAnswers = []
      if (question.answer) {
        correctAnswers = question.answer.split(',').map(a => a.trim())
      }
      
      const formattedQuestion = {
        _id: question._id,
        questionId: question.questionId,
        questionContent: question.questionContent,
        options: options,
        correctAnswers: correctAnswers,
        answer: question.answer,
        explanation: question.explanation,
        imageUrl: question.imageUrl,
        questionOrder: question.questionOrder,
        chapterId: question.chapterId,
        quizId: question.quizId,
        type: question.type || (question.answer.includes(',') ? 'multiple' : 'single')
      }
      
      // 调试日志
      console.log('格式化题目:', {
        questionId: formattedQuestion.questionId,
        questionContent: formattedQuestion.questionContent,
        optionsCount: formattedQuestion.options.length,
        options: formattedQuestion.options,
        correctAnswers: formattedQuestion.correctAnswers,
        type: formattedQuestion.type,
        databaseOptions: question.options,
        hasOptionA: !!question.optionA
      })
      
      return formattedQuestion
    })
    
    console.log('获取题目内容成功，共', questions.length, '题')
    
    return questions
    
  } catch (error) {
    console.error('获取题目内容失败:', error)
    
    return []
  }
}
