// 云函数：从错题本移除题目
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  // userId 应该从 event 参数中获取
  const userId = event.userId || wxContext.OPENID
  const { questionId } = event

  console.log('从错题本移除题目，userId:', userId, 'questionId:', questionId)
  console.log('OpenID:', wxContext.OPENID)
  console.log('event 参数:', event)

  if (!questionId) {
    return {
      success: false,
      message: '请提供题目ID'
    }
  }

  try {
    // 删除错题记录
    const result = await db.collection('user_wrong_questions')
      .where({
        userId: userId,
        questionId: questionId
      })
      .remove()

    console.log('删除错题记录结果:', result)

    if (result.stats.removed > 0) {
      return {
        success: true,
        message: '从错题本移除成功'
      }
    } else {
      return {
        success: false,
        message: '未找到该错题记录'
      }
    }

  } catch (error) {
    console.error('从错题本移除失败:', error)
    return {
      success: false,
      message: '从错题本移除失败',
      error: error.message
    }
  }
}
