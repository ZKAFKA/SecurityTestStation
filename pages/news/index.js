import { fetchNewsData } from '../../services/news/index';

Page({
  /**
   * 页面的初始数据
   */
  data: {
    newsList:[],
  },

  async onLoad() {
    await this.getNewsList();
  },

  // 获取最新动态
  async getNewsList(){
    try {
      wx.showLoading({
        title: '加载中...'
      });
      const newsList = await fetchNewsData();
      this.setData({newsList});
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

  // 处理二维码长按事件
  handleQrCodeLongPress(e) {
    const src = e.currentTarget.dataset.src;
    
    // 显示操作菜单
    wx.showActionSheet({
      itemList: ['扫描二维码', '预览图片', '保存图片'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            // 扫描二维码
            this.scanQrCode();
            break;
          case 1:
            // 预览图片
            wx.previewImage({
              urls: [src],
              current: src
            });
            break;
          case 2:
            // 保存图片
            this.saveQrCode(src);
            break;
        }
      },
      fail: (res) => {
        console.log('用户取消操作', res);
      }
    });
  },

  // 扫描二维码
  scanQrCode() {
    wx.showLoading({
      title: '正在扫描...'
    });
    
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: (res) => {
        wx.hideLoading();
        this.handleScanResult(res);
      },
      fail: (error) => {
        wx.hideLoading();
        console.error('扫描失败:', error);
        
        if (error.errMsg.includes('cancel')) {
          // 用户取消扫描
          return;
        }
        
        wx.showModal({
          title: '扫描失败',
          content: '无法识别二维码，请尝试调整距离或光线后重试',
          showCancel: false,
          confirmText: '确定'
        });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  // 处理扫描结果
  handleScanResult(res) {
    const result = res.result;
    console.log('扫描结果:', result);
    
    if (result.startsWith('http://') || result.startsWith('https://')) {
      // 扫描结果是链接，跳转到webview
      wx.navigateTo({
        url: `/pages/webview/webview?url=${encodeURIComponent(result)}`
      });
    } else {
      // 扫描结果不是链接，显示结果
      wx.showModal({
        title: '扫描成功',
        content: result,
        showCancel: false,
        confirmText: '确定'
      });
    }
  },

  // 保存二维码图片
  saveQrCode(src) {
    wx.showLoading({
      title: '保存中...'
    });
    
    wx.getImageInfo({
      src: src,
      success: (res) => {
        wx.saveImageToPhotosAlbum({
          filePath: res.path,
          success: () => {
            wx.hideLoading();
            wx.showToast({
              title: '保存成功',
              icon: 'success',
              duration: 2000
            });
          },
          fail: (error) => {
            wx.hideLoading();
            console.error('保存失败:', error);
            
            if (error.errMsg.includes('auth')) {
              wx.showModal({
                title: '需要权限',
                content: '保存图片需要相册权限，请在设置中开启',
                success: (res) => {
                  if (res.confirm) {
                    wx.openSetting();
                  }
                }
              });
            } else {
              wx.showToast({
                title: '保存失败，请重试',
                icon: 'error',
                duration: 2000
              });
            }
          }
        });
      },
      fail: (error) => {
        wx.hideLoading();
        console.error('获取图片信息失败:', error);
        wx.showToast({
          title: '保存失败，请重试',
          icon: 'error',
          duration: 2000
        });
      }
    });
  },
})