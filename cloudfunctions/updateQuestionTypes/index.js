// 云函数：为现有题目添加类型字段
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    console.log('开始为现有题目添加类型字段...')
    
    // 获取所有题目
    const result = await db.collection('quizQuestions').get()
    const questions = result.data
    
    console.log('查询到题目数量:', questions.length)
    
    let updatedCount = 0
    let skippedCount = 0
    
    // 批量更新题目
    const batch = db.batch()
    
    questions.forEach(question => {
      // 如果已经有 type 字段，跳过
      if (question.type) {
        skippedCount++
        return
      }
      
      // 根据答案判断类型
      const type = question.answer && question.answer.includes(',') ? 'multiple' : 'single'
      
      console.log(`更新题目 ${question.questionId}: 答案="${question.answer}" -> 类型=${type}`)
      
      batch.update({
        data: {
          type: type
        },
        where: {
          _id: question._id
        }
      })
      
      updatedCount++
    })
    
    // 执行批量更新
    if (updatedCount > 0) {
      await batch.commit()
      console.log('批量更新完成')
    }
    
    console.log(`处理完成：更新 ${updatedCount} 题，跳过 ${skippedCount} 题`)
    
    return {
      success: true,
      message: `成功为 ${updatedCount} 题添加类型字段，跳过 ${skippedCount} 题（已有类型）`,
      updated: updatedCount,
      skipped: skippedCount,
      total: questions.length
    }
    
  } catch (error) {
    console.error('添加类型字段失败:', error)
    
    return {
      success: false,
      message: '添加类型字段失败',
      error: error.message
    }
  }
}
