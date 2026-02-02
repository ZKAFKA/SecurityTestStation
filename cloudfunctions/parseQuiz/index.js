const cloud = require('wx-server-sdk')
const xlsx = require('node-xlsx')
const fs = require('fs')
const path = require('path')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    const { chapterId, chapterName } = event
    
    // 1. 从云存储下载Excel文件
    const excelFileName = `chapter${chapterId}.xlsx`
    const excelFilePath = `CISSP题库/第${chapterId}章/${excelFileName}`
    
    console.log('开始下载Excel文件:', excelFilePath)
    
    // 下载文件到临时目录
    const fileContent = await cloud.downloadFile({
      fileID: excelFilePath
    })
    
    console.log('Excel文件下载成功')
    
    // 2. 解析Excel文件
    const workbook = xlsx.parse(fileContent.fileContent)
    const worksheet = workbook[0]
    const rows = worksheet.data
    
    console.log('Excel文件解析成功，共', rows.length, '行数据')
    
    // 3. 处理题目数据
    const questions = []
    let questionId = 1
    
    for (let i = 1; i < rows.length; i++) { // 从第二行开始，第一行是标题
      const row = rows[i]
      
      if (!row[0]) continue // 如果第一列为空，跳过该行
      
      const questionType = row[0]
      const questionContent = row[1]
      const optionA = row[2]
      const optionB = row[3]
      const optionC = row[4]
      const optionD = row[5]
      const correctAnswers = row[6]
      
      // 构建选项列表
      const options = []
      if (optionA) options.push({ id: 'A', content: optionA })
      if (optionB) options.push({ id: 'B', content: optionB })
      if (optionC) options.push({ id: 'C', content: optionC })
      if (optionD) options.push({ id: 'D', content: optionD })
      
      // 处理正确答案
      const correctAnswersList = []
      if (correctAnswers) {
        correctAnswersList = String(correctAnswers).split(',').map(ans => ans.trim())
      }
      
      // 构建题目对象
      const question = {
        _id: `${chapterId}_${questionId}`,
        chapterId: chapterId,
        chapterName: chapterName,
        questionId: questionId,
        type: questionType.includes('单选') ? 'single' : 'multiple',
        content: questionContent,
        options: options,
        correctAnswers: correctAnswersList,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      questions.push(question)
      questionId++
    }
    
    console.log('题目数据处理完成，共', questions.length, '道题目')
    
    // 4. 批量插入数据库
    if (questions.length > 0) {
      // 先删除该章节已有的题目
      await db.collection('questions').where({
        chapterId: chapterId
      }).remove()
      
      console.log('已删除该章节原有题目')
      
      // 批量插入新题目
      // 由于云开发数据库一次最多支持100条数据的批量操作，需要分批处理
      const batchSize = 100
      for (let i = 0; i < questions.length; i += batchSize) {
        const batchQuestions = questions.slice(i, i + batchSize)
        
        const addPromises = batchQuestions.map(question => {
          return db.collection('questions').add({
            data: question
          })
        })
        
        await Promise.all(addPromises)
      }
      
      console.log('题目数据批量插入数据库成功')
    }
    
    // 5. 更新章节信息
    await db.collection('chapters').doc(chapterId).set({
      data: {
        _id: chapterId,
        name: chapterName,
        questionCount: questions.length,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })
    
    console.log('章节信息更新成功')
    
    return {
      success: true,
      message: `成功解析并存储${questions.length}道题目`,
      data: {
        chapterId,
        chapterName,
        questionCount: questions.length
      }
    }
    
  } catch (error) {
    console.error('解析Excel文件时出错:', error)
    
    return {
      success: false,
      message: '解析Excel文件时出错',
      error: error.message
    }
  }
}
