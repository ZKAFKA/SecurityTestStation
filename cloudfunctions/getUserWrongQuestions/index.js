// 云函数：获取用户错题记录
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  // userId 应该从 event 参数中获取（来自 quiz.js 传递的 app.globalData.userId）
  const userId = event.userId || wxContext.OPENID

  console.log('获取用户错题记录，userId:', userId)
  console.log('OpenID:', wxContext.OPENID)
  console.log('event 参数:', event)

  try {
    // 获取用户的错题记录
    const wrongQuestionsResult = await db.collection('user_wrong_questions')
      .where({
        userId: userId
      })
      .get()

    console.log('获取错题记录结果:', wrongQuestionsResult)

    if (!wrongQuestionsResult.data || wrongQuestionsResult.data.length === 0) {
      return {
        success: true,
        message: '暂无错题记录',
        questions: []
      }
    }

    const wrongQuestionIds = wrongQuestionsResult.data.map(item => item.questionId)
    console.log('错题ID列表:', wrongQuestionIds)

    // 批量获取错题的详细信息
    const questions = []
    
    for (const questionId of wrongQuestionIds) {
      try {
        const questionResult = await db.collection('quizQuestions')
          .where({
            questionId: questionId
          })
          .get()

        if (questionResult.data && questionResult.data.length > 0) {
          const question = questionResult.data[0]
          
          // 格式化选项为数组
          let options = []
          
          // 检查数据库中是否有options字段（格式：[{key: 'A', value: '内容'}, ...]）
          if (question.options && Array.isArray(question.options)) {
            options = question.options.map(opt => ({
              id: opt.key || opt.id,
              key: opt.key || opt.id,
              value: opt.value || opt.content
            }))
          } else if (question.optionA) {
            // 兼容旧格式：optionA/B/C/D字段
            if (question.optionA) options.push({ id: 'A', key: 'A', value: question.optionA })
            if (question.optionB) options.push({ id: 'B', key: 'B', value: question.optionB })
            if (question.optionC) options.push({ id: 'C', key: 'C', value: question.optionC })
            if (question.optionD) options.push({ id: 'D', key: 'D', value: question.optionD })
          }
          
          // 格式化正确答案为数组
          let correctAnswers = []
          if (question.answer) {
            correctAnswers = question.answer.split(',').map(a => a.trim())
          }
          
          // 确定题目类型
          const type = question.type || (question.answer && question.answer.includes(',') ? 'multiple' : 'single')
          
          const formattedQuestion = {
            ...question,
            options: options,
            correctAnswers: correctAnswers,
            type: type
          }
          
          questions.push(formattedQuestion)
        } else {
          console.warn('未找到题目:', questionId)
        }
      } catch (error) {
        console.error('获取题目详情失败:', questionId, error)
      }
    }

    console.log('获取到的错题详情:', questions.length, '条')

    return {
      success: true,
      message: '获取错题记录成功',
      questions: questions
    }

  } catch (error) {
    console.error('获取用户错题记录失败:', error)
    return {
      success: false,
      message: '获取错题记录失败',
      error: error.message
    }
  }
}
