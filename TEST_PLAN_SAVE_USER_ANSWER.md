# 测试计划：saveUserAnswer云函数事务优化

## 一、测试概述

**测试对象**：`saveUserAnswer`云函数（事务优化版）
**测试目的**：验证事务处理的正确性、数据一致性和错误处理能力
**测试时间**：2026-01-28
**测试环境**：微信云开发测试环境

## 二、测试用例

### 2.1 单元测试

#### 测试用例1：正常答题（答对）

**测试ID**：UT-SUA-001
**测试类型**：单元测试
**测试场景**：用户答对题目
**前置条件**：
- 用户已存在于users集合
- 题目不存在于user_answers集合

**测试步骤**：
1. 准备测试数据：
```javascript
const testData = {
  userId: 'test_user_1',
  questionId: 'question_001',
  bankId: 'bank_001',
  chapterId: 'chapter_001',
  userAnswer: 'A',
  correctAnswer: 'A',
  isCorrect: true,
  spendTime: 10000
}
```

2. 调用云函数：
```javascript
const result = await wx.cloud.callFunction({
  name: 'saveUserAnswer',
  data: testData
})
```

3. 验证结果：
- [ ] `result.success === true`
- [ ] user_answers集合新增1条记录
- [ ] users集合的`totalQuestions`增加1
- [ ] users集合的`correctCount`增加1
- [ ] user_wrong_questions集合无新增记录（答对）

**预期结果**：所有验证点通过
**实际结果**：待测试
**结论**：待测试
**备注**：

---

#### 测试用例2：正常答题（答错）

**测试ID**：UT-SUA-002
**测试类型**：单元测试
**测试场景**：用户答错题目
**前置条件**：
- 用户已存在于users集合
- 题目不存在于user_answers集合

**测试步骤**：
1. 准备测试数据：
```javascript
const testData = {
  userId: 'test_user_1',
  questionId: 'question_002',
  bankId: 'bank_001',
  chapterId: 'chapter_001',
  userAnswer: 'B',
  correctAnswer: 'A',
  isCorrect: false,
  spendTime: 15000
}
```

2. 调用云函数

3. 验证结果：
- [ ] `result.success === true`
- [ ] user_answers集合新增1条记录
- [ ] users集合的`totalQuestions`增加1
- [ ] users集合的`wrongCount`增加1
- [ ] user_wrong_questions集合新增1条记录
- [ ] 错题记录的`wrongCount === 1`
- [ ] 错题记录的`isMastered === false`

**预期结果**：所有验证点通过
**实际结果**：待测试
**结论**：待测试
**备注**：

---

#### 测试用例3：重复答题（更新已有记录）

**测试ID**：UT-SUA-003
**测试类型**：单元测试
**测试场景**：用户再次回答同一道题
**前置条件**：
- 用户已回答过question_001（测试用例1的数据）
- user_answers集合已有该题记录

**测试步骤**：
1. 准备测试数据（再次回答question_001，答对）：
```javascript
const testData = {
  userId: 'test_user_1',
  questionId: 'question_001',
  bankId: 'bank_001',
  chapterId: 'chapter_001',
  userAnswer: 'A',
  correctAnswer: 'A',
  isCorrect: true,
  spendTime: 8000
}
```

2. 调用云函数

3. 验证结果：
- [ ] `result.success === true`
- [ ] user_answers集合该题记录被更新（不是新增）
- [ ] 答题记录的`history`数组包含2条记录
- [ ] users集合的`totalQuestions`增加1
- [ ] users集合的`correctCount`增加1
- [ ] user_wrong_questions集合无变化

**预期结果**：所有验证点通过
**实际结果**：待测试
**结论**：待测试
**备注**：

---

#### 测试用例4：重复答错（更新错题记录）

**测试ID**：UT-SUA-004
**测试类型**：单元测试
**测试场景**：用户再次答错同一道题
**前置条件**：
- 用户已回答过question_002（测试用例2的数据）
- user_wrong_questions集合已有该错题记录

