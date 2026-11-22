// pages/favorite-questions.js
Page({
  data: {
    currentQuestionIndex: 0,
    questions: [],
    userAnswers: [],
    chosenum: null,
    moreArr: {},
    selectedCount: 0,
    isEmpty: false,
    showAnswer: false,
    isCorrect: null,
    isFavorite: false,
    questionResults: [],
    drawerVisible: false,
    questionList: [],
    favoritesSynced: false,
    favoriteQuestionIds: [],
    loading: false,
    loadingImages: {},
    errorImages: {},
    imageCache: {},
    imageMenuVisible: false,
    currentImageUrl: ''
  },

  async onLoad(options) {
    wx.hideTabBar();
    
    wx.setNavigationBarTitle({
      title: '收藏题目'
    });
    
    await this.loadFavoriteQuestions();
  },
  
  onUnload() {
    wx.showTabBar();
    // 页面卸载时清理IntersectionObserver
    if (this.imageObserver) {
      this.imageObserver.disconnect();
    }
  },

  async onShow() {
    if (this.data.questions && this.data.questions.length > 0) {
      await this.checkIfFavorite();
    }
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

  async loadFavoriteQuestions() {
    try {
      wx.showLoading({
        title: '加载收藏题目...'
      });
      
      const app = getApp();
      const userId = app.globalData.userId;
      
      const result = await wx.cloud.callFunction({
        name: 'getUserFavoriteQuestions',
        data: {
          userId: userId
        }
      });
      
      let questions = [];
      if (result.result && result.result.success && Array.isArray(result.result.questions)) {
        questions = result.result.questions;
      }
      
      if (!questions || questions.length === 0) {
        wx.hideLoading();
        this.setData({
          questions: [],
          isEmpty: true
        });
        return;
      }

      const formattedQuestions = questions.map((q, index) => {
        const optionsWithStatus = q.options.map(opt => ({
          ...opt,
          status: ''
        }));
        
        return {
          ...q,
          type: this.normalizeType(q.type),
          answered: false,
          options: optionsWithStatus
        };
      });
      
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
          selectedCount: 0,
          isEmpty: false,
          questionResults: new Array(formattedQuestions.length).fill(null),
          questionList: questionList,
          favoritesSynced: false,
          favoriteQuestionIds: [],
          loading: false
        });
      
      await this.loadCurrentQuestionState();
      
      wx.hideLoading();
      
    } catch (error) {
      console.error('加载收藏题目数据失败:', error);
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

      const currentMoreArr = this.data.moreArr || {};
      const nextMoreArr = {
        ...currentMoreArr,
        [optionId]: newStatus === 'select'
      };
      setDataObj.moreArr = nextMoreArr;
      setDataObj.selectedCount = Object.keys(nextMoreArr).filter(key => nextMoreArr[key]).length;

      

      this.setData(setDataObj);

      // 多选题立即判断逻辑
      if (newStatus === 'select') {
        const isCorrectOption = currentQuestion.correctAnswers.includes(optionId);

        if (!isCorrectOption) {
          this.submitAnswer();
          return;
        }

        const allCorrectSelected = currentQuestion.correctAnswers.every(
          id => nextMoreArr[id]
        );

        if (allCorrectSelected) {
          this.submitAnswer();
        }
      }
      return;
    }

    this.setData(setDataObj);

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

  async submitAnswer() {
    if (this.data.showAnswer) return;
    
    const currentQuestionIndex = this.data.currentQuestionIndex;
    const currentQuestion = this.data.questions[currentQuestionIndex];
    
    let userAnswer = [];
    
    if (currentQuestion.type === 'single' || currentQuestion.type === 'judge') {
      if (!this.data.chosenum) {
        wx.showToast({
          title: '请选择答案',
          icon: 'none'
        });
        return;
      }
      userAnswer = [this.data.chosenum];
    } else {
      userAnswer = Object.keys(this.data.moreArr).filter(key => this.data.moreArr[key]);
      if (userAnswer.length === 0) {
        wx.showToast({
          title: '请选择答案',
          icon: 'none'
        });
        return;
      }
    }
    
    const correctAnswers = currentQuestion.correctAnswers || (currentQuestion.answer ? [currentQuestion.answer] : []);
    const isCorrect = this.compareAnswers(userAnswer, correctAnswers);
    
    const questions = [...this.data.questions];
    const question = questions[currentQuestionIndex];
    
    question.options.forEach(opt => {
      if (correctAnswers.includes(opt.id)) {
        opt.status = 'right';
      } else if (userAnswer.includes(opt.id)) {
        opt.status = 'wrong';
      }
    });
    
    question.answered = true;
    
    const questionResults = [...this.data.questionResults];
    questionResults[currentQuestionIndex] = isCorrect;
    
    const userAnswers = [...this.data.userAnswers];
    userAnswers[currentQuestionIndex] = userAnswer;
    
    this.setData({
      questions,
      showAnswer: true,
      isCorrect,
      questionResults,
      userAnswers
    });
    
    await this.saveAnswerRecord(currentQuestion.questionId, userAnswer, isCorrect);
  },

  compareAnswers(userAnswer, correctAnswers) {
    const sortedUserAnswer = [...userAnswer].sort();
    const sortedCorrectAnswers = [...correctAnswers].sort();
    
    return sortedUserAnswer.length === sortedCorrectAnswers.length &&
           sortedUserAnswer.every((answer, index) => answer === sortedCorrectAnswers[index]);
  },

  async saveAnswerRecord(questionId, userAnswer, isCorrect) {
    const app = getApp();
    const userId = app.globalData.userId;
    const currentQuestion = this.data.questions[this.data.currentQuestionIndex];
    const now = new Date().getTime();

    // 本地 answerHistory 仅做快速恢复用，权威数据源是云端 user_answers
    let answerHistory = wx.getStorageSync('answerHistory') || [];
    answerHistory.push({
      questionId: currentQuestion.questionId,
      selectedAnswers: userAnswer,
      isCorrect: isCorrect,
      answerTime: now
    });
    if (answerHistory.length > 1000) {
      answerHistory = answerHistory.slice(-1000);
    }
    wx.setStorageSync('answerHistory', answerHistory);

    // 注：不再维护本地 wrongQuestions/totalQuestions/correctAnswers 统计
    // saveUserAnswer 云函数已自动更新 users 表统计 + user_wrong_questions

    if (userId) {
      try {
        
        
        const result = await wx.cloud.callFunction({
          name: 'saveUserAnswer',
          data: {
            userId: userId,
            questionId: currentQuestion.questionId,
            source: 'favorite',
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

  async toggleFavorite() {
    const app = getApp();
    const userId = app.globalData.userId;
    const { questions, currentQuestionIndex, favoriteQuestionIds, isFavorite: currentFav } = this.data;
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion || !currentQuestion.questionId) return;

    const ids = favoriteQuestionIds.slice();
    const targetFav = !currentFav;

    if (targetFav) {
      if (ids.indexOf(currentQuestion.questionId) === -1) ids.push(currentQuestion.questionId);
      wx.showToast({ title: '已收藏', icon: 'success' });
    } else {
      const idx = ids.indexOf(currentQuestion.questionId);
      if (idx > -1) ids.splice(idx, 1);
      wx.showToast({ title: '已取消收藏', icon: 'success' });
    }

    this.setData({ favoriteQuestionIds: ids, isFavorite: targetFav });

    if (userId) {
      try {
        const res = await wx.cloud.callFunction({
          name: 'toggleFavorite',
          data: { userId: userId, questionId: currentQuestion.questionId, isFavorite: targetFav }
        });
        if (!(res.result && res.result.success)) {
          console.error('同步收藏失败:', res.result);
          this.setData({ favoriteQuestionIds: favoriteQuestionIds, isFavorite: currentFav });
        }
      } catch (error) {
        console.error('同步收藏云函数失败:', error);
        this.setData({ favoriteQuestionIds: favoriteQuestionIds, isFavorite: currentFav });
      }
    }
  },

  async checkIfFavorite() {
    const app = getApp();
    const userId = app.globalData.userId;
    const { questions, currentQuestionIndex, favoriteQuestionIds, favoritesSynced } = this.data;
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion || !currentQuestion.questionId) return;

    const isFavorite = favoriteQuestionIds.includes(currentQuestion.questionId);
    this.setData({ isFavorite: isFavorite });

    if (!userId) return;
    if (favoritesSynced) return;

    try {
      const result = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { userId: userId, needWrong: false, needChapterProgress: false }
      });
      if (result && result.result && result.result.success && result.result.data) {
        const qids = (result.result.data.favorites || []).map(function(f) { return f.questionId; });
        this.setData({ favoriteQuestionIds: qids, favoritesSynced: true });
        const refreshed = qids.includes(currentQuestion.questionId);
        if (refreshed !== isFavorite) this.setData({ isFavorite: refreshed });
      }
    } catch (error) {
      console.warn('checkIfFavorite 云端同步失败:', error);
    }
  },

  async loadCurrentQuestionState() {
    const currentQuestion = this.data.questions[this.data.currentQuestionIndex];
    
    if (currentQuestion && currentQuestion.answered) {
      this.setData({
        showAnswer: true,
        isCorrect: this.data.questionResults[this.data.currentQuestionIndex]
      });
    } else {
      this.setData({
        showAnswer: false,
        isCorrect: null,
        chosenum: null,
        moreArr: {},
        selectedCount: 0
      });
    }
    
    await this.checkIfFavorite();
  },

  onQuestionChange(e) {
    const currentIndex = e.detail.current;
    this.setData({
      currentQuestionIndex: currentIndex
    });
    this.loadCurrentQuestionState();
  },

  jumpToQuestion(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      currentQuestionIndex: index
    });
    this.loadCurrentQuestionState();
  },

  toggleDrawer() {
    this.setData({
      drawerVisible: !this.data.drawerVisible
    });
  },

  // 空状态：返回首页
  goHome() {
    wx.switchTab({
      url: '/pages/index/index'
    });
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
      const allImages = this.data.questions
        .filter(q => q.imageUrl && q.imageUrl !== '无图片')
        .map(q => q.imageUrl);
      
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

    wx.downloadFile({
      url: imageUrl,
      success: (res) => {
        if (res.statusCode === 200) {
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
      const allImages = this.data.questions
        .filter(q => q.imageUrl && q.imageUrl !== '无图片')
        .map(q => q.imageUrl);
      
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
    var bankId = q.bankId || q.quizId || '';
    var path = '/pages/quiz/quiz?id=' + encodeURIComponent(bankId) +
      '&chapterId=' + encodeURIComponent(q.chapterId || '') +
      '&questionId=' + encodeURIComponent(q.questionId || '');
    return {
      title: '快来看看这道题！ ——来自网络安全刷题站',
      path: path,
      imageUrl: 'cloud://cloud1-2gdek8xx22a5db1a.636c-cloud1-2gdek8xx22a5db1a-1395189804/weda-uploader/b30bb99d6ec016c0c53126b13e92efda-网络安全刷题站.jpg',
      fail: function(res) { wx.showToast({ title: '分享失败，请重试', icon: 'none' }); }
    };
  }
});