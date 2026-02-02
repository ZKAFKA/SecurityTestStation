// 云函数：获取用户收藏题目
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  // userId 应该从 event 参数中获取
  const userId = event.userId || wxContext.OPENID

  console.log('获取用户收藏题目，userId:', userId)
  console.log('OpenID:', wxContext.OPENID)
  console.log('event 参数:', event)

  try {
    // 获取用户的收藏记录（从 user_favorites 集合）
    const favoritesResult = await db.collection('user_favorites')
      .where({
        userId: userId
      })
      .get()

    console.log('获取用户收藏记录结果:', favoritesResult)

    if (!favoritesResult.data || favoritesResult.data.length === 0) {
      return {
        success: true,
        message: '暂无收藏记录',
        questions: []
      }
    }

    const favorites = favoritesResult.data
    
    if (favorites.length === 0) {
      return {
        success: true,
        message: '暂无收藏记录',
        questions: []
      }
    }

    const favoriteQuestionIds = favorites.map(item => item.questionId)
    console.log('收藏题目ID列表:', favoriteQuestionIds)

    // 批量获取收藏题目的详细信息
    const questions = []
    
    for (const questionId of favoriteQuestionIds) {
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

    console.log('获取到的收藏题目详情:', questions.length, '条')

    return {
      success: true,
      message: '获取收藏题目成功',
      questions: questions
    }

  } catch (error) {
    console.error('获取用户收藏题目失败:', error)
    return {
      success: false,
      message: '获取收藏题目失败',
      error: error.message
    }
  }
}
