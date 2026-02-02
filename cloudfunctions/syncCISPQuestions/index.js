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
    console.log('开始同步CISP题库数据...')
    
    // 1. 确保question_bank集合存在CISP题库记录
    let cispBankId = ''
    try {
      const bankResult = await db.collection('question_bank').where({
        name: 'CISP'
      }).get()
      
      if (bankResult.data.length > 0) {
        cispBankId = bankResult.data[0]._id
        console.log('CISP题库记录已存在，ID:', cispBankId)
      } else {
        // 创建CISP题库记录
        const addResult = await db.collection('question_bank').add({
          data: {
            name: 'CISP',
            description: 'CISP官方题库',
            path: '/CISP',
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        })
        cispBankId = addResult._id
        console.log('CISP题库记录创建成功，ID:', cispBankId)
      }
    } catch (error) {
      console.error('处理CISP题库记录失败:', error)
      throw error
    }
    
    // 2. 手动定义CISP的章节数据
    const cispChapters = [
      { chapterName: "第一节", chapterNumber: 1, path: "/CISP题库/第一节" },
      { chapterName: "第二节", chapterNumber: 2, path: "/CISP题库/第二节" },
      { chapterName: "第三节", chapterNumber: 3, path: "/CISP题库/第三节" },
      { chapterName: "第四节", chapterNumber: 4, path: "/CISP题库/第四节" },
      { chapterName: "第五节", chapterNumber: 5, path: "/CISP题库/第五节" }
    ]
    
    // 3. 生成章节数据
    const allChapters = []
    const bankName = "CISP"
    const bankId = cispBankId
    
    console.log(`为${bankName}题库创建章节，共${cispChapters.length}章`)
    
    for (let chapter of cispChapters) {
      const chapterOrder = chapter.chapterNumber
      const chapterId = `${bankName.toLowerCase()}_${chapterOrder}`
      
      allChapters.push({
        _id: `${bankName.toLowerCase()}_chapter_${chapterOrder}`,
        chapterId: chapterId,
        chapterName: chapter.chapterName,
        questionCount: 0,
        bankId: bankId,
        bankName: bankName,
        chapterOrder: chapterOrder,
        path: chapter.path
      })
    }
    
    console.log('动态生成了', allChapters.length, '个章节')
    
    // 4. 保存章节数据到数据库
    for (let chapter of allChapters) {
      // 创建一个不包含_id的新对象
      const { _id, ...chapterData } = chapter
      await db.collection('chapters').doc(_id).set({
        data: chapterData
      })
    }
    
    console.log('chapters集合数据同步成功，共', allChapters.length, '个章节')
    
    // 5. 同步quizStructure集合
    const quizStructureMap = {}
    
    // 按题库分组章节
    for (let chapter of allChapters) {
      if (!quizStructureMap[chapter.bankName]) {
        quizStructureMap[chapter.bankName] = {
          quizId: chapter.bankId,
          quizName: chapter.bankName,
          chapters: []
        }
      }
      quizStructureMap[chapter.bankName].chapters.push({
        chapterId: chapter.chapterId,
        chapterName: chapter.chapterName,
        chapterOrder: chapter.chapterOrder
      })
    }
    
    // 将map转换为数组并插入数据库
    const quizStructureEntries = Object.entries(quizStructureMap)
    
    for (let [bankName, structureData] of quizStructureEntries) {
      const _id = `${bankName.toLowerCase()}_structure`
      
      await db.collection('quizStructure').doc(_id).set({
        data: structureData
      })
      
      console.log('同步quizStructure:', bankName, '共', structureData.chapters.length, '个章节')
    }
    
    console.log('quizStructure集合数据同步成功，共', quizStructureEntries.length, '个题库结构')
    
    // 6. 从云存储Excel文件导入题目数据
    console.log('开始从云存储导入CISP题目数据...')
    
    const xlsx = require('xlsx')
    const fetch = require('node-fetch')
    
    let totalQuestionsImported = 0
    
    // 云开发环境ID（从fileID中提取）
    const envId = 'cloud1-2gdek8xx22a5db1a'
    
    for (let chapter of allChapters) {
      try {
        // 构造完整的cloud://格式的fileID
        const chapterNumber = chapter.chapterOrder
        const fileId = `cloud://${envId}.636c-${envId}-1395189804/CISP题库/${chapter.chapterName}/chapter${chapterNumber}.xlsx`
        
        console.log(`\n处理章节: ${chapter.chapterName}`)
        console.log('完整fileID:', fileId)
        
        // 从云存储获取文件的临时下载链接
        let tempFileURL = ''
        
        try {
          const fileResult = await cloud.getTempFileURL({
            fileList: [fileId]
          })
          
          console.log('getTempFileURL结果:', JSON.stringify(fileResult))
          
          if (!fileResult.fileList || fileResult.fileList.length === 0) {
            console.warn(`文件列表为空，跳过该章节: ${chapter.chapterName}`)
            continue
          }
          
          const fileInfo = fileResult.fileList[0]
          
          if (fileInfo.status !== 0) {
            console.warn(`文件状态异常，status: ${fileInfo.status}, errMsg: ${fileInfo.errMsg}，跳过该章节: ${chapter.chapterName}`)
            continue
          }
          
          if (!fileInfo.tempFileURL) {
            console.warn(`无法获取临时下载链接，跳过该章节: ${chapter.chapterName}`)
            continue
          }
          
          tempFileURL = fileInfo.tempFileURL
          console.log('获取临时下载链接成功:', tempFileURL)
          
        } catch (error) {
          console.error(`获取文件 ${fileId} 的临时下载链接失败:`, error.message)
          console.error('错误详情:', error)
          continue
        }
        
        // 使用node-fetch下载文件
        const response = await fetch(tempFileURL)
        const fileBuffer = await response.buffer()
        
        console.log('文件下载成功，大小:', fileBuffer.length, '字节')
        
        // 解析Excel文件
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = xlsx.utils.sheet_to_json(worksheet)
        
        console.log('Excel解析成功，工作表:', sheetName, '共', jsonData.length, '行数据')
        
        if (jsonData.length === 0) {
          console.warn('Excel文件中没有数据，跳过该章节')
          continue
        }
        
        // 输出第一行数据，查看实际列名
        const firstRow = jsonData[0]
        console.log('Excel第一行数据（列名）:', JSON.stringify(firstRow))
        console.log('实际列名:', Object.keys(firstRow).join(', '))
        
        // 验证数据格式（适配实际的列名）
        const requiredFields = ['题目内容', '选项A', '选项B', '选项C', '选项D', '正确答案', '题目解析']
        const missingFields = requiredFields.filter(field => !(field in firstRow))
        
        if (missingFields.length > 0) {
          console.warn(`数据格式不正确，缺少必要列：${missingFields.join(', ')}，跳过该章节`)
          continue
        }
        
        console.log('✓ 所有必要列都已找到')
        
        // 格式化题目数据并导入数据库
        let questionOrder = 1
        let chapterQuestions = 0
        
        for (let row of jsonData) {
          const questionContent = row['题目内容']
          
          if (!questionContent) {
            continue
          }
          
          let answerKey = row['正确答案']
          
          // 处理答案：去除空格，支持多种分隔符
          if (answerKey) {
            // 去除所有空格
            answerKey = answerKey.replace(/\s/g, '')
            
            // 支持多种分隔符：、，, / \ | 等
            const separators = ['、', '，', ',', '/', '\\', '|', ';', '；']
            let cleanedAnswer = answerKey
            
            // 替换所有分隔符为统一的逗号
            for (let sep of separators) {
              cleanedAnswer = cleanedAnswer.split(sep).join(',')
            }
            
            // 去除重复的逗号
            cleanedAnswer = cleanedAnswer.replace(/,+/g, ',')
            
            // 去除首尾逗号
            cleanedAnswer = cleanedAnswer.replace(/^,|,$/g, '')
            
            // 转换为大写
            cleanedAnswer = cleanedAnswer.toUpperCase()
            
            // 验证每个答案选项
            const answers = cleanedAnswer.split(',')
            const validAnswers = answers.filter(a => ['A', 'B', 'C', 'D'].includes(a))
            
            if (validAnswers.length === 0) {
              console.warn(`第${questionOrder}题答案格式不正确，跳过该题。原始答案: "${row['正确答案']}"，处理后: "${cleanedAnswer}"`)
              continue
            }
            
            // 保存处理后的答案
            answerKey = validAnswers.join(',')
          } else {
            console.warn(`第${questionOrder}题缺少答案，跳过该题`)
            continue
          }
          
          // 处理图片字段（保存为fileID格式）
          let imageUrl = ''
          if (row['有无图片'] && row['有无图片'] !== '无图片') {
            // 构造正确的fileID
            const correctFileId = `cloud://${envId}.636c-${envId}-1395189804/CISP题库/${chapter.chapterName}/${questionOrder}.png`
            imageUrl = correctFileId
            console.log('题目', questionOrder, '的图片URL:', imageUrl)
          }
          
          // 保存所有Excel列的数据
          const questionData = {
            questionId: `${chapter.chapterId}_q${questionOrder}`,
            chapterId: chapter.chapterId,
            quizId: chapter.bankId,
            questionContent: questionContent,
            options: [
              { key: 'A', value: row['选项A'] || '' },
              { key: 'B', value: row['选项B'] || '' },
              { key: 'C', value: row['选项C'] || '' },
              { key: 'D', value: row['选项D'] || '' }
            ],
            answer: answerKey,
            explanation: row['题目解析'] || '',
            imageUrl: imageUrl,
            questionOrder: questionOrder,
            // 保存所有原始列数据
            originalData: {
              questionId: row['题目ID'] || null,
              questionType: row['题型'] || '',
              hasImage: row['有无图片'] || '',
              // 保留所有其他列
              ...row
            },
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
          
          await db.collection('quizQuestions').doc(questionData.questionId).set({
            data: questionData
          })
          
          chapterQuestions++
          questionOrder++
        }
        
        // 更新章节的题目数量
        await db.collection('chapters').doc(chapter._id).update({
          data: {
            questionCount: chapterQuestions
          }
        })
        
        totalQuestionsImported += chapterQuestions
        console.log(`章节 ${chapter.chapterName} 导入完成，共 ${chapterQuestions} 道题目`)
        
      } catch (error) {
        console.error(`导入章节 ${chapter.chapterName} 的题目失败:`, error.message)
        console.error('错误详情:', error)
        continue
      }
    }
    
    console.log('\n所有CISP章节题目导入完成，共导入', totalQuestionsImported, '道题目')
    
    return {
      success: true,
      message: 'CISP题库同步成功',
      data: {
        bankId: cispBankId,
        chapterCount: allChapters.length,
        totalQuestions: totalQuestionsImported
      }
    }
    
  } catch (error) {
    console.error('CISP题库同步失败:', error)
    
    return {
      success: false,
      message: 'CISP题库同步失败',
      error: error.message
    }
  }
}