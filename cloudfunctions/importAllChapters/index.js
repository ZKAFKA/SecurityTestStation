// 云函数：批量导入所有章节的题目
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    const { bankName } = event
    
    console.log('开始批量导入章节题目，题库名称:', bankName || '全部')
    
    // 1. 查询chapters集合中的所有章节
    let query = db.collection('chapters')
    
    // 如果指定了题库名称，只导入该题库的章节
    if (bankName) {
      query = query.where({
        bankName: bankName
      })
    }
    
    const result = await query.get()
    const chapters = result.data
    
    console.log('查询到', chapters.length, '个章节')
    
    if (chapters.length === 0) {
      return {
        success: false,
        message: '未找到任何章节数据，请先运行initDatabase初始化章节'
      }
    }
    
    // 2. 按章节序号排序
    chapters.sort((a, b) => a.chapterOrder - b.chapterOrder)
    
    // 3. 遍历所有章节，导入题目
    const importResults = []
    let successCount = 0
    let failCount = 0
    let totalQuestions = 0
    
    for (let chapter of chapters) {
      console.log(`\n开始导入章节: ${chapter.chapterName} (ID: ${chapter.chapterId})`)
      
      try {
        // 构造Excel文件路径
        // 格式: /CISSP题库/第1章 安全与风险管理/chapter1.xlsx
        const chapterNumber = chapter.chapterOrder
        const excelFilePath = `${chapter.path}/chapter${chapterNumber}.xlsx`
        
        console.log('Excel文件路径:', excelFilePath)
        
        // 调用parseExcelQuestions云函数导入题目
        const importResult = await cloud.callFunction({
          name: 'parseExcelQuestions',
          data: {
            chapterId: chapter.chapterId,
            fileId: excelFilePath
          }
        })
        
        console.log('导入结果:', importResult.result)
        
        if (importResult.result && importResult.result.success) {
          // 导入成功
          const importedCount = importResult.result.data?.importedCount || 0
          successCount++
          totalQuestions += importedCount
          
          importResults.push({
            chapterId: chapter.chapterId,
            chapterName: chapter.chapterName,
            status: 'success',
            importedCount: importedCount,
            message: importResult.result.message
          })
          
          console.log(`✓ ${chapter.chapterName} 导入成功，共${importedCount}道题目`)
        } else {
          // 导入失败
          failCount++
          
          importResults.push({
            chapterId: chapter.chapterId,
            chapterName: chapter.chapterName,
            status: 'fail',
            importedCount: 0,
            message: importResult.result?.message || '导入失败'
          })
          
          console.log(`✗ ${chapter.chapterName} 导入失败:`, importResult.result?.message || '未知错误')
        }
        
      } catch (error) {
        // 发生异常
        failCount++
        
        importResults.push({
          chapterId: chapter.chapterId,
          chapterName: chapter.chapterName,
          status: 'error',
          importedCount: 0,
          message: error.message
        })
        
        console.log(`✗ ${chapter.chapterName} 发生异常:`, error.message)
      }
    }
    
    // 4. 生成汇总报告
    console.log(`\n=================== 导入完成 ===================`)
    console.log(`总章节数: ${chapters.length}`)
    console.log(`成功: ${successCount} 个章节`)
    console.log(`失败: ${failCount} 个章节`)
    console.log(`总题目数: ${totalQuestions} 道`)
    console.log(`==============================================`)
    
    return {
      success: true,
      message: `批量导入完成，成功${successCount}个章节，失败${failCount}个章节，共导入${totalQuestions}道题目`,
      data: {
        summary: {
          totalChapters: chapters.length,
          successCount: successCount,
          failCount: failCount,
          totalQuestions: totalQuestions
        },
        details: importResults
      }
    }
    
  } catch (error) {
    console.error('批量导入章节题目失败:', error)
    
    return {
      success: false,
      message: '批量导入章节题目失败',
      error: error.message,
      stack: error.stack
    }
  }
}
