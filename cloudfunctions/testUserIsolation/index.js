// 云函数：测试用户数据隔离
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 创建测试用户
async function createTestUser(userNumber) {
  try {
    const openid = `test_openid_${userNumber}`
    const userData = {
      _id: openid,
      openid: openid,
      nickName: `测试用户${userNumber}`,
      avatarUrl: `/images/avatar${userNumber}.png`,
      totalQuestions: 0,
      correctCount: 0,
      wrongCount: 0,
      createdAt: Date.now(),
      lastLoginTime: Date.now()
    }
    
    // 尝试更新或创建用户
    await db.collection('users').doc(openid).set({
      data: userData
    })
    
    console.log(`测试用户${userNumber}创建成功:`, openid)
    return openid
  } catch (error) {
    console.error(`创建测试用户${userNumber}失败:`, error)
    throw error
  }
}

// 为测试用户添加答题记录
async function addTestAnswers(userId, userNumber, questionCount = 5) {
  try {
    const answers = []
    for (let i = 1; i <= questionCount; i++) {
      const questionId = `question_${userNumber}_${i}`
      const isCorrect = i % 2 === 0 // 偶数题答对
      
      const answerData = {
        userId,
        questionId,
        bankId: 'test_bank',
        chapterId: 'test_chapter',
        userAnswer: isCorrect ? 'A' : 'B',
        correctAnswer: 'A',
        isCorrect,
        answerTime: Date.now() - (questionCount - i) * 1000,
        spendTime: 10000,
        history: [{
          userAnswer: isCorrect ? 'A' : 'B',
          isCorrect,
          answerTime: Date.now() - (questionCount - i) * 1000,
          spendTime: 10000
        }]
      }
      
      await db.collection('user_answers').add({
        data: answerData
      })
      
      answers.push({
        questionId,
        userAnswer: answerData.userAnswer,
        isCorrect
      })
      
      // 如果是错题，添加到错题本
      if (!isCorrect) {
        await db.collection('user_wrong_questions').add({
          data: {
            userId,
            questionId,
            bankId: 'test_bank',
            chapterId: 'test_chapter',
            wrongCount: 1,
            lastWrongTime: Date.now(),
            isMastered: false
          }
        })
      }
    }
    
    console.log(`为用户${userNumber}添加了${questionCount}条答题记录`)
    return answers
  } catch (error) {
    console.error(`为用户${userNumber}添加答题记录失败:`, error)
    throw error
  }
}

// 为测试用户添加收藏
async function addTestFavorites(userId, userNumber, favoriteCount = 3) {
  try {
    const favorites = []
    for (let i = 1; i <= favoriteCount; i++) {
      const questionId = `question_${userNumber}_${i}`
      
      await db.collection('user_favorites').add({
        data: {
          userId,
          questionId,
          bankId: 'test_bank',
          chapterId: 'test_chapter',
          favoriteTime: Date.now(),
          note: `收藏笔记${i}`
        }
      })
      
      favorites.push(questionId)
    }
    
    console.log(`为用户${userNumber}添加了${favoriteCount}条收藏`)
    return favorites
  } catch (error) {
    console.error(`为用户${userNumber}添加收藏失败:`, error)
    throw error
  }
}

