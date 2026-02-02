// 云函数：获取用户OpenID
const cloud = require('wx-server-sdk')

cloud.init({
 env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
 const wxContext = cloud.getWXContext()

 try {
 console.log('获取OpenID成功:', wxContext.OPENID)

 return {
 success: true,
 openid: wxContext.OPENID,
 appid: wxContext.APPID,
 unionid: wxContext.UNIONID
 }
 } catch (error) {
 console.error('获取OpenID失败:', error)
 return {
 success: false,
 message: '获取OpenID失败',
 error: error.message
 }
 }
}
