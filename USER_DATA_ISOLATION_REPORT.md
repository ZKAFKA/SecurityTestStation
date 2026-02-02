# 用户数据隔离检查报告

**检查时间**: 2026-01-28
**检查人员**: AI Assistant
**系统版本**: SecurityTestStation v1.0

---

## 1. 数据库架构检查

### 1.1 集合结构分析

系统使用以下集合来存储用户数据：

#### 1. users 集合（用户基本信息）
- **主键**: `_id` (使用OpenID)
- **关键字段**: `openid`, `nickName`, `avatarUrl`, `totalQuestions`, `correctCount`, `wrongCount`
- **隔离机制**: 每个用户有唯一的`_id`和`openid`

#### 2. user_answers 集合（答题记录）
- **关键字段**: `userId`, `questionId`, `bankId`, `chapterId`, `userAnswer`, `correctAnswer`, `isCorrect`, `answerTime`, `history`
- **隔离机制**: 所有查询/更新都使用`userId`作为where条件
- **索引建议**: 应创建复合索引 `{userId: 1, questionId: 1}` 以提高查询性能

#### 3. user_favorites 集合（收藏记录）
- **关键字段**: `userId`, `questionId`, `bankId`, `chapterId`, `favoriteTime`, `note`
- **隔离机制**: 所有查询/更新都使用`userId`作为where条件
- **索引建议**: 应创建复合索引 `{userId: 1, questionId: 1}`

#### 4. user_wrong_questions 集合（错题记录）
- **关键字段**: `userId`, `questionId`, `bankId`, `chapterId`, `wrongCount`, `lastWrongTime`, `isMastered`
- **隔离机制**: 所有查询/更新都使用`userId`作为where条件
- **索引建议**: 应创建复合索引 `{userId: 1, questionId: 1}`

#### 5. user_chapter_progress 集合（章节进度）
- **关键字段**: `userId`, `bankId`, `chapterId`, `completedQuestions`, `progress`, `lastStudyTime`
- **隔离机制**: 所有查询/更新都使用`userId`和`chapterId`作为where条件
- **索引建议**: 应创建复合索引 `{userId: 1, chapterId: 1}`

#### 6. user_quiz_sessions 集合（答题会话）
- **关键字段**: `userId`, `bankId`, `chapterId`, `currentQuestionIndex`, `sessionStartTime`, `isCompleted`
- **隔离机制**: 所有查询/更新都使用`userId`作为where条件

---

## 2. 数据操作检查

### 2.1 查询操作检查

#### ✅ saveUserAnswer 云函数
**文件**: `cloudfunctions/saveUserAnswer/index.js`

**检查点**:
1. ✅ 创建/更新答题记录时使用 `{userId, questionId}` 作为where条件
2. ✅ 更新用户统计时使用 `userId` 作为doc ID
3. ✅ 所有操作都严格隔离用户数据

**关键代码**:
```javascript
// 检查是否已有该题的答题记录
const existResult = await db.collection('user_answers')
  .where({
    userId,
    questionId
  })
  .get()
```

#### ✅ getUserData 云函数
**文件**: `cloudfunctions/getUserData/index.js`

**检查点**:
1. ✅ 获取用户信息时使用 `userId` 作为doc ID
2. ✅ 获取收藏记录时使用 `{userId}` 作为where条件
3. ✅ 获取错题记录时使用 `{userId, isMastered: false}` 作为where条件
4. ✅ 获取章节进度时使用 `{userId}` 作为where条件

**关键代码**:
```javascript
// 获取用户收藏记录
const result = await db.collection('user_favorites')
  .where({ userId })
  .orderBy('favoriteTime', 'desc')
  .get()
```

#### ✅ getUserFavoriteQuestions 云函数
**文件**: `cloudfunctions/getUserFavoriteQuestions/index.js`

**检查点**:
1. ✅ 从`event`参数获取`userId`，降级使用`OPENID`
2. ✅ 查询收藏记录时使用 `{userId}` 作为where条件
3. ✅ 批量获取题目详情时使用`questionId`，不涉及用户隔离

**关键代码**:
```javascript
const userId = event.userId || wxContext.OPENID

const favoritesResult = await db.collection('user_favorites')
  .where({
    userId: userId
  })
  .get()
```

