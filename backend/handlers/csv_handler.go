package handlers

import (
	"csv-parser/models"
	"csv-parser/services"
	"csv-parser/utils"
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
	utils.Info("开始处理文件上传请求")

	// 获取协议类型参数
	protocolType := c.DefaultPostForm("protocolType", "CAN")
	if protocolType != "CAN" && protocolType != "CANOPEN" && protocolType != "COMMON" {
		protocolType = "CAN" // 默认使用CAN协议
	}
	utils.Info("协议类型: %s", protocolType)

	// 获取上传的文件
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		utils.Error("获取上传文件失败: %v", err)
		c.JSON(http.StatusBadRequest, models.UploadResponse{
			Success: false,
			Message: "Failed to get uploaded file: " + err.Error(),
		})
		return
	}
	defer file.Close()

	// 验证文件类型
	filename := header.Filename
	utils.Info("正在上传文件: %s", filename)
	ext := strings.ToLower(filepath.Ext(filename))
	if ext != ".csv" {
		utils.Warn("文件类型不允许: %s", ext)
		c.JSON(http.StatusBadRequest, models.UploadResponse{
			Success: false,
			Message: "Only CSV files are allowed",
		})
		return
	}

	// 上传文件（带协议类型）
	csvFile, err := h.csvService.UploadFile(filename, file, protocolType)
	if err != nil {
		utils.Error("上传文件失败: %v", err)
		c.JSON(http.StatusInternalServerError, models.UploadResponse{
			Success: false,
			Message: "Failed to upload file: " + err.Error(),
		})
		return
	}

	utils.Info("文件上传成功: %s, 协议类型: %s", filename, protocolType)
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
	utils.Info("开始解析文件: %s, 协议: %s", filename, protocol)

	// 验证文件名
	if filename == "" {
		utils.Warn("解析请求缺少文件名")
		c.JSON(http.StatusBadRequest, models.ParseResponse{
			Success: false,
			Message: "Filename is required",
		})
		return
	}

	// 验证协议
	if protocol != "CAN" && protocol != "CANOPEN" && protocol != "COMMON" {
		c.JSON(http.StatusBadRequest, models.ParseResponse{
			Success: false,
			Message: "Invalid protocol. Must be 'CAN', 'CANOPEN' or 'COMMON'",
		})
		return
	}

	// 1. 先检查缓存
	if cachedData, hasCached := h.csvService.GetCachedResult(filename, protocol); hasCached {
		utils.Info("从缓存读取解析结果: %s, 协议: %s", filename, protocol)
		c.JSON(http.StatusOK, models.ParseResponse{
			Success: true,
			Message: "File loaded from cache",
			Data:    cachedData,
			Cached:  true,
		})
		return
	}

	// 2. 无缓存，创建以CSV文件名命名的日志文件
	protocolType := utils.GetProtocolType(protocol)
	logKey, err := utils.CreateFileLogger(filename, protocolType)
	if err != nil {
		utils.Warn("创建日志文件失败: %v，将继续解析但不记录详细日志", err)
		logKey = ""
	}
	defer func() {
		if logKey != "" {
			utils.CloseFileLogger(logKey)
		}
	}()

	// 3. 检查是否是合并文件（支持新格式 m_ 和旧格式 merged_）
	var data *models.CSVData
	if strings.HasPrefix(filename, "m_") || strings.HasPrefix(filename, "merged_") {
		// 使用合并文件解析逻辑
		utils.Info("Detected merged file, using merge parsing: %s", filename)
		data, err = h.csvService.ParseMergedFiles(filename, protocol, logKey)
	} else {
		// 常规单文件解析
		data, err = h.csvService.ParseFileWithLog(filename, protocol, logKey)
	}

	if err != nil {
		if logKey != "" {
			utils.FileLogError(logKey, "解析文件失败: %v", err)
		}
		utils.Error("解析文件失败 %s: %v", filename, err)
		c.JSON(http.StatusInternalServerError, models.ParseResponse{
			Success: false,
			Message: "Failed to parse file: " + err.Error(),
		})
		return
	}

	// 4. 保存解析结果到缓存
	if err := h.csvService.SaveCacheResult(filename, protocol, data); err != nil {
		utils.Warn("保存缓存失败: %v", err)
	}

	if logKey != "" {
		utils.FileLogInfo(logKey, "文件解析完成，返回 %d 条数据", data.Total)
	}
	utils.Info("文件解析成功: %s, 协议: %s", filename, protocol)
	c.JSON(http.StatusOK, models.ParseResponse{
		Success: true,
		Message: "File parsed successfully with " + protocol + " protocol",
		Data:    data,
		Cached:  false,
	})
}

