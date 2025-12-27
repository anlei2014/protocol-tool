package main

import (
	"csv-parser/handlers"
	"csv-parser/services"
	"csv-parser/utils"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// 初始化日志系统
	if err := utils.InitLogger("../log"); err != nil {
		panic("Failed to initialize logger: " + err.Error())
	}
	defer utils.Close()

	// 创建上传目录
	if err := os.MkdirAll("../uploads", 0755); err != nil {
		utils.Fatal("Failed to create uploads directory: %v", err)
	}

	// 初始化服务
	csvService := services.NewCSVService("../uploads")
	csvHandler := handlers.NewCSVHandler(csvService)

	// 创建Gin路由
	r := gin.Default()

	// 配置CORS
	config := cors.DefaultConfig()
	config.AllowOrigins = []string{"*"}
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Type", "Accept", "Authorization"}
	r.Use(cors.New(config))

	// 静态文件服务
	r.Static("/static", "../frontend")
	r.Static("/uploads", "../uploads")

	// 协议专用配置路由 (后端配置)
	r.Static("/config/can", "../backend/config/can")
	r.Static("/config/canopen", "../backend/config/canopen")
	r.Static("/config/common", "../backend/config/common")

	// 协议专用前端静态资源路由
	r.Static("/protocols/can", "../frontend/protocols/can")
	r.Static("/protocols/canopen", "../frontend/protocols/canopen")

	// API路由
	api := r.Group("/api")
	{
		api.POST("/upload", csvHandler.UploadFile)
		api.POST("/upload-multiple", csvHandler.UploadMultipleFiles) // 多文件上传
		api.GET("/files", csvHandler.GetFiles)
		api.GET("/parse/:filename", csvHandler.ParseFile)
		api.DELETE("/file/:filename", csvHandler.DeleteFile)
		api.POST("/cleanup", csvHandler.CleanupOrphanedFiles) // 清理孤立文件
	}

	// 根路径直接提供前端index.html
	r.GET("/", func(c *gin.Context) {
		c.File("../frontend/index.html")
	})

	// 确保index.html可以直接访问
	r.GET("/index.html", func(c *gin.Context) {
		c.File("../frontend/index.html")
	})

	// 协议专用预览页面路由
	r.GET("/can/preview.html", func(c *gin.Context) {
		c.File("../frontend/protocols/can/preview.html")
	})

	// CAN统计图页面路由
	r.GET("/can/statistics.html", func(c *gin.Context) {
		c.File("../frontend/protocols/can/statistics.html")
	})

	r.GET("/canopen/preview.html", func(c *gin.Context) {
		c.File("../frontend/protocols/canopen/preview.html")
	})

	// 保持旧路由兼容性（重定向到CAN）
	r.GET("/preview.html", func(c *gin.Context) {
		c.Redirect(301, "/can/preview.html"+c.Request.URL.RawQuery)
	})

	// 启动服务器
	utils.Info("Server starting on :8080")
	if err := r.Run(":8080"); err != nil {
		utils.Fatal("Failed to start server: %v", err)
	}
}
