Page({
  data: {
    applicationScene: [],
    lastStudySession: null,
    isLoggedIn: false,
    showQrcodeModal: false,
    resumeLoading: true
  },

  onLoad: function() {
    var that = this;
    that.refreshLoginState();
    that.loadData();
  },

  onShow: function() {
    var that = this;
    that.refreshLoginState();
    // 首次进入由 onLoad 的 loadData 负责加载（避免重复）；仅后续返回时刷新
    if (that._hasLoaded) {
      that.loadLastStudySession();
    }
    that._hasLoaded = true;
  },

  onPullDownRefresh: function() {
    var that = this;
    that.loadData().then(function() {
      wx.stopPullDownRefresh();
    });
  },

  /** 加载所有数据 */
  loadData: function() {
    var that = this;
    wx.showLoading({ title: '加载中...', mask: true });
    return Promise.all([
      that.loadQuestionBanks(),
      that.loadLastStudySession()
    ]).catch(function(error) {
      console.error('加载数据失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }).then(function() {
      wx.hideLoading();
    });
  },

  /** 加载题库列表 */
  loadQuestionBanks: function() {
    var that = this;
    return new Promise(function(resolve, reject) {
      // 检查缓存（需包含 questionCountText 字段，否则视为旧格式缓存，强制拉取云端）
      var cachedData = wx.getStorageSync('cachedQuestionBanks');
      var cacheTime = wx.getStorageSync('questionBanksCacheTime');
      var now = Date.now();
      var cacheValid = cachedData && cacheTime && (now - cacheTime) < 10 * 60 * 1000
        && cachedData.length > 0 && cachedData[0].questionCountText !== undefined;

      if (cacheValid) {
        that.setData({ applicationScene: cachedData });
        resolve();
        return;
      }

      wx.cloud.callFunction({ name: 'getQuestionBanks', data: {} }).then(function(result) {
        if (result.result && result.result.success) {
          var rawList = result.result.data;
          var questionBanks = [];
          for (var i = 0; i < rawList.length; i++) {
            var bank = rawList[i];
            var qCount = bank.questionCount || 0;
            var displayCount = qCount > 0 ? (that.formatNumber(qCount) + ' 题') : '—';
            var displayStatus = bank.statusLabel || '已更新';
            
            questionBanks.push({
              _id: bank._id,
              title: bank.name || bank.title,
              sub_title: bank.description || bank.sub_title || '',
              path: bank.path,
              questionCount: qCount,
              questionCountText: displayCount,
              chapterCount: bank.chapterCount || 0,
              statusLabel: displayStatus
            });
          }

          // 缓存
          wx.setStorageSync('cachedQuestionBanks', questionBanks);
          wx.setStorageSync('questionBanksCacheTime', now);
          that.setData({ applicationScene: questionBanks });
        }
        resolve();
      }).catch(function(error) {
        console.error('加载题库列表失败:', error);
        // 失败时使用缓存
        var cached = wx.getStorageSync('cachedQuestionBanks');
        if (cached) {
          that.setData({ applicationScene: cached });
        }
        resolve();
      });
    });
  },

  /** 加载上次练习记录（从云端用户进度表读取，废弃本地 lastStudySession） */
  loadLastStudySession: function() {
    var that = this;
    var app = getApp();
    that.setData({ lastStudySession: null, resumeLoading: true });

    if (!app.checkLogin()) {
      that.setData({ resumeLoading: false });
      return Promise.resolve();
    }

    var userId = (app.globalData && app.globalData.userId) || wx.getStorageSync('currentUser');
    if (userId && typeof userId === 'object') {
      userId = userId.userId || userId._id || null;
    }
    if (!userId) {
      that.setData({ resumeLoading: false });
      return Promise.resolve();
    }

    return wx.cloud.callFunction({
      name: 'getUserData',
      data: { userId: userId, includeAnswers: false, needFavorites: false, needWrong: false }
    }).then(function(result) {
      if (!result.result || !result.result.success) {
        console.warn('getUserData 失败:', result.result && result.result.message);
        that.setData({ resumeLoading: false });
        return;
      }

      var chapterProgress = (result.result.data && result.result.data.chapterProgress) || [];
      // 取最新未完成的章节（按 lastStudyTime desc）
      var latest = null;
      for (var i = 0; i < chapterProgress.length; i++) {
        if (!chapterProgress[i].isCompleted) {
          latest = chapterProgress[i];
          break;
        }
      }
      if (!latest) {
        that.setData({ resumeLoading: false });
        return;
      }

      var bankId = latest.bankId;
      var chapterId = latest.chapterId;

      // 从题库缓存里拿 bankName（loadQuestionBanks 已经缓存了）
      var banks = wx.getStorageSync('cachedQuestionBanks') || that.data.applicationScene || [];
      var bankName = '';
      for (var j = 0; j < banks.length; j++) {
        if (banks[j]._id === bankId) {
          bankName = banks[j].title || '';
          break;
        }
      }

      // bankId / chapterId 已从 chapterProgress 拿到，接下来：
      // 1) 查 chapters 表补 chapterName / totalQuestions
      // 2) 调 getUserResumeIndex 云函数动态算"继续答题"的当前题号（不再依赖本地缓存）
      var chapterNameFromProgress = latest.chapterName || '';
      var totalQ = latest.totalQuestions || 0;
      var completedQ = latest.completedQuestions || 0;

      var cloudDB = wx.cloud.database();
      return cloudDB.collection('chapters').where({ chapterId: chapterId }).get().then(function(chRes) {
        var ch = (chRes && chRes.data && chRes.data.length > 0) ? chRes.data[0] : null;
        if (ch) {
          chapterNameFromProgress = ch.chapterName || chapterNameFromProgress;
          totalQ = ch.questionCount || totalQ;
          // 修正云端 chapterProgress 脏数据（异步，不阻塞）
          if (chapterNameFromProgress && chapterNameFromProgress !== (latest.chapterName || '')) {
            wx.cloud.callFunction({
              name: 'updateChapterProgress',
              data: {
                userId: (app.globalData && app.globalData.userId) || '',
                bankId: bankId,
                chapterId: chapterId,
                chapterName: chapterNameFromProgress,
                total: totalQ,
                completed: completedQ,
                progress: latest.progress || 0
              }
            }).then(function() {}).catch(function() {});
          }
        }

        // 2) 动态算 currentQuestionIndex（云端查 user_answers 最近记录）
        return wx.cloud.callFunction({
          name: 'getUserResumeIndex',
          data: {
            userId: (app.globalData && app.globalData.userId) || '',
            bankId: bankId,
            chapterId: chapterId
          }
        }).catch(function(err) {
          console.warn('getUserResumeIndex 调用失败，兜底用 0:', err);
          return { result: { success: false, currentQuestionIndex: 0 } };
        });
      }).then(function(resumeRes) {
        var result = resumeRes && resumeRes.result ? resumeRes : { result: { currentQuestionIndex: 0 } };
        var idx = (result.result && typeof result.result.currentQuestionIndex === 'number')
          ? result.result.currentQuestionIndex : 0;

        var relativeTime = that.calcRelativeTime(latest.lastStudyTime);
        var progressPercent = latest.progress || 0;
        if (totalQ > 0 && progressPercent === 0) {
          progressPercent = Math.round(completedQ / totalQ * 100);
        }

        var chapterInfo = (chapterNameFromProgress || chapterId) + ' (' + completedQ + '/' + totalQ + ')';

        var session = Object.assign({}, latest, {
          bankId: bankId,
          bankName: bankName || bankId,
          chapterId: chapterId,
          chapterName: chapterNameFromProgress || chapterId,
          chapterInfoDisplay: chapterInfo,
          currentQuestion: idx,
          currentQuestionDisplay: idx + 1,
          totalQuestions: totalQ,
          completedCount: completedQ,
          progressPercent: progressPercent,
          progressPercentDisplay: progressPercent + '%',
          relativeTime: relativeTime,
          lastTime: latest.lastStudyTime
        });

        that.setData({ lastStudySession: session, resumeLoading: false });
      }).catch(function(err) {
        console.warn('loadLastStudySession chapters 查询失败:', err);
        // 兜底：尽量渲染
        var relativeTime = that.calcRelativeTime(latest.lastStudyTime);
        var chapterInfo = (chapterNameFromProgress || chapterId) + ' (' + completedQ + ' / ' + totalQ + '题)';
        that.setData({
          lastStudySession: Object.assign({}, latest, {
            bankId: bankId,
            bankName: bankName || bankId,
            chapterId: chapterId,
            chapterName: chapterNameFromProgress || chapterId,
            chapterInfoDisplay: chapterInfo,
            currentQuestion: 0,
            currentQuestionDisplay: 1,
            totalQuestions: totalQ,
            completedCount: completedQ,
            progressPercent: latest.progress || 0,
            progressPercentDisplay: (latest.progress || 0) + '%',
            relativeTime: relativeTime,
            lastTime: latest.lastStudyTime
          }),
          resumeLoading: false
        });
      });
    }).catch(function(err) {
      console.error('加载用户进度失败:', err);
      that.setData({ resumeLoading: false });
    });
  },

  /** 计算相对时间文本 */
  calcRelativeTime: function(timestamp) {
    if (!timestamp) return '';
    var now = Date.now();
    var diff = now - timestamp;
    
    if (diff < 60 * 1000) {
      return '刚刚';
    } else if (diff < 60 * 60 * 1000) {
      return (Math.floor(diff / (60 * 1000))) + ' 分钟前活跃';
    } else if (diff < 24 * 60 * 60 * 1000) {
      return (Math.floor(diff / (60 * 60 * 1000))) + ' 小时前活跃';
    } else if (diff < 7 * 24 * 60 * 60 * 1000) {
      return (Math.floor(diff / (24 * 60 * 60 * 1000))) + ' 天前活跃';
    } else {
      var date = new Date(timestamp);
      return (date.getMonth() + 1) + '月' + date.getDate() + '日活跃';
    }
  },

  /** 数字千分位格式化 */
  formatNumber: function(num) {
    var str = String(num);
    var result = '';
    while (str.length > 3) {
      result = ',' + str.slice(-3) + result;
      str = str.slice(0, -3);
    }
    return str + result;
  },

  /** 刷新登录状态 */
  refreshLoginState: function() {
    var app = getApp();
    this.setData({ isLoggedIn: !!app.checkLogin() });
  },

  /** 登录按钮 */
  goLogin: function() {
    var that = this;
    var app = getApp();
    if (app.checkLogin()) {
      that.refreshLoginState();
      that.loadLastStudySession();
      return;
    }
    app.login().then(function(success) {
      if (success) {
        that.refreshLoginState();
        that.loadLastStudySession();
      }
    });
  },

  /** 已登录无记录时，滚动到题库区域 */
  scrollToBankSection: function() {
    wx.pageScrollTo({
      selector: '#bank-section',
      duration: 300
    });
  },

  /** 继续上次练习 */
  goContinueQuiz: function() {
    var that = this;
    var session = that.data.lastStudySession;
    if (!session) {
      wx.showToast({ title: '暂无练习记录', icon: 'none' });
      return;
    }
    if (!session.bankId) {
      wx.showToast({ title: '练习记录异常', icon: 'none' });
      return;
    }

    var app = getApp();
    if (!app.checkLogin()) {
      wx.showModal({
        title: '需要登录',
        content: '继续上次练习需要登录后使用，是否现在登录？',
        confirmText: '登录',
        cancelText: '取消',
        success: function(res) {
          if (res.confirm) {
            app.login().then(function(success) {
              if (success) that.goContinueQuiz();
            });
          }
        }
      });
      return;
    }

    // 构建导航 URL
    var url = '/pages/quiz/quiz'
      + '?id=' + session.bankId
      + '&name=' + encodeURIComponent(session.bankName || '')
      + '&chapterId=' + session.chapterId
      + '&chapterName=' + encodeURIComponent(session.chapterName || '')
      + '&currentQuestion=' + (session.currentQuestion !== undefined ? session.currentQuestion : 0);

    // 如果 session 里带了 path，也传过去（增强健壮性）
    if (session.path) {
      url += '&path=' + encodeURIComponent(session.path);
    }

    // 如果 session 里带了 currentQuestion，也传过去让 quiz 恢复到那题
    // 但 quiz.js onLoad 不处理这个，需要 quiz.js 支持（留作后续扩展）
    wx.navigateTo({
      url: url,
      fail: function(err) {
        console.error('跳转到 quiz 失败:', err, 'URL:', url);
        wx.showToast({ title: '跳转失败，请重试', icon: 'none' });
      }
    });
  },

  /** 跳转到题库章节页面 */
  goQuiz: function(event) {
    var that = this;
    var app = getApp();
    if (!app.checkLogin()) {
      wx.showModal({
        title: '需要登录',
        content: '刷题功能需要登录后使用，是否现在登录？',
        confirmText: '登录',
        cancelText: '取消',
        success: function(res) {
          if (res.confirm) {
            app.login().then(function(success) {
              if (success) that.goQuiz(event);
            });
          }
        }
      });
      return;
    }

    var id = event.currentTarget.dataset.id;
    var title = event.currentTarget.dataset.title;
    var path = event.currentTarget.dataset.path;

    if (!id) return;

    // 优先使用列表已缓存的 path，避免再次云调用校验题库
    if (!path) {
      var banks = wx.getStorageSync('cachedQuestionBanks') || [];
      for (var k = 0; k < banks.length; k++) {
        if (banks[k]._id === id) {
          path = banks[k].path;
          break;
        }
      }
    }

    if (!path || path === '') {
      wx.showModal({ title: '提示', content: '题库更新中，敬请期待', showCancel: false });
      return;
    }

    wx.navigateTo({
      url: '/pages/chapter/chapter?id=' + id
        + '&name=' + title
        + '&path=' + encodeURIComponent(path)
    });
  },

  /** 公众号关注引导：弹出二维码浮层，长按图片识别关注 */
  onOfficialTap: function() {
    this.setData({ showQrcodeModal: true });
  },

  /** 关闭二维码浮层 */
  closeQrcodeModal: function() {
    this.setData({ showQrcodeModal: false });
  },

  /** 阻止冒泡的空函数 */
  noop: function() {
  },

  onShareAppMessage: function() {
    return {
      title: '网络安全刷题站 - 完全免费的网络安全考试题库',
      path: '/pages/index/index'
    };
  },

  onShareTimeline: function() {
    return {
      title: '网络安全刷题站 - 完全免费的网络安全考试题库',
      path: '/pages/index/index'
    };
  }
});
