const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    // 并行获取所有题库和所有章节数据（2次查询 vs N+1次）
    // chapters 查询显式设 limit(1000)，避免默认 100 条上限导致统计不全
    const [banksResult, chaptersResult] = await Promise.all([
      db.collection('question_bank').orderBy('order', 'asc').get(),
      db.collection('chapters').limit(1000).get()
    ])

    const questionBanks = banksResult.data
    const allChapters = chaptersResult.data

    // 按 bankName 分组统计章节
    const bankStatsMap = {}
    for (const chapter of allChapters) {
      const name = chapter.bankName
      if (!bankStatsMap[name]) {
        bankStatsMap[name] = { chapterCount: 0, questionCount: 0 }
      }
      bankStatsMap[name].chapterCount += 1
      bankStatsMap[name].questionCount += chapter.questionCount || 0
    }
    
    // 组装返回数据
    const bankList = questionBanks.map(bank => {
      const stats = bankStatsMap[bank.name] || { chapterCount: 0, questionCount: 0 }
      
      // 确定状态标签
      let statusLabel = '已更新'
      if (!bank.path || bank.path === '') {
        statusLabel = '敬请期待'
      } else if (bank.path.includes('CISP')) {
        statusLabel = '高押密'
      } else if (bank.path.includes('软考')) {
        statusLabel = '历年卷'
      }
      
      return {
        ...bank,
        questionCount: stats.questionCount,
        chapterCount: stats.chapterCount,
        statusLabel: statusLabel
      }
    })
    
    return {
      success: true,
      data: bankList,
      message: '题库数据获取成功'
    }
    
  } catch (error) {
    return {
      success: false,
      message: '获取题库数据失败',
      error: error.message
    }
  }
}
