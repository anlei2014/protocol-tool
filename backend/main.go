package main

import (
	"csv-parser/handlers"
	"csv-parser/services"
	"log"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// 创建上传目录
	if err := os.MkdirAll("../uploads", 0755); err != nil {
		log.Fatal("Failed to create uploads directory:", err)
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

	// API路由
	api := r.Group("/api")
	{
		api.POST("/upload", csvHandler.UploadFile)
		api.GET("/files", csvHandler.GetFiles)
		api.GET("/parse/:filename", csvHandler.ParseFile)
		api.DELETE("/file/:filename", csvHandler.DeleteFile)
	}

	// 根路径重定向到前端
	r.GET("/", func(c *gin.Context) {
		c.Redirect(302, "/static/index.html")
	})

	// 启动服务器
	log.Println("Server starting on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
