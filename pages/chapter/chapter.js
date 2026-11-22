Page({
  
  /**
   * 页面的初始数据
   */
  data: {
    bankId: '',
    bankName: '',
    totalQuestions: 0,
    chapters: [],
    showRedoConfirm: false,
    currentChapterId: '',
    currentChapterName: '',
    currentChapterIndex: -1,
    showRedoHint: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(options) {
    const { id, name, path } = options;
    
    // 动态设置导航栏标题
    wx.setNavigationBarTitle({
      title: name
    });
    
    this.setData({
      bankId: id,
      bankName: name,
      path: path
    });

    // 首次进入章节页面：onShow 时提示左滑可重做
    this._pendingFirstHint = true;
    
    // 根据题库ID从数据库加载章节数据
    await this.loadChapters();
  },
  
  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 每次进入页面时更新章节进度
    this.loadChapterProgress();

    // 首次进入：提示左滑章节卡片可重做
    if (this._pendingFirstHint) {
      this._pendingFirstHint = false;
      this.showRedoHint();
      return;
    }

    // 刷完一个章节返回：提示左滑可重做
    var pending = wx.getStorageSync('chapterRedoHintPending');
    if (pending && pending.bankId === this.data.bankId) {
      wx.removeStorageSync('chapterRedoHintPending');
      this.showRedoHint();
    }
  },

  /**
   * 加载章节进度（优先从云端读，兜底本地）
   */
  loadChapterProgress: function() {
    var that = this;
    var app = getApp();
    var userId = (app.globalData && app.globalData.userId) || null;

    var chapters = this.data.chapters;
    var localProgressMap = {};

    // 先读本地缓存做兜底
    for (var i = 0; i < chapters.length; i++) {
      var ck = 'chapter_progress_' + that.data.bankId + '_' + chapters[i].chapterId;
      localProgressMap[chapters[i].chapterId] = wx.getStorageSync(ck) || 0;
    }

    var afterMerge = function(cloudProgressMap) {
      var updatedChapters = chapters.map(function(chapter) {
        var completed = cloudProgressMap[chapter.chapterId] !== undefined
          ? cloudProgressMap[chapter.chapterId]
          : localProgressMap[chapter.chapterId];
        var progress = chapter.questionCount > 0 ? Math.round((completed / chapter.questionCount) * 100) : 0;
        return Object.assign({}, chapter, { completed: completed, progress: progress });
      });
      that.setData({ chapters: updatedChapters });
    };

    if (!userId) {
      // 未登录：只用本地
      afterMerge({});
      return;
    }

    // 调 getUserData 拿 chapterProgress，按 chapterId 映射 completedQuestions
    wx.cloud.callFunction({
      name: 'getUserData',
      data: { userId: userId, includeAnswers: false, needFavorites: false, needWrong: false }
    }).then(function(result) {
      var cloudMap = {};
      if (result.result && result.result.success && result.result.data) {
        var cp = result.result.data.chapterProgress || [];
        for (var j = 0; j < cp.length; j++) {
          // 只取当前题库的
          if (cp[j].bankId === that.data.bankId) {
            cloudMap[cp[j].chapterId] = cp[j].completedQuestions || 0;
          }
        }
      }
      afterMerge(cloudMap);
    }).catch(function(err) {
      console.warn('loadChapterProgress getUserData 失败，用本地兜底:', err);
      afterMerge({});
    });
  },

  /**
   * 从数据库加载章节数据
   */
  async loadChapters() {
    wx.showLoading({
      title: '加载中...'
    });
    
    try {
      // 从question_bank集合获取题库信息
      const questionBankResult = await wx.cloud.callFunction({
        name: 'getQuestionBank',
        data: {
          bankId: this.data.bankId
        }
      });
      
      if (!questionBankResult.result || !questionBankResult.result.success) {
        wx.hideLoading();
        wx.showToast({
          title: '获取题库信息失败',
          icon: 'none'
        });
        return;
      }
      
      const questionBank = questionBankResult.result.data;
      const bankName = questionBank.name; // 例如 "CISSP"
      
      // 根据题库名称从chapters集合获取章节
      const chaptersResult = await wx.cloud.callFunction({
        name: 'getChapters',
        data: {
          bankName: bankName
        }
      });
      
      if (!chaptersResult.result || !chaptersResult.result.success) {
        wx.hideLoading();
        wx.showToast({
          title: '获取章节数据失败',
          icon: 'none'
        });
        return;
      }
      
      const chapters = chaptersResult.result.data;
      
      if (!chapters || chapters.length === 0) {
        wx.hideLoading();
        wx.showToast({
          title: '该题库暂无章节',
          icon: 'none'
        });
        return;
      }
      
      // 计算总题数
      const totalQuestions = chapters.reduce((sum, chapter) => sum + (chapter.questionCount || 0), 0);
      
      this.setData({
        chapters: chapters,
        totalQuestions: totalQuestions,
        loading: false
      });
      
      // 加载章节进度
      this.loadChapterProgress();
      
      wx.hideLoading();
      
    } catch (error) {
      console.error('加载章节数据失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  /**
   * 跳转到刷题页面
   */
  goQuiz(e) {
    const { chapterId, chapterName } = e.currentTarget.dataset;
    const { bankId, bankName, path } = this.data;
    
    let url = '/pages/quiz/quiz?id=' + bankId
      + '&name=' + encodeURIComponent(bankName)
      + '&chapterId=' + chapterId
      + '&chapterName=' + encodeURIComponent(chapterName);
    if (path) {
      url += '&path=' + encodeURIComponent(path);
    }
    
    wx.navigateTo({
      url: url
    });
  },
  
  /**
   * 同步题库数据
   */
  async syncQuizData() {
    const { bankId, bankName } = this.data;
    
    wx.showLoading({
      title: '同步中...'
    });
    
    try {
      // 遍历所有章节，同步题目数据
      for (let i = 0; i < this.data.chapters.length; i++) {
        const chapter = this.data.chapters[i];
        
        // 调用云函数解析Excel文件
        const result = await wx.cloud.callFunction({
          name: 'parseQuiz',
          data: {
            chapterId: chapter.id,
            chapterName: chapter.name
          }
        });
      }
      
      wx.hideLoading();
      wx.showToast({
        title: '题库同步成功',
        icon: 'success'
      });
      
      // 重新加载章节进度
      this.loadChapterProgress();
      
    } catch (error) {
      console.error('题库同步失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '题库同步失败',
        icon: 'none'
      });
    }
  },

  /**
   * 左滑手势开始
   */
  handleTouchStart(e) {
    const index = e.currentTarget.dataset.index;
    const touch = e.touches[0];
    const chapters = this.data.chapters;
    
    // 记录触摸开始位置
    this.setData({
      startX: touch.clientX
    });
    
    // 重置其他章节的滑动状态
    const updatedChapters = chapters.map((chapter, idx) => {
      if (idx !== index) {
        return {
          ...chapter,
          showRedo: false,
          translateX: 0
        };
      }
      return chapter;
    });
    
    this.setData({
      chapters: updatedChapters
    });
  },

  /**
   * 左滑手势移动
   */
  handleTouchMove(e) {
    // 节流：约 16ms 一次，避免高频 touchmove 全量 setData
    const now = Date.now();
    if (this._lastMoveTs && now - this._lastMoveTs < 16) return;
    this._lastMoveTs = now;

    const index = e.currentTarget.dataset.index;
    const touch = e.touches[0];
    const startX = this.data.startX || 0;

    // 计算滑动距离
    let translateX = touch.clientX - startX;

    // 限制滑动范围
    const maxMove = -80;
    const minMove = 0;

    if (translateX < maxMove) {
      translateX = maxMove;
    } else if (translateX > minMove) {
      translateX = minMove;
    }

    // 仅更新当前滑动项，避免重建整个 chapters 数组
    const setDataObj = {};
    setDataObj['chapters[' + index + '].translateX'] = translateX;
    setDataObj['chapters[' + index + '].showRedo'] = translateX <= -40;
    this.setData(setDataObj);
  },

  /**
   * 左滑手势结束
   */
  handleTouchEnd(e) {
    const index = e.currentTarget.dataset.index;
    const chapters = this.data.chapters;
    const chapter = chapters[index];
    
    // 根据滑动距离决定最终状态
    let finalTranslateX = 0;
    let showRedo = false;
    
    if (chapter.translateX <= -40) {
      // 滑动超过阈值，显示重做按钮
      finalTranslateX = -80;
      showRedo = true;
    } else {
      // 滑动未超过阈值，恢复原位
      finalTranslateX = 0;
      showRedo = false;
    }
    
    // 更新章节状态
    const updatedChapters = chapters.map((item, idx) => {
      if (idx === index) {
        return {
          ...item,
          translateX: finalTranslateX,
          showRedo: showRedo
        };
      }
      return item;
    });
    
    this.setData({
      chapters: updatedChapters
    });
  },

  /**
   * 显示重做确认弹窗
   */
  showRedoConfirm(e) {
    const { chapterId, chapterName, index } = e.currentTarget.dataset;
    
    this.setData({
      showRedoConfirm: true,
      currentChapterId: chapterId,
      currentChapterName: chapterName,
      currentChapterIndex: index
    });
  },

  /**
   * 关闭重做确认弹窗
   */
  closeRedoConfirm() {
    this.setData({
      showRedoConfirm: false,
      currentChapterId: '',
      currentChapterName: '',
      currentChapterIndex: -1
    });
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {
    // 阻止点击事件冒泡
  },

  /**
   * 显示左滑重做提示（3秒后自动消失）
   */
  showRedoHint: function() {
    var that = this;
    this.setData({ showRedoHint: true });
    if (this._redoHintTimer) clearTimeout(this._redoHintTimer);
    this._redoHintTimer = setTimeout(function() {
      that.setData({ showRedoHint: false });
    }, 3000);
  },

  /**
   * 手动关闭左滑重做提示
   */
  hideRedoHint: function() {
    if (this._redoHintTimer) clearTimeout(this._redoHintTimer);
    this.setData({ showRedoHint: false });
  },

  /**
   * 确认清空章节做题记录
   */
  async confirmRedo() {
    const { currentChapterId, currentChapterName, currentChapterIndex, bankId } = this.data;
    const app = getApp();
    const userId = app.globalData.userId;
    
    if (!currentChapterId) {
      return;
    }
    
    wx.showLoading({
      title: '清空中...',
      mask: true
    });
    
    try {
      // 清空本地存储中的章节进度
      const progressKey = `chapter_progress_${bankId}_${currentChapterId}`;
      wx.removeStorageSync(progressKey);
      
      // 清空本地存储中的答题进度
      const quizProgressKey = `quiz_progress_${bankId}_${currentChapterId}`;
      wx.removeStorageSync(quizProgressKey);
      
      // 清空本地存储中的题目答案记录
      const answerKey = `quiz_answers_${bankId}_${currentChapterId}`;
      wx.removeStorageSync(answerKey);
      
      // 调用云函数删除云端记录
      if (userId) {
        const result = await wx.cloud.callFunction({
          name: 'resetChapterProgress',
          data: {
            userId: userId,
            bankId: bankId,
            chapterId: currentChapterId
          }
        });
        
        if (!result.result.success) {
          console.error('云端重置失败:', result.result);
        }
      }
      
      // 更新章节的完成状态
      const chapters = this.data.chapters;
      const updatedChapters = chapters.map((chapter, idx) => {
        if (idx === currentChapterIndex) {
          return {
            ...chapter,
            completed: 0,
            progress: 0,
            showRedo: false,
            translateX: 0
          };
        }
        return chapter;
      });
      
      this.setData({
        chapters: updatedChapters
      });
      
      wx.hideLoading();
      
      wx.showToast({
        title: `${currentChapterName}做题记录已清空`,
        icon: 'success',
        duration: 2000
      });
      
      this.closeRedoConfirm();
      
    } catch (error) {
      console.error('清空做题记录失败:', error);
      wx.hideLoading();
      
      wx.showToast({
        title: '清空失败，请重试',
        icon: 'none'
      });
    }
  }

})