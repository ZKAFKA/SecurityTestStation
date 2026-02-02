// components/imageViewer/index.js
Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    imageUrl: {
      type: String,
      value: ''
    }
  },
  
  data: {
    scale: 1.0,
    loading: false,
    error: false,
    lastTapTime: 0,
    touchStartDistance: 0,
    touchStartScale: 1.0
  },
  
  observers: {
    'imageUrl': function(newUrl) {
      if (newUrl) {
        this.setData({ loading: true, error: false });
      }
    },
    'visible': function(newVisible) {
      if (!newVisible) {
        this.setData({ scale: 1.0, loading: false, error: false });
      }
    }
  },
  
  methods: {
    close() {
      this.triggerEvent('close');
      this.setData({
        scale: 1.0,
        loading: false,
        error: false
      });
    },
    
    stopPropagation() {
      // 阻止事件冒泡，避免点击图片时触发关闭
    },
    
    onImageLoad() {
      this.setData({ 
        loading: false,
        error: false 
      });
    },
    
    onImageError() {
      this.setData({ 
        loading: false,
        error: true 
      });
    },
    
    retry() {
      this.setData({ 
        loading: true,
        error: false 
      });
      
      // 触发重新加载
      const tempUrl = this.data.imageUrl;
      this.setData({ imageUrl: '' });
      setTimeout(() => {
        this.setData({ imageUrl: tempUrl });
      }, 100);
    },
    
    onTouchStart(e) {
      const touches = e.touches;
      if (touches.length === 2) {
        // 双指缩放
        const touch1 = touches[0];
        const touch2 = touches[1];
        const distance = Math.sqrt(
          Math.pow(touch1.x - touch2.x, 2) + 
          Math.pow(touch1.y - touch2.y, 2)
        );
        
        this.setData({
          touchStartDistance: distance,
          touchStartScale: this.data.scale
        });
      }
    },
    
    onTouchMove(e) {
      const touches = e.touches;
      if (touches.length === 2) {
        // 双指缩放
        const touch1 = touches[0];
        const touch2 = touches[1];
        const distance = Math.sqrt(
          Math.pow(touch1.x - touch2.x, 2) + 
          Math.pow(touch1.y - touch2.y, 2)
        );
        
        const { touchStartDistance, touchStartScale } = this.data;
        
        if (touchStartDistance > 0) {
          const scaleRatio = distance / touchStartDistance;
          let newScale = touchStartScale * scaleRatio;
          
          // 限制缩放范围
          newScale = Math.max(1.0, Math.min(3.0, newScale));
          
          this.setData({ scale: newScale });
        }
      }
    },
    
    onTouchEnd(e) {
      this.setData({
        touchStartDistance: 0,
        touchStartScale: 1.0
      });
    },
    
    onImageTap(e) {
      const currentTime = Date.now();
      const timeDiff = currentTime - this.data.lastTapTime;
      
      if (timeDiff < 300 && timeDiff > 0) {
        // 双击缩放
        const currentScale = this.data.scale;
        let newScale;
        
        if (currentScale < 2.0) {
          newScale = currentScale + 0.5;
        } else if (currentScale < 3.0) {
          newScale = currentScale + 0.3;
        } else {
          newScale = 1.0;
        }
        
        newScale = Math.max(1.0, Math.min(3.0, newScale));
        this.setData({ scale: newScale });
      }
      
      this.setData({ lastTapTime: currentTime });
    }
  }
});