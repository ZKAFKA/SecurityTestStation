// 云函数：每日打卡提醒
// 1) 定时触发器每天 20:00（UTC+8）调用：向开启提醒的用户下发订阅消息
// 2) 小程序端手动调用 { action: 'setSetting', userId, enabled }：同步提醒开关
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 订阅消息模板ID（更换模板时需同步修改 app.js 中 reminderTmplId）
const TEMPLATE_ID = '0TqcyxWGWEF32VzGK4VB6UrEXgqkyyRMLBMcvRTiW78'

// 每次最多处理的用户数
const MAX_USERS = 1000
const PAGE_SIZE = 100

// thing 类型字段限 20 个字符
function trunc(str, max) {
  str = String(str)
  return str.length > max ? str.substring(0, max) : str
}

exports.main = async (event, context) => {
  // 小程序端：更新提醒开关
  if (event.action === 'setSetting') {
    return await setSetting(event)
  }
  // 定时触发器：发送每日提醒
  return await sendDailyReminders(event)
}

// 同步 users.checkinReminder
async function setSetting(event) {
  const userId = event.userId
  const enabled = !!event.enabled

  if (!userId) {
    return { success: false, message: '缺少userId' }
  }

  try {
    await db.collection('users').doc(userId).update({
      data: {
        checkinReminder: enabled,
        reminderUpdateTime: Date.now()
      }
    })
    return { success: true }
  } catch (err) {
    console.error('更新提醒开关失败:', err)
    return { success: false, error: err.message }
  }
}

// 查询开启提醒的用户，逐人发送订阅消息
async function sendDailyReminders(event) {
  const miniprogramState = event.miniprogramState || 'formal'
  let processed = 0
  let successCount = 0
  let failCount = 0
  const failures = []

  try {
    while (processed < MAX_USERS) {
      const res = await db.collection('users')
        .where({ checkinReminder: true })
        .skip(processed)
        .limit(PAGE_SIZE)
        .get()

      const users = res.data || []
      if (users.length === 0) break

      for (let i = 0; i < users.length; i++) {
        const user = users[i]

        if (!user.openid) {
          failCount++
          failures.push({ userId: user._id, reason: '缺少openid' })
          processed++
          continue
        }

        const totalCheckinDays = user.totalCheckinDays || 0

        // 模板字段：thing3 提醒人 / thing5 持续天数（持续打卡口径）/ thing2 温馨提醒
        const data = {
          thing3: { value: trunc('网络安全刷题站', 20) },
          thing5: { value: trunc('已持续打卡' + totalCheckinDays + '天', 20) },
          thing2: { value: trunc('快来刷题啦，距离拿证就差一点点了！', 20) }
        }

        try {
          const sendRes = await cloud.openapi.subscribeMessage.send({
            touser: user.openid,
            templateId: TEMPLATE_ID,
            page: 'pages/index/index',
            miniprogramState: miniprogramState,
            data: data
          })

          if (sendRes.errCode === 0) {
            successCount++
          } else {
            failCount++
            failures.push({
              userId: user._id,
              errCode: sendRes.errCode,
              errMsg: sendRes.errMsg
            })
          }
        } catch (sendErr) {
          failCount++
          failures.push({
            userId: user._id,
            errMsg: sendErr.errMsg || String(sendErr)
          })
        }

        processed++
      }

      if (users.length < PAGE_SIZE) break
    }

    return {
      success: true,
      total: processed,
      successCount: successCount,
      failCount: failCount,
      failures: failures
    }
  } catch (err) {
    console.error('发送每日提醒失败:', err)
    return {
      success: false,
      error: err.message,
      total: processed,
      successCount: successCount,
      failCount: failCount
    }
  }
}
