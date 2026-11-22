// 云函数：获取指定章节的全部答题记录
// 单一职责：userId + chapterId → user_answers[]
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const MAX_LIMIT = 100

exports.main = async (event, context) => {
  const { userId, chapterId } = event

  try {
    console.log('getChapterAnswers:', { userId, chapterId })

    if (!userId || !chapterId) {
      return { success: false, message: 'userId 和 chapterId 不能为空' }
    }

    // 分页拉取所有答题记录（limit 100 足够覆盖 100 题章节）
    let all = []
    let skip = 0
    while (true) {
      const r = await db.collection('user_answers')
        .where({ userId, chapterId })
        .orderBy('answerTime', 'asc')
        .skip(skip)
        .limit(MAX_LIMIT)
        .get()
      if (!r.data || r.data.length === 0) break
      all = all.concat(r.data)
      skip += MAX_LIMIT
    }

    console.log('getChapterAnswers: 返回', all.length, '条')
    return { success: true, data: all }
  } catch (error) {
    console.error('getChapterAnswers 失败:', error)
    return { success: false, message: error.message }
  }
}
