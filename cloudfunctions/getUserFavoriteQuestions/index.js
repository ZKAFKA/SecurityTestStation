// 云函数：获取用户收藏题目
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  // userId 应该从 event 参数中获取
  const userId = event.userId || wxContext.OPENID

  console.log('获取用户收藏题目，userId:', userId)
  console.log('OpenID:', wxContext.OPENID)
  console.log('event 参数:', event)

  try {
    const MAX_LIMIT = 100
    let allFavorites = []
    let skip = 0

    while (true) {
      const batchResult = await db.collection('user_favorites')
        .where({
          userId: userId
        })
        .skip(skip)
        .limit(MAX_LIMIT)
        .get()

      if (!batchResult.data || batchResult.data.length === 0) break

      allFavorites = allFavorites.concat(batchResult.data)
      skip += MAX_LIMIT
    }

    console.log('获取收藏记录结果:', { total: allFavorites.length })

    if (allFavorites.length === 0) {
      return {
        success: true,
        message: '暂无收藏记录',
        questions: []
      }
    }

    const favoriteQuestionIds = allFavorites.map(item => item.questionId)
    console.log('收藏题目ID数量:', favoriteQuestionIds.length)

    const questions = []
    const BATCH_SIZE = 100

    for (let i = 0; i < favoriteQuestionIds.length; i += BATCH_SIZE) {
      const batchIds = favoriteQuestionIds.slice(i, i + BATCH_SIZE)
      console.log('批量查询题目:', i + 1, '-', i + batchIds.length)

      const batchQuestionResult = await db.collection('quizQuestions')
        .where({
          questionId: _.in(batchIds)
        })
        .limit(BATCH_SIZE)
        .get()

      if (!batchQuestionResult.data || batchQuestionResult.data.length === 0) continue

      for (const question of batchQuestionResult.data) {
        let options = []

        if (question.options && Array.isArray(question.options)) {
          options = question.options.map(opt => ({
            id: opt.key || opt.id,
            key: opt.key || opt.id,
            value: opt.value || opt.content
          }))
        } else if (question.optionA) {
          if (question.optionA) options.push({ id: 'A', key: 'A', value: question.optionA })
          if (question.optionB) options.push({ id: 'B', key: 'B', value: question.optionB })
          if (question.optionC) options.push({ id: 'C', key: 'C', value: question.optionC })
          if (question.optionD) options.push({ id: 'D', key: 'D', value: question.optionD })
        }

        let correctAnswers = []
        if (question.answer) {
          correctAnswers = question.answer.split(',').map(a => a.trim())
        }

        const type = question.type || (question.answer && question.answer.includes(',') ? 'multiple' : 'single')

        questions.push({
          ...question,
          options: options,
          correctAnswers: correctAnswers,
          type: type
        })
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
