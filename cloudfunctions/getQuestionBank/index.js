// 云函数：获取题库信息
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const { bankId } = event
    
    console.log('获取题库信息，bankId:', bankId)
    
    // 从question_bank集合获取题库信息
    const result = await db.collection('question_bank').doc(bankId).get()
    
    const questionBank = result.data
    
    if (!questionBank) {
      console.log('题库不存在:', bankId)
      return {
        success: false,
        message: '题库不存在'
      }
    }
    
    console.log('获取题库信息成功:', questionBank.name)
    
    return {
      success: true,
      data: questionBank
    }
    
  } catch (error) {
    console.error('获取题库信息失败:', error)
    
    return {
      success: false,
      message: '获取题库信息失败',
      error: error.message
    }
  }
}
