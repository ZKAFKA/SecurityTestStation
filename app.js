import { init } from '@cloudbase/wx-cloud-client-sdk';
import updateManager from './common/updateManager';

wx.cloud.init({
  env: 'cloud1-2gdek8xx22a5db1a', // 指定云开发环境 ID
});
const client = init(wx.cloud);
const models = client.models;
// 接下来就可以调用 models 上的数据模型增删改查等方法了
globalThis.dataModel = models;

App({
  globalData: {
    openid: null,
    userId: null,
    userInfo: null,
    // 每日打卡提醒订阅消息模板ID（前端授权与云函数发送共用此配置）
    reminderTmplId: '0TqcyxWGWEF32VzGK4VB6UrEXgqkyyRMLBMcvRTiW78'
  },

  onLaunch: async function () {
    await this.initUser();
  },

  onShow: function () {
    // 管理小程序的更新。主要功能包括：检查更新，下载新版本，提示用户更新
    updateManager();
    // 进入小程序（从后台切回）即视为当日打卡
    this.dailyCheckin();
  },

  async initUser() {
    try {
      // 步骤1：获取OpenID
      const openidResult = await wx.cloud.callFunction({
        name: 'getOpenid'
      });

      if (!openidResult.result.success) {
        return;
      }

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

      if (!initResult.result.success) {
        return;
      }

      const userId = initResult.result.data.userId;
      this.globalData.userId = userId;

      // 步骤3：获取用户数据
      const userDataResult = await wx.cloud.callFunction({
        name: 'getUserData',
        data: {
          userId: userId,
          includeAnswers: false
        }
      });

      if (!userDataResult.result.success) {
        return;
      }

      const userData = userDataResult.result.data;

      // 步骤4：保存到本地存储
      wx.setStorageSync('currentUser', userData.user);
      wx.setStorageSync('userData', userData);
      wx.setStorageSync('favoriteQuestions', userData.favorites.map(f => f.questionId));
      wx.setStorageSync('wrongQuestions', userData.wrongQuestions.map(w => w.questionId));

      // 进入小程序即视为当日打卡
      this.dailyCheckin();

    } catch (error) {
    }
  },

  // 微信登录
  async login() {
    try {
      // 步骤1：获取登录凭证
      const loginResult = await wx.login();
      if (!loginResult.code) {
        wx.showToast({
          title: '登录失败，请重试',
          icon: 'none'
        });
        return false;
      }

      // 步骤2：获取用户信息（使用最新的授权方式）
      const userInfoResult = await this.getUserInfoWithAuth();
      if (!userInfoResult) {
        return false;
      }

      const userInfo = userInfoResult;

      // 步骤3：调用登录云函数
      const cloudLoginResult = await wx.cloud.callFunction({
        name: 'login',
        data: {
          userInfo: userInfo
        }
      });

      if (!cloudLoginResult.result.success) {
        wx.showToast({
          title: '登录失败: ' + cloudLoginResult.result.message,
          icon: 'none'
        });
        return false;
      }

      const userId = cloudLoginResult.result.data.userId;
      const user = cloudLoginResult.result.data.user;

      // 步骤4：更新全局数据
      this.globalData.userId = userId;
      this.globalData.userInfo = user;

      // 步骤5：保存到本地存储
      wx.setStorageSync('currentUser', user);
      wx.setStorageSync('isLoggedIn', true);

      wx.showToast({
        title: '登录成功',
        icon: 'success'
      });

      // 登录完成后补一次当日打卡
      this.dailyCheckin();

      return true;

    } catch (error) {
      if (error.errMsg && error.errMsg.includes('auth deny')) {
        wx.showToast({
          title: '需要您的授权才能继续',
          icon: 'none'
        });
      } else {
        wx.showToast({
          title: '登录失败，请重试',
          icon: 'none'
        });
      }
      
      return false;
    }
  },

  // 获取用户信息（使用微信最新的头像昵称填写规范）
  async getUserInfoWithAuth() {
    return new Promise((resolve, reject) => {
      // 微信最新规范：需要用户手动填写昵称和上传头像
      // 这里我们先使用默认值，后续可以实现头像昵称填写功能
      const defaultUserInfo = {
        nickName: '微信用户',
        avatarUrl: 'cloud://cloud1-2gdek8xx22a5db1a.636c-cloud1-2gdek8xx22a5db1a-1395189804/assets/default_avatar.png',
        gender: 0,
        country: '',
        province: '',
        city: '',
        language: ''
      };
      
      // 显示提示，告诉用户需要手动设置昵称和头像
      wx.showModal({
        title: '提示',
        content: '用户登录成功',
        confirmText: '确定',
        showCancel: false,
        success: () => {
          resolve(defaultUserInfo);
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  // 检查登录状态
  checkLogin() {
    const isLoggedIn = wx.getStorageSync('isLoggedIn');
    const currentUser = wx.getStorageSync('currentUser');
    
    return isLoggedIn && currentUser;
  },

  // 获取当前用户
  getCurrentUser() {
    return wx.getStorageSync('currentUser');
  },

  // ==================== 每日打卡（进入小程序即打卡，无需做题） ====================

  // UTC+8 自然日 key
  getTodayKey() {
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  },

  // 触发当日打卡（本地当日节流；云端也按日期去重，幂等）
  // 注意：节流标记只在云端成功后写入，失败可重试，避免当天漏打卡
  dailyCheckin() {
    var userId = this.globalData.userId;
    if (!userId) return;
    var todayKey = this.getTodayKey();
    if (wx.getStorageSync('daily_checkin_date') === todayKey) return;
    wx.cloud.callFunction({
      name: 'userDailyCheckin',
      data: { userId: userId }
    }).then(function (res) {
      if (res && res.result && res.result.success) {
        wx.setStorageSync('daily_checkin_date', todayKey);
      }
    }).catch(function (err) {
      console.warn('每日打卡失败:', err);
    });
  },

  // ==================== 每日提醒订阅授权 ====================

  // 当天是否已经请求过订阅授权
  hasRequestedSubscribeToday() {
    return wx.getStorageSync('reminder_sub_date') === this.getTodayKey();
  },

  // 标记今天已请求过订阅授权
  markSubscribeRequestedToday() {
    wx.setStorageSync('reminder_sub_date', this.getTodayKey());
  },

  // 请求每日打卡提醒订阅授权（拉起微信订阅弹窗）
  // 返回 Promise<boolean>：true=用户允许，false=拒绝/失败
  // 注意：无论允许还是拒绝，当天都不再重复请求
  requestReminderSubscribe() {
    var tmplId = this.globalData.reminderTmplId;
    if (!tmplId) return Promise.resolve(false);
    var self = this;
    return new Promise(function (resolve) {
      wx.requestSubscribeMessage({
        tmplIds: [tmplId],
        success: function (res) {
          self.markSubscribeRequestedToday();
          resolve(res[tmplId] === 'accept');
        },
        fail: function () {
          // 系统失败（手势上下文丢失/模板未配置等）不标记今日已请求，便于当天重试
          resolve(false);
        }
      });
    });
  },

  // 已开启提醒 且 今天还没请求过时，请求一次订阅授权（用于 my 页面每日自动授权）
  // 用户此前勾选"总是保持以上选择"时不会弹窗，实现静默获取
  requestReminderSubscribeIfEnabled() {
    var enabled = wx.getStorageSync('checkinReminder');
    if (!enabled) return Promise.resolve(false);
    if (this.hasRequestedSubscribeToday()) return Promise.resolve(false);
    return this.requestReminderSubscribe();
  }
});
