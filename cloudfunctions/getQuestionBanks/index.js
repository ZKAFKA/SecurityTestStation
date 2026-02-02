const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    console.log('开始获取题库数据')
    
    // 从question_bank集合读取所有题库数据，按order排序
    const result = await db.collection('question_bank')
      .orderBy('order', 'asc')
      .get()
    
    const questionBanks = result.data
    
    console.log('获取题库数据成功，共', questionBanks.length, '个题库')
    
    return {
      success: true,
      data: questionBanks,
      message: '题库数据获取成功'
    }
    
  } catch (error) {
    console.error('获取题库数据失败:', error)
    
    return {
      success: false,
      message: '获取题库数据失败',
      error: error.message
    }
  }
}