// 验证用户数据隔离
async function verifyUserIsolation(userId1, userId2, userId3) {
  try {
    console.log('\n=== 开始验证用户数据隔离 ===')
    
    // 验证用户1只能看到自己的答题记录
    const user1Answers = await db.collection('user_answers')
      .where({ userId: userId1 })
      .get()
    
    const user1AnswersFromOther = await db.collection('user_answers')
      .where({ 
        userId: userId1,
        questionId: db.RegExp({
          regexp: 'question_2|question_3',
          options: 'i'
        })
      })
      .get()
    
    // 验证用户2只能看到自己的答题记录
    const user2Answers = await db.collection('user_answers')
      .where({ userId: userId2 })
      .get()
    
    // 验证用户3只能看到自己的答题记录
    const user3Answers = await db.collection('user_answers')
      .where({ userId: userId3 })
      .get()
    
    // 验证收藏隔离
    const user1Favorites = await db.collection('user_favorites')
      .where({ userId: userId1 })
      .get()
    
    const user2Favorites = await db.collection('user_favorites')
      .where({ userId: userId2 })
      .get()
    
    // 验证错题隔离
    const user1Wrong = await db.collection('user_wrong_questions')
      .where({ userId: userId1 })
      .get()
    
    const user2Wrong = await db.collection('user_wrong_questions')
      .where({ userId: userId2 })
      .get()
    
    // 生成验证报告
    const report = {
      success: true,
      checks: [
        {
          check: '用户1只能看到自己的答题记录',
          result: user1Answers.data.length === 5 && user1AnswersFromOther.data.length === 0,
          details: `用户1有${user1Answers.data.length}条答题记录，不应该包含其他用户的题目`
        },
        {
          check: '用户2只能看到自己的答题记录',
          result: user2Answers.data.length === 5,
          details: `用户2有${user2Answers.data.length}条答题记录`
        },
        {
          check: '用户3只能看到自己的答题记录',
          result: user3Answers.data.length === 5,
          details: `用户3有${user3Answers.data.length}条答题记录`
        },
        {
          check: '用户1和用户2的答题记录完全隔离',
          result: user1Answers.data.every(a => a.questionId.startsWith('question_1')) &&
                 user2Answers.data.every(a => a.questionId.startsWith('question_2')),
          details: '用户1的题目ID都以question_1开头，用户2的题目ID都以question_2开头'
        },
        {
          check: '用户1和用户2的收藏完全隔离',
          result: user1Favorites.data.every(f => f.questionId.startsWith('question_1')) &&
                 user2Favorites.data.every(f => f.questionId.startsWith('question_2')),
          details: `用户1有${user1Favorites.data.length}条收藏，用户2有${user2Favorites.data.length}条收藏`
        },
        {
          check: '用户1和用户2的错题完全隔离',
          result: user1Wrong.data.every(w => w.questionId.startsWith('question_1')) &&
                 user2Wrong.data.every(w => w.questionId.startsWith('question_2')),
          details: `用户1有${user1Wrong.data.length}条错题，用户2有${user2Wrong.data.length}条错题`
        }
      ],
      summary: {
        totalUsers: 3,
        totalAnswers: user1Answers.data.length + user2Answers.data.length + user3Answers.data.length,
        user1Stats: {
          answers: user1Answers.data.length,
          favorites: user1Favorites.data.length,
          wrongQuestions: user1Wrong.data.length
        },
        user2Stats: {
          answers: user2Answers.data.length,
          favorites: user2Favorites.data.length,
          wrongQuestions: user2Wrong.data.length
        },
        user3Stats: {
          answers: user3Answers.data.length,
          favorites: 0,
          wrongQuestions: 0
        }
      }
    }
    
    // 检查是否所有验证都通过
    report.success = report.checks.every(check => check.result)
    
    console.log('验证报告:', JSON.stringify(report, null, 2))
    
    return report
  } catch (error) {
    console.error('验证用户数据隔离失败:', error)
    throw error
  }
}

// 清理测试数据
async function cleanupTestData() {
  try {
    console.log('\n=== 开始清理测试数据 ===')
    
    // 删除测试用户
    for (let i = 1; i <= 3; i++) {
      const openid = `test_openid_${i}`
      await db.collection('users').doc(openid).remove()
    }
    
    // 删除测试答题记录
    await db.collection('user_answers').where({
      bankId: 'test_bank'
    }).remove()
    
    // 删除测试收藏
    await db.collection('user_favorites').where({
      bankId: 'test_bank'
    }).remove()
    
    // 删除测试错题
    await db.collection('user_wrong_questions').where({
      bankId: 'test_bank'
    }).remove()
    
    console.log('测试数据清理完成')
  } catch (error) {
    console.error('清理测试数据失败:', error)
    throw error
  }
}

// 云函数入口
exports.main = async (event, context) => {
  const { action } = event
  
  console.log('测试用户数据隔离，action:', action)
  
  try {
    if (action === 'cleanup') {
      await cleanupTestData()
      return {
        success: true,
        message: '测试数据清理完成'
      }
    }
    
    // 创建测试用户
    const userId1 = await createTestUser(1)
    const userId2 = await createTestUser(2)
    const userId3 = await createTestUser(3)
    
    // 为测试用户添加数据
    await Promise.all([
      addTestAnswers(userId1, 1, 5),
      addTestAnswers(userId2, 2, 5),
      addTestAnswers(userId3, 3, 5)
    ])
    
    // 为用户1和用户2添加收藏
    await Promise.all([
      addTestFavorites(userId1, 1, 3),
      addTestFavorites(userId2, 2, 3)
    ])
    
    // 验证数据隔离
    const report = await verifyUserIsolation(userId1, userId2, userId3)
    
    // 返回结果
    return {
      success: report.success,
      message: report.success ? '用户数据隔离验证通过' : '用户数据隔离验证失败',
      report: report
    }
  } catch (error) {
    console.error('测试用户数据隔离失败:', error)
    return {
      success: false,
      message: '测试失败',
      error: error.message
    }
  }
}
