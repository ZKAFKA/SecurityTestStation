// 云函数：初始化用户数据库
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 创建单个集合（已存在则忽略）
function createCollection(name) {
  return db.createCollection(name).catch(function (err) {
    if (err.errMsg && err.errMsg.includes('exist')) {
      console.log(name + ' 集合已存在')
    } else {
      throw err
    }
  })
}

// 初始化用户数据库集合（并行创建，已存在的集合静默跳过）
async function initCollections() {
  try {
    await Promise.all([
      createCollection('users'),
      createCollection('user_answers'),
      createCollection('user_favorites'),
      createCollection('user_wrong_questions'),
      createCollection('user_chapter_progress'),
      createCollection('user_quiz_sessions'),
      createCollection('user_checkins')
    ])

    console.log('所有集合初始化成功')
    return true
  } catch (error) {
    console.error('初始化集合失败:', error)
    throw error
  }
}

// 创建或更新用户记录
async function createOrUpdateUser(openid, userInfo) {
  try {
    // 检查用户是否已存在
    const existResult = await db.collection('users')
      .where({ openid })
      .get()

    if (existResult.data.length > 0) {
      // 用户已存在，更新最后登录时间
      const userId = existResult.data[0]._id
      await db.collection('users').doc(userId).update({
        data: {
          lastLoginTime: Date.now(),
          ...userInfo
        }
      })
      console.log('用户已存在，更新登录时间')
      return existResult.data[0]
    } else {
      // 用户不存在，创建新用户
      const now = Date.now()
      const userData = {
        openid,
        nickName: userInfo.nickName || '用户' + openid.substring(0, 8),
        avatarUrl: userInfo.avatarUrl || 'cloud://cloud1-2gdek8xx22a5db1a.636c-cloud1-2gdek8xx22a5db1a-1395189804/assets/default_avatar.png',
        createTime: now,
        lastLoginTime: now,
        totalQuestions: 0,
        correctCount: 0,
        wrongCount: 0,
        accuracy: 0,
        studyTime: 0,
        bankStats: {},
        // 每日打卡提醒默认关闭；打卡天数默认0
        checkinReminder: false,
        totalCheckinDays: 0,
        continuousCheckinDays: 0,
        checkinDays: 0
      }

      const result = await db.collection('users').add({
        data: userData
      })

      console.log('新用户创建成功:', result._id)
      return { _id: result._id, ...userData }
    }
  } catch (error) {
    console.error('创建或更新用户失败:', error)
    throw error
  }
}

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { openid, userInfo } = event

  try {
    console.log('初始化用户数据库...')
    console.log('OpenID:', openid || wxContext.OPENID)
    console.log('UserInfo:', userInfo)

    // 使用传入的openid或从上下文获取
    const finalOpenid = openid || wxContext.OPENID

    // 1. 初始化集合
    await initCollections()

    // 2. 创建或更新用户
    const user = await createOrUpdateUser(finalOpenid, userInfo || {})

    return {
      success: true,
      message: '用户数据库初始化成功',
      data: {
        userId: user._id,
        user: user
      }
    }
  } catch (error) {
    console.error('初始化用户数据库失败:', error)
    return {
      success: false,
      message: '初始化用户数据库失败',
      error: error.message
    }
  }
}
