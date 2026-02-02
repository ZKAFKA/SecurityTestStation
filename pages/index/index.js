import { fetchIndexData } from '../../services/index/index';
import { fetchNewsData } from '../../services/news/index';

Page({
  data: {
    showUploadTip:false,
    bannerList:[],
    productAbilityList:[],
    applicationScene:[],
    newsList:[],
    partnersList:[]
  },
  async onLoad() {
    await this.getBannerList();
    await this.getRequestList();
  },
  // 从云存储获取轮播图列表
  async getBannerList() {
    try {
      
      // 调用云函数获取轮播图列表
      const result = await wx.cloud.callFunction({
        name: 'getBannerList',
        data: {
          folderPath: '/轮播图'
        }
      });
      
      const bannerList = result.result || [];
      
      console.log('从云存储获取轮播图成功，共', bannerList.length, '张图片');
      
      this.setData({
        bannerList: bannerList
      });
      
      wx.hideLoading();
      
    } catch (error) {
      console.error('从云存储获取轮播图失败:', error);
      wx.hideLoading();
      // 如果云函数调用失败，使用原来的轮播图数据
      wx.showToast({
        title: '轮播图加载失败',
        icon: 'none'
      });
    }
  },
  // 首页数据请求
  async getRequestList(){
    try {
      wx.showTabBar();
      wx.showLoading({
        title: '加载中',
      })

      // 从数据库获取题库数据
      const questionBankResult = await wx.cloud.callFunction({
        name: 'getQuestionBanks',
        data: {}
      });

      let applicationScene = [];
      if (questionBankResult.result && questionBankResult.result.success) {
        const questionBanks = questionBankResult.result.data;
        // 转换数据库数据格式为页面所需格式
        applicationScene = questionBanks.map(bank => ({
          _id: bank._id,
          title: bank.name,
          sub_title: bank.description,
          description: '',
          time: new Date().toISOString().replace('T', ' ').substring(0, 19),
          path: bank.path
        }));
      } else {
        // 如果数据库没有数据，使用默认数据
        applicationScene = [
          {
            "sub_title": "官方题库",
            "_id": "default_cissp",
            "title": "CISSP",
            "description": "",
            "time": new Date().toISOString().replace('T', ' ').substring(0, 19),
            "path": "/CISSP"
          },
          {
            "sub_title": "官方题库",
            "_id": "default_cisp",
            "title": "CISP",
            "description": "",
            "time": new Date().toISOString().replace('T', ' ').substring(0, 19),
            "path": "/CISP"
          }
        ];
      }

      const res2 = await fetchNewsData({pageSize:3});

      this.setData({
        showUploadTip: true,
        applicationScene: applicationScene,
        newsList: res2
      });
    } catch (error) {
      wx.showToast({
        title: error?.message || '页面请求失败，请刷新页面',
        icon: 'error',
        duration: 2000
      })   
    } finally {
      wx.hideLoading();  
    }   
  },
  // 跳转最新动态列表页面
  onGoNews(){
    wx.navigateTo({
      url: '/pages/news/index'
    })
  },
  // 跳转到题库章节页面
  async goQuiz(event) {
    // 检查登录状态
    const app = getApp();
    if (!app.checkLogin()) {
      wx.showModal({
        title: '需要登录',
        content: '刷题功能需要登录后使用，是否现在登录？',
        confirmText: '登录',
        cancelText: '取消',
        success: async (res) => {
          if (res.confirm) {
            const success = await app.login();
            if (success) {
              // 登录成功后重新执行跳转
              this.goQuiz(event);
            }
          }
        }
      });
      return;
    }
    
    const id = event.currentTarget.dataset.id;
    const title = event.currentTarget.dataset.title;
    const path = event.currentTarget.dataset.path;
    
    if (id) {
      try {
        wx.showLoading({
          title: '检查题库...',
          mask: true
        });
        
        // 从数据库检查question_bank中的path字段
        const result = await wx.cloud.callFunction({
          name: 'getQuestionBank',
          data: {
            bankId: id
          }
        });
        
        wx.hideLoading();
        
        if (result.result && result.result.success) {
          const questionBank = result.result.data;
          const dbPath = questionBank.path;
          
          // 检查path是否为null或空
          if (!dbPath || dbPath === '') {
            // path为null，显示提示
            wx.showModal({
              title: '提示',
              content: '题库更新中，敬请期待',
              showCancel: false
            });
          } else {
            // path不为null，跳转到章节页面
            wx.navigateTo({
              url: `/pages/chapter/chapter?id=${id}&name=${title}&path=${encodeURIComponent(dbPath)}`
            });
          }
        } else {
          // 获取题库信息失败，显示提示
          wx.showModal({
            title: '提示',
            content: '题库更新中，敬请期待',
            showCancel: false
          });
        }
      } catch (error) {
        console.error('检查题库失败:', error);
        wx.hideLoading();
        
        // 如果云函数调用失败，显示提示
        wx.showModal({
          title: '提示',
          content: '题库更新中，敬请期待',
          showCancel: false
        });
      }
    }
  }
});
