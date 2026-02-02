Component({

  /**
   * 组件的属性列表
   */
  properties: {
    number:{
      type: Number,
      value:0
    },
    title:{
      type:String,
      value:""
    },
    description:{
      type:String,
      value:""
    },
    time:{
      type:String,
      value:""
    },
    url:{
      type:String,
      value:""
    },
    id:{
      type:String,
      value:""
    }
  },

  /**
   * 组件的初始数据
   */
  data: {

  },

  /**
   * 组件的方法列表
   */
  methods: {
    goDetail(event) {
      const url = event.currentTarget.dataset.url;
      if (url) {
        // 使用webview页面在小程序内打开公众号文章
        wx.navigateTo({
          url: `/pages/webview/webview?url=${encodeURIComponent(url)}`
        });
      }
    }
  }
})
