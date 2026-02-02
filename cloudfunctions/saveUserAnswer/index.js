// 云函数：保存用户答题记录（事务优化版）
// 优化说明：使用事务确保答题记录、用户统计、错题记录的原子性更新
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 使用事务保存答题记录和相关统计
 * @param {Object} answerData - 答题数据
 * @param {string} answerData.userId - 用户ID
 * @param {string} answerData.questionId - 题目ID
 * @param {string} answerData.bankId - 题库ID
 * @param {string} answerData.chapterId - 章节ID
 * @param {string} answerData.userAnswer - 用户答案
 * @param {string} answerData.correctAnswer - 正确答案
 * @param {boolean} answerData.isCorrect - 是否正确
 * @param {number} answerData.spendTime - 答题用时（毫秒）
 * @returns {Object} - 答题记录
 */
async function saveAnswerWithTransaction(answerData) {
  const { userId, questionId, bankId, chapterId, userAnswer, correctAnswer, isCorrect, spendTime } = answerData
  const now = Date.now()

  // 参数验证
  if (!userId || !questionId || !bankId || !chapterId) {
    throw new Error('缺少必要参数：userId、questionId、bankId、chapterId不能为空')
  }

  if (userAnswer === undefined || correctAnswer === undefined || isCorrect === undefined) {
    throw new Error('缺少必要参数：userAnswer、correctAnswer、isCorrect不能为空')
  }

  // 开始事务
  const transaction = await db.startTransaction()

  try {
    let answerRecord

    console.log('事务：开始执行，userId:', userId, 'questionId:', questionId)

    // 步骤1：检查是否已有该题的答题记录
    const existResult = await transaction.collection('user_answers')
      .where({
        userId,
        questionId
      })
      .get()

    if (existResult.data.length > 0) {
      // 已有记录，更新并添加到历史
      const recordId = existResult.data[0]._id
      const historyItem = {
        userAnswer,
        isCorrect,
        answerTime: now,
        spendTime
      }

      await transaction.collection('user_answers').doc(recordId).update({
        data: {
          userAnswer,
          isCorrect,
          answerTime: now,
          spendTime,
          history: _.push(historyItem)
        }
      })

      console.log('事务：答题记录已更新:', recordId)
      answerRecord = { _id: recordId, ...existResult.data[0], userAnswer, isCorrect, answerTime: now }
    } else {
      // 没有记录，创建新记录
      const recordData = {
        userId,
        questionId,
        bankId,
        chapterId,
        userAnswer,
        correctAnswer,
        isCorrect,
        answerTime: now,
        spendTime,
        history: [{
          userAnswer,
          isCorrect,
          answerTime: now,
          spendTime
        }]
      }

      const result = await transaction.collection('user_answers').add({
        data: recordData
      })

      console.log('事务：新答题记录创建成功:', result._id)
      answerRecord = { _id: result._id, ...recordData }
    }

    // 步骤2：更新用户统计数据
    const statsUpdateData = isCorrect ? {
      totalQuestions: _.inc(1),
      correctCount: _.inc(1)
    } : {
      totalQuestions: _.inc(1),
      wrongCount: _.inc(1)
    }

    await transaction.collection('users').doc(userId).update({
      data: statsUpdateData
    })

    console.log('事务：用户统计数据已更新')

    // 步骤3：如果答错，更新或创建错题记录
    if (!isCorrect) {
      const wrongExistResult = await transaction.collection('user_wrong_questions')
        .where({
          userId,
          questionId
        })
        .get()

      if (wrongExistResult.data.length > 0) {
        // 已有错题记录，更新
        const wrongId = wrongExistResult.data[0]._id
        await transaction.collection('user_wrong_questions').doc(wrongId).update({
          data: {
            wrongCount: _.inc(1),
            lastWrongTime: now,
            userAnswer,
            spendTime
          }
        })
        console.log('事务：错题记录已更新:', wrongId)
      } else {
        // 没有错题记录，创建新记录
        await transaction.collection('user_wrong_questions').add({
          data: {
            userId,
            questionId,
            bankId,
            chapterId,
            wrongCount: 1,
            lastWrongTime: now,
            isMastered: false,
            userAnswer,
            correctAnswer,
            spendTime
          }
        })
        console.log('事务：新错题记录创建成功')
      }
    }

    // 提交事务
    await transaction.commit()
    console.log('事务：提交成功')

    return answerRecord

  } catch (error) {
    // 回滚事务
    await transaction.rollback()
    console.error('事务：回滚，错误原因:', error)
    throw error
  }
}