**测试步骤**：
1. 准备测试数据（再次回答question_002，答错）：
```javascript
const testData = {
  userId: 'test_user_1',
  questionId: 'question_002',
  bankId: 'bank_001',
  chapterId: 'chapter_001',
  userAnswer: 'C',
  correctAnswer: 'A',
  isCorrect: false,
  spendTime: 12000
}
```

2. 调用云函数

3. 验证结果：
- [ ] `result.success === true`
- [ ] user_answers集合该题记录被更新
- [ ] users集合的`totalQuestions`增加1
- [ ] users集合的`wrongCount`增加1
- [ ] user_wrong_questions集合该错题记录被更新
- [ ] 错题记录的`wrongCount === 2`
- [ ] 错题记录的`lastWrongTime`被更新

**预期结果**：所有验证点通过
**实际结果**：待测试
**结论**：待测试
**备注**：

---

#### 测试用例5：事务回滚（用户不存在）

**测试ID**：UT-SUA-005
**测试类型**：单元测试
**测试场景**：用户ID不存在，触发事务回滚
**前置条件**：
- users集合中不存在`test_user_999`

**测试步骤**：
1. 准备测试数据：
```javascript
const testData = {
  userId: 'test_user_999', // 不存在的用户
  questionId: 'question_003',
  bankId: 'bank_001',
  chapterId: 'chapter_001',
  userAnswer: 'A',
  correctAnswer: 'A',
  isCorrect: true,
  spendTime: 10000
}
```

2. 调用云函数

3. 验证结果：
- [ ] `result.success === false`
- [ ] `result.error`包含错误信息
- [ ] user_answers集合无新增记录（事务回滚）
- [ ] users集合无变化（事务回滚）
- [ ] user_wrong_questions集合无变化（事务回滚）

**预期结果**：所有验证点通过，事务正确回滚
**实际结果**：待测试
**结论**：待测试
**备注**：

---

#### 测试用例6：事务回滚（参数错误）

**测试ID**：UT-SUA-006
**测试类型**：单元测试
**测试场景**：缺少必要参数，触发事务回滚
**前置条件**：无

**测试步骤**：
1. 准备测试数据（缺少userId）：
```javascript
const testData = {
  // userId: 'test_user_1', // 故意省略
  questionId: 'question_004',
  bankId: 'bank_001',
  chapterId: 'chapter_001',
  userAnswer: 'A',
  correctAnswer: 'A',
  isCorrect: true,
  spendTime: 10000
}
```

2. 调用云函数

3. 验证结果：
- [ ] `result.success === false`
- [ ] `result.error === '缺少必要参数：userId、questionId、bankId、chapterId不能为空'`
- [ ] 所有集合无变化（事务未开始）

**预期结果**：所有验证点通过
**实际结果**：待测试
**结论**：待测试
**备注**：参数验证在事务开始前执行

---

### 2.2 集成测试

#### 测试用例7：端到端答题流程

**测试ID**：IT-SUA-001
**测试类型**：集成测试
**测试场景**：用户在quiz页面完整答题流程
**前置条件**：
- 小程序已登录
- 用户进入quiz页面

**测试步骤**：
1. 用户选择题库和章节
2. 用户回答第一道题（答对）
3. 点击下一题
4. 用户回答第二道题（答错）
5. 点击下一题
6. 查看答题结果

**验证点**：
- [ ] 页面正常显示题目
- [ ] 点击选项后显示正确/错误提示
- [ ] 可以正常切换题目
- [ ] user_answers集合有2条记录
- [ ] users集合统计正确（total=2, correct=1, wrong=1）
- [ ] user_wrong_questions集合有1条记录
- [ ] 章节进度正确更新

**预期结果**：所有验证点通过
**实际结果**：待测试
**结论**：待测试
**备注**：

---

#### 测试用例8：并发答题测试

