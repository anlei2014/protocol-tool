package handlers

import (
	"csv-parser/models"
	"csv-parser/services"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

type CSVHandler struct {
	csvService *services.CSVService
}

func NewCSVHandler(csvService *services.CSVService) *CSVHandler {
	return &CSVHandler{
		csvService: csvService,
	}
}

// UploadFile 处理文件上传
func (h *CSVHandler) UploadFile(c *gin.Context) {
	// 获取上传的文件
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, models.UploadResponse{
			Success: false,
			Message: "Failed to get uploaded file: " + err.Error(),
		})
		return
	}
	defer file.Close()

	// 验证文件类型
	filename := header.Filename
	ext := strings.ToLower(filepath.Ext(filename))
	if ext != ".csv" {
		c.JSON(http.StatusBadRequest, models.UploadResponse{
			Success: false,
			Message: "Only CSV files are allowed",
		})
		return
	}

	// 上传文件
	csvFile, err := h.csvService.UploadFile(filename, file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.UploadResponse{
			Success: false,
			Message: "Failed to upload file: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.UploadResponse{
		Success: true,
		Message: "File uploaded successfully",
		File:    csvFile,
	})
}

// ParseFile 解析CSV文件
func (h *CSVHandler) ParseFile(c *gin.Context) {
	filename := c.Param("filename")
	protocol := c.DefaultQuery("protocol", "CAN") // 默认使用CAN协议

	// 验证文件名
	if filename == "" {
		c.JSON(http.StatusBadRequest, models.ParseResponse{
			Success: false,
			Message: "Filename is required",
		})
		return
	}

	// 验证协议
	if protocol != "CAN" && protocol != "CANOPEN" {
		c.JSON(http.StatusBadRequest, models.ParseResponse{
			Success: false,
			Message: "Invalid protocol. Must be 'CAN' or 'CANOPEN'",
		})
		return
	}

	// 解析文件
	data, err := h.csvService.ParseFile(filename, protocol)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ParseResponse{
			Success: false,
			Message: "Failed to parse file: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.ParseResponse{
		Success: true,
		Message: "File parsed successfully with " + protocol + " protocol",
		Data:    data,
	})
}

// GetFiles 获取文件列表
func (h *CSVHandler) GetFiles(c *gin.Context) {
	files, err := h.csvService.GetFiles()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.FileListResponse{
			Success: false,
			Message: "Failed to get files: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.FileListResponse{
		Success: true,
		Message: "Files retrieved successfully",
		Files:   files,
	})
}

// DeleteFile 删除文件
func (h *CSVHandler) DeleteFile(c *gin.Context) {
	filename := c.Param("filename")

	if filename == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Filename is required",
		})
		return
	}

	err := h.csvService.DeleteFile(filename)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to delete file: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "File deleted successfully",
	})
}
