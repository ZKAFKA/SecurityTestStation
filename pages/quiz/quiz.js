// pages/quiz.js
Page({
  data: {
    bankId: '',
    bankName: '',
    chapterId: '',
    chapterName: '',
    currentQuestionIndex: 0,
    questions: [],
    userAnswers: [],
    chosenum: null,
    moreArr: {},
    selectedCount: 0,
    showAnswer: false,
    isCorrect: null,
    isFavorite: false,
    questionResults: [],
    drawerVisible: false,
    questionList: [],
    touchStartX: 0,
    touchEndX: 0,
    loadingImages: {},
    errorImages: {},
    imageCache: {},
    imageMenuVisible: false,
    currentImageUrl: ''
  },

  async onLoad(options) {
    // 隐藏底部导航栏
    wx.hideTabBar();
    
    // 手动 decode 一次，防止上游跳转时 encodeURIComponent 过的中文没被解开
    var safe = function(v) {
      if (v === undefined || v === null) return '';
      try { return decodeURIComponent(String(v)); } catch (e) { return String(v); }
    };

    var bankId = options.id || '';
    var bankName = safe(options.name);
    var chapterId = options.chapterId || '';
    var chapterName = safe(options.chapterName);
    var path = safe(options.path);
    // 首页跳转传来的目标题号（0-indexed），优先用
    var resumeIndex = options.currentQuestion !== undefined && options.currentQuestion !== null
      ? Number(options.currentQuestion) : -1;
    // 分享打开的题目ID，定位到指定题
    var sharedQuestionId = safe(options.questionId);

    this.setData({
      bankId: bankId,
      bankName: bankName,
      chapterId: chapterId,
      chapterName: chapterName,
      path: path,
      resumeIndex: resumeIndex,
      sharedQuestionId: sharedQuestionId
    });
    
    // 动态设置导航栏标题（分享打开时可能缺名称，做兜底）
    var navTitle = [];
    if (bankName) navTitle.push(bankName);
    if (chapterName) navTitle.push(chapterName);
    wx.setNavigationBarTitle({
      title: navTitle.join(' - ') || '题目'
    });
    
    await this.loadQuestions();
  },

  // 原生模板广告加载成功
  adLoad() {
    console.log('原生模板广告加载成功')
  },

  // 原生模板广告加载失败
  adError(err) {
    console.error('原生模板广告加载失败', err)
  },

  // 原生模板广告关闭
  adClose() {
    console.log('原生模板广告关闭')
  },
  
  async onShow() {
    // 恢复当前题目的作答状态
    if (this.data.questions && this.data.questions.length > 0) {
      await this.loadCurrentQuestionState();
    }
    // 页面显示时初始化图片懒加载
    this.initImageLazyLoad();
  },

  onHide() {
    // 页面隐藏时保存进度并清理 IntersectionObserver
    this.saveProgress();
    if (this.imageObserver) {
      this.imageObserver.disconnect();
      this.imageObserver = null;
    }
  },

  // 初始化图片懒加载
  initImageLazyLoad() {
    // 先清理旧实例，避免 onShow 重复挂载 observer
    if (this.imageObserver) {
      this.imageObserver.disconnect();
      this.imageObserver = null;
    }
    // 创建IntersectionObserver实例
    this.imageObserver = wx.createIntersectionObserver(this, {
      observeAll: true
    });

    // 监听图片元素
    this.imageObserver.observe('.question-image', (res) => {
      if (res.intersectionRatio > 0) {
        // 图片进入视口，加载图片
        const questionId = res.dataset.questionId;
        if (questionId) {
          
          // 这里可以添加加载逻辑，例如设置loading状态
          const loadingImages = { ...this.data.loadingImages };
          loadingImages[questionId] = true;
          this.setData({ loadingImages });
        }
      }
    });
  },

  onUnload() {
    // 页面卸载时清理IntersectionObserver
    if (this.imageObserver) {
      this.imageObserver.disconnect();
      this.imageObserver = null;
    }
    // 显示底部导航栏
    wx.showTabBar();
    // 保存答题进度
    this.saveProgress();
    // 若本章所有题目都已作答，标记：返回章节页时提示左滑可重做
    this.markChapterCompleteForRedoHint();
  },

  // 刷完整个章节后标记，供章节页返回时提示“左滑可重做”
  markChapterCompleteForRedoHint() {
    const questions = this.data.questions;
    const questionResults = this.data.questionResults;
    if (!questions || !questions.length || !questionResults) return;

    let completed = 0;
    for (let i = 0; i < questionResults.length; i++) {
      if (questionResults[i] !== null && questionResults[i] !== undefined) completed++;
    }

    if (completed >= questions.length) {
      wx.setStorageSync('chapterRedoHintPending', {
        bankId: this.data.bankId,
        chapterId: this.data.chapterId,
        ts: Date.now()
      });
    }
  },

  async loadQuestions() {
    try {
      wx.showLoading({
        title: '加载题目...'
      });
      
      // 从数据库获取题目数据
      const result = await wx.cloud.callFunction({
        name: 'getQuizQuestions',
        data: {
          chapterId: this.data.chapterId
        }
      });
      
      let questions = [];
      if (result.result && Array.isArray(result.result)) {
        questions = result.result;
      }
      
      if (!questions || questions.length === 0) {
        wx.hideLoading();
        wx.showToast({
          title: '该章节暂无题目',
          icon: 'none'
        });
        return;
      }
      
      // 为每个题目添加answered属性，为每个选项添加status属性
      const formattedQuestions = questions.map((q, index) => {
        const optionsWithStatus = q.options.map(opt => ({
          ...opt,
          status: '' // '' | 'select' | 'right' | 'wrong'
        }));
        
        return {
          ...q,
          type: this.normalizeType(q.type),
          answered: false,
          options: optionsWithStatus
        };
      });
      
      // 初始化题目列表
      const questionList = formattedQuestions.map((q, index) => ({
        id: q.questionId,
        index: index,
        chosenum: null,
        judge: null
      }));
      
      this.setData({
          questions: formattedQuestions,
          userAnswers: new Array(formattedQuestions.length).fill(null),
          chosenum: null,
          moreArr: {},
          questionResults: new Array(formattedQuestions.length).fill(null),
          questionList: questionList,
          totalQuestions: formattedQuestions.length,
          currentQuestion: formattedQuestions[0],
          currentIndex: 0,
          favoritesSynced: false,
          favoriteQuestionIds: [],
          loading: false
        });
      
      // 尝试加载之前的答题进度
      // 优先用首页跳转传来的 resumeIndex（动态从云端算的），没有再回退到本地缓存
      let startIndex;
      if (this.data.resumeIndex >= 0 && this.data.resumeIndex < formattedQuestions.length) {
        startIndex = this.data.resumeIndex;
        // 同时把本地缓存也更新一下，保证后续 onHide/saveProgress 一致
        const progressKey = `quiz_progress_${this.data.bankId}_${this.data.chapterId}`;
        const progressData = wx.getStorageSync(progressKey);
        if (progressData && progressData.userAnswers) {
          // 本地有答题记录，恢复已答题状态
          this.setData({
            userAnswers: progressData.userAnswers,
            questionResults: progressData.questionResults || new Array(formattedQuestions.length).fill(null)
          });
          // 恢复每个已答题目的选项状态
          const setDataObj = {};
          for (let i = 0; i < formattedQuestions.length; i++) {
            const ua = progressData.userAnswers[i];
            if (ua && ua.length > 0) {
              setDataObj[`questions[${i}].answered`] = true;
            }
          }
          this.setData(setDataObj);
        }
      } else {
        startIndex = this.loadProgress();
      }
      
      // 分享打开：定位到指定题目
      if (this.data.sharedQuestionId) {
        for (var si = 0; si < formattedQuestions.length; si++) {
          if (formattedQuestions[si].questionId === this.data.sharedQuestionId) {
            startIndex = si;
            break;
          }
        }
      }

      // 设置从上次进度开始
      this.setData({
        currentQuestionIndex: startIndex
      });
      
      // ★ 权威数据源：从云端拉所有已答题记录，恢复全局已答状态
      // 章节列表显示的 N 题都要在这里恢复 marked，不能只靠本地缓存
      await this.restoreFromCloudAnswers(formattedQuestions);
      
      await this.loadCurrentQuestionState();
      
      wx.hideLoading();
      
    } catch (error) {
      console.error('加载题目数据失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  selectAnswer(e) {
    if (this.data.showAnswer) return;

    const dataset = e.currentTarget.dataset || {};
    const optionId = dataset.optionId || dataset.optionid || dataset['option-id'] || dataset.optionId;
    const currentQuestionIndex = this.data.currentQuestionIndex;

    

    if (!this.data.questions || !this.data.questions[currentQuestionIndex]) {
      console.error('题目数据未找到，currentQuestionIndex:', currentQuestionIndex);
      return;
    }

    const currentQuestion = this.data.questions[currentQuestionIndex];

    if (!optionId) {
      console.error('选项ID未找到', {dataset});
      return;
    }

    // 找到被点击的选项
    const optionIndex = currentQuestion.options.findIndex(opt => opt.id === optionId);
    if (optionIndex === -1) {
      console.error('选项未找到', {optionId, currentQuestionIndex});
      return;
    }

    const setDataObj = {};
    let newStatus;
    // 单选题、判断题：点击即判；多选题：选对部分继续选，选错或选全立即判
    const isImmediateType = currentQuestion.type === 'single' || currentQuestion.type === 'judge';

    if (isImmediateType) {
      // 单选题/判断题：先清空所有选项的status，然后设置当前选项为select
      // 使用精确的路径更新每个选项的状态，避免刷新整个questions数组
      currentQuestion.options.forEach((opt, idx) => {
        const path = `questions[${currentQuestionIndex}].options[${idx}].status`;
        setDataObj[path] = opt.id === optionId ? 'select' : '';
      });

      setDataObj.chosenum = optionId;

      
    } else {
      // 多选题：切换选项状态后立即判断
      const currentStatus = currentQuestion.options[optionIndex].status;
      newStatus = currentStatus === 'select' ? '' : 'select';
      const path = `questions[${currentQuestionIndex}].options[${optionIndex}].status`;
      setDataObj[path] = newStatus;

      // 更新moreArr
      const currentMoreArr = this.data.moreArr || {};
      const nextMoreArr = {
        ...currentMoreArr,
        [optionId]: newStatus === 'select'
      };
      setDataObj.moreArr = nextMoreArr;
      setDataObj.selectedCount = Object.keys(nextMoreArr).filter(key => nextMoreArr[key]).length;

      

      // 使用精确路径更新，避免刷新题干
      this.setData(setDataObj);

      // 多选题立即判断逻辑
      if (newStatus === 'select') {
        // 用户选中了一个选项
        const isCorrectOption = currentQuestion.correctAnswers.includes(optionId);

        if (!isCorrectOption) {
          // 选中的是错误选项 → 立即提交，显示回答错误
          this.submitAnswer();
          return;
        }

        // 选中的是正确选项 → 检查是否所有正确选项都已选中
        const allCorrectSelected = currentQuestion.correctAnswers.every(
          id => nextMoreArr[id]
        );

        if (allCorrectSelected) {
          // 所有正确选项已选中 → 提交，显示回答正确
          this.submitAnswer();
        }
        // 否则：仅部分正确选项被选中，不提交，允许继续选择
      }
      // 如果 newStatus === ''（取消选中），不提交
      return;
    }

    // 使用精确路径更新，避免刷新题干
    this.setData(setDataObj);

    // 单选题/判断题：点击后立即提交答案
    if (isImmediateType) {
      this.submitAnswer();
    }
  },



  // 归一化题型：兼容数据库中的中文取值（单选题/多选题/判断题）
  normalizeType(type) {
    const typeMap = {
      '单选题': 'single',
      '多选题': 'multiple',
      '判断题': 'judge'
    };
    return typeMap[type] || type || 'single';
  },

  async checkIfFavorite() {
    const app = getApp();
    const userId = app.globalData.userId;
    const { currentQuestionIndex, questions, favoriteQuestionIds, favoritesSynced } = this.data;
    if (currentQuestionIndex >= questions.length) return;

    const currentQuestion = questions[currentQuestionIndex];

    // 从内存数组快速判断收藏状态
    let isFavorite = favoriteQuestionIds.includes(currentQuestion.questionId);
    this.setData({ isFavorite: isFavorite });

    // 未登录不云请求
    if (!userId) return;

    // 内存还没同步过，从云端一次性拉全量 favorites
    if (!favoritesSynced) {
      try {
        const result = await wx.cloud.callFunction({
          name: 'getUserData',
          data: { userId: userId, needWrong: false, needChapterProgress: false }
        });
        if (result && result.result && result.result.success && result.result.data) {
          const userData = result.result.data;
          const favorites = userData.favorites || [];
          const questionIds = favorites.map(function(f) { return f.questionId; });
          this.setData({
            favoriteQuestionIds: questionIds,
            favoritesSynced: true
          });
          const refreshed = questionIds.includes(currentQuestion.questionId);
          if (refreshed !== isFavorite) {
            this.setData({ isFavorite: refreshed });
          }
        }
      } catch (error) {
        console.warn('checkIfFavorite 云端同步失败:', error);
      }
    }
  },

  async toggleFavorite() {
    const app = getApp();
    const userId = app.globalData.userId;
    const { currentQuestionIndex, questions, favoriteQuestionIds } = this.data;
    const currentQuestion = questions[currentQuestionIndex];
    let ids = favoriteQuestionIds.slice(); // 浅拷贝
    let isFavorite = !this.data.isFavorite; // 先算出目标状态

    if (isFavorite) {
      if (ids.indexOf(currentQuestion.questionId) === -1) {
        ids.push(currentQuestion.questionId);
      }
      wx.showToast({ title: '已收藏', icon: 'success' });
    } else {
      const idx = ids.indexOf(currentQuestion.questionId);
      if (idx > -1) ids.splice(idx, 1);
      wx.showToast({ title: '已取消收藏', icon: 'success' });
    }

    // 乐观更新内存 + UI（不再写本地 Storage）
    this.setData({
      favoriteQuestionIds: ids,
      isFavorite: isFavorite
    });

    // 同步到云端
    if (userId) {
      try {
        const result = await wx.cloud.callFunction({
          name: 'toggleFavorite',
          data: {
            userId: userId,
            questionId: currentQuestion.questionId,
            isFavorite: isFavorite
          }
        });

        if (result.result && result.result.success) {
          
        } else {
          console.error('同步收藏状态到云端失败:', result.result);
          // 云端失败 → 回滚
          this.setData({
            favoriteQuestionIds: favoriteQuestionIds,
            isFavorite: this.data.isFavorite
          });
        }
      } catch (error) {
        console.error('调用toggleFavorite云函数失败:', error);
      }
    }
  },

  submitAnswer() {
    const { currentQuestionIndex, questions, chosenum, moreArr } = this.data;
    
    if (!questions || !questions[currentQuestionIndex]) {
      console.error('题目数据未找到');
      return;
    }
    
    const currentQuestion = questions[currentQuestionIndex];
    
    
    let userAnswer = [];
    
    if (currentQuestion.type === 'single' || currentQuestion.type === 'judge') {
      if (!chosenum) {
        wx.showToast({
          title: '请先选择答案',
          icon: 'none'
        });
        return;
      }
      userAnswer = [chosenum];
    } else {
      userAnswer = Object.keys(moreArr).filter(key => moreArr[key]);
      if (userAnswer.length === 0) {
        wx.showToast({
          title: '请先选择答案',
          icon: 'none'
        });
        return;
      }
    }
    
    const isCorrect = this.checkAnswer(userAnswer, currentQuestion.correctAnswers);
    
    // 更新选项的status为right或wrong
    const newOptions = currentQuestion.options.map(opt => {
      const isCorrectAnswer = currentQuestion.correctAnswers.includes(opt.id);
      const isUserAnswer = userAnswer.includes(opt.id);

      let status = '';
      if (isCorrectAnswer) {
        status = 'right'; // 正确答案
      } else if (isUserAnswer) {
        status = 'wrong'; // 用户选的错误答案
      } else {
        status = ''; // 用户没选的错误答案
      }

      return {
        ...opt,
        status: status
      };
    });

    
    
    // 更新题目数据
    const newQuestions = [...this.data.questions];
    newQuestions[currentQuestionIndex] = {
      ...currentQuestion,
      answered: true,
      options: newOptions
    };
    
    const newUserAnswers = [...this.data.userAnswers];
    newUserAnswers[currentQuestionIndex] = userAnswer;
    
    const newQuestionResults = [...this.data.questionResults];
    newQuestionResults[currentQuestionIndex] = isCorrect;
    
    this.setData({
      questions: newQuestions,
      userAnswers: newUserAnswers,
      questionResults: newQuestionResults,
      showAnswer: true,
      isCorrect: isCorrect
    });

    // 先等答题记录写入（saveUserAnswer 事务提交后 user_answers 才是最新的），
    // 再更新章节进度；否则 updateChapterProgress 读到旧的答题数量，
    // 会算出滞后的 isCompleted/进度，导致首页「继续刷题」把已完成章节显示成第 1 题
    this.saveAnswerRecord(currentQuestion.questionId, userAnswer, isCorrect).then(function() {
      this.updateChapterProgress();
    }.bind(this));
  },

  checkAnswer(userAnswer, correctAnswers) {
    if (userAnswer.length !== correctAnswers.length) return false;
    
    const sortedUserAnswer = [...userAnswer].sort();
    const sortedCorrectAnswers = [...correctAnswers].sort();
    
    return sortedUserAnswer.every((answer, index) => answer === sortedCorrectAnswers[index]);
  },

  async saveAnswerRecord(questionId, userAnswer, isCorrect) {
    const app = getApp();
    const userId = app.globalData.userId;
    const currentQuestion = this.data.questions[this.data.currentQuestionIndex];
    const now = new Date().getTime();

    // 保存到本地存储
    let answerHistory = wx.getStorageSync('answerHistory') || [];
    answerHistory.push({
      questionId: currentQuestion.questionId,
      bankId: this.data.bankId,
      selectedAnswers: userAnswer,
      isCorrect: isCorrect,
      answerTime: now
    });
    if (answerHistory.length > 1000) {
      answerHistory = answerHistory.slice(-1000);
    }
    wx.setStorageSync('answerHistory', answerHistory);

    // 本地错题列表（仅快速兜底显示，权威数据源是云端 user_wrong_questions）
    // 注：不再维护 totalQuestions/correctAnswers/bankAnswerStats 本地统计
    // saveUserAnswer 云函数已同时更新 users 表的 totalQuestions/correctAnswers 字段
    if (!isCorrect) {
      let wrongQuestions = wx.getStorageSync('wrongQuestions') || [];
      if (!wrongQuestions.includes(currentQuestion.questionId)) {
        wrongQuestions.push(currentQuestion.questionId);
        wx.setStorageSync('wrongQuestions', wrongQuestions);
      }
    }

    // 同步到云端
    if (userId) {
      try {
        
        
        const result = await wx.cloud.callFunction({
          name: 'saveUserAnswer',
          data: {
            userId: userId,
            questionId: currentQuestion.questionId,
            source: 'normal',
            bankId: this.data.bankId,
            chapterId: this.data.chapterId,
            userAnswer: userAnswer,
            correctAnswer: currentQuestion.correctAnswers || (currentQuestion.answer ? [currentQuestion.answer] : []),
            isCorrect: isCorrect,
            spendTime: 0
          }
        });

        
        
        if (result.result.success) {
          
        } else {
          console.error('保存答题记录到云端失败:', result.result);
        }
      } catch (error) {
        console.error('调用saveUserAnswer云函数失败:', error);
      }
    } else {
      console.error('userId为空，无法保存到云端');
    }
  },
  
  // 更新章节进度
  async updateChapterProgress() {
    const app = getApp();
    const userId = app.globalData.userId;

    if (!this.data.chapterId) return;

    // 统计当前章节已完成的题目数量
    const completed = this.data.questionResults.filter(result => result !== null).length;
    const total = this.data.questions.length;
    const progress = total > 0 ? (completed / total) * 100 : 0;

    // 保存进度到本地存储
    const progressKey = `chapter_progress_${this.data.bankId}_${this.data.chapterId}`;
    wx.setStorageSync(progressKey, completed);

    // 同步到云端
    if (userId) {
      try {
        const result = await wx.cloud.callFunction({
          name: 'updateChapterProgress',
          data: {
            userId: userId,
            bankId: this.data.bankId,
            chapterId: this.data.chapterId,
            completed: completed,
            total: total,
            progress: progress
          }
        });

        if (result.result.success) {
          
        } else {
          console.error('同步章节进度到云端失败:', result.result);
        }
      } catch (error) {
        console.error('调用updateChapterProgress云函数失败:', error);
      }
    }
  },

  // 从云端拉取该章节所有已答题记录，恢复全局已答状态（权威数据源）
  // 走独立云函数 getChapterAnswers，绕开客户端 db 权限隔离问题
  async restoreFromCloudAnswers(questions) {
    const app = getApp();
    const userId = app.globalData.userId;
    const chapterId = this.data.chapterId;
    if (!userId || !chapterId || !questions) return;

    try {
      const result = await wx.cloud.callFunction({
        name: 'getChapterAnswers',
        data: { userId: userId, chapterId: chapterId }
      });

      if (!result || !result.result || !result.result.success) {
        console.warn('getChapterAnswers 返回异常:', result);
        return;
      }

      const answers = result.result.data || [];
      if (answers.length === 0) {
        return;
      }

      // questionId -> answer 映射
      const ansMap = {};
      for (let i = 0; i < answers.length; i++) {
        ansMap[answers[i].questionId] = answers[i];
      }

      const setDataObj = {};
      const userAnswersArr = this.data.userAnswers.slice();
      const questionResultsArr = this.data.questionResults.slice();

      for (let i = 0; i < questions.length; i++) {
        const ans = ansMap[questions[i].questionId];
        if (ans) {
          setDataObj['questions[' + i + '].answered'] = true;
          userAnswersArr[i] = ans.userAnswer || null;
          questionResultsArr[i] = !!ans.isCorrect;
        }
      }

      setDataObj.userAnswers = userAnswersArr;
      setDataObj.questionResults = questionResultsArr;

      this.setData(setDataObj);
    } catch (err) {
      console.warn('restoreFromCloudAnswers 失败:', err);
    }
  },

  async loadCurrentQuestionState() {
    const currentIndex = this.data.currentQuestionIndex;
    const savedAnswer = this.data.userAnswers[currentIndex];
    const savedResult = this.data.questionResults[currentIndex];
    const currentQuestion = this.data.questions[currentIndex];

    const hasSubmitted = savedAnswer && Array.isArray(savedAnswer) && savedAnswer.length > 0;

    

    if (hasSubmitted && currentQuestion) {
      // ★ 按 submitAnswer 相同的逻辑重建选项 status（right / wrong / ''）
      const correctAnswers = currentQuestion.correctAnswers || [];
      const newOptions = currentQuestion.options.map(opt => {
        const isCorrectAnswer = correctAnswers.includes(opt.id);
        const isUserAnswer = savedAnswer.includes(opt.id);
        let status = '';
        if (isCorrectAnswer) {
          status = 'right';
        } else if (isUserAnswer) {
          status = 'wrong';
        }
        return { ...opt, status };
      });

      const newQuestions = [...this.data.questions];
      newQuestions[currentIndex] = { ...currentQuestion, options: newOptions };

      // 恢复选中状态 + 选项 status 一起 setData
      const baseSetData = {
        questions: newQuestions,
        showAnswer: true,
        isCorrect: savedResult
      };

      if (currentQuestion.type === 'single' || currentQuestion.type === 'judge') {
        baseSetData.chosenum = savedAnswer[0];
        baseSetData.moreArr = {};
        baseSetData.selectedCount = 0;
      } else {
        const moreArr = {};
        savedAnswer.forEach(id => { moreArr[id] = true; });
        baseSetData.chosenum = undefined;
        baseSetData.moreArr = moreArr;
        baseSetData.selectedCount = savedAnswer.length;
      }
      this.setData(baseSetData);
    } else {
      // 未回答过：保持未选中状态 + 清空选项 status
      const newOptions = currentQuestion
        ? currentQuestion.options.map(opt => ({ ...opt, status: '' }))
        : [];
      const newQuestions = currentQuestion
        ? [...this.data.questions].map((q, i) => i === currentIndex ? { ...q, options: newOptions } : q)
        : this.data.questions;

      this.setData({
        questions: newQuestions,
        chosenum: null,
        moreArr: {},
        selectedCount: 0,
        showAnswer: false,
        isCorrect: null
      });
    }

    await this.checkIfFavorite();
  },

  nextQuestion() {
    if (this.data.currentQuestionIndex >= this.data.questions.length - 1) {
      wx.showToast({
        title: '已是最后一题',
        icon: 'none'
      });
      return;
    }

    const nextIndex = this.data.currentQuestionIndex + 1;

    // 获取目标题目
    const nextQuestion = this.data.questions[nextIndex];
    if (!nextQuestion) {
      console.error('目标题目不存在', nextIndex);
      return;
    }

    // 获取目标题目的用户答案和结果
    const userAnswer = this.data.userAnswers[nextIndex];
    const isCorrect = this.data.questionResults[nextIndex];
    const hasSubmitted = userAnswer !== undefined && userAnswer !== null;

    // 立即清空当前选择状态
    this.setData({
      chosenum: null,
      moreArr: {},
      selectedCount: 0,
      showAnswer: false,
      isCorrect: null
    });

    setTimeout(async () => {
        // 更新题目索引
        this.setData({
          currentQuestionIndex: nextIndex
        });

        // 加载题目的状态
        await this.loadCurrentQuestionState();
      }, 100);
  },

  prevQuestion() {
    if (this.data.currentQuestionIndex <= 0) {
      wx.showToast({
        title: '已是第一题',
        icon: 'none'
      });
      return;
    }

    const prevIndex = this.data.currentQuestionIndex - 1;

    // 获取目标题目
    const prevQuestion = this.data.questions[prevIndex];
    if (!prevQuestion) {
      console.error('目标题目不存在', prevIndex);
      return;
    }

    // 立即清空当前选择状态
    this.setData({
      chosenum: null,
      moreArr: {},
      selectedCount: 0,
      showAnswer: false,
      isCorrect: null
    });

    setTimeout(async () => {
        // 更新题目索引
        this.setData({
          currentQuestionIndex: prevIndex
        });

        // 加载题目的状态
        await this.loadCurrentQuestionState();
      }, 100);
  },

  // 切换抽屉显示状态
  toggleDrawer() {
    this.setData({
      drawerVisible: !this.data.drawerVisible
    });
  },

  // 跳转到指定题目
  jumpToQuestion(e) {
    const dataset = e.currentTarget.dataset || {};
    const index = dataset.index;

    if (index !== undefined && index >= 0 && index < this.data.questions.length) {
      // 关闭抽屉
      this.setData({
        drawerVisible: false
      });

      // 跳转到指定题目
      const targetQuestion = this.data.questions[index];
      const userAnswer = this.data.userAnswers[index];
      const isCorrect = this.data.questionResults[index];
      const hasSubmitted = userAnswer !== undefined && userAnswer !== null;

      // 清空当前选择状态
      this.setData({
        chosenum: null,
        moreArr: {},
        selectedCount: 0,
        showAnswer: false,
        isCorrect: null
      });

      setTimeout(async () => {
          

          // 更新题目索引
          this.setData({
            currentQuestionIndex: index
          });

          // 加载当前题目的状态
          await this.loadCurrentQuestionState();

          // 延迟一段时间后检查选项状态
          setTimeout(() => {
            
          }, 200);
        }, 100);
    }
  },
  
  // 处理滑动事件
  handleSwipe() {
    const { touchStartX, touchEndX, currentQuestionIndex, questions } = this.data;
    const threshold = 150; // 提高滑动阈值，降低灵敏度
    const swipeDistance = touchStartX - touchEndX;
    
    // 左滑：下一题
    if (swipeDistance > threshold && currentQuestionIndex < questions.length - 1) {
      this.setData({
        currentQuestionIndex: currentQuestionIndex + 1
      });
    }
    
    // 右滑：上一题
    if (swipeDistance < -threshold && currentQuestionIndex > 0) {
      this.setData({
        currentQuestionIndex: currentQuestionIndex - 1
      });
    }
  },
  
  // 处理swiper组件的变化事件
  async onQuestionChange(e) {
    const currentIndex = e.detail.current;
    if (currentIndex !== this.data.currentQuestionIndex) {
      this.setData({
        currentQuestionIndex: currentIndex
      });
      await this.loadCurrentQuestionState();
    }
  },
  
  // 提交试卷
  submitExam() {
    const { questions, questionResults } = this.data;
    
    // 计算答题结果
    const totalQuestions = questions.length;
    const answeredQuestions = questionResults.filter(result => result !== null).length;
    const correctAnswers = questionResults.filter(result => result === true).length;
    
    // 显示考试结果
    wx.showModal({
      title: '考试完成',
      content: `共${totalQuestions}题，已答${answeredQuestions}题，正确${correctAnswers}题，正确率${((correctAnswers / totalQuestions) * 100).toFixed(1)}%`,
      showCancel: false,
      success: (res) => {
        if (res.confirm) {
          // 保存当前进度（不清除）
          this.saveProgress();
          // 返回上一页
          wx.navigateBack();
        }
      }
    });
  },

  // 保存答题进度
  // 注：本地只保留 quiz_progress_*（恢复页面内未退出时的作答状态用）
  // 章节完成进度 / 继续练习位置 全部由云端 user_chapter_progress + user_answers 动态计算
  saveProgress() {
    const { bankId, chapterId, currentQuestionIndex, userAnswers, questionResults } = this.data;
    
    // 计算已完成的题目数量
    const completedCount = questionResults.filter(result => result !== null).length;
    const now = Date.now();
    
    // 保存进度到本地存储（仅恢复页面内作答状态）
    const progressKey = `quiz_progress_${bankId}_${chapterId}`;
    const progressData = {
      currentQuestionIndex: currentQuestionIndex,
      userAnswers: userAnswers,
      questionResults: questionResults,
      completedCount: completedCount,
      timestamp: now
    };
    
    wx.setStorageSync(progressKey, progressData);
  },

  // 加载答题进度
  loadProgress() {
    const { bankId, chapterId, questions } = this.data;
    
    const progressKey = `quiz_progress_${bankId}_${chapterId}`;
    const progressData = wx.getStorageSync(progressKey);
    
    if (progressData && progressData.userAnswers && progressData.userAnswers.length === questions.length) {
      // 恢复答题数据
      this.setData({
        userAnswers: progressData.userAnswers,
        questionResults: progressData.questionResults
      });
      
      // 恢复每个题目的选项状态
      const setDataObj = {};
      
      for (let i = 0; i < questions.length; i++) {
        const userAnswer = progressData.userAnswers[i];
        const questionResult = progressData.questionResults[i];
        const question = questions[i];
        
        // 如果这道题已经答过
        if (userAnswer && userAnswer.length > 0) {
          // 标记题目为已答
          setDataObj[`questions[${i}].answered`] = true;
          
          // 设置每个选项的状态
          for (let j = 0; j < question.options.length; j++) {
            const option = question.options[j];
            const isUserAnswer = userAnswer.includes(option.id);
            const isCorrectAnswer = question.correctAnswers.includes(option.id);
            
            let status = '';
            if (isCorrectAnswer) {
              status = 'right';
            } else if (isUserAnswer && questionResult === false) {
              status = 'wrong';
            } else if (isUserAnswer) {
              status = 'select';
            }
            
            setDataObj[`questions[${i}].options[${j}].status`] = status;
          }
        }
      }
      
      // 应用所有状态更新
      this.setData(setDataObj);
      
      // 找到下一道未答的题目
      const nextUnansweredIndex = progressData.questionResults.findIndex(result => result === null);
      
      // 如果有未答的题目，从下一道未答的开始
      // 如果所有题目都已答完，从最后一题开始
      const startIndex = nextUnansweredIndex !== -1 ? nextUnansweredIndex : questions.length - 1;
      
      return startIndex;
    }
    
    return 0;
  },

  // 清除答题进度
  clearProgress() {
    const { bankId, chapterId } = this.data;
    const progressKey = `quiz_progress_${bankId}_${chapterId}`;
    
    wx.removeStorageSync(progressKey);
  },
  
  // 图片加载开始
  onImageLoadStart(e) {
    const questionId = e.currentTarget.dataset.questionId;
    const loadingImages = { ...this.data.loadingImages };
    loadingImages[questionId] = true;
    this.setData({ loadingImages });
  },
  
  // 图片加载完成
  onImageLoad(e) {
    const questionId = e.currentTarget.dataset.questionId;
    const loadingImages = { ...this.data.loadingImages };
    const errorImages = { ...this.data.errorImages };
    const imageCache = { ...this.data.imageCache };
    loadingImages[questionId] = false;
    errorImages[questionId] = false;
    // 获取当前问题的图片URL并添加到缓存
    const currentQuestion = this.data.questions.find(q => q.questionId === questionId);
    if (currentQuestion && currentQuestion.imageUrl) {
      imageCache[currentQuestion.imageUrl] = true;
      this.setData({ imageCache });
      
    }
    this.setData({ loadingImages, errorImages });
    
  },
  
  // 图片加载失败
  onImageError(e) {
    const questionId = e.currentTarget.dataset.questionId;
    const loadingImages = { ...this.data.loadingImages };
    const errorImages = { ...this.data.errorImages };
    loadingImages[questionId] = false;
    errorImages[questionId] = true;
    this.setData({ loadingImages, errorImages });
    
  },
  
  // 重试加载图片
  retryLoadImage(e) {
    const questionId = e.currentTarget.dataset.questionId;
    
    
    // 重置错误状态
    const errorImages = { ...this.data.errorImages };
    errorImages[questionId] = false;
    this.setData({ errorImages });
    
    // 触发图片重新加载
    const currentQuestion = this.data.questions.find(q => q.questionId === questionId);
    if (currentQuestion) {
      // 可以通过修改src属性来触发重新加载
      // 这里我们可以先设置为空，然后再设置回原始值
      const tempUrl = currentQuestion.imageUrl;
      currentQuestion.imageUrl = '';
      this.setData({ questions: this.data.questions });
      
      setTimeout(() => {
        currentQuestion.imageUrl = tempUrl;
        this.setData({ questions: this.data.questions });
      }, 100);
    }
  },

  // 预览图片 - 使用微信原生API
  previewImage(e) {
    const imageUrl = e.currentTarget.dataset.imageUrl;
    if (imageUrl && imageUrl !== '无图片') {
      // 获取所有图片URL用于左右滑动查看
      const allImages = this.data.questions
        .filter(q => q.imageUrl && q.imageUrl !== '无图片')
        .map(q => q.imageUrl);
      
      // 找到当前图片的索引
      const currentIndex = allImages.indexOf(imageUrl);
      
      wx.previewImage({
        current: imageUrl,
        urls: allImages,
        success: (res) => {
          },
        fail: (err) => {
          console.error('图片预览失败', err);
          wx.showToast({
            title: '图片预览失败',
            icon: 'none'
          });
        }
      });
    }
  },

  // 显示图片操作菜单
  showImageMenu(e) {
    const imageUrl = e.currentTarget.dataset.imageUrl;
    if (imageUrl && imageUrl !== '无图片') {
      this.setData({
        currentImageUrl: imageUrl,
        imageMenuVisible: true
      });
    }
  },

  // 隐藏图片操作菜单
  onImageMenuChange(e) {
    this.setData({
      imageMenuVisible: false
    });
  },

  // 保存图片
  saveImage() {
    const imageUrl = this.data.currentImageUrl;
    if (!imageUrl) return;

    wx.showLoading({
      title: '保存中...'
    });

    // 先下载图片到本地
    wx.downloadFile({
      url: imageUrl,
      success: (res) => {
        if (res.statusCode === 200) {
          // 保存图片到相册
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              wx.hideLoading();
              wx.showToast({
                title: '保存成功',
                icon: 'success'
              });
              this.setData({ imageMenuVisible: false });
            },
            fail: (err) => {
              wx.hideLoading();
              console.error('保存图片失败', err);
              if (err.errMsg.includes('auth')) {
                wx.showModal({
                  title: '提示',
                  content: '需要您授权保存图片到相册',
                  confirmText: '去授权',
                  success: (modalRes) => {
                    if (modalRes.confirm) {
                      wx.openSetting({
                        success: (settingRes) => {
                          if (settingRes.authSetting['scope.writePhotosAlbum']) {
                            this.saveImage();
                          }
                        }
                      });
                    }
                  }
                });
              } else {
                wx.showToast({
                  title: '保存失败',
                  icon: 'none'
                });
              }
            }
          });
        } else {
          wx.hideLoading();
          wx.showToast({
            title: '下载失败',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('下载图片失败', err);
        wx.showToast({
          title: '下载失败',
          icon: 'none'
        });
      }
    });
  },

  // 从菜单预览图片
  previewImageFromMenu() {
    const imageUrl = this.data.currentImageUrl;
    if (imageUrl) {
      // 获取所有图片URL用于左右滑动查看
      const allImages = this.data.questions
        .filter(q => q.imageUrl && q.imageUrl !== '无图片')
        .map(q => q.imageUrl);
      
      // 找到当前图片的索引
      const currentIndex = allImages.indexOf(imageUrl);
      
      wx.previewImage({
        current: imageUrl,
        urls: allImages,
        success: (res) => {
          this.setData({ imageMenuVisible: false });
        },
        fail: (err) => {
          console.error('图片预览失败', err);
          wx.showToast({
            title: '图片预览失败',
            icon: 'none'
          });
        }
      });
    }
  },

  onShareAppMessage: function() {
    var q = (this.data.questions && this.data.questions[this.data.currentQuestionIndex]) || {};
    var path = '/pages/quiz/quiz?id=' + encodeURIComponent(this.data.bankId || '') +
      '&chapterId=' + encodeURIComponent(this.data.chapterId || '') +
      '&name=' + encodeURIComponent(this.data.bankName || '') +
      '&chapterName=' + encodeURIComponent(this.data.chapterName || '') +
      '&questionId=' + encodeURIComponent(q.questionId || '');
    return {
      title: '快来看看这道题！ ——来自网络安全刷题站',
      path: path,
      imageUrl: 'cloud://cloud1-2gdek8xx22a5db1a.636c-cloud1-2gdek8xx22a5db1a-1395189804/weda-uploader/b30bb99d6ec016c0c53126b13e92efda-网络安全刷题站.jpg',
      fail: function(res) { wx.showToast({ title: '分享失败，请重试', icon: 'none' }); }
    };
  },

  onShareTimeline: function() {
    var q = (this.data.questions && this.data.questions[this.data.currentQuestionIndex]) || {};
    var query = 'id=' + encodeURIComponent(this.data.bankId || '') +
      '&chapterId=' + encodeURIComponent(this.data.chapterId || '') +
      '&name=' + encodeURIComponent(this.data.bankName || '') +
      '&chapterName=' + encodeURIComponent(this.data.chapterName || '') +
      '&questionId=' + encodeURIComponent(q.questionId || '');
    return {
      title: '网络安全刷题站 - 完全免费的网络安全考试题库',
      query: query,
      imageUrl: 'cloud://cloud1-2gdek8xx22a5db1a.636c-cloud1-2gdek8xx22a5db1a-1395189804/weda-uploader/b30bb99d6ec016c0c53126b13e92efda-网络安全刷题站.jpg'
    };
  }
})
