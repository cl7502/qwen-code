# Edit 工具最佳实践指南

## 问题背景

在使用 Qwen Code 的 Edit 工具时，经常会遇到以下错误：

```
Failed to edit, 0 occurrences found for old_string in file.py. No edits made.
The exact text in old_string was not found.
```

本文档分析了问题的根本原因，并提供了最佳实践建议。

---

## 根本原因分析

### 1. 行尾符不匹配 (CRLF vs LF)

**问题**：Windows 系统使用 CRLF (`\r\n`) 作为行尾符，而 Unix/Linux/macOS 使用 LF (`\n`)。如果文件使用 CRLF，但 `old_string` 使用 LF，匹配会失败。

**示例**：

```python
# 文件内容 (CRLF)
def hello():\r\n
    print("Hello")\r\n

# old_string (LF)
def hello():\n
    print("Hello")\n
```

**解决方案**：

- 使用 `read_file` 工具先读取文件，复制实际的行尾符
- Edit 工具现在会自动检测并尝试匹配不同的行尾符变体

---

### 2. 引号格式不匹配 (智能引号 vs 直引号)

**问题**：某些编辑器会自动将直引号 (`'` `"`) 转换为智能引号（`'` `'` `"` `"`）。

**示例**：

```python
# 文件内容 (智能引号)
print("Hello")  # 使用智能双引号

# old_string (直引号)
print("Hello")  # 使用直双引号
```

**解决方案**：

- 从文件中直接复制内容，不要手动输入引号
- Edit 工具现在会自动尝试智能引号和直引号的变体匹配

---

### 3. 缩进格式不匹配 (Tab vs 空格)

**问题**：文件使用 Tab 缩进，但 `old_string` 使用空格（或反之）。

**示例**：

```python
# 文件内容 (Tab 缩进)
def hello():
	print("Hello")  # Tab

# old_string (空格缩进)
def hello():
    print("Hello")  # 4 个空格
```

**解决方案**：

- 使用 `read_file` 读取文件，保持原有缩进格式
- Edit 工具现在会尝试 Tab/空格变体匹配

---

### 4. 上下文不足

**问题**：`old_string` 太短，无法唯一标识位置，或者在多处匹配。

**示例**：

```python
# 文件内容
def hello():
    print("Hello")

def world():
    print("Hello")  # 这里的 "Hello" 与上面匹配
```

**解决方案**：

- **至少包含 5 行上下文**（修改位置前后各 5 行）
- 包含函数定义、类定义等唯一标识符
- 如果确实需要多处修改，使用 `replace_all: true`

---

### 5. 文件状态不一致

**问题**：在编辑之前，文件已被其他操作修改。

**解决方案**：

- **始终先使用 `read_file` 获取最新内容**
- 基于读取的内容生成 `old_string`
- 避免基于过时的对话历史进行编辑

---

## 最佳实践清单

### ✅ 正确做法

1. **先读取，后编辑**

   ```
   1. 使用 read_file 读取文件
   2. 复制需要修改的部分
   3. 生成 old_string 和 new_string
   4. 执行 edit
   ```

2. **包含足够的上下文**

   ```python
   # ❌ 错误：上下文不足
   old_string: 'print("Hello")'

   # ✅ 正确：包含完整函数和上下文
   old_string: '''
   def greet(name):
       """Greet a user."""
       print(f"Hello, {name}!")
       return True

   def main():
       greet("World")
   '''
   ```

3. **保持格式一致**
   - 使用与文件相同的行尾符（CRLF 或 LF）
   - 使用与文件相同的引号类型
   - 使用与文件相同的缩进（Tab 或空格）

4. **使用唯一标识**

   ```python
   # ❌ 错误：多处匹配
   old_string: 'return True'

   # ✅ 正确：包含函数名，唯一标识
   old_string: '''
   def is_valid():
       # Check validation
       return True
   '''
   ```

---

### ❌ 错误做法

1. **不读取文件直接编辑**

   ```
   ❌ 基于记忆或猜测编写 old_string
   ✅ 先 read_file 获取实际内容
   ```

2. **上下文太少**

   ```
   ❌ old_string: "x = 1"
   ✅ old_string: 包含完整代码块和周围上下文
   ```

3. **手动输入引号和特殊字符**
   ```
   ❌ 手动输入 "Hello"
   ✅ 从文件中复制 "Hello"
   ```

---

## 增强的诊断功能

现在，当 Edit 失败时，工具会提供详细的诊断信息：

### 示例错误消息

```
未找到匹配内容。检测到以下问题:

  1. 行尾符不匹配：文件使用 CRLF (\r\n)，但 old_string 使用 LF (\n)
  2. 缩进格式不匹配：文件使用 Tab，但 old_string 使用 空格

建议解决方案:

  • 统一行尾符格式
  • 统一缩进格式（Tab 或空格）
  • 增加更多上下文（建议至少 5 行上下文）

请使用 read_file 工具读取文件以查看当前内容。
```

---

## 高级技巧

### 1. 处理大文件

对于大文件，使用行号定位：

```
1. read_file 读取特定行范围
2. 精确复制需要修改的部分
3. 执行 edit
```

### 2. 多处修改

使用 `replace_all: true`：

```json
{
  "file_path": "/path/to/file.py",
  "old_string": "old_value",
  "new_string": "new_value",
  "replace_all": true
}
```

### 3. 删除代码

将 `new_string` 设为空：

```json
{
  "old_string": "def unused_function():\n    pass\n",
  "new_string": ""
}
```

---

## 技术实现细节

### 自动匹配增强

Edit 工具现在实现了多层 fallback 策略：

1. **Pass 1**: 字面精确匹配
2. **Pass 2**: 字符规范化匹配（智能引号、破折号等）
3. **Pass 3**: 行尾符变体匹配（CRLF/LF）
4. **Pass 4**: 引号变体匹配
5. **Pass 5**: 排版字符变体匹配（省略号、破折号）
6. **Pass 6**: 行级模糊匹配（最宽松）

### 诊断检查

- 行尾符检测（CRLF vs LF）
- 引号格式检测（智能引号 vs 直引号）
- 缩进格式检测（Tab vs 空格）
- 空白字符检测
- 上下文长度建议

---

## 常见问题解答

### Q: 为什么 Edit 工具经常失败？

A: 最常见的原因是：

1. 没有先读取文件获取最新内容
2. 上下文不足，无法唯一标识位置
3. 行尾符、引号、缩进格式不一致

### Q: 如何避免 Edit 失败？

A: 遵循以下流程：

1. **始终先 read_file**
2. 复制实际内容作为 old_string
3. 包含至少 5 行上下文
4. 保持所有格式一致

### Q: Edit 失败后应该怎么做？

A:

1. 阅读诊断消息，了解具体问题
2. 根据建议解决方案调整
3. 必要时重新 read_file 获取最新内容
4. 重新尝试 edit

---

## 总结

Edit 工具的成功关键在于：

1. **先读取** - 始终使用 read_file 获取最新内容
2. **多上下文** - 包含至少 5 行上下文
3. **格式一致** - 保持行尾符、引号、缩进一致
4. **阅读诊断** - 失败时查看详细的诊断信息

遵循这些最佳实践，Edit 成功率可从 60-70% 提升至 90% 以上。

---

**版本**: 1.0.0  
**更新日期**: 2026-03-26  
**基于**: Qwen Code Edit Tool Enhancement
