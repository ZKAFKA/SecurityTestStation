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
    currentChapterIndex: -1
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
    
    // 根据题库ID从数据库加载章节数据
    await this.loadChapters();
  },
  
  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 每次进入页面时更新章节进度
    this.loadChapterProgress();
  },

  /**
   * 从本地存储加载章节进度
   */
  loadChapterProgress() {
    const chapters = this.data.chapters;
    const updatedChapters = chapters.map(chapter => {
      const progressKey = `chapter_progress_${this.data.bankId}_${chapter.chapterId}`;
      const completed = wx.getStorageSync(progressKey) || 0;
      const progress = chapter.questionCount > 0 ? Math.round((completed / chapter.questionCount) * 100) : 0;
      return {
        ...chapter,
        completed,
        progress
      };
    });
    
    this.setData({
      chapters: updatedChapters
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
      
      console.log('获取题库信息结果:', questionBankResult.result);
      
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
      
      console.log('题库名称:', bankName);
      
      // 根据题库名称从chapters集合获取章节
      const chaptersResult = await wx.cloud.callFunction({
        name: 'getChapters',
        data: {
          bankName: bankName
        }
      });
      
      console.log('获取章节数据结果:', chaptersResult.result);
      
      if (!chaptersResult.result || !chaptersResult.result.success) {
        wx.hideLoading();
        wx.showToast({
          title: '获取章节数据失败',
          icon: 'none'
        });
        return;
      }
      
      const chapters = chaptersResult.result.data;
      
      console.log('章节数据:', chapters);
      
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
    
    let url = `/pages/quiz/quiz?id=${bankId}&name=${bankName}&chapterId=${chapterId}&chapterName=${chapterName}`;
    if (path) {
      url += `&path=${encodeURIComponent(path)}`;
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
        
        console.log(`开始同步章节 ${chapter.id}: ${chapter.name}`);
        
        // 调用云函数解析Excel文件
        const result = await wx.cloud.callFunction({
          name: 'parseQuiz',
          data: {
            chapterId: chapter.id,
            chapterName: chapter.name
          }
        });
        
        console.log(`章节 ${chapter.id} 同步完成:`, result.result);
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
    const index = e.currentTarget.dataset.index;
    const touch = e.touches[0];
    const chapters = this.data.chapters;
    const startX = this.data.startX || 0;
    
    // 计算滑动距离
    const moveX = touch.clientX - startX;
    
    // 限制滑动范围
    const maxMove = -80;
    const minMove = 0;
    let translateX = moveX;
    
    if (translateX < maxMove) {
      translateX = maxMove;
    } else if (translateX > minMove) {
      translateX = minMove;
    }
    
    // 更新当前章节的滑动状态
    const updatedChapters = chapters.map((chapter, idx) => {
      if (idx === index) {
        return {
          ...chapter,
          translateX: translateX,
          showRedo: translateX <= -40
        };
      }
      return chapter;
    });
    
    this.setData({
      chapters: updatedChapters
    });
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
   * 确认清空章节做题记录
   */
  async confirmRedo() {
    const { currentChapterId, currentChapterName, currentChapterIndex, bankId } = this.data;
    
    if (!currentChapterId) {
      return;
    }
    
    wx.showLoading({
      title: '清空中...',
      mask: true
    });
    
    try {
      // 清空本地存储中的章节做题记录
      const progressKey = `chapter_progress_${bankId}_${currentChapterId}`;
      wx.removeStorageSync(progressKey);
      
      // 清空本地存储中的题目答案记录
      const answerKey = `quiz_answers_${bankId}_${currentChapterId}`;
      wx.removeStorageSync(answerKey);
      
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
      
      // 显示成功提示
      wx.showToast({
        title: `${currentChapterName}做题记录已清空`,
        icon: 'success',
        duration: 2000
      });
      
      // 关闭弹窗
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