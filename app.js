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
    userInfo: null
  },

  onLaunch: async function () {
    console.log('小程序启动...');
    await this.initUser();
  },

  onShow: function () {
    // 管理小程序的更新。主要功能包括：检查更新，下载新版本，提示用户更新
    updateManager();
  },

  async initUser() {
    try {
      console.log('初始化用户...');

      // 步骤1：获取OpenID
      const openidResult = await wx.cloud.callFunction({
        name: 'getOpenid'
      });

      if (!openidResult.result.success) {
        console.error('获取OpenID失败:', openidResult);
        return;
      }

      const openid = openidResult.result.openid;
      this.globalData.openid = openid;
      console.log('获取OpenID成功:', openid);

      // 步骤2：初始化用户数据库
      const initResult = await wx.cloud.callFunction({
        name: 'initUserDatabase',
        data: {
          openid: openid,
          userInfo: this.globalData.userInfo || {}
        }
      });

      if (!initResult.result.success) {
        console.error('初始化用户数据库失败:', initResult);
        return;
      }

      const userId = initResult.result.data.userId;
      this.globalData.userId = userId;
      console.log('初始化用户数据库成功:', userId);

      // 步骤3：获取用户数据
      const userDataResult = await wx.cloud.callFunction({
        name: 'getUserData',
        data: {
          userId: userId,
          includeAnswers: false
        }
      });

      if (!userDataResult.result.success) {
        console.error('获取用户数据失败:', userDataResult);
        return;
      }

      const userData = userDataResult.result.data;
      console.log('获取用户数据成功:', userData);

      // 步骤4：保存到本地存储
      wx.setStorageSync('currentUser', userData.user);
      wx.setStorageSync('userData', userData);
      wx.setStorageSync('favoriteQuestions', userData.favorites.map(f => f.questionId));
      wx.setStorageSync('wrongQuestions', userData.wrongQuestions.map(w => w.questionId));

      console.log('用户数据已保存到本地存储');

    } catch (error) {
      console.error('初始化用户失败:', error);
    }
  },

  // 微信登录
  async login() {
    try {
      console.log('开始微信登录...');

      // 步骤1：获取用户信息
      const userInfoResult = await wx.getUserProfile({
        desc: '用于完善用户资料'
      });

      const userInfo = userInfoResult.userInfo;
      console.log('获取用户信息成功:', userInfo);

      // 步骤2：调用登录云函数
      const loginResult = await wx.cloud.callFunction({
        name: 'login',
        data: {
          userInfo: userInfo
        }
      });

      if (!loginResult.result.success) {
        console.error('登录失败:', loginResult.result.message);
        wx.showToast({
          title: '登录失败: ' + loginResult.result.message,
          icon: 'none'
        });
        return false;
      }

      const userId = loginResult.result.data.userId;
      const user = loginResult.result.data.user;

      // 步骤3：更新全局数据
      this.globalData.userId = userId;
      this.globalData.userInfo = user;

      // 步骤4：保存到本地存储
      wx.setStorageSync('currentUser', user);
      wx.setStorageSync('isLoggedIn', true);

      console.log('登录成功:', user);

      wx.showToast({
        title: '登录成功',
        icon: 'success'
      });

      return true;

    } catch (error) {
      console.error('登录失败:', error);
      
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

  // 检查登录状态
  checkLogin() {
    const isLoggedIn = wx.getStorageSync('isLoggedIn');
    const currentUser = wx.getStorageSync('currentUser');
    
    return isLoggedIn && currentUser;
  },

  // 获取当前用户
  getCurrentUser() {
    return wx.getStorageSync('currentUser');
  }
});
