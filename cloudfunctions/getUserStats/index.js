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
    
    // 并行获取今日刷题数和总刷题数
    const [todayCount, totalCount] = await Promise.all([
      getTodayAnswerCount(userId),
      getTotalAnswerCount(userId)
    ])
    
    return {
      success: true,
      data: {
        todayCount: todayCount,
        totalCount: totalCount
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