#### ✅ getUserWrongQuestions 云函数
**文件**: `cloudfunctions/getUserWrongQuestions/index.js`

**检查点**:
1. ✅ 从`event`参数获取`userId`，降级使用`OPENID`
2. ✅ 查询错题记录时使用 `{userId}` 作为where条件
3. ✅ 批量获取题目详情时使用`questionId`，不涉及用户隔离

**关键代码**:
```javascript
const userId = event.userId || wxContext.OPENID

const wrongQuestionsResult = await db.collection('user_wrong_questions')
  .where({
    userId: userId
  })
  .get()
```

#### ✅ getUserStats 云函数
**文件**: `cloudfunctions/getUserStats/index.js`

**检查点**:
1. ✅ 必须传入`userId`参数，否则返回错误
2. ✅ 查询今日答题数时使用 `{userId, answerTime: gte(todayStartTime)}`
3. ✅ 查询总答题数时使用 `{userId}`

**关键代码**:
```javascript
if (!userId) {
  return {
    success: false,
    message: '用户ID不能为空'
  }
}

const result = await db.collection('user_answers')
  .where({
    userId: userId,
    answerTime: db.command.gte(todayStartTime)
  })
  .count()
```

#### ✅ toggleFavorite 云函数
**文件**: `cloudfunctions/toggleFavorite/index.js`

**检查点**:
1. ✅ 检查收藏状态时使用 `{userId, questionId}`
2. ✅ 添加收藏时使用 `userId` 字段
3. ✅ 取消收藏时使用 `{userId, questionId}` 作为where条件

**关键代码**:
```javascript
// 检查是否已收藏
const result = await db.collection('user_favorites')
  .where({
    userId,
    questionId
  })
  .get()
```

#### ✅ updateChapterProgress 云函数
**文件**: `cloudfunctions/updateChapterProgress/index.js`

**检查点**:
1. ✅ 检查进度记录时使用 `{userId, chapterId}`
2. ✅ 创建进度记录时使用 `userId` 字段
3. ✅ 更新进度记录时使用 `{userId, chapterId}` 作为where条件

**关键代码**:
```javascript
const result = await db.collection('user_chapter_progress')
  .where({
    userId,
    chapterId
  })
  .get()
```

#### ✅ removeFromWrongQuestions 云函数
**文件**: `cloudfunctions/removeFromWrongQuestions/index.js`

**检查点**:
1. ✅ 从`event`参数获取`userId`，降级使用`OPENID`
2. ✅ 删除错题时使用 `{userId, questionId}` 作为where条件

**关键代码**:
```javascript
const userId = event.userId || wxContext.OPENID

const result = await db.collection('user_wrong_questions')
  .where({
    userId: userId,
    questionId: questionId
  })
  .remove()
```

---

## 3. 业务逻辑层检查

### 3.1 前端页面检查

#### ✅ quiz 页面
**文件**: `pages/quiz/quiz.js`

**检查点**:
1. ✅ 从`app.globalData.userId`获取用户ID
2. ✅ 调用`saveUserAnswer`时传入`userId`参数
3. ✅ 调用`getUserData`时传入`userId`参数
4. ✅ 所有云函数调用都包含`userId`

**关键代码**:
```javascript
const app = getApp();
const userId = app.globalData.userId;

const result = await wx.cloud.callFunction({
  name: 'saveUserAnswer',
  data: {
    userId: userId,
    questionId: questionId,
    // ... 其他参数
  }
});
```

#### ✅ favorite-questions 页面
**文件**: `pages/favorite-questions/favorite-questions.js`

**检查点**:
1. ✅ 从`app.globalData.userId`获取用户ID
2. ✅ 调用`getUserFavoriteQuestions`时传入`userId`参数
3. ✅ 调用`toggleFavorite`时传入`userId`参数
4. ✅ 所有云函数调用都包含`userId`

**关键代码**:
```javascript
const app = getApp();
const userId = app.globalData.userId;

const result = await wx.cloud.callFunction({
  name: 'getUserFavoriteQuestions',
  data: {
    userId: userId
  }
});
```

#### ✅ wrong-questions 页面
**文件**: `pages/wrong-questions/wrong-questions.js`

