# CSV解析工具

一个基于Web的CSV文件解析工具，支持多种协议解析、文件上传、数据预览和管理功能。支持CAN协议（FIXED格式）和CANOPEN协议（Mobiled格式）的CSV数据解析。

## 技术栈

- **后端**：Go语言 + Gin框架
- **前端**：HTML + CSS + JavaScript + Bootstrap 5
- **架构**：前后端分离，JSON配置驱动

## 项目结构

```
protocol-tool/
├── 📁 backend/                            # Go后端服务
│   ├── 📄 main.go                         # 主程序入口、路由配置
│   ├── 📄 go.mod / go.sum                 # Go模块依赖
│   ├── 📁 handlers/                       # HTTP请求处理器
│   │   └── 📄 csv_handler.go              # CSV文件上传/解析/删除API
│   ├── 📁 models/                         # 数据模型定义
│   │   └── 📄 csv.go                      # CSV数据结构与响应模型
│   ├── 📁 services/                       # 业务逻辑层
│   │   └── 📄 csv_service.go              # 文件处理、协议解析服务
│   ├── 📁 utils/                          # 工具函数
│   │   └── � logger.go                   # 日志处理
│   └── �📁 config/                         # 协议配置目录（可扩展）
│       ├── 📁 can/                        # CAN协议配置
│       │   ├── 📄 definitions.json        # CAN ID定义与消息含义
│       │   ├── 📄 from_to_mapping.json    # From->To列映射规则
│       │   ├── 📄 name_definitions.json   # Name字段到Id描述映射
│       │   ├── 📄 row_highlight.json      # 行高亮颜色配置
│       │   ├── 📄 data_parser.json        # 详细数据解析规则
│       │   └── 📄 row_filter.json         # CSV行过滤配置
│       ├── 📁 canopen/                    # CANOPEN协议配置
│       └── 📁 common/                     # 公共配置
│
├── 📁 frontend/                           # 前端静态文件
│   ├── 📄 index.html                      # 主页面（文件上传/管理）
│   ├── 📁 css/                            # 样式文件
│   ├── 📁 js/                             # JavaScript脚本（公共）
│   ├── 📁 config/                         # 前端配置 (table_style_config.json)
│   ├── 📁 fonts/                          # 字体资源
│   ├── 📁 common/                         # 公共组件
│   └── 📁 protocols/                      # 协议特定页面
│       ├── 📁 can/                        # CAN协议模块
│       └── 📁 canopen/                    # CANOPEN协议模块
│
├── � uploads/                            # 上传文件存储目录
├── 📁 log/                                # 运行日志目录
├── 📁 bin/                                # 辅助工具脚本
├── 📁 build/                              # 编译输出目录
│   └── 📄 csv-parser.exe                  # 编译后的服务器可执行文件
├── 📄 start.bat                           # Windows启动脚本
├── 📄 start.sh                            # Linux/Mac启动脚本
├── 📄 test_can_messages.csv               # 测试数据文件
├── 📄 sniffer.csv                         # 嗅探数据文件
└── 📄 README.md                           # 项目说明文档
```

## 功能特性

### 🚀 核心功能
- **多协议解析**：支持CAN协议（FIXED格式）和CANOPEN协议（Mobiled格式）
- **文件上传**：支持拖拽和点击上传CSV文件
- **智能解析**：根据选择的协议自动处理数据格式
- **自动解析**：上传文件后立即触发解析，无需额外点击
- **高速缓存**：解析结果持久化缓存，重复打开秒级加载
- **数据预览**：表格形式展示解析结果，支持大数据量
- **文件管理**：查看、删除已上传的文件
- **分页历史**：历史记录支持分页（每页50条）
- **协议标签**：历史列表显示每个文件的协议类型