// GetFiles 获取文件列表
func (h *CSVHandler) GetFiles(c *gin.Context) {
	utils.Debug("获取文件列表请求")
	files, err := h.csvService.GetFiles()
	if err != nil {
		utils.Error("获取文件列表失败: %v", err)
		c.JSON(http.StatusInternalServerError, models.FileListResponse{
			Success: false,
			Message: "Failed to get files: " + err.Error(),
		})
		return
	}

	utils.Debug("成功获取文件列表, 共 %d 个文件", len(files))
	c.JSON(http.StatusOK, models.FileListResponse{
		Success: true,
		Message: "Files retrieved successfully",
		Files:   files,
	})
}

// DeleteFile 删除文件
func (h *CSVHandler) DeleteFile(c *gin.Context) {
	filename := c.Param("filename")
	utils.Info("请求删除文件: %s", filename)

	if filename == "" {
		utils.Warn("删除请求缺少文件名")
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Filename is required",
		})
		return
	}

	err := h.csvService.DeleteFile(filename)
	if err != nil {
		utils.Error("删除文件失败 %s: %v", filename, err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to delete file: " + err.Error(),
		})
		return
	}

	utils.Info("文件删除成功: %s", filename)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "File deleted successfully",
	})
}

// UploadMultipleFiles 处理多文件上传
func (h *CSVHandler) UploadMultipleFiles(c *gin.Context) {
	utils.Info("开始处理多文件上传请求")

	// 获取协议类型参数
	protocolType := c.DefaultPostForm("protocolType", "CAN")
	if protocolType != "CAN" && protocolType != "CANOPEN" {
		utils.Warn("多文件上传不支持协议类型: %s", protocolType)
		c.JSON(http.StatusBadRequest, models.MultiFileUploadResponse{
			Success: false,
			Message: "Multi-file upload only supports CAN and CANOPEN protocols",
		})
		return
	}
	utils.Info("协议类型: %s", protocolType)

	// 获取所有上传的文件
	form, err := c.MultipartForm()
	if err != nil {
		utils.Error("获取上传表单失败: %v", err)
		c.JSON(http.StatusBadRequest, models.MultiFileUploadResponse{
			Success: false,
			Message: "Failed to get uploaded files: " + err.Error(),
		})
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		utils.Warn("未找到上传的文件")
		c.JSON(http.StatusBadRequest, models.MultiFileUploadResponse{
			Success: false,
			Message: "No files uploaded",
		})
		return
	}

	utils.Info("共收到 %d 个文件", len(files))

	// 验证所有文件类型
	for _, fileHeader := range files {
		ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
		if ext != ".csv" {
			utils.Warn("文件类型不允许: %s", fileHeader.Filename)
			c.JSON(http.StatusBadRequest, models.MultiFileUploadResponse{
				Success: false,
				Message: "Only CSV files are allowed: " + fileHeader.Filename,
			})
			return
		}
	}

	// 调用服务层上传和合并处理
	mergedFile, sourceFiles, err := h.csvService.UploadMultipleFiles(files, protocolType)
	if err != nil {
		utils.Error("上传多文件失败: %v", err)
		c.JSON(http.StatusInternalServerError, models.MultiFileUploadResponse{
			Success: false,
			Message: "Failed to upload files: " + err.Error(),
		})
		return
	}

	utils.Info("多文件上传成功: 合并文件=%s, 源文件数=%d", mergedFile.Filename, len(sourceFiles))
	c.JSON(http.StatusOK, models.MultiFileUploadResponse{
		Success:     true,
		Message:     "Files uploaded successfully",
		MergedFile:  mergedFile,
		SourceFiles: sourceFiles,
		SourceCount: len(sourceFiles),
	})
}

// CleanupOrphanedFiles 清理所有孤立的文件和缓存
func (h *CSVHandler) CleanupOrphanedFiles(c *gin.Context) {
	utils.Info("Starting cleanup of orphaned files")

	count, err := h.csvService.CleanupAllOrphanedFiles()
	if err != nil {
		utils.Error("Cleanup failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Cleanup failed: " + err.Error(),
		})
		return
	}

	utils.Info("Cleanup completed, deleted %d files", count)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Cleanup completed",
		"deleted": count,
	})
}
