// 云函数：获取用户所有数据
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 获取用户基本信息
async function getUserInfo(userId) {
  try {
    const result = await db.collection('users').doc(userId).get()
    return result.data
  } catch (error) {
    console.error('获取用户信息失败:', error)
    return null
  }
}

// 获取用户收藏记录
async function getUserFavorites(userId) {
  try {
    const result = await db.collection('user_favorites')
      .where({ userId })
      .orderBy('favoriteTime', 'desc')
      .get()
    return result.data
  } catch (error) {
    console.error('获取收藏记录失败:', error)
    return []
  }
}

// 获取用户错题记录
async function getUserWrongQuestions(userId) {
  try {
    const result = await db.collection('user_wrong_questions')
      .where({ 
        userId,
        isMastered: false
      })
      .orderBy('lastWrongTime', 'desc')
      .get()
    return result.data
  } catch (error) {
    console.error('获取错题记录失败:', error)
    return []
  }
}

// 获取用户章节进度
async function getUserChapterProgress(userId) {
  try {
    const result = await db.collection('user_chapter_progress')
      .where({ userId })
      .orderBy('lastStudyTime', 'desc')
      .get()
    return result.data
  } catch (error) {
    console.error('获取章节进度失败:', error)
    return []
  }
}

// 获取用户当前会话
async function getUserCurrentSession(userId, chapterId = null) {
  try {
    let query = db.collection('user_quiz_sessions').where({ 
      userId,
      isActive: true
    })

    if (chapterId) {
      query = query.where({ chapterId })
    }

    const result = await query.get()
    return result.data.length > 0 ? result.data[0] : null
  } catch (error) {
    console.error('获取当前会话失败:', error)
    return null
  }
}

// 获取用户最近答题记录
async function getUserRecentAnswers(userId, limit = 50) {
  try {
    const result = await db.collection('user_answers')
      .where({ userId })
      .orderBy('answerTime', 'desc')
      .limit(limit)
      .get()
    return result.data
  } catch (error) {
    console.error('获取答题记录失败:', error)
    return []
  }
}

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { userId, includeAnswers = false, answersLimit = 50 } = event

  try {
    console.log('获取用户数据...')
    console.log('UserID:', userId)

    if (!userId) {
      return {
        success: false,
        message: '用户ID不能为空'
      }
    }

    // 并行获取所有数据
    const [user, favorites, wrongQuestions, chapterProgress, currentSession] = await Promise.all([
      getUserInfo(userId),
      getUserFavorites(userId),
      getUserWrongQuestions(userId),
      getUserChapterProgress(userId),
      getUserCurrentSession(userId)
    ])

    // 可选：获取答题记录
    let recentAnswers = []
    if (includeAnswers) {
      recentAnswers = await getUserRecentAnswers(userId, answersLimit)
    }

    if (!user) {
      return {
        success: false,
        message: '用户不存在'
      }
    }

    return {
      success: true,
      data: {
        user,
        favorites,
        wrongQuestions,
        chapterProgress,
        currentSession,
        recentAnswers,
        summary: {
          totalFavorites: favorites.length,
          totalWrongQuestions: wrongQuestions.length,
          totalChapters: chapterProgress.length,
          completedChapters: chapterProgress.filter(p => p.isCompleted).length
        }
      }
    }
  } catch (error) {
    console.error('获取用户数据失败:', error)
    return {
      success: false,
      message: '获取用户数据失败',
      error: error.message
    }
  }
}
