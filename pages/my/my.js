// pages/my.js

// 用户卡背景图候选（4张轮换）
var CARD_BG_LIST = [
  'cloud://cloud1-2gdek8xx22a5db1a.636c-cloud1-2gdek8xx22a5db1a-1395189804/用户背景图/usercard-background1.jpeg',
  'cloud://cloud1-2gdek8xx22a5db1a.636c-cloud1-2gdek8xx22a5db1a-1395189804/用户背景图/usercard-background2.jpeg',
  'cloud://cloud1-2gdek8xx22a5db1a.636c-cloud1-2gdek8xx22a5db1a-1395189804/用户背景图/usercard-background3.jpeg',
  'cloud://cloud1-2gdek8xx22a5db1a.636c-cloud1-2gdek8xx22a5db1a-1395189804/用户背景图/usercard-background4.jpeg'
];

Page({
  /**
   * 页面的初始数据
   */
  data: {
    totalQuestions: 0,
    correctQuestions: 0,
    wrongQuestionsCount: 0,
    favoriteQuestionsCount: 0,
    userInfo: null,
    // 新UI字段
    uid: '',
    checkinDays: 0,
    totalCheckinDays: 0,
    correctRateDisplay: '0.0',
    checkinReminder: false,
    reminderProcessing: false,
    countdownDays: 0,
    masteryPct: 0,
    cardBgUrl: '',
    isFirstLoad: true,
    // 考试目标字段
    examBankId: '',
    examBankTitle: '',
    examDate: '',
    bankList: [],
    bankRange: [],
    bankIdx: 0,
    tempBankIdx: 0,
    tempExamDate: '',
    showTargetModal: false,
    // 备考资料弹窗
    showMaterialModal: false,
    // 联系我们弹窗
    showContactModal: false,
    qrcodeUrl: 'cloud://cloud1-2gdek8xx22a5db1a.636c-cloud1-2gdek8xx22a5db1a-1395189804/公众号二维码/qrcode.jpg'
  },

  /**
   * 每次进入页面随机选一张用户卡背景
   */
  pickCardBackground() {
    var idx = Math.floor(Math.random() * CARD_BG_LIST.length);
    this.setData({ cardBgUrl: CARD_BG_LIST[idx] });
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.loadLocalSettings();
    this.loadUserStats();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  async onShow() {
    // 每次进入页面随机换一张用户卡背景
    this.pickCardBackground();
    // 首次进入页面时自动触发登录授权流程
    if (this.data.isFirstLoad) {
      this.setData({ isFirstLoad: false });
      await this.autoLogin();
    }
    // 每次页面显示时重新加载数据
    this.loadUserInfo();
    this.loadUserStats();
    // 加载考试目标 + 题库列表 + 刷新显示
    this.initExamTarget();
    // 已开启打卡提醒时，每次进入页面自动增加一次订阅授权
    var app = getApp();
    if (app.requestReminderSubscribeIfEnabled) {
      app.requestReminderSubscribeIfEnabled();
    }
  },

  /**
   * 初始化考试目标：云端读取 → 拉题库列表 → 刷新倒计时/掌握度
   */
  async initExamTarget() {
    await this.loadExamTargetFromCloud();
    await this.loadBankList();
    await this.refreshTargetDisplay();
  },

  /**
   * 从云端读取考试目标（云端没有时回退本地缓存并迁移上云）
   */
  async loadExamTargetFromCloud() {
    var app = getApp();
    var userId = app.globalData.userId;
    if (!userId) {
      this.loadExamTargetFromStorage();
      return;
    }
    try {
      var res = await wx.cloud.callFunction({
        name: 'examTarget',
        data: { action: 'get', userId: userId }
      });
      var target = res && res.result && res.result.success ? res.result.data : null;
      if (target && target.bankId && target.examDate) {
        this.setData({
          examBankId: target.bankId,
          examBankTitle: target.bankTitle || '',
          examDate: target.examDate
        });
        return;
      }
      // 云端没有 → 读本地缓存（历史数据迁移上云）
      var key = 'examTarget_' + userId;
      var saved = wx.getStorageSync(key);
      if (saved && saved.bankId && saved.examDate) {
        this.setData({
          examBankId: saved.bankId,
          examBankTitle: saved.bankTitle || '',
          examDate: saved.examDate
        });
        this.syncExamTargetToCloud(saved.bankId, saved.bankTitle, saved.examDate);
      }
    } catch (err) {
      console.warn('云端读取考试目标失败，回退本地缓存:', err);
      this.loadExamTargetFromStorage();
    }
  },

  /**
   * 从本地 Storage 读取已保存的考试目标（兜底）
   */
  loadExamTargetFromStorage() {
    var app = getApp();
    var userId = app.globalData.userId || 'anonymous';
    var key = 'examTarget_' + userId;
    var saved = wx.getStorageSync(key);
    if (saved && saved.bankId && saved.examDate) {
      this.setData({
        examBankId: saved.bankId,
        examBankTitle: saved.bankTitle || '',
        examDate: saved.examDate
      });
    }
  },

  /**
   * 同步考试目标到云端（users.examTarget）
   */
  async syncExamTargetToCloud(bankId, bankTitle, examDate) {
    var app = getApp();
    var userId = app.globalData.userId;
    if (!userId) return false;
    try {
      var res = await wx.cloud.callFunction({
        name: 'examTarget',
        data: {
          action: 'save',
          userId: userId,
          bankId: bankId,
          bankTitle: bankTitle,
          examDate: examDate
        }
      });
      return !!(res && res.result && res.result.success);
    } catch (err) {
      console.warn('同步考试目标到云端失败:', err);
      return false;
    }
  },

  /**
   * 拉题库列表，组装 picker range
   */
  async loadBankList() {
    try {
      var res = await wx.cloud.callFunction({ name: 'getQuestionBanks' });
      if (res && res.result && res.result.success && res.result.data) {
        var raw = res.result.data;
        var banks = [];
        var range = [];
        for (var i = 0; i < raw.length; i++) {
          // 云函数返回的字段叫 name，不是 title，这里统一映射
          var title = raw[i].name || raw[i].title || '';
          var item = {
            _id: raw[i]._id,
            title: title,
            name: raw[i].name,
            path: raw[i].path,
            questionCount: raw[i].questionCount || 0,
            chapterCount: raw[i].chapterCount || 0
          };
          banks.push(item);
          range.push(title);
        }
        var idx = 0;
        if (this.data.examBankId) {
          for (var j = 0; j < banks.length; j++) {
            if (banks[j]._id === this.data.examBankId) { idx = j; break; }
          }
        }
        this.setData({
          bankList: banks,
          bankRange: range,
          bankIdx: idx
        });
      }
    } catch (err) {
      console.warn('loadBankList 失败:', err);
    }
  },

  /**
   * 刷新考试目标显示（倒计时 + 掌握度）
   * 未设置 examBankId 时保持空状态，不自动兜底
   */
  async refreshTargetDisplay() {
    var examBankId = this.data.examBankId;
    var examDate = this.data.examDate;

    // 未设置过 → 兜底为 0% 和 0 天
    if (!examBankId || !examDate) {
      this.setData({
        countdownDays: 0,
        masteryPct: 0,
        examBankTitle: ''
      });
      return;
    }

    // 计算倒计时
    var now = new Date();
    var targetDate = new Date(examDate);
    var diffDays = Math.ceil((targetDate - now) / 86400000);
    if (diffDays < 0) diffDays = 0;
    this.setData({ countdownDays: diffDays });

    // 计算掌握度（调云函数）
    try {
      var app = getApp();
      var userId = app.globalData.userId;
      if (userId) {
        var progRes = await wx.cloud.callFunction({
          name: 'getBankProgress',
          data: { userId: userId, bankId: examBankId }
        });
        if (progRes && progRes.result && progRes.result.success) {
          var mastery = progRes.result.data.mastery || 0;
          this.setData({ masteryPct: mastery });
        }
      }
    } catch (err) {
      console.warn('refreshTargetDisplay 进度计算失败:', err);
      this.setData({ masteryPct: 0 });
    }
  },

  /**
   * 点击备考目标卡片 → 打开设置弹窗
   */
  openTargetModal() {
    if (!this.data.bankList || this.data.bankList.length === 0) {
      wx.showToast({ title: '题库加载中，请稍候', icon: 'none' });
      return;
    }
    // 初始化临时值
    this.setData({
      tempBankIdx: this.data.bankIdx,
      tempExamDate: this.data.examDate || this.getDefaultExamDate(),
      showTargetModal: true
    });
  },

  /**
   * 关闭弹窗
   */
  closeTargetModal() {
    this.setData({ showTargetModal: false });
  },

  /**
   * 题库 picker 变化
   */
  onBankPick(e) {
    this.setData({ tempBankIdx: Number(e.detail.value) });
  },

  /**
   * 日期 picker 变化
   */
  onDatePick(e) {
    this.setData({ tempExamDate: e.detail.value });
  },

  /**
   * 确认保存考试目标（本地缓存 + 实时同步云端）
   */
  async confirmTarget() {
    var idx = this.data.tempBankIdx;
    var bank = this.data.bankList[idx];
    var examDate = this.data.tempExamDate;
    if (!bank) return;

    this.setData({
      examBankId: bank._id,
      examBankTitle: bank.title,
      examDate: examDate,
      bankIdx: idx,
      showTargetModal: false
    });

    // 保存到本地 Storage（缓存，快速显示）
    var app = getApp();
    var userId = app.globalData.userId || 'anonymous';
    var key = 'examTarget_' + userId;
    wx.setStorageSync(key, {
      bankId: bank._id,
      bankTitle: bank.title,
      examDate: examDate
    });

    wx.showLoading({ title: '保存中...' });
    // 实时同步到云端
    var synced = await this.syncExamTargetToCloud(bank._id, bank.title, examDate);
    try {
      await this.refreshTargetDisplay();
    } finally {
      wx.hideLoading();
    }
    if (synced) {
      wx.showToast({ title: '已更新备考目标', icon: 'success' });
    } else {
      wx.showToast({ title: '已保存，云端同步失败', icon: 'none' });
    }
  },

  /**
   * 默认考试日期 = 今天+48 天
   */
  getDefaultExamDate() {
    var d = new Date();
    d.setDate(d.getDate() + 48);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  },

  /**
   * 空操作（用于 catchtap 阻断事件冒泡）
   */
  noop() {},

  /**
   * 打开备考资料弹窗
   */
  showMaterialModal() {
    this.setData({ showMaterialModal: true });
  },

  /**
   * 关闭备考资料弹窗
   */
  closeMaterialModal() {
    this.setData({ showMaterialModal: false });
  },

  /**
   * 加载本地设置（打卡提醒开关等）
   */
  loadLocalSettings() {
    var reminder = wx.getStorageSync('checkinReminder');
    if (reminder === '' || reminder === null || reminder === undefined) {
      // 从未主动开启过 → 默认关闭，避免未授权用户被弹订阅窗
      reminder = false;
    }
    this.setData({ checkinReminder: reminder });
  },

  /**
   * 自动登录授权
   */
  async autoLogin() {
    var app = getApp();
    if (!app.checkLogin()) {
      await app.login();
      this.loadUserInfo();
    }
  },

  // 云存储默认头像（兜底）
  DEFAULT_AVATAR: 'cloud://cloud1-2gdek8xx22a5db1a.636c-cloud1-2gdek8xx22a5db1a-1395189804/assets/default_avatar.png',

  /**
   * 对 avatarUrl 做兜底：空 / 旧本地路径 → 云存储默认头像
   */
  fixAvatarUrl(url) {
    if (!url) return this.DEFAULT_AVATAR;
    // 旧本地路径或 /images/ 开头的不存在路径
    if (typeof url === 'string' && (url.indexOf('/images/') === 0 || url.indexOf('http') !== 0 && url.indexOf('cloud://') !== 0)) {
      return this.DEFAULT_AVATAR;
    }
    return url;
  },

  /**
   * 加载用户信息（每次从云端拉最新 avatarUrl + nickname）
   */
  async loadUserInfo() {
    var app = getApp();
    var localUser = app.getCurrentUser() || null;
    // 本地缓存先做一次兜底
    if (localUser) {
      localUser = Object.assign({}, localUser, { avatarUrl: this.fixAvatarUrl(localUser.avatarUrl) });
    }
    this.setData({ userInfo: localUser });

    if (!app.checkLogin()) return;

    var userId = app.globalData.userId;
    // 设置UID显示
    if (userId) {
      var shortUid = String(userId).slice(-8);
      this.setData({ uid: shortUid || userId });
    }

    try {
      var res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { userId: userId }
      });
      if (res && res.result && res.result.success && res.result.data && res.result.data.user) {
        var cloudUser = res.result.data.user;
        var merged = Object.assign({}, localUser || {}, cloudUser);
        // 云端 avatarUrl 兜底修复
        merged.avatarUrl = this.fixAvatarUrl(merged.avatarUrl);
        this.setData({ userInfo: merged });
        app.globalData.userInfo = merged;
        wx.setStorageSync('currentUser', merged);
        // 以云端提醒开关为准，同步本地开关显示
        if (cloudUser.checkinReminder !== undefined) {
          var cloudReminder = !!cloudUser.checkinReminder;
          this.setData({ checkinReminder: cloudReminder });
          wx.setStorageSync('checkinReminder', cloudReminder);
        }
        // 云端返回的用户ID
        if (cloudUser._id) {
          var uidShort = String(cloudUser._id).slice(-8);
          this.setData({ uid: uidShort || cloudUser._id });
        }
      }
    } catch (err) {
      console.warn('loadUserInfo 云端刷新失败，保留本地数据:', err);
    }
  },

  /**
   * 用户头像/名称点击事件
   */
  async onUserTap() {
    var app = getApp();
    if (!app.checkLogin()) {
      await app.login();
      this.loadUserInfo();
    } else {
      this.openUserProfileSetting();
    }
  },

  /**
   * 打开头像昵称设置
   */
  openUserProfileSetting() {
    wx.showActionSheet({
      itemList: ['修改昵称', '修改头像'],
      success: async (res) => {
        if (res.tapIndex === 0) {
          await this.modifyNickName();
        } else if (res.tapIndex === 1) {
          await this.modifyAvatar();
        }
      }
    });
  },

  /**
   * 修改昵称
   */
  async modifyNickName() {
    var app = getApp();
    var currentUser = app.getCurrentUser();

    wx.showModal({
      title: '修改昵称',
      content: '',
      editable: true,
      placeholderText: (currentUser && currentUser.nickName) || '请输入昵称',
      success: async (res) => {
        if (res.confirm && res.content) {
          var newNickName = res.content.trim();
          if (newNickName) {
            var updatedUser = Object.assign({}, currentUser, { nickName: newNickName });
            wx.setStorageSync('currentUser', updatedUser);
            app.globalData.userInfo = updatedUser;
            await this.updateUserInfoInCloud(updatedUser);
            this.loadUserInfo();
            wx.showToast({ title: '昵称修改成功', icon: 'success' });
          }
        }
      }
    });
  },

  /**
   * 修改头像
   */
  async modifyAvatar() {
    try {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: async (res) => {
          try {
            var tempFiles = res.tempFiles || [];
            if (Array.isArray(tempFiles) && tempFiles.length > 0) {
              var tempFilePath = tempFiles[0].tempFilePath;
              if (tempFilePath) {
                var app = getApp();
                var currentUser = app.getCurrentUser();
                if (!currentUser || !currentUser._id) {
                  throw new Error('获取用户信息失败');
                }
                var oldAvatarUrl = currentUser.avatarUrl;
                var timestamp = Date.now();
                var cloudPath = 'user_avatars/' + currentUser._id + '_' + timestamp + '.png';
                wx.showLoading({ title: '上传中...' });
                try {
                  var uploadResult = await wx.cloud.uploadFile({
                    cloudPath: cloudPath,
                    filePath: tempFilePath
                  });
                  if (uploadResult.fileID) {
                    var updatedUser = Object.assign({}, currentUser, { avatarUrl: uploadResult.fileID });
                    wx.setStorageSync('currentUser', updatedUser);
                    app.globalData.userInfo = updatedUser;
                    await this.updateUserInfoInCloud(updatedUser);
                    if (oldAvatarUrl && oldAvatarUrl.indexOf('cloud://') === 0) {
                      try {
                        await wx.cloud.deleteFile({ fileList: [oldAvatarUrl] });
                      } catch (deleteError) {}
                    }
                    this.loadUserInfo();
                    wx.showToast({ title: '头像修改成功', icon: 'success' });
                  }
                } catch (uploadError) {
                  wx.showToast({ title: '头像上传失败，请重试', icon: 'none' });
                } finally {
                  wx.hideLoading();
                }
              }
            }
          } catch (processError) {
            wx.showToast({ title: '处理头像失败，请重试', icon: 'none' });
          }
        },
        fail: () => {
          wx.showToast({ title: '选择图片失败，请重试', icon: 'none' });
        }
      });
    } catch (error) {
      wx.showToast({ title: '修改头像失败，请重试', icon: 'none' });
    }
  },

  /**
   * 更新用户信息到云端
   */
  async updateUserInfoInCloud(userInfo) {
    try {
      await wx.cloud.callFunction({
        name: 'login',
        data: { userInfo: userInfo }
      });
    } catch (error) {
      console.error('更新云端用户信息失败:', error);
    }
  },

  /**
   * 加载用户统计数据
   */
  async loadUserStats() {
    try {
      var app = getApp();
      var userId = app.globalData.userId;
      if (!userId) {
        var success = await app.login();
        if (!success) return;
        userId = app.globalData.userId;
      }

      // 先确保当日打卡（含首次历史迁移）已完成，再读统计，避免冷启动竞态读到旧值
      await wx.cloud.callFunction({
        name: 'userDailyCheckin',
        data: { userId: userId }
      });

      var userDataResult = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { userId: userId }
      });
      var statsResult = await wx.cloud.callFunction({
        name: 'getUserStats',
        data: { userId: userId }
      });
      // 收藏数量与收藏页同口径：getUserFavoriteQuestions 只返回题目仍存在的收藏
      var favResult = await wx.cloud.callFunction({
        name: 'getUserFavoriteQuestions',
        data: { userId: userId }
      });

      var wrongQuestionsCount = 0;
      var favoriteQuestionsCount = 0;
      var totalQuestionsCount = 0;
      var correctQuestions = 0;
      var checkinDays = 0;
      var totalCheckinDays = 0;

      if (favResult.result && favResult.result.success && Array.isArray(favResult.result.questions)) {
        favoriteQuestionsCount = favResult.result.questions.length;
      }

      if (userDataResult.result && userDataResult.result.success && userDataResult.result.data) {
        var userData = userDataResult.result.data;
        var wrongQuestions = userData.wrongQuestions || [];
        wrongQuestionsCount = wrongQuestions.length;
        // 从users表获取正确题数和打卡天数（兜底值）
        if (userData.user) {
          // 刷题总数/正确题数直接读 users 表字段（最简口径：答过的总数、做对数）
          totalQuestionsCount = userData.user.totalQuestions || 0;
          correctQuestions = userData.user.correctCount || 0;
          checkinDays = userData.user.continuousCheckinDays || userData.user.checkinDays || 0;
          totalCheckinDays = userData.user.totalCheckinDays || 0;
        }
      }

      if (statsResult.result && statsResult.result.success && statsResult.result.data) {
        var statsData = statsResult.result.data;
        // 打卡天数以 getUserStats 实时计算结果为准；旧版云函数无此字段时保留 users 表兜底值
        if (statsData.continuousCheckinDays !== undefined && statsData.continuousCheckinDays !== null) {
          checkinDays = statsData.continuousCheckinDays;
        }
        if (statsData.totalCheckinDays !== undefined && statsData.totalCheckinDays !== null) {
          totalCheckinDays = statsData.totalCheckinDays;
        }
      }

      // 计算正确率（分子分母同口径，不会超过100%）
      var correctRateDisplay = '0.0';
      if (totalQuestionsCount > 0) {
        var rate = (correctQuestions / totalQuestionsCount) * 100;
        correctRateDisplay = rate.toFixed(1);
      }

      this.setData({
        wrongQuestionsCount: wrongQuestionsCount,
        favoriteQuestionsCount: favoriteQuestionsCount,
        totalQuestionsCount: totalQuestionsCount,
        correctRateDisplay: correctRateDisplay,
        checkinDays: checkinDays,
        totalCheckinDays: totalCheckinDays
      });
    } catch (error) {
      console.error('加载用户统计数据失败:', error);
      var wrongQuestions = wx.getStorageSync('wrongQuestions') || [];
      var favoriteQuestions = wx.getStorageSync('favoriteQuestions') || [];
      // 失败时仅更新角标，不用本地0值覆盖已显示的刷题总数/打卡天数
      this.setData({
        wrongQuestionsCount: wrongQuestions.length,
        favoriteQuestionsCount: favoriteQuestions.length
      });
    }
  },

  /**
   * 打卡提醒开关变化
   */
  async onReminderChange(e) {
    var app = getApp();

    // 防止重复触发（点击抽搐）
    if (this.data.reminderProcessing) {
      return;
    }

    var checked = e.detail.value;

    // 关闭：直接同步，无需订阅授权
    if (!checked) {
      this.setData({ checkinReminder: false });
      wx.setStorageSync('checkinReminder', false);
      await this.syncReminderSetting(false);
      wx.showToast({
        title: '已关闭打卡提醒',
        icon: 'none',
        duration: 1500
      });
      return;
    }

    // 开启：直接在当前点击手势内拉起订阅授权
    // 注意：不要在 requestSubscribeMessage 之前 await showModal，否则 iOS 手势上下文丢失会导致订阅静默失败
    this.setData({ reminderProcessing: true, checkinReminder: true });

    var accepted = await app.requestReminderSubscribe();
    if (!accepted) {
      this.setData({ checkinReminder: false, reminderProcessing: false });
      wx.setStorageSync('checkinReminder', false);
      wx.showToast({
        title: '未授权订阅，提醒未开启',
        icon: 'none',
        duration: 1800
      });
      return;
    }

    wx.setStorageSync('checkinReminder', true);
    var synced = await this.syncReminderSetting(true);
    this.setData({ reminderProcessing: false });
    wx.showToast({
      title: synced ? '已开启，每晚8点提醒你' : '已开启，云端同步失败',
      icon: 'none',
      duration: 1800
    });
  },

  /**
   * 同步提醒开关到云端 users.checkinReminder
   */
  async syncReminderSetting(enabled) {
    var app = getApp();
    var userId = app.globalData.userId;
    if (!userId) return false;
    try {
      var res = await wx.cloud.callFunction({
        name: 'sendCheckinReminder',
        data: {
          action: 'setSetting',
          userId: userId,
          enabled: !!enabled
        }
      });
      return !!(res && res.result && res.result.success);
    } catch (err) {
      console.warn('syncReminderSetting 失败:', err);
      return false;
    }
  },

  /**
   * 跳转到错题本页面
   */
  async goToWrongQuestions() {
    var app = getApp();
    if (!app.checkLogin()) {
      var success = await app.login();
      if (!success) return;
    }
    wx.navigateTo({ url: '/pages/wrong-questions/wrong-questions' });
  },

  /**
   * 跳转到收藏题目页面
   */
  async goToFavoriteQuestions() {
    var app = getApp();
    if (!app.checkLogin()) {
      var success = await app.login();
      if (!success) return;
    }
    wx.navigateTo({ url: '/pages/favorite-questions/favorite-questions' });
  },

  /**
   * 联系我们
   */
  contactUs() {
    this.setData({ showContactModal: true });
  },

  /**
   * 关闭联系我们弹窗
   */
  closeContactModal() {
    this.setData({ showContactModal: false });
  },

  /**
   * 关于我们 / 清除缓存
   */
  aboutUs() {
    wx.showActionSheet({
      itemList: ['清除缓存', '关于我们'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.clearCache();
        } else if (res.tapIndex === 1) {
          wx.showModal({
            title: '关于我们',
            content: '网络安全刷题站 v2.4.0\n\n致力于为广大安全从业者、安全学习者提供优质的学习体验。\n\n©2026 网络安全研究站',
            showCancel: false,
            confirmText: '确定'
          });
        }
      }
    });
  },

  /**
   * 清除缓存
   */
  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除本地缓存吗？这不会影响云端数据。',
      confirmText: '清除',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          // 保留登录状态相关的key
          var keysToKeep = ['currentUser', 'userId', 'checkinReminder'];
          var allKeys = wx.getStorageInfoSync().keys || [];
          for (var i = 0; i < allKeys.length; i++) {
            if (keysToKeep.indexOf(allKeys[i]) === -1) {
              wx.removeStorageSync(allKeys[i]);
            }
          }
          wx.showToast({ title: '缓存已清除', icon: 'success' });
          // 重新加载数据
          this.loadUserStats();
        }
      }
    });
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    this.loadUserStats();
    wx.stopPullDownRefresh();
  },

  /**
   * 用户点击右上角分享给朋友
   */
  onShareAppMessage() {
    return {
      title: '网络安全刷题站 - 完全免费的网络安全考试题库',
      path: '/pages/index/index',
      imageUrl: 'cloud://cloud1-2gdek8xx22a5db1a.636c-cloud1-2gdek8xx22a5db1a-1395189804/weda-uploader/b30bb99d6ec016c0c53126b13e92efda-网络安全刷题站.jpg',
      fail: function (res) {
        wx.showToast({ title: '分享失败，请重试', icon: 'none' });
      }
    };
  },

  /**
   * 用户点击右上角分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '网络安全刷题站 - 完全免费的网络安全考试题库',
      path: '/pages/index/index',
      imageUrl: 'cloud://cloud1-2gdek8xx22a5db1a.636c-cloud1-2gdek8xx22a5db1a-1395189804/weda-uploader/b30bb99d6ec016c0c53126b13e92efda-网络安全刷题站.jpg',
      fail: function (res) {
        wx.showToast({ title: '分享失败，请重试', icon: 'none' });
      }
    };
  }
});