// 云函数：切换收藏状态
const cloud = require('wx-server-sdk')

cloud.init({
 env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 检查是否已收藏
async function isFavorited(userId, questionId) {
 try {
 const result = await db.collection('user_favorites')
 .where({
 userId,
 questionId
 })
 .get()
 return result.data.length > 0
 } catch (error) {
 console.error('检查收藏状态失败:', error)
 return false
 }
}

// 添加收藏
async function addFavorite(userId, questionId, bankId, chapterId, note = '') {
 try {
 const now = Date.now()
 const favoriteData = {
 userId,
 questionId,
 bankId,
 chapterId,
 favoriteTime: now,
 note
 }

 const result = await db.collection('user_favorites').add({
 data: favoriteData
 })

 console.log('收藏成功:', result._id)
 return { _id: result._id, ...favoriteData }
 } catch (error) {
 console.error('添加收藏失败:', error)
 throw error
 }
}

// 取消收藏
async function removeFavorite(userId, questionId) {
 try {
 const result = await db.collection('user_favorites')
 .where({
 userId,
 questionId
 })
 .get()

 if (result.data.length > 0) {
 const recordId = result.data[0]._id
 await db.collection('user_favorites').doc(recordId).remove()
 console.log('取消收藏成功:', recordId)
 return true
 }

 return false
 } catch (error) {
 console.error('取消收藏失败:', error)
 throw error
 }
}

// 更新收藏笔记
async function updateFavoriteNote(userId, questionId, note) {
 try {
 const result = await db.collection('user_favorites')
 .where({
 userId,
 questionId
 })
 .get()

 if (result.data.length > 0) {
 const recordId = result.data[0]._id
 await db.collection('user_favorites').doc(recordId).update({
 data: { note }
 })
 console.log('收藏笔记已更新:', recordId)
 return true
 }

 return false
 } catch (error) {
 console.error('更新收藏笔记失败:', error)
 throw error
 }
}

// 云函数入口函数
exports.main = async (event, context) => {
 const wxContext = cloud.getWXContext()
 const { userId, questionId, bankId, chapterId, note, action } = event

 try {
 console.log('切换收藏状态...')
 console.log('参数:', { userId, questionId, action })

 if (!userId || !questionId) {
 return {
 success: false,
 message: '用户ID和题目ID不能为空'
 }
 }

 // 检查当前收藏状态
 const favorited = await isFavorited(userId, questionId)

 // 如果指定了action，按action执行
 if (action === 'add') {
 if (favorited) {
 // 已收藏，如果有note则更新笔记
 if (note !== undefined) {
 await updateFavoriteNote(userId, questionId, note)
 return {
 success: true,
 isFavorite: true,
 message: '收藏笔记已更新',
 data: { note }
 }
 }
 return {
 success: true,
 isFavorite: true,
 message: '已收藏'
 }
 }
 // 未收藏，添加收藏
 const favoriteRecord = await addFavorite(userId, questionId, bankId, chapterId, note)
 return {
 success: true,
 isFavorite: true,
 message: '收藏成功',
 data: favoriteRecord
 }
 }

 if (action === 'remove') {
 if (!favorited) {
 return {
 success: true,
 isFavorite: false,
 message: '未收藏'
 }
 }
 // 已收藏，取消收藏
 await removeFavorite(userId, questionId)
 return {
 success: true,
 isFavorite: false,
 message: '取消收藏成功'
 }
 }

 // 如果没有指定action，自动切换
 if (favorited) {
 // 已收藏，取消收藏
 await removeFavorite(userId, questionId)
 return {
 success: true,
 isFavorite: false,
 message: '取消收藏成功'
 }
 } else {
 // 未收藏，添加收藏
 const favoriteRecord = await addFavorite(userId, questionId, bankId, chapterId, note)
 return {
 success: true,
 isFavorite: true,
 message: '收藏成功',
 data: favoriteRecord
 }
 }
 } catch (error) {
 console.error('切换收藏状态失败:', error)
 return {
 success: false,
 message: '切换收藏状态失败',
 error: error.message
 }
 }
}
