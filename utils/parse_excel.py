import openpyxl
import json
import os

def parse_excel_to_json(excel_file_path, output_json_path):
    """
    解析Excel文件并转换为JSON格式
    Excel文件格式要求：
    - 第一列：题目类型（单选/多选）
    - 第二列：题目内容
    - 第三列：选项A
    - 第四列：选项B
    - 第五列：选项C
    - 第六列：选项D
    - 第七列：正确答案（多个答案用逗号分隔）
    """
    try:
        # 加载Excel文件
        wb = openpyxl.load_workbook(excel_file_path)
        sheet = wb.active
        
        questions = []
        question_id = 1
        
        # 遍历Excel行（从第二行开始，第一行是标题）
        for row in sheet.iter_rows(min_row=2, values_only=True):
            if not row[0]:  # 如果第一列为空，跳过该行
                continue
            
            question_type = row[0]
            question_content = row[1]
            option_a = row[2]
            option_b = row[3]
            option_c = row[4]
            option_d = row[5]
            correct_answers = row[6]
            
            # 构建选项列表
            options = []
            if option_a:
                options.append({"id": "A", "content": option_a})
            if option_b:
                options.append({"id": "B", "content": option_b})
            if option_c:
                options.append({"id": "C", "content": option_c})
            if option_d:
                options.append({"id": "D", "content": option_d})
            
            # 处理题目内容中的图片路径
            # 假设题目内容中的图片用类似"[图片1]"的格式标记
            # 需要将其替换为实际的图片路径
            # 这里暂时保持原样，由前端处理图片显示
            
            # 处理正确答案
            correct_answers_list = []
            if correct_answers:
                correct_answers_list = [ans.strip() for ans in str(correct_answers).split(',')]
            
            # 构建题目对象
            question = {
                "id": question_id,
                "type": "single" if "单选" in question_type else "multiple",
                "content": question_content,
                "options": options,
                "correctAnswers": correct_answers_list
            }
            
            questions.append(question)
            question_id += 1
        
        # 保存为JSON文件
        with open(output_json_path, 'w', encoding='utf-8') as f:
            json.dump(questions, f, ensure_ascii=False, indent=2)
        
        print(f"成功解析Excel文件：{excel_file_path}")
        print(f"生成JSON文件：{output_json_path}")
        print(f"共解析 {len(questions)} 道题目")
        
        return questions
    except Exception as e:
        print(f"解析Excel文件时出错：{e}")
        return []

def parse_all_chapters(excel_folder_path, output_folder_path):
    """
    解析所有章节的Excel文件
    """
    # 确保输出文件夹存在
    if not os.path.exists(output_folder_path):
        os.makedirs(output_folder_path)
    
    # 遍历所有章节文件夹
    for chapter_folder in os.listdir(excel_folder_path):
        chapter_path = os.path.join(excel_folder_path, chapter_folder)
        
        if os.path.isdir(chapter_path):
            # 查找Excel文件
            excel_files = [f for f in os.listdir(chapter_path) if f.endswith('.xlsx')]
            
            if excel_files:
                excel_file = excel_files[0]  # 取第一个Excel文件
                excel_file_path = os.path.join(chapter_path, excel_file)
                
                # 提取章节号
                chapter_num = chapter_folder.replace('第', '').replace('章', '')
                
                # 生成JSON文件名
                output_json_file = f"chapter{chapter_num}.json"
                output_json_path = os.path.join(output_folder_path, output_json_file)
                
                # 解析Excel文件
                parse_excel_to_json(excel_file_path, output_json_path)

if __name__ == "__main__":
    # 示例用法
    excel_folder = "CISSP题库"
    output_folder = "CISSP题库JSON"
    parse_all_chapters(excel_folder, output_folder)