/**
 * 更新用户题库统计（事务外，可选操作）
 * @param {string} userId - 用户ID
 * @param {string} bankId - 题库ID
 * @param {boolean} isCorrect - 是否正确
 */
async function updateBankStats(userId, bankId, isCorrect) {
  try {
    const user = await db.collection('users').doc(userId).get()
    const bankStats = user.data.bankStats || {}

    if (!bankStats[bankId]) {
      bankStats[bankId] = {
        totalQuestions: 0,
        correctCount: 0,
        wrongCount: 0,
        accuracy: 0
      }
    }

    bankStats[bankId].totalQuestions++
    if (isCorrect) {
      bankStats[bankId].correctCount++
    } else {
      bankStats[bankId].wrongCount++
    }
    bankStats[bankId].accuracy = Math.round(bankStats[bankId].correctCount / bankStats[bankId].totalQuestions * 100)

    await db.collection('users').doc(userId).update({
      data: {
        bankStats
      }
    })

    console.log('题库统计数据已更新:', bankId)
  } catch (error) {
    console.error('更新题库统计数据失败:', error)
    // 可选操作，不抛出错误
  }
}

/**
 * 更新章节进度（事务外，可选操作）
 * @param {string} userId - 用户ID
 * @param {string} bankId - 题库ID
 * @param {string} chapterId - 章节ID
 * @param {string} questionId - 题目ID
 * @param {boolean} isCorrect - 是否正确
 */
async function updateChapterProgress(userId, bankId, chapterId, questionId, isCorrect) {
  try {
    // 检查是否已有章节进度记录
    const existResult = await db.collection('user_chapter_progress')
      .where({
        userId,
        chapterId
      })
      .get()

    if (existResult.data.length > 0) {
      // 已有记录，更新
      const progressId = existResult.data[0]._id
      const progressData = existResult.data[0]

      // 检查是否已经完成过这道题
      const completedQuestions = progressData.completedQuestionsList || []
      if (!completedQuestions.includes(questionId)) {
        // 新增完成的题目
        const newCompletedQuestions = [...completedQuestions, questionId]
        const newProgress = Math.round((newCompletedQuestions.length / progressData.totalQuestions) * 100)

        await db.collection('user_chapter_progress').doc(progressId).update({
          data: {
            completedQuestions: newCompletedQuestions.length,
            completedQuestionsList: newCompletedQuestions,
            correctCount: isCorrect ? _.inc(1) : progressData.correctCount,
            wrongCount: isCorrect ? progressData.wrongCount : _.inc(1),
            accuracy: newCompletedQuestions.length > 0 ? Math.round((isCorrect ? progressData.correctCount + 1 : progressData.correctCount) / newCompletedQuestions.length * 100) : 0,
            progress: newProgress,
            lastStudyTime: Date.now(),
            isCompleted: newProgress >= 100,
            studyTime: _.inc(progressData.spendTime || 0)
          }
        })

        console.log('章节进度已更新:', chapterId, '进度:', newProgress + '%')
      } else {
        console.log('该题目已完成，跳过章节进度更新:', questionId)
      }
    } else {
      // 没有记录，需要先获取章节信息
      console.log('未找到章节进度记录，跳过更新:', chapterId)
    }
  } catch (error) {
    console.error('更新章节进度失败:', error)
    // 可选操作，不抛出错误
  }
}

/**
 * 云函数主入口
 * @param {Object} event - 事件参数
 * @param {Object} context - 上下文
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()

  try {
    const { userId, questionId, bankId, chapterId, userAnswer, correctAnswer, isCorrect, spendTime } = event

    console.log('===== 保存答题记录开始 =====')
    console.log('参数:', {
      userId,
      questionId,
      bankId,
      chapterId,
      userAnswer,
      correctAnswer,
      isCorrect,
      spendTime
    })

    // 核心事务：保存答题记录、更新统计、更新错题
    const answerRecord = await saveAnswerWithTransaction({
      userId,
      questionId,
      bankId,
      chapterId,
      userAnswer,
      correctAnswer,
      isCorrect,
      spendTime
    })

    console.log('核心事务执行成功')

    // 可选操作：更新章节进度（事务外，可以容忍失败）
    await updateChapterProgress(userId, bankId, chapterId, questionId, isCorrect)

    // 可选操作：更新题库统计（事务外，可以容忍失败）
    await updateBankStats(userId, bankId, isCorrect)

    console.log('===== 保存答题记录完成 =====')

    return {
      success: true,
      message: '答题记录保存成功',
      data: answerRecord
    }

  } catch (error) {
    console.error('===== 保存答题记录失败 =====')
    console.error('错误信息:', error)
    return {
      success: false,
      message: '保存答题记录失败',
      error: error.message
    }
  }
}