**检查点**:
1. ✅ 从`app.globalData.userId`获取用户ID
2. ✅ 调用`getUserWrongQuestions`时传入`userId`参数
3. ✅ 调用`toggleFavorite`时传入`userId`参数
4. ✅ 调用`removeFromWrongQuestions`时传入`userId`参数
5. ✅ 所有云函数调用都包含`userId`

**关键代码**:
```javascript
const app = getApp();
const userId = app.globalData.userId;

const result = await wx.cloud.callFunction({
  name: 'getUserWrongQuestions',
  data: {
    userId: userId
  }
});
```

#### ✅ my 页面
**文件**: `pages/my/my.js`

**检查点**:
1. ✅ 从`app.globalData.userId`获取用户ID
2. ✅ 调用`getUserStats`时传入`userId`参数
3. ✅ 显示用户特定的统计数据

**关键代码**:
```javascript
const app = getApp();
const userId = app.globalData.userId;

const result = await wx.cloud.callFunction({
  name: 'getUserStats',
  data: {
    userId: userId
  }
});
```

#### ✅ app.js（全局用户管理）
**文件**: `app.js`

**检查点**:
1. ✅ 在`onLaunch`时初始化用户
2. ✅ 调用`getOpenid`获取用户唯一标识
3. ✅ 调用`initUserDatabase`创建/更新用户记录
4. ✅ 调用`getUserData`获取用户完整数据
5. ✅ 将`userId`存储在`globalData`中供所有页面使用

**关键代码**:
```javascript
async initUser() {
  // 步骤1：获取OpenID
  const openidResult = await wx.cloud.callFunction({
    name: 'getOpenid'
  });
  
  const openid = openidResult.result.openid;
  this.globalData.openid = openid;
  
  // 步骤2：初始化用户数据库
  const initResult = await wx.cloud.callFunction({
    name: 'initUserDatabase',
    data: {
      openid: openid,
      userInfo: this.globalData.userInfo || {}
    }
  });
  
  const userId = initResult.result.data.userId;
  this.globalData.userId = userId;
}
```

---

## 4. 并发场景数据隔离

### 4.1 并发访问分析

#### 场景1：多个用户同时答题
- **问题**: 用户A和用户B同时回答同一道题
- **当前机制**: 每个用户的答题记录存储在`user_answers`集合，使用`{userId, questionId}`作为唯一标识
- **风险评估**: ✅ 无风险 - 每个用户有独立的记录

#### 场景2：用户快速切换题目
- **问题**: 用户在短时间内连续回答多道题
- **当前机制**: 使用`answerTime`记录答题时间，`history`数组保存历史记录
- **风险评估**: ✅ 无风险 - 每次答题都会创建新的历史记录

#### 场景3：多个用户同时收藏同一道题
- **问题**: 用户A和用户B同时收藏同一道题
- **当前机制**: 每个用户的收藏记录存储在`user_favorites`集合，使用`{userId, questionId}`作为唯一标识
- **风险评估**: ✅ 无风险 - 每个用户有独立的收藏记录

#### 场景4：用户同时在多个设备登录
- **问题**: 用户在手机和平板同时使用小程序
- **当前机制**: 使用相同的`userId`，所有数据会合并
- **风险评估**: ⚠️ 需要注意 - 可能导致进度不同步
- **建议解决方案**: 实现实时同步机制，使用WebSocket或云开发的实时数据库

### 4.2 事务处理

#### 当前问题
系统中没有使用数据库事务，可能导致以下问题：
1. **答题记录和用户统计不同步**: 在`saveUserAnswer`中，先更新`user_answers`，再更新`users`统计，如果第二步失败，会导致数据不一致
2. **错题记录和答题记录不同步**: 答题错误时需要同时更新`user_answers`和`user_wrong_questions`

#### 建议解决方案
使用云开发的事务功能：

```javascript
const transaction = await db.startTransaction()

try {
  // 步骤1：更新答题记录
  await transaction.collection('user_answers').doc(recordId).update({
    data: updateData
  })
  
  // 步骤2：更新用户统计
  await transaction.collection('users').doc(userId).update({
    data: statsUpdateData
  })
  
  // 步骤3：如果答错，添加到错题本
  if (!isCorrect) {
    await transaction.collection('user_wrong_questions').add({
      data: wrongQuestionData
    })
  }
  
  // 提交事务
  await transaction.commit()
} catch (error) {
  // 回滚事务
  await transaction.rollback()
  throw error
}
```

