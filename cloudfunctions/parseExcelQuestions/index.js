// 云函数：解析Excel题目文件并导入数据库
const cloud = require('wx-server-sdk')
const xlsx = require('xlsx')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    const { chapterId, fileId, parseOnly } = event
    
    console.log('开始解析Excel文件，章节ID:', chapterId, '文件ID:', fileId)
    console.log('解析模式:', parseOnly ? '纯解析' : '解析并导入')
    
    if (!fileId) {
      return {
        success: false,
        message: '缺少必要参数：fileId'
      }
    }
    
    // 1. 判断fileId是cloud://路径还是直接的HTTPS链接
    let tempFileURL = ''
    
    if (fileId.startsWith('cloud://')) {
      // 云存储路径，需要获取临时下载链接
      const fileResult = await cloud.getTempFileURL({
        fileList: [fileId]
      })
      
      if (!fileResult.fileList || fileResult.fileList.length === 0 || !fileResult.fileList[0].tempFileURL) {
        return {
          success: false,
          message: '无法获取文件的临时下载链接',
          error: '文件不存在或无权限访问',
          fileInfo: fileResult.fileList ? fileResult.fileList[0] : null
        }
      }
      
      tempFileURL = fileResult.fileList[0].tempFileURL
      console.log('从云存储获取临时下载链接成功:', tempFileURL)
    } else if (fileId.startsWith('http://') || fileId.startsWith('https://')) {
      // 直接使用HTTPS链接
      tempFileURL = fileId
      console.log('直接使用HTTPS链接:', tempFileURL)
    } else {
      // 相对路径，尝试添加cloud://前缀
      try {
        const fileResult = await cloud.getTempFileURL({
          fileList: [fileId]
        })
        
        if (fileResult.fileList && fileResult.fileList.length > 0 && fileResult.fileList[0].tempFileURL) {
          tempFileURL = fileResult.fileList[0].tempFileURL
          console.log('从相对路径获取临时下载链接成功:', tempFileURL)
        } else {
          return {
            success: false,
            message: '无法获取文件的临时下载链接',
            error: '文件路径格式不正确或文件不存在',
            filePath: fileId
          }
        }
      } catch (error) {
        return {
          success: false,
          message: '文件路径格式不正确',
          error: error.message,
          filePath: fileId
        }
      }
    }
    
    // 2. 使用node-fetch下载文件
    const fetch = require('node-fetch')
    const response = await fetch(tempFileURL)
    const fileBuffer = await response.buffer()
    
    console.log('文件下载成功，大小:', fileBuffer.length, '字节')
    
    // 3. 解析Excel文件
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' })
    
    // 3. 获取第一个工作表
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    
    console.log('解析工作表:', sheetName)
    
    // 4. 转换为JSON格式
    const jsonData = xlsx.utils.sheet_to_json(worksheet)
    
    console.log('Excel解析成功，共', jsonData.length, '行数据')
    
    // 5. 验证数据格式
    if (jsonData.length === 0) {
      return {
        success: false,
        message: 'Excel文件中没有数据'
      }
    }
    
    // 6. 检查数据格式是否正确
    const firstRow = jsonData[0]
    const requiredFields = ['题目', 'A', 'B', 'C', 'D', '答案', '解析']
    const missingFields = requiredFields.filter(field => !(field in firstRow))
    
    if (missingFields.length > 0) {
      return {
        success: false,
        message: `Excel文件格式不正确，缺少必要列：${missingFields.join(', ')}`
      }
    }
    
    // 7. 获取章节信息（仅在非纯解析模式且需要导入时）
    let chapter = null
    let quizId = null
    if (!parseOnly && chapterId) {
      const chapterResult = await db.collection('chapters').where({
        chapterId: chapterId
      }).get()
      
      if (chapterResult.data.length === 0) {
        return {
          success: false,
          message: `未找到章节ID为 ${chapterId} 的章节`
        }
      }
      
      chapter = chapterResult.data[0]
      quizId = chapter.bankId
      
      console.log('获取章节信息成功，题库ID:', quizId)
    }
    
    // 8. 转换数据格式
    const formattedQuestions = []
    let questionOrder = 1
    
    for (let row of jsonData) {
      // 跳过空行
      if (!row['题目']) {
        continue
      }
      
      // 检查答案是否在选项中
      const answerKey = row['答案']
      if (!['A', 'B', 'C', 'D'].includes(answerKey)) {
        console.warn(`第${questionOrder}题答案格式不正确，跳过该题:`, row)
        continue
      }
      
      const question = {
        questionId: chapterId ? `${chapterId}_q${questionOrder}` : `q${questionOrder}`,
        questionContent: row['题目'],
        options: [
          { key: 'A', value: row['A'] || '' },
          { key: 'B', value: row['B'] || '' },
          { key: 'C', value: row['C'] || '' },
          { key: 'D', value: row['D'] || '' }
        ],
        answer: answerKey,
        explanation: row['解析'] || '',
        imageUrl: row['图片'] || '',
        questionOrder: questionOrder,
        chapterId: chapterId || '',
        quizId: quizId || '',
        type: answerKey.includes(',') ? 'multiple' : 'single'
      }
      
      formattedQuestions.push(question)
      questionOrder++
    }
    
    console.log('数据转换完成，共', formattedQuestions.length, '道题目')
    
    if (formattedQuestions.length === 0) {
      return {
        success: false,
        message: 'Excel文件中没有有效的题目数据'
      }
    }
    
    // 9. 如果是纯解析模式，直接返回数据
    if (parseOnly) {
      return {
        success: true,
        message: '解析成功',
        data: {
          total: jsonData.length,
          valid: formattedQuestions.length,
          questions: formattedQuestions
        },
        sheetName: sheetName
      }
    }
    
    // 10. 检查是否有chapterId用于导入
    if (!chapterId) {
      return {
        success: false,
        message: '导入数据库需要chapterId参数'
      }
    }
    
    // 11. 批量导入到数据库
    const batchSize = 50
    let successCount = 0
    let failCount = 0
    
    for (let i = 0; i < formattedQuestions.length; i += batchSize) {
      const batch = formattedQuestions.slice(i, i + batchSize)
      const tasks = []
      
      for (let question of batch) {
        const task = db.collection('quizQuestions').doc(question.questionId).set({
          data: {
            ...question,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        })
        
        tasks.push(task)
      }
      
      const results = await Promise.allSettled(tasks)
      
      for (let result of results) {
        if (result.status === 'fulfilled') {
          successCount++
        } else {
          failCount++
          console.error('导入失败:', result.reason)
        }
      }
      
      console.log(`批次 ${Math.floor(i / batchSize) + 1} 完成: ${tasks.length} 条数据`)
    }
    
    console.log('题目批量导入成功，成功:', successCount, '失败:', failCount)
    
    // 12. 更新章节的题目数量
    await db.collection('chapters').where({
      chapterId: chapterId
    }).update({
      data: {
        questionCount: successCount
      }
    })
    
    console.log('章节题目数量更新成功')
    
    return {
      success: true,
      message: `成功解析并导入 ${successCount} 道题目`,
      data: {
        chapterId: chapterId,
        chapterName: chapter.chapterName,
        importedCount: successCount,
        failCount: failCount,
        totalRows: jsonData.length
      }
    }
    
  } catch (error) {
    console.error('解析Excel文件失败:', error)
    
    return {
      success: false,
      message: '解析Excel文件失败',
      error: error.message,
      stack: error.stack
    }
  }
}
