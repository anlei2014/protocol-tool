package services

import (
	"csv-parser/models"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

type CSVService struct {
	uploadDir string
}

func NewCSVService(uploadDir string) *CSVService {
	return &CSVService{
		uploadDir: uploadDir,
	}
}

// UploadFile 处理文件上传
func (s *CSVService) UploadFile(filename string, file io.Reader) (*models.CSVFile, error) {
	// 生成唯一文件名，格式：UUID_原始文件名
	id := uuid.New().String()
	ext := filepath.Ext(filename)
	baseName := strings.TrimSuffix(filename, ext)
	newFilename := id + "_" + baseName + ext
	filePath := filepath.Join(s.uploadDir, newFilename)

	// 创建目标文件
	dst, err := os.Create(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to create file: %v", err)
	}
	defer dst.Close()

	// 复制文件内容
	size, err := io.Copy(dst, file)
	if err != nil {
		os.Remove(filePath) // 清理失败的文件
		return nil, fmt.Errorf("failed to save file: %v", err)
	}

	// 验证CSV格式
	rowCount, columnCount, err := s.validateCSV(filePath)
	if err != nil {
		os.Remove(filePath) // 清理无效文件
		return nil, fmt.Errorf("invalid CSV file: %v", err)
	}

	// 创建文件记录
	csvFile := &models.CSVFile{
		ID:           id,
		Filename:     newFilename,
		OriginalName: filename,
		Size:         size,
		UploadTime:   time.Now(),
		RowCount:     rowCount,
		ColumnCount:  columnCount,
	}

	return csvFile, nil
}

// ParseFile 解析CSV文件
func (s *CSVService) ParseFile(filename string, protocol string) (*models.CSVData, error) {
	filePath := filepath.Join(s.uploadDir, filename)

	// 检查文件是否存在
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return nil, fmt.Errorf("file not found")
	}

	// 打开文件
	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %v", err)
	}
	defer file.Close()

	// 创建CSV读取器
	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1 // 允许不同行有不同数量的字段

	var headers []string
	var rows [][]string

	// 读取所有记录
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("failed to read CSV: %v", err)
	}

	if len(records) == 0 {
		return &models.CSVData{
			Headers: []string{},
			Rows:    [][]string{},
			Total:   0,
		}, nil
	}

	// 第一行作为表头
	headers = records[0]

	// 其余行作为数据
	if len(records) > 1 {
		rows = records[1:]
	}

	// 根据协议进行特定的数据处理
	processedData := s.processDataByProtocol(headers, rows, protocol)

	return &models.CSVData{
		Headers: processedData.Headers,
		Rows:    processedData.Rows,
		Total:   len(processedData.Rows),
	}, nil
}

// GetFiles 获取已上传的文件列表
func (s *CSVService) GetFiles() ([]*models.CSVFile, error) {
	var files []*models.CSVFile

	// 读取上传目录
	entries, err := os.ReadDir(s.uploadDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read upload directory: %v", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		// 获取文件信息
		filePath := filepath.Join(s.uploadDir, entry.Name())
		info, err := entry.Info()
		if err != nil {
			continue
		}

		// 验证CSV文件
		rowCount, columnCount, err := s.validateCSV(filePath)
		if err != nil {
			continue // 跳过无效文件
		}

		// 提取原始文件名（去掉UUID前缀）
		originalName := entry.Name()
		if idx := strings.Index(entry.Name(), "_"); idx > 0 {
			// 格式：UUID_原始文件名.csv
			originalName = entry.Name()[idx+1:]
		} else {
			// 旧格式：UUID.csv，显示为"未知文件"
			originalName = "未知文件"
		}

		file := &models.CSVFile{
			ID:           strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name())),
			Filename:     entry.Name(),
			OriginalName: originalName,
			Size:         info.Size(),
			UploadTime:   info.ModTime(),
			RowCount:     rowCount,
			ColumnCount:  columnCount,
		}

		files = append(files, file)
	}

	return files, nil
}

// DeleteFile 删除文件
func (s *CSVService) DeleteFile(filename string) error {
	filePath := filepath.Join(s.uploadDir, filename)
	return os.Remove(filePath)
}

// validateCSV 验证CSV文件格式
func (s *CSVService) validateCSV(filePath string) (rowCount, columnCount int, err error) {
	file, err := os.Open(filePath)
	if err != nil {
		return 0, 0, err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1

	records, err := reader.ReadAll()
	if err != nil {
		return 0, 0, err
	}

	if len(records) == 0 {
		return 0, 0, nil
	}

	// 计算列数（使用第一行的列数）
	columnCount = len(records[0])
	rowCount = len(records)

	return rowCount, columnCount, nil
}

// processDataByProtocol 根据协议处理数据
func (s *CSVService) processDataByProtocol(headers []string, rows [][]string, protocol string) *models.CSVData {
	switch protocol {
	case "CAN":
		return s.processCANData(headers, rows)
	case "CANOPEN":
		return s.processCANOPENData(headers, rows)
	default:
		// 默认返回原始数据
		return &models.CSVData{
			Headers: headers,
			Rows:    rows,
		}
	}
}

// processCANData 处理CAN协议数据（FIXED格式）
func (s *CSVService) processCANData(headers []string, rows [][]string) *models.CSVData {
	// CAN协议FIXED格式处理逻辑
	// 这里可以根据具体的CAN协议规范进行数据处理

	// 示例：为CAN协议添加特定的列
	canHeaders := append([]string{"协议类型", "消息ID", "数据长度"}, headers...)

	var canRows [][]string
	for _, row := range rows {
		// 为每行添加CAN协议特定的信息
		canRow := []string{
			"CAN",                                // 协议类型
			"0x" + fmt.Sprintf("%03X", len(row)), // 消息ID（基于数据长度）
			fmt.Sprintf("%d", len(row)),          // 数据长度
		}
		canRow = append(canRow, row...)
		canRows = append(canRows, canRow)
	}

	return &models.CSVData{
		Headers: canHeaders,
		Rows:    canRows,
	}
}

// processCANOPENData 处理CANOPEN协议数据（Mobile格式）
func (s *CSVService) processCANOPENData(headers []string, rows [][]string) *models.CSVData {
	// CANOPEN协议Mobile格式处理逻辑
	// 这里可以根据具体的CANOPEN协议规范进行数据处理

	// 示例：为CANOPEN协议添加特定的列
	canopenHeaders := append([]string{"协议类型", "节点ID", "对象索引", "子索引"}, headers...)

	var canopenRows [][]string
	for i, row := range rows {
		// 为每行添加CANOPEN协议特定的信息
		canopenRow := []string{
			"CANOPEN",                    // 协议类型
			fmt.Sprintf("Node_%d", i+1),  // 节点ID
			fmt.Sprintf("0x%04X", i*100), // 对象索引
			"0x00",                       // 子索引
		}
		canopenRow = append(canopenRow, row...)
		canopenRows = append(canopenRows, canopenRow)
	}

	return &models.CSVData{
		Headers: canopenHeaders,
		Rows:    canopenRows,
	}
}
