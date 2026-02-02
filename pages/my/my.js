// pages/my.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    totalQuestions: 0,
    correctQuestions: 0,
    wrongQuestionsCount: 0,
    favoriteQuestionsCount: 0,
    backgroundImageUrl: '',
    userInfo: null,
    todayProgress: 0,
    totalQuestionsCount: 0
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.loadBackgroundImage();
    this.loadUserStats();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 每次页面显示时重新加载数据
    this.loadUserInfo();
    this.loadUserStats();
  },

  /**
   * 加载用户信息
   */
  loadUserInfo() {
    const app = getApp();
    const userInfo = app.getCurrentUser();
    this.setData({
      userInfo: userInfo
    });
    console.log('用户信息已加载:', userInfo);
  },

  /**
   * 用户头像/名称点击事件
   */
  async onUserTap() {
    const app = getApp();
    if (!app.checkLogin()) {
      // 未登录，触发登录
      await app.login();
      // 登录成功后刷新用户信息
      this.loadUserInfo();
    }
  },

  /**
   * 从云存储加载背景图
   */
  async loadBackgroundImage() {
    try {
      // 随机选择一张背景图（1-4）
      const randomIndex = Math.floor(Math.random() * 4) + 1;
      const fileID = `cloud://cloud1-2gdek8xx22a5db1a.636c-cloud1-2gdek8xx22a5db1a-1395189804/用户背景图/usercard-background${randomIndex}.jpeg`;

      console.log('随机选择的背景图:', fileID);

      // 获取临时下载链接
      const fileURL = await wx.cloud.getTempFileURL({
        fileList: [fileID]
      });

      if (fileURL.fileList && fileURL.fileList[0] && fileURL.fileList[0].tempFileURL) {
        this.setData({
          backgroundImageUrl: fileURL.fileList[0].tempFileURL
        });
        console.log('背景图加载成功:', fileURL.fileList[0].tempFileURL);
      } else {
        console.error('获取临时下载链接失败:', fileURL);
      }
    } catch (error) {
      console.error('加载背景图失败:', error);
    }
  },

  /**
   * 加载用户统计数据
   */
  async loadUserStats() {
    try {
      const app = getApp();
      const userId = app.globalData.userId;
      
      // 并行调用多个云函数获取数据
      const [userDataResult, statsResult] = await Promise.all([
        // 获取用户数据（包含错题和收藏）
        wx.cloud.callFunction({
          name: 'getUserData',
          data: {
            userId: userId
          }
        }),
        // 获取刷题统计数据（今日和总刷题数）
        wx.cloud.callFunction({
          name: 'getUserStats',
          data: {
            userId: userId
          }
        })
      ]);
      
      let wrongQuestionsCount = 0;
      let favoriteQuestionsCount = 0;
      let todayProgress = 0;
      let totalQuestionsCount = 0;
      
      // 处理用户数据（错题和收藏）
      if (userDataResult.result && userDataResult.result.success && userDataResult.result.data) {
        const userData = userDataResult.result.data;
        // 获取错题数量
        const wrongQuestions = userData.wrongQuestions || [];
        wrongQuestionsCount = wrongQuestions.length;
        console.log('从云端获取错题数量:', wrongQuestionsCount);
        
        // 获取收藏数量
        const favorites = userData.favorites || [];
        favoriteQuestionsCount = favorites.length;
        console.log('从云端获取收藏数量:', favoriteQuestionsCount);
      }
      
      // 处理刷题统计数据
      if (statsResult.result && statsResult.result.success && statsResult.result.data) {
        const statsData = statsResult.result.data;
        todayProgress = statsData.todayCount || 0;
        totalQuestionsCount = statsData.totalCount || 0;
        console.log('从云端获取刷题统计:', { todayProgress, totalQuestionsCount });
      }
      
      this.setData({
        todayProgress: todayProgress,
        totalQuestionsCount: totalQuestionsCount,
        wrongQuestionsCount: wrongQuestionsCount,
        favoriteQuestionsCount: favoriteQuestionsCount
      });
    } catch (error) {
      console.error('加载用户统计数据失败:', error);
      // 出错时使用本地数据
      const totalQuestions = wx.getStorageSync('totalQuestions') || 0;
      const wrongQuestions = wx.getStorageSync('wrongQuestions') || [];
      const favoriteQuestions = wx.getStorageSync('favoriteQuestions') || [];
      
      this.setData({
        todayProgress: 0,
        totalQuestionsCount: totalQuestions,
        wrongQuestionsCount: wrongQuestions.length,
        favoriteQuestionsCount: favoriteQuestions.length
      });
    }
  },

  /**
   * 跳转到错题本页面
   */
  goToWrongQuestions() {
    wx.navigateTo({
      url: '/pages/wrong-questions/wrong-questions'
    });
  },

  /**
   * 跳转到收藏题目页面
   */
  goToFavoriteQuestions() {
    wx.navigateTo({
      url: '/pages/favorite-questions/favorite-questions'
    });
  },

  /**
   * 联系我们
   */
  contactUs() {
    // 这里可以使用微信小程序的客服消息功能
    wx.showModal({
      title: '联系我们',
      content: '如有任何问题或建议，欢迎通过公众号"网络安全研究站"后台留言',
      showCancel: false,
      confirmText: '确定'
    });
  },

  /**
   * 关于我们
   */
  aboutUs() {
    wx.showModal({
      title: '关于我们',
      content: '网络安全刷题站v1.0.0\n\n致力于为广大安全从业者、安全学习者提供优质的学习体验。\n\n\n ©2026 网络安全研究站',
      showCancel: false,
      confirmText: '确定'
    });
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    this.loadUserStats();
    wx.stopPullDownRefresh();
  }
})
