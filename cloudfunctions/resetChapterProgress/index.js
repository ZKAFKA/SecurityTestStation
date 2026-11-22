// 云函数：重置章节做题记录
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const userId = event.userId || wxContext.OPENID
  const { bankId, chapterId } = event

  console.log('重置章节做题记录，userId:', userId, 'bankId:', bankId, 'chapterId:', chapterId)

  if (!userId || !chapterId) {
    return {
      success: false,
      message: '用户ID和章节ID不能为空'
    }
  }

  const results = {
    chapterProgress: { deleted: 0 },
    userAnswers: { deleted: 0 },
    wrongQuestions: { deleted: 0 },
    quizSessions: { deleted: 0 }
  }

  try {
    // 1. 删除章节进度记录
    const chapterProgressResult = await db.collection('user_chapter_progress')
      .where({ userId, chapterId })
      .remove()
    results.chapterProgress.deleted = chapterProgressResult.stats.removed || 0
    console.log('章节进度已删除:', results.chapterProgress.deleted)

    // 2. 删除该章节的答题记录
    const userAnswersResult = await db.collection('user_answers')
      .where({ userId, chapterId })
      .remove()
    results.userAnswers.deleted = userAnswersResult.stats.removed || 0
    console.log('答题记录已删除:', results.userAnswers.deleted)

    // 3. 删除该章节的错题记录
    const wrongQuestionsResult = await db.collection('user_wrong_questions')
      .where({ userId, chapterId })
      .remove()
    results.wrongQuestions.deleted = wrongQuestionsResult.stats.removed || 0
    console.log('错题记录已删除:', results.wrongQuestions.deleted)

    // 4. 删除该章节的答题会话
    const quizSessionsResult = await db.collection('user_quiz_sessions')
      .where({ userId, chapterId })
      .remove()
    results.quizSessions.deleted = quizSessionsResult.stats.removed || 0
    console.log('答题会话已删除:', results.quizSessions.deleted)

    return {
      success: true,
      message: '章节做题记录已清空',
      results
    }
  } catch (error) {
    console.error('重置章节做题记录失败:', error)
    return {
      success: false,
      message: '重置章节做题记录失败',
      error: error.message
    }
  }
}