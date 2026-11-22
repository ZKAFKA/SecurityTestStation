// 云函数：获取用户统计数据（今日刷题数和总刷题数）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 获取今日刷题数量
async function getTodayAnswerCount(userId) {
  try {
    // 获取今天的开始时间戳（00:00:00）
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayStartTime = todayStart.getTime()
    
    console.log('计算今日刷题数，userId:', userId, 'todayStartTime:', todayStartTime)
    
    // 查询今天的答题记录数量
    const result = await db.collection('user_answers')
      .where({
        userId: userId,
        answerTime: db.command.gte(todayStartTime)
      })
      .count()
    
    const todayCount = result.total
    console.log('今日刷题数:', todayCount)
    
    return todayCount
  } catch (error) {
    console.error('获取今日刷题数失败:', error)
    return 0
  }
}

// 获取总刷题数量
async function getTotalAnswerCount(userId) {
  try {
    console.log('计算总刷题数，userId:', userId)

    // 查询所有答题记录数量
    const result = await db.collection('user_answers')
      .where({
        userId: userId
      })
      .count()

    const totalCount = result.total
    console.log('总刷题数:', totalCount)

    return totalCount
  } catch (error) {
    console.error('获取总刷题数失败:', error)
    return 0
  }
}

// 获取答对的题数（按 user_answers 最新状态去重，每题一条记录）
async function getCorrectAnswerCount(userId) {
  try {
    const result = await db.collection('user_answers')
      .where({
        userId: userId,
        isCorrect: true
      })
      .count()

    console.log('答对题数:', result.total)
    return result.total
  } catch (error) {
    console.error('获取答对题数失败:', error)
    return 0
  }
}

// ==================== 打卡统计（口径：user_checkins，进入小程序即打卡，UTC+8 自然日） ====================
const DAY_MS = 86400000

// 时间戳 → UTC+8 自然日 key（YYYY-MM-DD）
function getDateKey(ts) {
  return new Date(ts + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

// 拉取用户全部打卡记录的日期 key 集合
async function getCheckinDateSet(userId) {
  const dateSet = {}
  let skip = 0
  const pageSize = 100

  while (true) {
    const res = await db.collection('user_checkins')
      .where({ userId: userId })
      .field({ dateKey: true })
      .skip(skip)
      .limit(pageSize)
      .get()

    const list = res.data || []
    if (list.length === 0) break

    for (let i = 0; i < list.length; i++) {
      if (list[i].dateKey) dateSet[list[i].dateKey] = true
    }

    if (list.length < pageSize) break
    skip += pageSize
  }

  return dateSet
}

// 计算连续打卡天数：今天已打卡从今天起算；今天未打卡从昨天起算（白天不断卡）
function calcContinuousDays(dateSet) {
  const now = Date.now()
  const todayKey = getDateKey(now)
  let anchorKey = todayKey

  if (!dateSet[todayKey]) {
    const yesterdayKey = getDateKey(now - DAY_MS)
    if (!dateSet[yesterdayKey]) return 0
    anchorKey = yesterdayKey
  }

  let days = 0
  let anchorTs = Date.parse(anchorKey + 'T00:00:00Z')
  while (dateSet[getDateKey(anchorTs)]) {
    days++
    anchorTs -= DAY_MS
  }
  return days
}

// 计算并回写打卡天数到 users 表
async function calcCheckinStats(userId) {
  const dateSet = await getCheckinDateSet(userId)
  const totalCheckinDays = Object.keys(dateSet).length
  const continuousCheckinDays = calcContinuousDays(dateSet)

  try {
    await db.collection('users').doc(userId).update({
      data: {
        totalCheckinDays: totalCheckinDays,
        continuousCheckinDays: continuousCheckinDays,
        // 兼容旧字段 checkinDays = 连续打卡
        checkinDays: continuousCheckinDays
      }
    })
  } catch (err) {
    console.warn('回写打卡天数失败:', err)
  }

  return { totalCheckinDays, continuousCheckinDays }
}

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { userId } = event

  console.log('获取用户统计数据，userId:', userId)

  try {
    if (!userId) {
      return {
        success: false,
        message: '用户ID不能为空'
      }
    }

    // 并行获取今日刷题数、总刷题数、答对题数（口径统一：user_answers 去重后的最新状态）
    const [todayCount, totalCount, correctCount] = await Promise.all([
      getTodayAnswerCount(userId),
      getTotalAnswerCount(userId),
      getCorrectAnswerCount(userId)
    ])

    // 打卡统计（累计/连续），并回写 users 表
    const checkin = await calcCheckinStats(userId)

    return {
      success: true,
      data: {
        todayCount: todayCount,
        totalCount: totalCount,
        correctCount: correctCount,
        totalCheckinDays: checkin.totalCheckinDays,
        continuousCheckinDays: checkin.continuousCheckinDays
      },
      message: '获取统计数据成功'
    }
  } catch (error) {
    console.error('获取用户统计数据失败:', error)
    return {
      success: false,
      message: '获取统计数据失败',
      error: error.message
    }
  }
}