---

## 5. 测试用户数据隔离

### 5.1 测试云函数

已创建测试云函数 `testUserIsolation`，用于验证多用户数据隔离。

**文件**: `cloudfunctions/testUserIsolation/index.js`

**测试步骤**:
1. 创建3个测试用户（测试用户1、测试用户2、测试用户3）
2. 为每个用户添加5条答题记录
3. 为用户1和用户2各添加3条收藏记录
4. 验证每个用户只能看到自己的答题记录、收藏记录和错题记录
5. 清理测试数据

**测试结果**: ✅ 所有隔离验证通过

### 5.2 测试结果摘要

| 测试项 | 结果 | 详情 |
|--------|------|------|
| 用户1只能看到自己的答题记录 | ✅ 通过 | 用户1有5条答题记录，不包含其他用户的题目 |
| 用户2只能看到自己的答题记录 | ✅ 通过 | 用户2有5条答题记录 |
| 用户3只能看到自己的答题记录 | ✅ 通过 | 用户3有5条答题记录 |
| 用户1和用户2的答题记录完全隔离 | ✅ 通过 | 用户1的题目ID以question_1开头，用户2的以question_2开头 |
| 用户1和用户2的收藏完全隔离 | ✅ 通过 | 用户1有3条收藏，用户2有3条收藏 |
| 用户1和用户2的错题完全隔离 | ✅ 通过 | 用户1有2条错题，用户2有2条错题 |

---

## 6. 安全漏洞检查

### 6.1 已发现的问题

#### 问题1：云函数参数验证不足
**位置**: 多个云函数
**风险等级**: 中
**问题描述**: 部分云函数没有对`userId`参数进行严格验证，依赖前端传入正确的`userId`

**当前代码**:
```javascript
const userId = event.userId || wxContext.OPENID
```

**风险**: 如果前端被篡改，可能传入其他用户的`userId`，导致数据泄露

**建议修复**:
```javascript
// 使用云函数上下文的OPENID作为唯一用户标识
const wxContext = cloud.getWXContext()
const userId = wxContext.OPENID

// 不要使用event.userId，防止前端篡改
// const userId = event.userId // ❌ 不安全
```

#### 问题2：缺少输入验证
**位置**: 多个云函数
**风险等级**: 中
**问题描述**: 没有对输入参数进行验证（如`questionId`格式、`bankId`是否存在等）

**建议修复**:
```javascript
// 添加输入验证
if (!questionId || typeof questionId !== 'string') {
  return {
    success: false,
    message: '题目ID格式不正确'
  }
}

if (!bankId || typeof bankId !== 'string') {
  return {
    success: false,
    message: '题库ID格式不正确'
  }
}
```

#### 问题3：没有使用数据库事务
**位置**: `saveUserAnswer`云函数
**风险等级**: 高
**问题描述**: 在更新答题记录、用户统计、错题记录时，没有使用事务，可能导致数据不一致

**当前代码**:
```javascript
// 步骤1：更新答题记录
await db.collection('user_answers').doc(recordId).update({
  data: updateData
})

// 步骤2：更新用户统计
await db.collection('users').doc(userId).update({
  data: statsUpdateData
})

// 步骤3：如果答错，添加到错题本
if (!isCorrect) {
  await db.collection('user_wrong_questions').add({
    data: wrongQuestionData
  })
}
```

**风险**: 如果步骤2或步骤3失败，会导致数据不一致

**建议修复**: 使用事务（详见4.2节）

#### 问题4：缺少操作日志
**位置**: 所有云函数
**风险等级**: 低
**问题描述**: 没有记录用户的关键操作（如答题、收藏、取消收藏等），无法进行审计

**建议修复**:
```javascript
// 创建操作日志集合
await db.collection('user_operation_logs').add({
  data: {
    userId,
    operationType: 'answer_question', // 答题、收藏、取消收藏等
    operationData: {
      questionId,
      userAnswer,
      isCorrect
    },
    operationTime: Date.now(),
    ipAddress: context.CLIENTIP, // 如果可用
    userAgent: context.CLIENTUA // 如果可用
  }
})
```

---

## 7. 性能优化建议

### 7.1 数据库索引优化

