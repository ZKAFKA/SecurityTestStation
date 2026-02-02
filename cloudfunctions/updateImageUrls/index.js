const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    console.log('开始更新图片URL...')
    
    // 获取所有题目
    const quizQuestionsResult = await db.collection('quizQuestions').get()
    const questions = quizQuestionsResult.data
    
    console.log('共获取到', questions.length, '道题目')
    
    let updatedCount = 0
    let skippedCount = 0
    
    // 云开发环境ID
    const envId = 'cloud1-2gdek8xx22a5db1a'
    
    for (let question of questions) {
      try {
        // 检查是否有图片
        if (!question.imageUrl || question.imageUrl === '' || question.imageUrl === '无图片') {
          skippedCount++
          continue
        }
        
        // 检查当前imageUrl是否已经是正确的cloud://格式
        if (question.imageUrl.startsWith('cloud://')) {
          console.log('题目', question.questionId, '的imageUrl已经是正确格式，跳过')
          skippedCount++
          continue
        }
        
        // 解析章节信息
        const chapterIdParts = question.chapterId.split('_')
        if (chapterIdParts.length < 2) {
          console.log('题目', question.questionId, '的chapterId格式不正确，跳过')
          skippedCount++
          continue
        }
        
        const chapterNumber = parseInt(chapterIdParts[1])
        if (isNaN(chapterNumber)) {
          console.log('题目', question.questionId, '的章节号解析失败，跳过')
          skippedCount++
          continue
        }
        
        // 解析题目序号
        const questionIdParts = question.questionId.split('_q')
        if (questionIdParts.length < 2) {
          console.log('题目', question.questionId, '的questionId格式不正确，跳过')
          skippedCount++
          continue
        }
        
        const questionNumber = parseInt(questionIdParts[1])
        if (isNaN(questionNumber)) {
          console.log('题目', question.questionId, '的题目序号解析失败，跳过')
          skippedCount++
          continue
        }
        
        // 构造章节名称
        const chapterName = `第${chapterNumber}章 ${getChapterTitle(chapterNumber)}`
        
        // 构造正确的fileID
        const correctFileId = `cloud://${envId}.636c-${envId}-1395189804/CISSP题库/${chapterName}/${questionNumber}.png`
        
        console.log('更新题目', question.questionId, '的imageUrl:')
        console.log('旧值:', question.imageUrl)
        console.log('新值:', correctFileId)
        
        // 更新数据库
        await db.collection('quizQuestions').doc(question.questionId).update({
          data: {
            imageUrl: correctFileId,
            updatedAt: db.serverDate()
          }
        })
        
        updatedCount++
        console.log('更新成功')
        
      } catch (error) {
        console.error('更新题目', question.questionId, '的imageUrl失败:', error.message)
        skippedCount++
        continue
      }
    }
    
    console.log('\n图片URL更新完成:')
    console.log('更新成功:', updatedCount, '道题目')
    console.log('跳过:', skippedCount, '道题目')
    console.log('总计:', questions.length, '道题目')
    
    return {
      success: true,
      message: '图片URL更新完成',
      data: {
        totalQuestions: questions.length,
        updatedCount: updatedCount,
        skippedCount: skippedCount
      }
    }
    
  } catch (error) {
    console.error('更新图片URL失败:', error)
    
    return {
      success: false,
      message: '更新图片URL失败',
      error: error.message
    }
  }
}

// 获取章节标题
function getChapterTitle(chapterNumber) {
  const chapterTitles = {
    1: '安全与风险管理',
    2: '资产安全',
    3: '安全架构和工程',
    4: '通信和网络安全',
    5: '身份和访问管理',
    6: '安全评估与测试',
    7: '安全运营',
    8: '软件开发安全'
  }
  
  return chapterTitles[chapterNumber] || ''
}
