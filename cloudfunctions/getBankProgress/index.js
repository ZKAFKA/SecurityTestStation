// cloudfunctions/getBankProgress/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { userId, bankId } = event

  if (!userId || !bankId) {
    return { success: false, message: '缺少 userId 或 bankId' }
  }

  try {
    // 1. 先从 question_bank 拿到题库的 name（chapters 里按 bankName 关联）
    let bankName = ''
    try {
      const bankRes = await db.collection('question_bank').doc(bankId).get()
      bankName = bankRes.data && (bankRes.data.name || bankRes.data.title) || ''
    } catch (e) {
      // 按 document _id 查不到，换 where 查
      const bankByName = await db.collection('question_bank')
        .where({ _id: bankId })
        .get()
      if (bankByName.data.length > 0) {
        bankName = bankByName.data[0].name || bankByName.data[0].title || ''
      }
    }

    // 2. 从 chapters 聚合总题数（优先按 bankName 查，兼容 bankId）
    let totalQuestions = 0
    const chaptersQuery = bankName
      ? { bankName: bankName }
      : { bankId: bankId }

    const chaptersRes = await db.collection('chapters')
      .where(chaptersQuery)
      .limit(1000)
      .get()

    for (let i = 0; i < chaptersRes.data.length; i++) {
      totalQuestions += chaptersRes.data[i].questionCount || 0
    }

    // 如果 chapters 还是没数据，兜底用 question_bank 自身的 questionCount
    if (totalQuestions === 0) {
      try {
        const bankRes2 = await db.collection('question_bank').doc(bankId).get()
        totalQuestions = (bankRes2.data && bankRes2.data.questionCount) || 0
      } catch (e) { /* 忽略 */ }
    }

    // 3. 从 user_chapter_progress 聚合已答题数（兼容 bankId 或 bankName）
    const progressWhere = bankName
      ? _.or([{ userId: userId, bankId: bankId }, { userId: userId, bankName: bankName }])
      : { userId: userId, bankId: bankId }

    const progressRes = await db.collection('user_chapter_progress')
      .where(progressWhere)
      .limit(1000)
      .get()

    let completedQuestions = 0
    let correctCount = 0
    for (let i = 0; i < progressRes.data.length; i++) {
      const p = progressRes.data[i]
      completedQuestions += p.completedQuestions || 0
      correctCount += p.correctCount || 0
    }

    // 3. 计算掌握度
    let mastery = 0
    if (totalQuestions > 0) {
      mastery = Math.round((completedQuestions / totalQuestions) * 100)
      if (mastery > 100) mastery = 100
    }

    return {
      success: true,
      data: {
        bankId: bankId,
        totalQuestions: totalQuestions,
        completedQuestions: completedQuestions,
        correctCount: correctCount,
        mastery: mastery
      }
    }
  } catch (err) {
    console.error('getBankProgress 出错:', err)
    return {
      success: false,
      message: '获取进度失败',
      error: err.message
    }
  }
}