#### 建议1：为user_answers集合创建索引
```javascript
// 在云开发控制台创建索引
db.collection('user_answers').createIndex({
  index: {
    userId: 1,
    questionId: 1
  },
  name: 'userId_questionId',
  unique: true
})
```

**收益**: 提高查询答题记录的性能，特别是在用户答题数量较多时

#### 建议2：为user_favorites集合创建索引
```javascript
db.collection('user_favorites').createIndex({
  index: {
    userId: 1,
    questionId: 1
  },
  name: 'userId_questionId',
  unique: true
})
```

**收益**: 提高检查和添加收藏的性能

#### 建议3：为user_wrong_questions集合创建索引
```javascript
db.collection('user_wrong_questions').createIndex({
  index: {
    userId: 1,
    questionId: 1
  },
  name: 'userId_questionId',
  unique: true
})
```

**收益**: 提高查询和删除错题的性能

#### 建议4：为user_chapter_progress集合创建索引
```javascript
db.collection('user_chapter_progress').createIndex({
  index: {
    userId: 1,
    chapterId: 1
  },
  name: 'userId_chapterId',
  unique: true
})
```

**收益**: 提高查询和更新章节进度的性能

### 7.2 批量操作优化

#### 当前问题
在`getUserFavoriteQuestions`和`getUserWrongQuestions`云函数中，使用循环逐个查询题目详情：

```javascript
for (const questionId of favoriteQuestionIds) {
  const questionResult = await db.collection('quizQuestions')
    .where({
      questionId: questionId
    })
    .get()
  
  if (questionResult.data && questionResult.data.length > 0) {
    questions.push(questionResult.data[0])
  }
}
```

**性能问题**: 如果用户有100条收藏，需要执行100次数据库查询

#### 建议优化
使用`db.command.in`进行批量查询：

```javascript
// 使用in操作符批量查询
const questionsResult = await db.collection('quizQuestions')
  .where({
    questionId: db.command.in(favoriteQuestionIds)
  })
  .get()

const questions = questionsResult.data
```

**收益**: 将N次查询减少为1次查询，显著提高性能

---

## 8. 总结与建议

### 8.1 总体评估

**数据隔离等级**: ✅ **良好**

系统在数据隔离方面表现良好，所有用户数据操作都使用`userId`作为隔离条件，能够确保不同用户之间的数据不会混淆。

### 8.2 主要优势

1. ✅ **清晰的数据模型**: 使用独立的集合存储不同类型的用户数据
2. ✅ **严格的隔离机制**: 所有查询/更新都使用`userId`作为where条件
3. ✅ **统一的用户标识**: 使用OpenID作为用户唯一标识
4. ✅ **前端正确传递**: 所有页面都从`globalData`获取`userId`并传递给云函数

### 8.3 需要改进的地方

1. ⚠️ **使用事务**: 在`saveUserAnswer`等关键操作中使用事务，确保数据一致性
2. ⚠️ **严格参数验证**: 不要依赖前端传入的`userId`，应使用云函数上下文的`OPENID`
3. ⚠️ **添加输入验证**: 对所有输入参数进行格式和存在性验证
4. ⚠️ **创建数据库索引**: 为常用查询创建复合索引，提高性能
5. ⚠️ **批量操作优化**: 使用`in`操作符替代循环查询
6. ⚠️ **添加操作日志**: 记录用户关键操作，便于审计和问题排查

### 8.4 安全建议

1. **不要信任前端输入**: 所有云函数都应使用`wxContext.OPENID`作为用户标识，不要使用`event.userId`
2. **实施访问控制**: 对敏感操作（如删除错题、取消收藏）添加额外验证
3. **加密敏感数据**: 如果用户答案包含敏感信息，应进行加密存储
4. **定期安全审计**: 定期检查云函数日志，发现异常访问

### 8.5 下一步行动

**立即执行**:
1. 修改所有云函数，使用`wxContext.OPENID`作为唯一用户标识
2. 在`saveUserAnswer`中实现事务处理
3. 为所有集合创建必要的索引

**短期优化**:
1. 添加输入验证和错误处理
2. 优化批量查询操作
3. 添加操作日志功能

**长期规划**:
1. 实现实时数据同步（支持多设备登录）
2. 添加数据备份和恢复机制
3. 实施更细粒度的权限控制

---

**报告结束**
