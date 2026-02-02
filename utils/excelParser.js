// Excel解析工具类
// 使用云函数解析Excel文件

// 从云存储下载Excel文件并通过云函数解析
async function parseExcelFromStorage(filePath) {
  try {
    console.log('开始解析Excel文件:', filePath);
    
    // 调用云函数解析Excel（使用纯解析模式）
    const result = await wx.cloud.callFunction({
      name: 'parseExcelQuestions',
      data: {
        fileId: filePath,
        parseOnly: true // 纯解析模式，不导入数据库
      }
    });
    
    console.log('云函数调用结果:', result.result);
    
    if (!result.result || !result.result.success) {
      return {
        success: false,
        message: result.result?.message || '云函数调用失败',
        error: result.result?.error
      };
    }
    
    const parseResult = result.result;
    
    return {
      success: true,
      data: parseResult.data.questions || [],
      sheetName: parseResult.sheetName || 'Sheet1',
      rowCount: parseResult.data.valid || 0
    };
    
  } catch (error) {
    console.error('解析Excel文件失败:', error);
    return {
      success: false,
      message: error.message,
      error: error
    };
  }
}

// 解析题目数据（格式化）
// 注意：云函数已经返回了格式化的题目数据，此函数用于验证和二次处理
function parseQuestions(jsonData) {
  if (!jsonData || jsonData.length === 0) {
    return {
      success: false,
      message: '没有数据'
    };
  }
  
  // 验证数据格式
  const firstRow = jsonData[0];
  
  // 如果是已经格式化的数据（来自云函数）
  if (firstRow.questionContent && firstRow.options && firstRow.answer) {
    console.log('数据已格式化，直接返回');
    return {
      success: true,
      data: jsonData,
      count: jsonData.length
    };
  }
  
  // 如果是原始Excel数据，需要格式化
  const requiredFields = ['题目', 'A', 'B', 'C', 'D', '答案', '解析'];
  const missingFields = requiredFields.filter(field => !(field in firstRow));
  
  if (missingFields.length > 0) {
    return {
      success: false,
      message: `数据格式不正确，缺少必要列：${missingFields.join(', ')}`
    };
  }
  
  // 格式化题目数据
  const questions = [];
  let questionOrder = 1;
  
  for (let row of jsonData) {
    // 跳过空行
    if (!row['题目']) {
      continue;
    }
    
    // 验证答案格式
    const answerKey = row['答案'];
    if (!['A', 'B', 'C', 'D'].includes(answerKey)) {
      console.warn(`第${questionOrder}题答案格式不正确，跳过:`, row);
      continue;
    }
    
    const question = {
      questionId: `q${questionOrder}`,
      questionContent: row['题目'],
      options: [
        { key: 'A', value: row['A'] || '' },
        { key: 'B', value: row['B'] || '' },
        { key: 'C', value: row['C'] || '' },
        { key: 'D', value: row['D'] || '' }
      ],
      answer: answerKey,
      explanation: row['解析'] || '',
      imageUrl: row['图片'] || '',
      questionOrder: questionOrder
    };
    
    questions.push(question);
    questionOrder++;
  }
  
  return {
    success: true,
    data: questions,
    count: questions.length
  };
}

// 获取章节题目数量
async function getChapterQuestionCount(chapterPath) {
  try {
    const excelPath = `${chapterPath}/chapter${chapterPath.match(/\d+/)[0]}.xlsx`;
    const result = await parseExcelFromStorage(excelPath);
    
    if (result.success) {
      return {
        success: true,
        count: result.rowCount
      };
    } else {
      return result;
    }
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

// 导出工具函数
module.exports = {
  parseExcelFromStorage,
  parseQuestions,
  getChapterQuestionCount
};
