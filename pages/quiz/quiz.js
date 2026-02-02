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
    
    this.setData({
      bankId: options.id,
      bankName: options.name,
      chapterId: options.chapterId,
      chapterName: options.chapterName,
      path: options.path || ''
    });
    
    // 动态设置导航栏标题
    wx.setNavigationBarTitle({
      title: `${options.name} - ${options.chapterName}`
    });
    
    await this.loadQuestions();
  },
  
  onShow() {
    // 页面显示时初始化图片懒加载
    this.initImageLazyLoad();
  },
  
  // 初始化图片懒加载
  initImageLazyLoad() {
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
          console.log('图片进入视口，开始加载:', questionId);
          // 这里可以添加加载逻辑，例如设置loading状态
          const loadingImages = { ...this.data.loadingImages };
          loadingImages[questionId] = true;
          this.setData({ loadingImages });
        }
      }
    });
  },
  
  onHide() {
    // 页面隐藏时清理IntersectionObserver
    if (this.imageObserver) {
      this.imageObserver.disconnect();
    }
  },
  
  onUnload() {
    // 页面卸载时清理IntersectionObserver
    if (this.imageObserver) {
      this.imageObserver.disconnect();
    }
    // 显示底部导航栏
    wx.showTabBar();
    // 保存答题进度
    console.log('onUnload: 保存答题进度');
    this.saveProgress();
  },
  
  onHide() {
    // 页面隐藏时保存进度
    console.log('onHide: 保存答题进度');
    this.saveProgress();
  },

  async onShow() {
    if (this.data.questions && this.data.questions.length > 0) {
      await this.loadCurrentQuestionState();
    }
  },

  async loadQuestions() {
    try {
      wx.showLoading({
        title: '加载题目...'
      });
      
      console.log('加载题目，chapterId:', this.data.chapterId);
      
      // 从数据库获取题目数据
      const result = await wx.cloud.callFunction({
        name: 'getQuizQuestions',
        data: {
          chapterId: this.data.chapterId
        }
      });
      
      console.log('获取题目数据结果:', result.result);
      
      let questions = [];
      if (result.result && Array.isArray(result.result)) {
        questions = result.result;
      }
      
      console.log('题目数据:', questions);
      
      // 调试：检查第一题的选项
      if (questions.length > 0) {
        console.log('第一题详情:', {
          questionContent: questions[0].questionContent,
          options: questions[0].options,
          optionsCount: questions[0].options ? questions[0].options.length : 0,
          correctAnswers: questions[0].correctAnswers,
          type: questions[0].type
        });
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
        console.log('初始化题目', index, '选项状态:', optionsWithStatus.map(opt => ({id: opt.id, status: opt.status})));
        return {
          ...q,
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
          loading: false
        });
      
      // 尝试加载之前的答题进度
      const startIndex = this.loadProgress();
      
      // 设置从上次进度开始
      this.setData({
        currentQuestionIndex: startIndex
      });
      
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

    console.log('selectAnswer:', {currentQuestionIndex, optionId});

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

    if (currentQuestion.type === 'single') {
      // 单选题：先清空所有选项的status，然后设置当前选项为select
      // 使用精确的路径更新每个选项的状态，避免刷新整个questions数组
      currentQuestion.options.forEach((opt, idx) => {
        const path = `questions[${currentQuestionIndex}].options[${idx}].status`;
        setDataObj[path] = opt.id === optionId ? 'select' : '';
      });

      setDataObj.chosenum = optionId;

      console.log('设置单选题选项状态:', currentQuestionIndex, currentQuestion.options.map(opt => ({id: opt.id, status: opt.id === optionId ? 'select' : ''})));
    } else {
      // 多选题：切换当前选项的status
      const currentStatus = currentQuestion.options[optionIndex].status;
      const newStatus = currentStatus === 'select' ? '' : 'select';
      const path = `questions[${currentQuestionIndex}].options[${optionIndex}].status`;
      setDataObj[path] = newStatus;

      // 更新moreArr
      const currentMoreArr = this.data.moreArr || {};
      setDataObj.moreArr = {
        ...currentMoreArr,
        [optionId]: newStatus === 'select'
      };

      console.log('设置多选题选项状态:', currentQuestionIndex, {optionId, newStatus});
    }

    // 使用精确路径更新，避免刷新题干
    this.setData(setDataObj);

    // 立即提交答案，不延迟
    this.submitAnswer();
  },

  async checkIfFavorite() {
    const app = getApp();
    const userId = app.globalData.userId;
    const { currentQuestionIndex, questions } = this.data;
    if (currentQuestionIndex >= questions.length) return;

    const currentQuestion = questions[currentQuestionIndex];

    // 先从本地缓存获取
    const favoriteQuestions = wx.getStorageSync('favoriteQuestions') || [];
    let isFavorite = favoriteQuestions.includes(currentQuestion.questionId);

    // 立即显示本地缓存的收藏状态
    this.setData({
      isFavorite: isFavorite
    });

    // 如果有用户ID，并且本地缓存为空或已过期，从云端获取最新的收藏状态
    if (userId && (favoriteQuestions.length === 0 || !this.data.favoritesSynced)) {
      try {
        const result = await wx.cloud.callFunction({
          name: 'getUserData',
          data: {
            userId: userId
          }
        });

        if (result.result.success && result.result.data) {
          const userData = result.result.data;
          const favorites = userData.favorites || [];
          
          console.log('从云端获取的收藏数据:', favorites);
          
          const questionIds = favorites.map(f => f.questionId);
          
          // 更新本地缓存
          wx.setStorageSync('favoriteQuestions', questionIds);
          
          // 标记已同步
          this.setData({
            favoritesSynced: true
          });
          
          // 检查当前题目是否在收藏列表中
          const currentIsFavorite = questionIds.includes(currentQuestion.questionId);
          
          // 如果状态发生变化，更新UI
          if (currentIsFavorite !== isFavorite) {
            this.setData({
              isFavorite: currentIsFavorite
            });
          }
          
          console.log('从云端同步收藏状态:', currentQuestion.questionId, currentIsFavorite, 'favoritesCount:', favorites.length);
        }
      } catch (error) {
        console.error('从云端获取收藏状态失败:', error);
      }
    }
  },

  async toggleFavorite() {
    const app = getApp();
    const userId = app.globalData.userId;
    const { currentQuestionIndex, questions } = this.data;
    const currentQuestion = questions[currentQuestionIndex];
    const favoriteQuestions = wx.getStorageSync('favoriteQuestions') || [];
    let isFavorite = this.data.isFavorite;

    console.log('toggleFavorite:', {userId, questionId: currentQuestion ? currentQuestion.questionId : null, questionData: currentQuestion});

    if (isFavorite) {
      const index = favoriteQuestions.indexOf(currentQuestion.questionId);
      if (index > -1) {
        favoriteQuestions.splice(index, 1);
      }
      isFavorite = false;
      wx.showToast({
        title: '已取消收藏',
        icon: 'success'
      });
    } else {
      favoriteQuestions.push(currentQuestion.questionId);
      isFavorite = true;
      wx.showToast({
        title: '已收藏',
        icon: 'success'
      });
    }

    wx.setStorageSync('favoriteQuestions', favoriteQuestions);

    this.setData({
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

        if (result.result.success) {
          console.log('收藏状态已同步到云端');
        } else {
          console.error('同步收藏状态到云端失败:', result.result);
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
    console.log('submitAnswer:', {currentQuestionIndex, chosenum, moreArr});
    
    let userAnswer = [];
    
    if (currentQuestion.type === 'single') {
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

    console.log('提交答案后选项状态:', currentQuestionIndex, newOptions.map(opt => ({id: opt.id, status: opt.status})));
    
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
    
    this.saveAnswerRecord(currentQuestion.questionId, userAnswer, isCorrect);
    
    // 更新章节进度
    this.updateChapterProgress();
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

    if (!isCorrect) {
      let wrongQuestions = wx.getStorageSync('wrongQuestions') || [];
      if (!wrongQuestions.includes(currentQuestion.questionId)) {
        wrongQuestions.push(currentQuestion.questionId);
        wx.setStorageSync('wrongQuestions', wrongQuestions);
      }
    }

    let totalQuestions = wx.getStorageSync('totalQuestions') || 0;
    let correctAnswers = wx.getStorageSync('correctAnswers') || 0;
    let bankAnswerStats = wx.getStorageSync('bankAnswerStats') || {};
    if (!bankAnswerStats[this.data.bankId]) {
      bankAnswerStats[this.data.bankId] = { total: 0, correct: 0 };
    }

    totalQuestions++;
    bankAnswerStats[this.data.bankId].total++;

    if (isCorrect) {
      correctAnswers++;
      bankAnswerStats[this.data.bankId].correct++;
    }

    wx.setStorageSync('totalQuestions', totalQuestions);
    wx.setStorageSync('correctAnswers', correctAnswers);
    wx.setStorageSync('bankAnswerStats', bankAnswerStats);

    // 同步到云端
    if (userId) {
      try {
        console.log('准备调用saveUserAnswer云函数，参数:', {
          userId: userId,
          questionId: currentQuestion.questionId,
          bankId: this.data.bankId,
          chapterId: this.data.chapterId,
          userAnswer: userAnswer,
          correctAnswer: currentQuestion.correctAnswers || (currentQuestion.answer ? [currentQuestion.answer] : []),
          isCorrect: isCorrect,
          spendTime: 0
        });
        
        const result = await wx.cloud.callFunction({
          name: 'saveUserAnswer',
          data: {
            userId: userId,
            questionId: currentQuestion.questionId,
            bankId: this.data.bankId,
            chapterId: this.data.chapterId,
            userAnswer: userAnswer,
            correctAnswer: currentQuestion.correctAnswers || (currentQuestion.answer ? [currentQuestion.answer] : []),
            isCorrect: isCorrect,
            spendTime: 0
          }
        });

        console.log('saveUserAnswer云函数返回结果:', result);
        
        if (result.result.success) {
          console.log('答题记录已保存到云端');
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
          console.log('章节进度已同步到云端');
        } else {
          console.error('同步章节进度到云端失败:', result.result);
        }
      } catch (error) {
        console.error('调用updateChapterProgress云函数失败:', error);
      }
    }
  },

  async loadCurrentQuestionState() {
    const currentIndex = this.data.currentQuestionIndex;
    const savedAnswer = this.data.userAnswers[currentIndex];
    const savedResult = this.data.questionResults[currentIndex];
    const currentQuestion = this.data.questions[currentIndex];

    const hasSubmitted = savedAnswer && savedAnswer.length > 0;

    console.log('加载题目状态:', currentIndex, 'answered:', currentQuestion ? currentQuestion.answered : false, 'hasSubmitted:', hasSubmitted);

    if (hasSubmitted && currentQuestion) {
      // 已回答过：恢复选中状态
      if (currentQuestion.type === 'single') {
        this.setData({
          chosenum: savedAnswer[0],
          moreArr: {},
          showAnswer: true,
          isCorrect: savedResult
        });
      } else {
        const moreArr = {};
        savedAnswer.forEach(id => {
          moreArr[id] = true;
        });
        this.setData({
          chosenum: undefined,
          moreArr: moreArr,
          showAnswer: true,
          isCorrect: savedResult
        });
      }
    } else {
      // 未回答过：保持未选中状态
      this.setData({
        chosenum: null,
        moreArr: {},
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
        showAnswer: false,
        isCorrect: null
      });

      setTimeout(async () => {
          console.log('跳转前题目', index, '的选项状态:', this.data.questions[index].options.map(opt => ({id: opt.id, status: opt.status})));

          // 更新题目索引
          this.setData({
            currentQuestionIndex: index
          });

          // 加载当前题目的状态
          await this.loadCurrentQuestionState();

          // 延迟一段时间后检查选项状态
          setTimeout(() => {
            console.log('跳转后题目', index, '的选项状态:', this.data.questions[index].options.map(opt => ({id: opt.id, status: opt.status})));
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
      success(res) {
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
  saveProgress() {
    const { bankId, chapterId, currentQuestionIndex, userAnswers, questionResults, questions } = this.data;
    
    // 计算已完成的题目数量
    const completedCount = questionResults.filter(result => result !== null).length;
    
    // 保存进度到本地存储
    const progressKey = `quiz_progress_${bankId}_${chapterId}`;
    const progressData = {
      currentQuestionIndex: currentQuestionIndex,
      userAnswers: userAnswers,
      questionResults: questionResults,
      completedCount: completedCount,
      timestamp: Date.now()
    };
    
    wx.setStorageSync(progressKey, progressData);
    console.log('答题进度已保存:', progressKey, progressData);
    
    // 同时保存章节进度
    const chapterProgressKey = `chapter_progress_${bankId}_${chapterId}`;
    wx.setStorageSync(chapterProgressKey, completedCount);
  },

  // 加载答题进度
  loadProgress() {
    const { bankId, chapterId, questions } = this.data;
    
    const progressKey = `quiz_progress_${bankId}_${chapterId}`;
    const progressData = wx.getStorageSync(progressKey);
    
    if (progressData && progressData.userAnswers && progressData.userAnswers.length === questions.length) {
      console.log('找到之前的答题进度，恢复中...', progressData);
      
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
      
      console.log('已恢复', Object.keys(setDataObj).length, '个状态');
      
      // 找到下一道未答的题目
      const nextUnansweredIndex = progressData.questionResults.findIndex(result => result === null);
      
      // 如果有未答的题目，从下一道未答的开始
      // 如果所有题目都已答完，从最后一题开始
      const startIndex = nextUnansweredIndex !== -1 ? nextUnansweredIndex : questions.length - 1;
      
      console.log('从第', startIndex + 1, '题开始继续答题');
      
      return startIndex;
    }
    
    return 0;
  },

  // 清除答题进度
  clearProgress() {
    const { bankId, chapterId } = this.data;
    const progressKey = `quiz_progress_${bankId}_${chapterId}`;
    
    wx.removeStorageSync(progressKey);
    console.log('答题进度已清除:', progressKey);
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
      console.log('图片添加到缓存:', currentQuestion.imageUrl);
    }
    this.setData({ loadingImages, errorImages });
    console.log('图片加载成功:', questionId);
  },
  
  // 图片加载失败
  onImageError(e) {
    const questionId = e.currentTarget.dataset.questionId;
    const loadingImages = { ...this.data.loadingImages };
    const errorImages = { ...this.data.errorImages };
    loadingImages[questionId] = false;
    errorImages[questionId] = true;
    this.setData({ loadingImages, errorImages });
    console.log('图片加载失败:', questionId);
  },
  
  // 重试加载图片
  retryLoadImage(e) {
    const questionId = e.currentTarget.dataset.questionId;
    console.log('重试加载图片:', questionId);
    
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
          console.log('图片预览成功', res);
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
          console.log('图片预览成功', res);
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
  }
})
