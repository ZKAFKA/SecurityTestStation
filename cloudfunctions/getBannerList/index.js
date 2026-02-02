// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    const { folderPath } = event
    
    console.log('从云存储获取图片列表，文件夹路径:', folderPath)
    
    // 从云存储获取文件夹下的所有文件
    // 由于云函数中没有直接获取文件列表的方法，我们需要使用数据库来存储文件信息
    const db = cloud.database()
    const result = await db.collection('bannerFiles').where({
      folderPath: folderPath
    }).get()
    
    const fileList = result.data || []
    
    console.log('获取到文件列表，共', fileList.length, '个文件')
    
    // 获取图片的临时URL
    const bannerList = []
    for (let file of fileList) {
      const tempResult = await cloud.getTempFileURL({
        fileList: [file.fileID]
      })
      if (tempResult.fileList && tempResult.fileList.length > 0) {
        bannerList.push(tempResult.fileList[0].tempFileURL)
      }
    }
    
    console.log('从云存储获取轮播图成功，共', bannerList.length, '张图片')
    
    return bannerList
    
  } catch (error) {
    console.error('从云存储获取轮播图失败:', error)
    
    return []
  }
}
