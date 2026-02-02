// 云函数：登录
// 功能：获取微信用户信息并创建/更新用户记录
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { userInfo } = event
  
  try {
    console.log('登录请求，openid:', wxContext.OPENID, 'userInfo:', userInfo)
    
    // 检查用户是否已存在
    const userQuery = await db.collection('users')
      .where({
        openid: wxContext.OPENID
      })
      .get()
    
    if (userQuery.data.length > 0) {
      // 用户已存在，更新用户信息
      const existingUser = userQuery.data[0]
      
      const updateData = {
        lastLoginTime: db.serverDate()
      }
      
      // 如果有新的用户信息，更新
      if (userInfo) {
        updateData.nickName = userInfo.nickName
        updateData.avatarUrl = userInfo.avatarUrl
        updateData.gender = userInfo.gender || 0
        updateData.country = userInfo.country || ''
        updateData.province = userInfo.province || ''
        updateData.city = userInfo.city || ''
        updateData.language = userInfo.language || ''
      }
      
      await db.collection('users')
        .doc(existingUser._id)
        .update({
          data: updateData
        })
      
      // 获取更新后的用户信息
      const updatedUser = await db.collection('users')
        .doc(existingUser._id)
        .get()
      
      console.log('用户已更新:', updatedUser.data)
      
      return {
        success: true,
        message: '登录成功，用户信息已更新',
        data: {
          userId: existingUser._id,
          user: updatedUser.data
        }
      }
    } else {
      // 用户不存在，创建新用户
      if (!userInfo) {
        return {
          success: false,
          message: '需要用户信息才能创建新用户'
        }
      }
      
      const newUser = {
        openid: wxContext.OPENID,
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
        gender: userInfo.gender || 0,
        country: userInfo.country || '',
        province: userInfo.province || '',
        city: userInfo.city || '',
        language: userInfo.language || '',
        createTime: db.serverDate(),
        lastLoginTime: db.serverDate(),
        isActive: true
      }
      
      const createResult = await db.collection('users').add({
        data: newUser
      })
      
      // 获取完整的用户信息
      const createdUser = await db.collection('users')
        .doc(createResult._id)
        .get()
      
      console.log('新用户已创建:', createdUser.data)
      
      return {
        success: true,
        message: '新用户创建成功',
        data: {
          userId: createResult._id,
          user: createdUser.data
        }
      }
    }
    
  } catch (error) {
    console.error('登录失败:', error)
    return {
      success: false,
      message: '登录失败',
      error: error.message
    }
  }
}
