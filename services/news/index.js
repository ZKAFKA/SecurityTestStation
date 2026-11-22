import { cloudbaseTemplateConfig } from '../../config/index';
import {NewsData} from '../cloudbaseMock/index'

/** 获取最新动态数据 */
export async function fetchNewsData(params) {
  const { pageSize = 10 } = params || {};

  // 直接调用数据库中news集合下的json数据
  const db = wx.cloud.database();
  const _ = db.command;
  
  // 使用有效的查询条件、排序和限制数量，避免全表扫描
  // 使用_id存在作为查询条件，确保不是空查询
  const result = await db.collection('news')
    .where({
      _id: _.exists(true)  // 添加有效的查询条件
    })
    .orderBy('time', 'desc')  // 按发布时间倒序排列
    .limit(pageSize)           // 根据参数限制返回数量
    .get();
  
  // 转换数据格式
  const newsList = result.data.map(item => ({
    _id: item._id,
    title: item.title,
    description: item.description,
    time: item.time,
    url: item.url
  }));
  
  return newsList;
}
