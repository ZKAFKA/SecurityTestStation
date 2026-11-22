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
    const MAX_LIMIT = 100
    let allWrongQuestions = []
    let skip = 0

    while (true) {
      const batchResult = await db.collection('user_wrong_questions')
        .where({
          userId: userId
        })
        .skip(skip)
        .limit(MAX_LIMIT)
        .get()

      if (!batchResult.data || batchResult.data.length === 0) break

      allWrongQuestions = allWrongQuestions.concat(batchResult.data)
      skip += MAX_LIMIT
    }

    console.log('获取错题记录结果:', { total: allWrongQuestions.length })

    if (allWrongQuestions.length === 0) {
      return {
        success: true,
        message: '暂无错题记录',
        questions: []
      }
    }

    const wrongQuestionIds = allWrongQuestions.map(item => item.questionId)
    console.log('错题ID数量:', wrongQuestionIds.length)

    // 记录每条错题所属题库/章节，供前端答题时回传
    const wrongRecordMap = {}
    for (let i = 0; i < allWrongQuestions.length; i++) {
      const item = allWrongQuestions[i]
      wrongRecordMap[item.questionId] = item
    }

    const questions = []
    const BATCH_SIZE = 100

    for (let i = 0; i < wrongQuestionIds.length; i += BATCH_SIZE) {
      const batchIds = wrongQuestionIds.slice(i, i + BATCH_SIZE)
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

        // 优先用错题记录上的题库/章节，题目文档上的作为兜底
        const wrongRec = wrongRecordMap[question.questionId] || {}

        questions.push({
          ...question,
          bankId: wrongRec.bankId || question.bankId || '',
          chapterId: wrongRec.chapterId || question.chapterId || '',
          options: options,
          correctAnswers: correctAnswers,
          type: type
        })
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
