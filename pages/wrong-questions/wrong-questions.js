// pages/wrong-questions.js
Page({
  data: {
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
    favoritesSynced: false,
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
      title: '错题本'
    });
    
    await this.loadWrongQuestions();
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

  async loadWrongQuestions() {
    try {
      wx.showLoading({
        title: '加载错题...'
      });
      
      const app = getApp();
      const userId = app.globalData.userId;
      
      console.log('加载错题，userId:', userId);
      
      const result = await wx.cloud.callFunction({
        name: 'getUserWrongQuestions',
        data: {
          userId: userId
        }
      });
      
      console.log('获取错题数据结果:', result.result);
      
      let questions = [];
      if (result.result && result.result.success && Array.isArray(result.result.questions)) {
        questions = result.result.questions;
      }
      
      console.log('错题数据:', questions);
      
      if (questions.length > 0) {
        console.log('第一题详情:', {
          questionContent: questions[0].questionContent,
          options: questions[0].options,
          optionsCount: questions[0].options ? questions[0].options.length : 0,
          correctAnswers: questions[0].correctAnswers || (questions[0].answer ? [questions[0].answer] : []),
          type: questions[0].type
        });
      }
      
      if (!questions || questions.length === 0) {
        wx.hideLoading();
        wx.showToast({
          title: '暂无错题',
          icon: 'none'
        });
        return;
      }
      
      // 为每个题目添加answered属性，为每个选项添加status属性
      const formattedQuestions = questions.map((q, index) => {
        const optionsWithStatus = q.options.map(opt => ({
          ...opt,
          status: ''
        }));
        console.log('初始化错题', index, '选项状态:', optionsWithStatus.map(opt => ({id: opt.id, status: opt.status})));
        return {
          ...q,
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
          questionResults: new Array(formattedQuestions.length).fill(null),
          questionList: questionList,
          favoritesSynced: false,
          loading: false
        });
      
      await this.loadCurrentQuestionState();
      
      wx.hideLoading();
      
    } catch (error) {
      console.error('加载错题数据失败:', error);
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

    const optionIndex = currentQuestion.options.findIndex(opt => opt.id === optionId);
    if (optionIndex === -1) {
      console.error('选项未找到', {optionId, currentQuestionIndex});
      return;
    }

    const setDataObj = {};

    if (currentQuestion.type === 'single') {
      currentQuestion.options.forEach((opt, idx) => {
        const path = `questions[${currentQuestionIndex}].options[${idx}].status`;
        setDataObj[path] = opt.id === optionId ? 'select' : '';
      });

      setDataObj.chosenum = optionId;

      console.log('设置单选题选项状态:', currentQuestionIndex, currentQuestion.options.map(opt => ({id: opt.id, status: opt.id === optionId ? 'select' : ''})));
    } else {
      const currentStatus = currentQuestion.options[optionIndex].status;
      const newStatus = currentStatus === 'select' ? '' : 'select';
      const path = `questions[${currentQuestionIndex}].options[${optionIndex}].status`;
      setDataObj[path] = newStatus;

      const currentMoreArr = this.data.moreArr || {};
      setDataObj.moreArr = {
        ...currentMoreArr,
        [optionId]: newStatus === 'select'
      };

      console.log('设置多选题选项状态:', currentQuestionIndex, {optionId, newStatus});
    }

    this.setData(setDataObj);

    // 立即提交答案，不延迟
    this.submitAnswer();
  },

  async submitAnswer() {
    if (this.data.showAnswer) return;
    
    const currentQuestionIndex = this.data.currentQuestionIndex;
    const currentQuestion = this.data.questions[currentQuestionIndex];
    
    let userAnswer = [];
    
    if (currentQuestion.type === 'single') {
      if (!this.data.chosenum) {
        wx.showToast({
          title: '请选择答案',
          icon: 'none'
        });
        return;
      }
      userAnswer = [this.data.chosenum];
    } else {
      userAnswer = Object.keys(this.data.moreArr);
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
    
    if (isCorrect) {
      await this.removeFromWrongQuestions(currentQuestion.questionId);
    }
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

    if (!isCorrect) {
      let wrongQuestions = wx.getStorageSync('wrongQuestions') || [];
      if (!wrongQuestions.includes(currentQuestion.questionId)) {
        wrongQuestions.push(currentQuestion.questionId);
        wx.setStorageSync('wrongQuestions', wrongQuestions);
      }
    }

    let totalQuestions = wx.getStorageSync('totalQuestions') || 0;
    let correctAnswers = wx.getStorageSync('correctAnswers') || 0;
    
    totalQuestions++;
    if (isCorrect) {
      correctAnswers++;
    }

    wx.setStorageSync('totalQuestions', totalQuestions);
    wx.setStorageSync('correctAnswers', correctAnswers);

    if (userId) {
      try {
        console.log('准备调用saveUserAnswer云函数，参数:', {
          userId: userId,
          questionId: currentQuestion.questionId,
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

  async removeFromWrongQuestions(questionId) {
    try {
      const app = getApp();
      const userId = app.globalData.userId;
      
      const result = await wx.cloud.callFunction({
        name: 'removeFromWrongQuestions',
        data: {
          userId: userId,
          questionId: questionId
        }
      });
      
      if (result.result && result.result.success) {
        console.log('错题移除成功');
      } else {
        console.error('错题移除失败:', result.result);
      }
    } catch (error) {
      console.error('移除错题失败:', error);
    }
  },

  async toggleFavorite() {
    const app = getApp();
    const userId = app.globalData.userId;
    const currentQuestion = this.data.questions[this.data.currentQuestionIndex];
    const favoriteQuestions = wx.getStorageSync('favoriteQuestions') || [];
    let isFavorite = this.data.isFavorite;
    
    if (!currentQuestion || !currentQuestion.questionId) {
      console.error('当前题目数据不存在');
      return;
    }
    
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
        
        if (result.result && result.result.success) {
          console.log('收藏状态已同步到云端');
        } else {
          console.error('同步收藏状态到云端失败:', result.result);
        }
      } catch (error) {
        console.error('同步收藏状态失败:', error);
      }
    }
  },

  async checkIfFavorite() {
    const app = getApp();
    const userId = app.globalData.userId;
    const currentQuestion = this.data.questions[this.data.currentQuestionIndex];
    
    if (!currentQuestion || !currentQuestion.questionId) {
      console.error('当前题目数据不存在');
      return;
    }
    
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
        
        if (result.result && result.result.success && result.result.data) {
          const userData = result.result.data;
          const favorites = userData.favorites || [];
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
        moreArr: {}
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

  submitExam() {
    const correctCount = this.data.questionResults.filter(r => r === true).length;
    const totalCount = this.data.questions.length;
    const accuracy = ((correctCount / totalCount) * 100).toFixed(1);
    
    wx.showModal({
      title: '答题完成',
      content: `答对 ${correctCount} 题，正确率 ${accuracy}%`,
      showCancel: false,
      success: () => {
        wx.navigateBack();
      }
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
      const allImages = this.data.questions
        .filter(q => q.imageUrl && q.imageUrl !== '无图片')
        .map(q => q.imageUrl);
      
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
});