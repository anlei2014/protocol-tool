# 项目结构图

```
protocol-tool/
├── 📁 backend/                    # Go后端服务
│   ├── 📄 main.go                 # 主程序入口
│   ├── 📄 go.mod                  # Go模块依赖
│   ├── 📁 handlers/               # HTTP请求处理器
│   │   └── 📄 csv_handler.go      # CSV相关API处理
│   ├── 📁 models/                 # 数据模型定义
│   │   └── 📄 csv.go              # CSV数据模型
│   └── 📁 services/               # 业务逻辑层
│       └── 📄 csv_service.go      # CSV处理服务
├── 📁 frontend/                   # 前端静态文件
│   ├── 📄 index.html              # 主页面
│   ├── 📄 style.css               # 样式文件
│   └── 📄 script.js               # JavaScript逻辑
├── 📁 uploads/                    # 上传文件存储目录（运行时创建）
├── 📄 sample_data.csv             # 示例测试数据
├── 📄 start.bat                   # Windows启动脚本
├── 📄 start.sh                    # Linux/Mac启动脚本
├── 📄 .gitignore                  # Git忽略文件
└── 📄 README.md                   # 项目说明文档
```

## 架构说明

### 后端架构 (Go + Gin)
- **main.go**: 程序入口，配置路由和中间件
- **handlers/**: 处理HTTP请求，参数验证，响应格式化
- **services/**: 核心业务逻辑，文件处理，数据解析
- **models/**: 数据结构定义，API响应模型

### 前端架构 (HTML + CSS + JavaScript)
- **index.html**: 单页面应用，包含所有UI组件
- **style.css**: 响应式样式，现代化UI设计
- **script.js**: 前端逻辑，API调用，文件处理

### 数据流
```
用户上传CSV → 前端验证 → 后端接收 → 文件存储 → 格式验证 → 解析数据 → 返回结果 → 前端展示
```

### API设计
- RESTful风格
- JSON格式响应
- 统一错误处理
- CORS跨域支持
