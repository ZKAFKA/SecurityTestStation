// 云函数：考试目标的保存与读取（存于 users 集合的 examTarget 字段）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { action, userId, bankId, bankTitle, examDate } = event

  if (!userId) {
    return { success: false, message: '缺少 userId' }
  }

  try {
    // 保存考试目标
    if (action === 'save') {
      if (!bankId || !examDate) {
        return { success: false, message: '缺少 bankId 或 examDate' }
      }
      await db.collection('users').doc(userId).update({
        data: {
          examTarget: {
            bankId: bankId,
            bankTitle: bankTitle || '',
            examDate: examDate,
            updateTime: Date.now()
          }
        }
      })
      return { success: true, message: '保存成功' }
    }

    // 读取考试目标
    if (action === 'get') {
      const res = await db.collection('users').doc(userId).get()
      const user = res.data || {}
      return { success: true, data: user.examTarget || null }
    }

    return { success: false, message: '未知 action' }
  } catch (err) {
    console.error('examTarget 出错:', err)
    return { success: false, message: '操作失败', error: err.message }
  }
}