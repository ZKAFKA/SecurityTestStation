// 云函数：获取用户所有数据
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const MAX_LIMIT = 100

async function fetchAll(collectionName, queryBuilder) {
  let allData = []
  let skip = 0

  while (true) {
    const result = await queryBuilder(
      db.collection(collectionName).skip(skip).limit(MAX_LIMIT)
    ).get()

    if (!result.data || result.data.length === 0) break

    allData = allData.concat(result.data)
    skip += MAX_LIMIT
  }

  return allData
}

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
    return await fetchAll('user_favorites', query =>
      query.where({ userId }).orderBy('favoriteTime', 'desc')
    )
  } catch (error) {
    console.error('获取收藏记录失败:', error)
    return []
  }
}

// 获取用户错题记录
async function getUserWrongQuestions(userId) {
  try {
    return await fetchAll('user_wrong_questions', query =>
      query.where({ 
        userId,
        isMastered: false
      }).orderBy('lastWrongTime', 'desc')
    )
  } catch (error) {
    console.error('获取错题记录失败:', error)
    return []
  }
}

// 获取用户章节进度
async function getUserChapterProgress(userId) {
  try {
    return await fetchAll('user_chapter_progress', query =>
      query.where({ userId }).orderBy('lastStudyTime', 'desc')
    )
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

    // 按需字段：默认全取（向后兼容）；调用方可显式传 false 跳过不需要的全量分页集合
    const needFavorites = event.needFavorites !== false
    const needWrong = event.needWrong !== false
    const needChapterProgress = event.needChapterProgress !== false

    // 并行获取数据（favorites/wrong/chapterProgress 为全量分页扫描，按需跳过）
    const [user, favorites, wrongQuestions, chapterProgress, currentSession] = await Promise.all([
      getUserInfo(userId),
      needFavorites ? getUserFavorites(userId) : Promise.resolve([]),
      needWrong ? getUserWrongQuestions(userId) : Promise.resolve([]),
      needChapterProgress ? getUserChapterProgress(userId) : Promise.resolve([]),
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