**测试ID**：IT-SUA-002
**测试类型**：集成测试
**测试场景**：同一用户同时回答多道题
**前置条件**：
- 用户已存在
- 准备多道题目的测试数据

**测试步骤**：
1. 准备5道题的测试数据
2. 并发调用云函数：
```javascript
const promises = []
for (let i = 1; i <= 5; i++) {
  promises.push(wx.cloud.callFunction({
    name: 'saveUserAnswer',
    data: {
      userId: 'test_user_1',
      questionId: `question_${i}`,
      bankId: 'bank_001',
      chapterId: 'chapter_001',
      userAnswer: i % 2 === 0 ? 'A' : 'B',
      correctAnswer: 'A',
      isCorrect: i % 2 === 0,
      spendTime: 10000
    }
  }))
}
await Promise.all(promises)
```

3. 验证结果：
- [ ] 所有调用成功返回
- [ ] user_answers集合有5条记录
- [ ] users集合统计正确（total=5, correct=2, wrong=3）
- [ ] user_wrong_questions集合有3条记录
- [ ] 统计数据准确，无丢失或重复

**预期结果**：所有验证点通过，并发控制有效
**实际结果**：待测试
**结论**：待测试
**备注**：

---

#### 测试用例9：多用户隔离测试

**测试ID**：IT-SUA-003
**测试类型**：集成测试
**测试场景**：多个用户同时答题，验证数据隔离
**前置条件**：
- 准备3个测试用户
- 准备相同题目的测试数据

**测试步骤**：
1. 用户1回答question_001（答对）
2. 用户2回答question_001（答错）
3. 用户3回答question_001（答对）
4. 验证每个用户的数据

**验证点**：
- [ ] 用户1的统计：total=1, correct=1, wrong=0
- [ ] 用户2的统计：total=1, correct=0, wrong=1
- [ ] 用户3的统计：total=1, correct=1, wrong=0
- [ ] 用户1的错题本无记录
- [ ] 用户2的错题本有1条记录
- [ ] 用户3的错题本无记录
- [ ] 不同用户的数据完全隔离

**预期结果**：所有验证点通过，数据隔离有效
**实际结果**：待测试
**结论**：待测试
**备注**：

---

### 2.3 性能测试

#### 测试用例10：响应时间测试

**测试ID**：PT-SUA-001
**测试类型**：性能测试
**测试场景**：测量事务处理的响应时间
**前置条件**：无

**测试步骤**：
1. 准备测试数据
2. 调用云函数并记录时间：
```javascript
const startTime = Date.now()
await wx.cloud.callFunction({
  name: 'saveUserAnswer',
  data: testData
})
const endTime = Date.now()
const responseTime = endTime - startTime
```

3. 重复测试100次，计算平均响应时间

**验证点**：
- [ ] 平均响应时间 < 500ms
- [ ] 最大响应时间 < 1000ms
- [ ] 最小响应时间 < 200ms

**预期结果**：所有验证点通过
**实际结果**：待测试
**结论**：待测试
**备注**：

---

#### 测试用例11：并发性能测试

**测试ID**：PT-SUA-002
**测试类型**：性能测试
**测试场景**：测量高并发下的系统性能
**前置条件**：无

**测试步骤**：
1. 模拟100个并发用户
2. 每个用户回答10道题
3. 记录：
   - 总响应时间
   - 平均响应时间
   - 错误率
   - 吞吐量（QPS）

**验证点**：
- [ ] 错误率 < 1%
- [ ] 平均响应时间 < 1000ms
- [ ] 吞吐量 > 50 QPS

**预期结果**：所有验证点通过
**实际结果**：待测试
**结论**：待测试
**备注**：

---

## 三、测试工具

### 3.1 测试环境
- **开发工具**：微信开发者工具
- **云开发环境**：cloud1-2gdek8xx22a5db1a
- **测试数据库**：使用测试集合或测试环境

### 3.2 测试脚本

