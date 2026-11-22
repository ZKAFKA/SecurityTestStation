// 云函数：根据用户在指定章节的最近答题记录，动态推算"下一题"位置
// 完全无状态计算，不需要单独存 currentQuestionIndex
// 输入：userId, bankId, chapterId
// 输出：{ currentQuestionIndex }（0-indexed，直接给 quiz.js 用）

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { userId, bankId, chapterId } = event
  try {
    if (!userId || !chapterId) {
      return { success: false, message: '缺少必要参数 userId / chapterId' }
    }

    // 1. 查该章节最近一条答题记录（按 answerTime desc）
    const latestAnswer = await db.collection('user_answers')
      .where(_.or([
        { userId, chapterId, source: _.exists(false) },
        { userId, chapterId, source: 'normal' }
      ]))
      .orderBy('answerTime', 'desc')
      .limit(1)
      .get()

    if (!latestAnswer.data || latestAnswer.data.length === 0) {
      // 该章节从未答过题 → 从第 1 题开始（0-indexed = 0）
      return { success: true, currentQuestionIndex: 0, note: 'no answer record' }
    }

    const questionId = latestAnswer.data[0].questionId || ''

    // 2. 从 questionId 里解析 questionOrder
    // 格式示例：cissp_3_q142 → questionOrder = 142
    const match = questionId.match(/q(\d+)$/)
    let nextOrder = 1
    if (match) {
      const lastOrder = parseInt(match[1], 10)
      nextOrder = lastOrder + 1 // 下一题
    }

    // 3. 验证下一题确实存在（保险，防止跨题库/脏数据）
    const validate = await db.collection('quizQuestions')
      .where({ chapterId, questionOrder: nextOrder })
      .limit(1)
      .get()

    if (!validate.data || validate.data.length === 0) {
      // 下一题不存在（最后一题已答 / questionId 格式异常）→ 找该章节第一个未答的题
      const [answersRes, questionsRes] = await Promise.all([
        db.collection('user_answers')
          .where(_.or([
            { userId, chapterId, source: _.exists(false) },
            { userId, chapterId, source: 'normal' }
          ]))
          .field({ questionId: true })
          .limit(1000)
          .get(),
        db.collection('quizQuestions')
          .where({ chapterId })
          .field({ questionOrder: true })
          .orderBy('questionOrder', 'asc')
          .limit(1000)
          .get()
      ])

      // 已答题号集合
      const answeredOrders = {}
      for (const ans of (answersRes.data || [])) {
        const m = (ans.questionId || '').match(/q(\d+)$/)
        if (m) {
          answeredOrders[parseInt(m[1], 10)] = true
        }
      }

      // 找第一个未答的题
      for (const q of (questionsRes.data || [])) {
        if (!answeredOrders[q.questionOrder]) {
          return { success: true, currentQuestionIndex: q.questionOrder - 1, note: 'first unanswered' }
        }
      }

      // 全部答完 → 回到第 1 题
      return { success: true, currentQuestionIndex: 0, note: 'chapter completed' }
    }

    // questionOrder 是 1-indexed，quiz.js 用 0-indexed，所以 -1
    return { success: true, currentQuestionIndex: nextOrder - 1, note: 'ok' }
  } catch (error) {
    console.error('getUserResumeIndex error:', error)
    return { success: false, message: error.message, currentQuestionIndex: 0 }
  }
}
