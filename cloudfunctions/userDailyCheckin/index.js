// 云函数：用户每日打卡
// 口径：用户当天（UTC+8 自然日）进入小程序即打卡，无需做题；user_checkins 每人每天仅一条记录
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const DAY_MS = 86400000

// 时间戳 → UTC+8 自然日 key（YYYY-MM-DD）
function getDateKey(ts) {
  return new Date(ts + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

function parseTs(v) {
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Date.parse(v)
  return NaN
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

// 首次使用打卡功能：将历史答题日期迁移为打卡记录（只增不删，仅迁移一次）
async function migrateFromAnswers(userId, todayKey) {
  const answerDateSet = {}
  let skip = 0
  const pageSize = 100

  while (true) {
    const res = await db.collection('user_answers')
      .where({ userId: userId })
      .field({ answerTime: true })
      .skip(skip)
      .limit(pageSize)
      .get()

    const list = res.data || []
    if (list.length === 0) break

    for (let i = 0; i < list.length; i++) {
      const ts = parseTs(list[i].answerTime)
      if (!isNaN(ts)) answerDateSet[getDateKey(ts)] = true
    }

    if (list.length < pageSize) break
    skip += pageSize
  }

  const keys = Object.keys(answerDateSet)
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] === todayKey) continue
    await db.collection('user_checkins').add({
      data: {
        userId: userId,
        dateKey: keys[i],
        source: 'migrate',
        createTime: Date.now()
      }
    })
  }

  return keys.length
}

// 计算连续打卡天数：今天已打卡从今天起算；今天未打卡从昨天起算（白天不断卡）
function calcContinuousDays(dateSet, todayKey) {
  let anchorKey = todayKey
  if (!dateSet[todayKey]) {
    const yesterdayKey = getDateKey(Date.now() - DAY_MS)
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

// 一次性恢复：历史上 user_answers 被清空（如章节重置）但 user_wrong_questions 仍在时，
// 按错题记录把真实发生过的答错记录补回 user_answers。仅执行一次（users.answersRecoveredV1 标记）。
async function recoverAnswersFromWrong(userId) {
  // 1. 拉取全部错题记录
  const wrongRecords = []
  let skip = 0
  const pageSize = 100

  while (true) {
    const res = await db.collection('user_wrong_questions')
      .where({ userId: userId })
      .skip(skip)
      .limit(pageSize)
      .get()

    const list = res.data || []
    if (list.length === 0) break
    for (let i = 0; i < list.length; i++) wrongRecords.push(list[i])
    if (list.length < pageSize) break
    skip += pageSize
  }

  if (wrongRecords.length === 0) return 0

  // 2. 拉取已有答题记录的 questionId，已存在的不重复补
  const existIds = {}
  skip = 0
  while (true) {
    const res = await db.collection('user_answers')
      .where({ userId: userId })
      .field({ questionId: true })
      .skip(skip)
      .limit(pageSize)
      .get()

    const list = res.data || []
    if (list.length === 0) break
    for (let i = 0; i < list.length; i++) existIds[list[i].questionId] = true
    if (list.length < pageSize) break
    skip += pageSize
  }

  const missing = []
  for (let i = 0; i < wrongRecords.length; i++) {
    if (!existIds[wrongRecords[i].questionId]) missing.push(wrongRecords[i])
  }

  if (missing.length === 0) return 0

  // 3. 分批并发补写（每批20条，避免云函数超时）
  const now = Date.now()
  const CHUNK = 20
  for (let i = 0; i < missing.length; i += CHUNK) {
    const batch = missing.slice(i, i + CHUNK)
    await Promise.all(batch.map(function (r) {
      const ts = parseTs(r.lastWrongTime)
      const answerTime = !isNaN(ts) ? ts : now
      return db.collection('user_answers').add({
        data: {
          userId: userId,
          questionId: r.questionId,
          bankId: r.bankId || '',
          chapterId: r.chapterId || '',
          userAnswer: r.userAnswer || [],
          correctAnswer: r.correctAnswer || [],
          isCorrect: false,
          answerTime: answerTime,
          spendTime: r.spendTime || 0,
          recovered: true,
          history: [{
            userAnswer: r.userAnswer || [],
            isCorrect: false,
            answerTime: answerTime,
            spendTime: r.spendTime || 0
          }]
        }
      })
    }))
  }

  return missing.length
}

// 云函数入口
// event: { userId }
exports.main = async (event, context) => {
  const userId = event.userId

  if (!userId) {
    return { success: false, message: '用户ID不能为空' }
  }

  try {
    const now = Date.now()
    const todayKey = getDateKey(now)
    let isNewCheckin = false

    // 查询今日是否已打卡
    const todayResult = await db.collection('user_checkins')
      .where({ userId: userId, dateKey: todayKey })
      .limit(1)
      .get()

    if (todayResult.data.length === 0) {
      // 首次使用：迁移历史答题日期
      const countResult = await db.collection('user_checkins')
        .where({ userId: userId })
        .count()
      if (countResult.total === 0) {
        const migrated = await migrateFromAnswers(userId, todayKey)
        console.log('历史答题日期已迁移为打卡记录:', migrated)
      }

      // 写入今日打卡
      await db.collection('user_checkins').add({
        data: {
          userId: userId,
          dateKey: todayKey,
          source: 'daily',
          createTime: now
        }
      })
      isNewCheckin = true
    }

    // 一次性恢复丢失的答题记录（user_answers 被清空但错题仍在）
    let recoveredCount = 0
    let needRecoverFlag = false
    const userDoc = await db.collection('users').doc(userId).get()
    if (!userDoc.data.answersRecoveredV1) {
      recoveredCount = await recoverAnswersFromWrong(userId)
      needRecoverFlag = true
      console.log('已从错题记录恢复答题记录:', recoveredCount)
    }

    // 重新统计累计/连续打卡并回写 users 表
    const dateSet = await getCheckinDateSet(userId)
    const totalCheckinDays = Object.keys(dateSet).length
    const continuousCheckinDays = calcContinuousDays(dateSet, todayKey)

    const usersUpdateData = {
      totalCheckinDays: totalCheckinDays,
      continuousCheckinDays: continuousCheckinDays,
      checkinDays: continuousCheckinDays,
      lastCheckinTime: now
    }
    if (needRecoverFlag) usersUpdateData.answersRecoveredV1 = true

    await db.collection('users').doc(userId).update({
      data: usersUpdateData
    })

    return {
      success: true,
      data: {
        dateKey: todayKey,
        isNewCheckin: isNewCheckin,
        totalCheckinDays: totalCheckinDays,
        continuousCheckinDays: continuousCheckinDays,
        recoveredAnswers: recoveredCount
      },
      message: isNewCheckin ? '打卡成功' : '今日已打卡'
    }
  } catch (error) {
    console.error('每日打卡失败:', error)
    return {
      success: false,
      message: '每日打卡失败',
      error: error.message
    }
  }
}