#### 自动化测试脚本
```javascript
// test-save-user-answer.js

async function runTest(testCase, testData) {
  console.log(`\n=== 开始测试：${testCase} ===`)
  
  try {
    const startTime = Date.now()
    const result = await wx.cloud.callFunction({
      name: 'saveUserAnswer',
      data: testData
    })
    const endTime = Date.now()
    
    console.log('测试结果:', result)
    console.log('响应时间:', endTime - startTime, 'ms')
    
    return {
      success: result.success,
      responseTime: endTime - startTime,
      data: result
    }
  } catch (error) {
    console.error('测试失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// 运行所有测试
async function runAllTests() {
  const tests = [
    {
      case: 'UT-SUA-001: 正常答题（答对）',
      data: {
        userId: 'test_user_1',
        questionId: 'question_001',
        bankId: 'bank_001',
        chapterId: 'chapter_001',
        userAnswer: 'A',
        correctAnswer: 'A',
        isCorrect: true,
        spendTime: 10000
      }
    },
    {
      case: 'UT-SUA-002: 正常答题（答错）',
      data: {
        userId: 'test_user_1',
        questionId: 'question_002',
        bankId: 'bank_001',
        chapterId: 'chapter_001',
        userAnswer: 'B',
        correctAnswer: 'A',
        isCorrect: false,
        spendTime: 15000
      }
    },
    // ... 更多测试用例
  ]
  
  const results = []
  for (const test of tests) {
    const result = await runTest(test.case, test.data)
    results.push({
      testCase: test.case,
      ...result
    })
  }
  
  // 生成测试报告
  console.log('\n=== 测试报告 ===')
  console.log('总测试数:', results.length)
  console.log('通过数:', results.filter(r => r.success).length)
  console.log('失败数:', results.filter(r => !r.success).length)
  console.log('平均响应时间:', results.reduce((sum, r) => sum + r.responseTime, 0) / results.length, 'ms')
  
  return results
}

// 并发测试
async function runConcurrentTest(userCount, questionsPerUser) {
  console.log(`\n=== 并发测试：${userCount}个用户，每人${questionsPerUser}道题 ===`)
  
  const startTime = Date.now()
  const promises = []
  
  for (let i = 1; i <= userCount; i++) {
    for (let j = 1; j <= questionsPerUser; j++) {
      promises.push(wx.cloud.callFunction({
        name: 'saveUserAnswer',
        data: {
          userId: `test_user_${i}`,
          questionId: `question_${j}`,
          bankId: 'bank_001',
          chapterId: 'chapter_001',
          userAnswer: j % 2 === 0 ? 'A' : 'B',
          correctAnswer: 'A',
          isCorrect: j % 2 === 0,
          spendTime: 10000
        }
      }))
    }
  }
  
  const results = await Promise.all(promises)
  const endTime = Date.now()
  
  const successCount = results.filter(r => r.success).length
  const errorCount = results.filter(r => !r.success).length
  
  console.log('总请求数:', promises.length)
  console.log('成功数:', successCount)
  console.log('失败数:', errorCount)
  console.log('总耗时:', endTime - startTime, 'ms')
  console.log('吞吐量:', (promises.length / ((endTime - startTime) / 1000)).toFixed(2), 'QPS')
  
  return {
    totalRequests: promises.length,
    successCount,
    errorCount,
    totalTime: endTime - startTime,
    throughput: (promises.length / ((endTime - startTime) / 1000)).toFixed(2)
  }
}
```

### 3.3 数据验证脚本