### 🎨 数据展示增强
- **CAN ID含义显示**：自动识别CAN消息ID并显示对应含义
- **From->To映射**：根据Name字段自动填充消息方向
- **Id描述映射**：Name字段自动映射为可读的Id描述
- **行高亮**：根据消息类型自动高亮显示（如RTB信号等）
- **智能行过滤**：可配置的CSV行过滤（基于正则/精确匹配）
- **深度数据解析**：支持Bitfield、枚举值、单位换算等复杂规则
- **高性能处理**：多线程并行解析，大幅提升大数据量处理速度
- **表格样式配置**：可自定义表格外观（列宽、颜色等）

### 💡 用户体验
- **响应式界面**：适配不同屏幕尺寸
- **实时反馈**：上传进度、解析状态、错误提示
- **菜单导航**：File（导出）、Graphs（图表）、Help（帮助）
- **侧边栏**：可拖动调整大小的CAN消息列表
- **滑动面板**：配置与历史记录双面板切换

## 快速开始

### 方法一：使用启动脚本（推荐）

**Windows用户：**
```bash
# 双击运行或在命令行执行
start.bat
```

**Linux/Mac用户：**
```bash
./start.sh
```

### 方法二：手动启动

1. 安装Go语言环境（Go 1.21+）
   - 下载地址：https://golang.org/dl/

2. 启动后端服务：
   ```bash
   cd backend
   go mod tidy    # 下载依赖
   go run main.go # 启动服务
   ```

3. 打开浏览器访问：http://localhost:8080

## API接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/upload` | 上传CSV文件 |
| GET | `/api/files` | 获取已上传文件列表 |
| GET | `/api/parse/:filename?protocol=CAN` | CAN协议解析 |
| GET | `/api/parse/:filename?protocol=CANOPEN` | CANOPEN协议解析 |
| DELETE | `/api/file/:filename` | 删除指定文件 |

## 配置系统

项目采用JSON配置驱动，无需修改代码即可自定义行为：

### 后端配置 (`backend/config/`)

| 配置文件 | 说明 |
|----------|------|
| `definitions.json` | CAN消息ID与含义定义 |
| `from_to_mapping.json` | Name字段到From->To方向的映射规则 |
| `name_definitions.json` | Name字段到Id描述的映射 |
| `row_highlight.json` | 行高亮规则（颜色、匹配条件） |
| `data_parser.json` | 详细数据解析规则（位偏移、枚举等） |
| `row_filter.json` | CSV行过滤与验证配置 |

### 前端配置 (`frontend/config/`)

| 配置文件 | 说明 |
|----------|------|
| `table_style_config.json` | 表格列宽、样式等外观配置 |

## 扩展新协议

项目采用模块化设计，添加新协议只需：

1. **后端**：在 `backend/config/` 下创建新协议目录，添加配置文件
2. **前端**：在 `frontend/protocols/` 下创建新协议目录，添加页面和脚本
3. **路由**：在 `backend/main.go` 中注册新协议的路由

## 故障排除

### 常见问题

| 问题 | 解决方案 |
|------|----------|
| 端口被占用 | 修改 `main.go` 中的端口号，或关闭占用8080端口的程序 |
| Go未安装 | 安装Go 1.21+，确保添加到PATH环境变量 |
| 文件上传失败 | 检查 `uploads/` 目录权限 |

### 调试命令

```bash
# 查看端口占用
netstat -ano | findstr :8080

# 强制关闭进程
taskkill /PID [进程ID] /F

# 检查Go环境
go version
```

## 开发说明

### 技术架构
```
用户上传CSV → 前端验证 → 后端接收存储 → 选择协议解析 → 加载配置规则 → 返回增强数据 → 前端渲染展示
```

### 开发环境
- Go 1.21+
- 现代浏览器（Chrome、Firefox、Edge）
- 文本编辑器或IDE

### 更新日志
- **v1.0.0**：基础CSV解析功能
- **v1.1.0**：添加CAN/CANOPEN协议支持
- **v1.2.0**：优化用户体验，修复文件名显示问题
- **v1.3.0**：添加配置驱动的数据展示增强功能
- **v1.4.0**：新增自动解析、缓存系统、行过滤及复杂数据解析支持
- **v1.5.0**：简化预览页导航栏、添加历史记录分页、滑动面板切换、协议标签显示
