// 题库服务

/** 获取题库章节结构 */
export async function fetchQuizStructure(quizId) {
  try {
    // 调用云函数获取题库章节结构
    const result = await wx.cloud.callFunction({
      name: 'getQuizStructure',
      data: {
        quizId: quizId
      }
    })
    
    const chapters = result.result || []
    
    console.log('获取题库章节结构成功，共', chapters.length, '章')
    
    return chapters
    
  } catch (error) {
    console.error('获取题库章节结构失败:', error)
    
    return []
  }
}

/** 获取题目内容 */
export async function fetchQuizQuestions(quizId, chapterId) {
  try {
    // 调用云函数获取题目内容
    const result = await wx.cloud.callFunction({
      name: 'getQuizQuestions',
      data: {
        quizId: quizId,
        chapterId: chapterId
      }
    })
    
    const questions = result.result || []
    
    console.log('获取题目内容成功，共', questions.length, '题')
    
    return questions
    
  } catch (error) {
    console.error('获取题目内容失败:', error)
    
    return []
  }
}

/** 缓存题库数据 */
export function cacheQuizData(key, data) {
  try {
    wx.setStorageSync(key, data)
    
    console.log('缓存题库数据成功，key:', key)
  } catch (error) {
    console.error('缓存题库数据失败:', error)
  }
}

/** 获取缓存的题库数据 */
export function getCachedQuizData(key) {
  try {
    const data = wx.getStorageSync(key)
    
    console.log('获取缓存的题库数据成功，key:', key)
    
    return data
  } catch (error) {
    console.error('获取缓存的题库数据失败:', error)
    
    return null
  }
}

/** 清除缓存的题库数据 */
export function clearCachedQuizData(key) {
  try {
    wx.removeStorageSync(key)
    
    console.log('清除缓存的题库数据成功，key:', key)
  } catch (error) {
    console.error('清除缓存的题库数据失败:', error)
  }
}