```javascript
// verify-data.js

async function verifyUserData(userId) {
  console.log(`\n=== 验证用户数据：${userId} ===`)
  
  // 获取用户信息
  const userResult = await db.collection('users').doc(userId).get()
  const user = userResult.data
  
  console.log('用户统计:', {
    totalQuestions: user.totalQuestions,
    correctCount: user.correctCount,
    wrongCount: user.wrongCount
  })
  
  // 获取答题记录
  const answersResult = await db.collection('user_answers')
    .where({ userId })
    .get()
  const answers = answersResult.data
  
  console.log('答题记录数:', answers.length)
  
  // 统计答题记录
  const answerStats = {
    total: answers.length,
    correct: answers.filter(a => a.isCorrect).length,
    wrong: answers.filter(a => !a.isCorrect).length
  }
  
  console.log('答题记录统计:', answerStats)
  
  // 获取错题记录
  const wrongResult = await db.collection('user_wrong_questions')
    .where({ userId })
    .get()
  const wrongQuestions = wrongResult.data
  
  console.log('错题记录数:', wrongQuestions.length)
  
  // 验证一致性
  const isConsistent = 
    user.totalQuestions === answerStats.total &&
    user.correctCount === answerStats.correct &&
    user.wrongCount === answerStats.wrong &&
    wrongQuestions.length === answerStats.wrong
  
  console.log('数据一致性:', isConsistent ? '✓ 一致' : '✗ 不一致')
  
  if (!isConsistent) {
    console.log('差异分析:')
    console.log('  users.totalQuestions:', user.totalQuestions, 'vs answers.total:', answerStats.total)
    console.log('  users.correctCount:', user.correctCount, 'vs answers.correct:', answerStats.correct)
    console.log('  users.wrongCount:', user.wrongCount, 'vs answers.wrong:', answerStats.wrong)
    console.log('  wrongQuestions.length:', wrongQuestions.length, 'vs answers.wrong:', answerStats.wrong)
  }
  
  return {
    user,
    answerStats,
    wrongQuestionsCount: wrongQuestions.length,
    isConsistent
  }
}
```

## 四、测试报告模板

```markdown
# saveUserAnswer云函数测试报告

**测试日期**：2026-01-28
**测试人员**：
**测试环境**：微信云开发测试环境

## 一、测试概述

本次测试针对saveUserAnswer云函数的事务优化进行全面验证，包括单元测试、集成测试和性能测试。

## 二、测试结果汇总

| 测试类型 | 测试用例数 | 通过数 | 失败数 | 通过率 |
|---------|-----------|-------|-------|--------|
| 单元测试 | 6 | 6 | 0 | 100% |
| 集成测试 | 3 | 3 | 0 | 100% |
| 性能测试 | 2 | 2 | 0 | 100% |
| **总计** | **11** | **11** | **0** | **100%** |

## 三、详细测试结果

### 3.1 单元测试

| 测试ID | 测试用例 | 结果 | 响应时间 | 备注 |
|--------|---------|------|---------|------|
| UT-SUA-001 | 正常答题（答对） | ✓ 通过 | 85ms | |
| UT-SUA-002 | 正常答题（答错） | ✓ 通过 | 92ms | |
| UT-SUA-003 | 重复答题（更新已有记录） | ✓ 通过 | 78ms | |
| UT-SUA-004 | 重复答错（更新错题记录） | ✓ 通过 | 88ms | |
| UT-SUA-005 | 事务回滚（用户不存在） | ✓ 通过 | 45ms | 回滚成功 |
| UT-SUA-006 | 事务回滚（参数错误） | ✓ 通过 | 32ms | 参数验证有效 |

### 3.2 集成测试

| 测试ID | 测试用例 | 结果 | 备注 |
|--------|---------|------|------|
| IT-SUA-001 | 端到端答题流程 | ✓ 通过 | 页面功能正常 |
| IT-SUA-002 | 并发答题测试 | ✓ 通过 | 5道题并发成功 |
| IT-SUA-003 | 多用户隔离测试 | ✓ 通过 | 数据完全隔离 |

### 3.3 性能测试

| 测试ID | 测试用例 | 结果 | 指标 |
|--------|---------|------|------|
| PT-SUA-001 | 响应时间测试 | ✓ 通过 | 平均85ms |
| PT-SUA-002 | 并发性能测试 | ✓ 通过 | 吞吐量65 QPS |

## 四、数据一致性验证

| 用户ID | 答题记录数 | 用户统计total | 用户统计correct | 用户统计wrong | 错题记录数 | 一致性 |
|--------|-----------|--------------|----------------|---------------|-----------|--------|
| test_user_1 | 5 | 5 | 3 | 2 | 2 | ✓ 一致 |
| test_user_2 | 5 | 5 | 2 | 3 | 3 | ✓ 一致 |
| test_user_3 | 5 | 5 | 4 | 1 | 1 | ✓ 一致 |

## 五、问题与缺陷

### 5.1 发现的问题

| 问题ID | 问题描述 | 严重程度 | 状态 | 备注 |
|--------|---------|---------|------|------|
| 无 | 无 | - | - | - |

### 5.2 改进建议

1. **监控建议**：添加事务成功率监控告警
2. **日志建议**：增加更详细的事务日志
3. **优化建议**：考虑对高频访问的数据添加缓存

## 六、测试结论

### 6.1 总体评价

**测试结论**：✅ **通过**

saveUserAnswer云函数的事务优化实现成功，所有测试用例通过，数据一致性得到有效保障。

### 6.2 关键指标

- **功能完整性**：100%
- **数据一致性**：100%
- **事务成功率**：100%
- **平均响应时间**：85ms
- **并发吞吐量**：65 QPS
- **错误率**：0%

### 6.3 上线建议

✅ **建议立即上线**

理由：
1. 所有测试用例通过
2. 数据一致性得到有效保障
3. 性能指标满足要求
4. 错误率为0

### 6.4 后续工作

1. 部署到生产环境
2. 持续监控事务成功率和响应时间
3. 收集用户反馈
4. 根据实际运行数据进行优化

## 七、附录

### 7.1 测试环境信息

- **云开发环境ID**：cloud1-2gdek8xx22a5db1a
- **测试时间**：2026-01-28 14:00-16:00
- **测试工具**：微信开发者工具、自定义测试脚本

### 7.2 测试数据

测试使用的用户ID：test_user_1, test_user_2, test_user_3
测试使用的题目ID：question_001 ~ question_100

### 7.3 参考文档

- [优化方案文档](OPTIMIZATION_PLAN_SAVE_USER_ANSWER.md)
- [微信云开发事务文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/reference-sdk-api/database/Transaction.html)

---

**报告生成时间**：2026-01-28  
**报告审核人**：  
**审核日期**：
```

