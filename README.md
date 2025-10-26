# CSV解析工具

一个基于Web的CSV文件解析工具，支持多种协议解析、文件上传、数据预览和管理功能。支持CAN协议（FIXED格式）和CANOPEN协议（Mobiled格式）的CSV数据解析。

## 技术栈

- 后端：Go语言 + Gin框架
- 前端：HTML + CSS + JavaScript
- 架构：前后端分离

## 项目结构

```
protocol-tool/
├── backend/                 # Go后端服务
│   ├── main.go             # 主程序入口
│   ├── handlers/           # 请求处理器
│   ├── models/             # 数据模型
│   ├── services/           # 业务逻辑
│   └── go.mod              # Go模块文件
├── frontend/               # 前端静态文件
│   ├── index.html          # 主页面
│   ├── style.css           # 样式文件
│   └── script.js           # JavaScript文件
├── uploads/                # 上传文件存储目录
└── README.md               # 项目说明
```

## 功能特性

### 🚀 核心功能
- **多协议解析**：支持CAN协议（FIXED格式）和CANOPEN协议（Mobiled格式）
- **文件上传**：支持拖拽和点击上传CSV文件
- **智能解析**：根据选择的协议自动处理数据格式
- **数据预览**：表格形式展示解析结果，支持大数据量（显示前100行）
- **文件管理**：查看、删除已上传的文件

### 🎯 协议支持
- **CAN协议（FIXED）**：添加协议类型、消息ID、数据长度等字段
- **CANOPEN协议（Mobiled）**：添加协议类型、节点ID、对象索引、子索引等字段

### 💡 用户体验
- **响应式界面**：适配不同屏幕尺寸
- **实时反馈**：上传进度、解析状态、错误提示
- **文件验证**：自动验证CSV格式
- **原始文件名显示**：保持用户友好的文件名显示

## 快速开始

### 方法一：使用启动脚本（推荐）

**Windows用户：**
```bash
# 双击运行或在命令行执行
start.bat
```

**Linux/Mac用户：**
```bash
# 在终端执行
./start.sh
```

### 方法二：手动启动

1. 安装Go语言环境（如果未安装）
   - 下载地址：https://golang.org/dl/
   - 安装后确保Go在PATH环境变量中

2. 启动后端服务：
   ```bash
   cd backend
   go mod tidy    # 下载依赖
   go run main.go # 启动服务
   ```

3. 打开浏览器访问：http://localhost:8080

## 使用指南

### 📁 文件上传
1. **选择协议**：在上传区域选择CAN或CANOPEN协议
2. **上传文件**：拖拽CSV文件到上传区域或点击"选择文件"按钮
3. **自动验证**：系统自动验证文件格式，只接受.csv文件
4. **文件存储**：文件以UUID_原始文件名.csv格式存储，避免冲突

### 🔧 协议解析
- **CAN协议解析**：
  - 添加"协议类型"列（显示"CAN"）
  - 添加"消息ID"列（基于数据长度的十六进制ID）
  - 添加"数据长度"列（每行字段数量）
  
- **CANOPEN协议解析**：
  - 添加"协议类型"列（显示"CANOPEN"）
  - 添加"节点ID"列（Node_1, Node_2, ...）
  - 添加"对象索引"列（0x0000, 0x0064, ...）
  - 添加"子索引"列（0x00）

### 📊 数据预览
- **表格展示**：以表格形式显示解析后的数据
- **协议信息**：显示当前使用的解析协议
- **数据统计**：显示总行数、列数等统计信息
- **性能优化**：大数据量时只显示前100行，提高性能

### 🗂️ 文件管理
- **文件列表**：显示所有已上传的文件
- **原始文件名**：保持用户友好的文件名显示
- **文件信息**：显示文件大小、行数、列数、上传时间
- **操作按钮**：每个文件都有CAN解析、CANOPEN解析、删除按钮

## API接口

### 📡 RESTful API
- `POST /api/upload` - 上传CSV文件
- `GET /api/files` - 获取已上传文件列表
- `GET /api/parse/:filename?protocol=CAN` - 使用CAN协议解析指定CSV文件
- `GET /api/parse/:filename?protocol=CANOPEN` - 使用CANOPEN协议解析指定CSV文件
- `DELETE /api/file/:filename` - 删除指定文件

### 🔧 协议参数
- `protocol=CAN` - 使用CAN协议（FIXED格式）解析
- `protocol=CANOPEN` - 使用CANOPEN协议（Mobiled格式）解析
- 默认协议：CAN

## 技术架构

### 🏗️ 系统架构
- **前端**：HTML5 + CSS3 + JavaScript（原生）
- **后端**：Go 1.21+ + Gin Web框架
- **数据存储**：本地文件系统
- **通信**：RESTful API + JSON

### 📁 项目结构
```
protocol-tool/
├── backend/                    # Go后端服务
│   ├── main.go                # 主程序入口
│   ├── handlers/              # HTTP请求处理器
│   │   └── csv_handler.go     # CSV相关API处理
│   ├── models/                # 数据模型定义
│   │   └── csv.go             # CSV数据模型
│   ├── services/              # 业务逻辑层
│   │   └── csv_service.go     # CSV处理服务
│   ├── go.mod                 # Go模块依赖
│   └── csv-parser.exe         # 编译后的可执行文件
├── frontend/                  # 前端静态文件
│   ├── index.html             # 主页面
│   ├── style.css              # 样式文件
│   └── script.js              # JavaScript逻辑
├── uploads/                   # 上传文件存储目录（运行时创建）
├── sample_data.csv            # 示例测试数据
├── start.bat                  # Windows启动脚本
├── start.sh                   # Linux/Mac启动脚本
├── .gitignore                 # Git忽略文件
└── README.md                  # 项目说明文档
```

## 测试数据

项目包含一个示例CSV文件 `sample_data.csv`，包含以下测试数据：
- 姓名、年龄、城市、职业、薪资等字段
- 可用于测试CAN和CANOPEN协议解析功能

## 故障排除

### 🚨 常见问题

1. **端口被占用**：
   - 错误：`bind: address already in use`
   - 解决：修改 `backend/main.go` 中的端口号，或关闭占用8080端口的程序

2. **Go未安装**：
   - 错误：`'go' is not recognized`
   - 解决：安装Go 1.21+，确保添加到PATH环境变量

3. **文件上传失败**：
   - 错误：文件上传后无法解析
   - 解决：检查uploads目录权限，确保程序有写入权限

4. **程序无法启动**：
   - 检查是否有其他程序占用8080端口
   - 确保Go环境正确安装
   - 检查防火墙设置

### 🔧 调试方法

1. **查看端口占用**：
   ```bash
   netstat -ano | findstr :8080
   ```

2. **强制关闭进程**：
   ```bash
   taskkill /PID [进程ID] /F
   ```

3. **检查Go环境**：
   ```bash
   go version
   ```

## 开发说明

### 🛠️ 开发环境
- Go 1.21+
- 现代浏览器（Chrome、Firefox、Edge等）
- 文本编辑器或IDE

### 📝 代码结构
- **前端**：纯原生JavaScript，无框架依赖
- **后端**：Go + Gin框架，RESTful API设计
- **数据流**：前端 → API → 后端服务 → 文件系统

### 🔄 更新日志
- v1.0.0：基础CSV解析功能
- v1.1.0：添加CAN/CANOPEN协议支持
- v1.2.0：优化用户体验，修复文件名显示问题