## 五、测试执行

### 5.1 测试准备

1. **创建测试用户**：
```javascript
// 在云开发控制台或使用云函数创建测试用户
const testUsers = [
  { _id: 'test_user_1', openid: 'test_user_1', nickName: '测试用户1', totalQuestions: 0, correctCount: 0, wrongCount: 0 },
  { _id: 'test_user_2', openid: 'test_user_2', nickName: '测试用户2', totalQuestions: 0, correctCount: 0, wrongCount: 0 },
  { _id: 'test_user_3', openid: 'test_user_3', nickName: '测试用户3', totalQuestions: 0, correctCount: 0, wrongCount: 0 }
]
```

2. **清空测试数据**：
```javascript
// 在测试前清空相关集合
await db.collection('user_answers').where({ bankId: 'bank_001' }).remove()
await db.collection('user_wrong_questions').where({ bankId: 'bank_001' }).remove()
```

### 5.2 测试执行步骤

1. 运行单元测试（UT-SUA-001 ~ UT-SUA-006）
2. 运行集成测试（IT-SUA-001 ~ IT-SUA-003）
3. 运行性能测试（PT-SUA-001 ~ PT-SUA-002）
4. 验证数据一致性
5. 生成测试报告

### 5.3 测试注意事项

1. **测试环境隔离**：使用独立的测试集合或测试环境
2. **数据清理**：测试后清理测试数据，避免影响生产数据
3. **日志记录**：开启详细日志，便于问题排查
4. **性能监控**：测试期间监控云函数性能指标

---

**测试文档版本**：v1.0  
**创建日期**：2026-01-28  
**作者**：AI Assistant  
**审核状态**：待审核
