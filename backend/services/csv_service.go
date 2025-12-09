package services

import (
	"csv-parser/models"
	"csv-parser/utils"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
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
	return s.ParseFileWithLog(filename, protocol, "")
}

// ParseFileWithLog 解析CSV文件（带日志记录）
func (s *CSVService) ParseFileWithLog(filename string, protocol string, logKey string) (*models.CSVData, error) {
	filePath := filepath.Join(s.uploadDir, filename)

	// 检查文件是否存在
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		if logKey != "" {
			utils.FileLogError(logKey, "文件不存在: %s", filePath)
		}
		return nil, fmt.Errorf("file not found")
	}

	if logKey != "" {
		utils.FileLogInfo(logKey, "开始解析CSV文件: %s", filePath)
	}

	// 打开文件
	file, err := os.Open(filePath)
	if err != nil {
		if logKey != "" {
			utils.FileLogError(logKey, "打开文件失败: %v", err)
		}
		return nil, fmt.Errorf("failed to open file: %v", err)
	}
	defer file.Close()

	// 获取文件大小
	fileInfo, _ := file.Stat()
	if logKey != "" {
		utils.FileLogInfo(logKey, "文件大小: %d 字节", fileInfo.Size())
	}

	// 创建CSV读取器
	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1 // 允许不同行有不同数量的字段

	var headers []string
	var rows [][]string
	skippedRows := 0
	lineNumber := 0

	if logKey != "" {
		utils.FileLogInfo(logKey, "开始逐行读取CSV数据...")
	}

	// 逐行读取，跳过格式错误的行
	for {
		lineNumber++
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			// 跳过格式错误的行
			if logKey != "" {
				utils.FileLogWarn(logKey, "第 %d 行解析错误，已跳过: %v", lineNumber, err)
			}
			skippedRows++
			continue
		}

		// 第一个有效行作为表头
		if len(headers) == 0 {
			headers = record
			if logKey != "" {
				utils.FileLogInfo(logKey, "识别到表头，共 %d 列: %v", len(headers), headers)
			}
		} else {
			rows = append(rows, record)
		}
	}

	if logKey != "" {
		utils.FileLogInfo(logKey, "CSV读取完成: 总行数=%d, 有效数据行=%d, 跳过行数=%d", lineNumber-1, len(rows), skippedRows)
	}

	if len(headers) == 0 {
		if logKey != "" {
			utils.FileLogWarn(logKey, "文件为空或没有有效数据")
		}
		return &models.CSVData{
			Headers: []string{},
			Rows:    [][]string{},
			Total:   0,
		}, nil
	}

	// 根据协议进行特定的数据处理
	if logKey != "" {
		utils.FileLogInfo(logKey, "开始使用 %s 协议处理数据...", protocol)
	}
	processedData := s.processDataByProtocolWithLog(headers, rows, protocol, logKey)

	if logKey != "" {
		utils.FileLogInfo(logKey, "数据处理完成: 输出列数=%d, 输出行数=%d", len(processedData.Headers), len(processedData.Rows))
	}

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

	// 按上传时间降序排序，最近上传的文件显示在最上面
	sort.Slice(files, func(i, j int) bool {
		return files[i].UploadTime.After(files[j].UploadTime)
	})

	return files, nil
}

// DeleteFile 删除文件
func (s *CSVService) DeleteFile(filename string) error {
	filePath := filepath.Join(s.uploadDir, filename)
	return os.Remove(filePath)
}

// validateCSV 验证CSV文件格式，跳过格式错误的行
func (s *CSVService) validateCSV(filePath string) (rowCount, columnCount int, err error) {
	file, err := os.Open(filePath)
	if err != nil {
		return 0, 0, err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1 // 允许不同行有不同数量的字段

	var validRecords [][]string
	skippedRows := 0
	lineNumber := 0

	// 逐行读取，跳过格式错误的行
	for {
		lineNumber++
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			// 跳过格式错误的行，不返回错误
			utils.Warn("Skipping line %d during validation: %v", lineNumber, err)
			skippedRows++
			continue
		}
		validRecords = append(validRecords, record)
	}

	if skippedRows > 0 {
		utils.Info("Validated CSV file, skipped %d invalid rows", skippedRows)
	}

	if len(validRecords) == 0 {
		return 0, 0, nil
	}

	// 计算列数（使用第一行的列数）
	columnCount = len(validRecords[0])
	rowCount = len(validRecords)

	return rowCount, columnCount, nil
}

// processDataByProtocol 根据协议处理数据
func (s *CSVService) processDataByProtocol(headers []string, rows [][]string, protocol string) *models.CSVData {
	return s.processDataByProtocolWithLog(headers, rows, protocol, "")
}

// processDataByProtocolWithLog 根据协议处理数据（带日志）
func (s *CSVService) processDataByProtocolWithLog(headers []string, rows [][]string, protocol string, logKey string) *models.CSVData {
	switch protocol {
	case "CAN":
		return s.processCANDataWithLog(headers, rows, logKey)
	case "CANOPEN":
		return s.processCANOPENDataWithLog(headers, rows, logKey)
	default:
		if logKey != "" {
			utils.FileLogInfo(logKey, "使用默认处理，直接返回原始数据")
		}
		// 默认返回原始数据
		return &models.CSVData{
			Headers: headers,
			Rows:    rows,
		}
	}
}

// CANDefinition 表示一个CAN消息定义
type CANDefinition struct {
	Hex         string `json:"hex"`
	Dec         string `json:"dec"`
	Description string `json:"description"`
}

// loadCANDefinitions 加载CAN ID定义
func (s *CSVService) loadCANDefinitions() (map[string]string, error) {
	configPath := filepath.Join("config", "can_definitions.json")
	file, err := os.ReadFile(configPath)
	if err != nil {
		// 如果配置文件不存在,返回空map
		return make(map[string]string), nil
	}

	// 解析嵌套的JSON对象结构
	var rawDefinitions map[string]CANDefinition
	if err := json.Unmarshal(file, &rawDefinitions); err != nil {
		return nil, fmt.Errorf("解析can_definitions.json失败: %v", err)
	}

	// 转换为 ID -> Description 的映射
	definitions := make(map[string]string)
	for id, def := range rawDefinitions {
		definitions[id] = def.Description
	}

	return definitions, nil
}

// isValidCANMessage 检查Buffer字段是否为有效的消息格式
// 有效格式1: string=ID:Length:[HH HH HH ...] 例如: string=2cf:8:[10 40 ff 37 48 c1 0a 00]
// 有效格式2: string=ushort=X 例如: string=ushort=0
func isValidCANMessage(buffer string) bool {
	// 检查是否以 "string=" 开头
	if !strings.HasPrefix(buffer, "string=") {
		return false
	}

	// CAN消息格式的正则表达式: string=ID:Length:[HH HH HH ...]
	canMsgPattern := regexp.MustCompile(`^string=[0-9a-fA-F]{1,4}:\d{1,2}:\[[0-9a-fA-F ]*\]`)
	if canMsgPattern.MatchString(buffer) {
		return true
	}

	// ushort格式的正则表达式: string=ushort=X
	ushortPattern := regexp.MustCompile(`^string=ushort=\d+`)
	if ushortPattern.MatchString(buffer) {
		return true
	}

	return false
}

// processCANData 处理CAN协议数据（FIXED格式）
func (s *CSVService) processCANData(headers []string, rows [][]string) *models.CSVData {
	return s.processCANDataWithLog(headers, rows, "")
}

// processCANDataWithLog 处理CAN协议数据（带日志）
func (s *CSVService) processCANDataWithLog(headers []string, rows [][]string, logKey string) *models.CSVData {
	if logKey != "" {
		utils.FileLogInfo(logKey, "===== 开始CAN协议数据处理 =====")
	}

	// 加载CAN定义
	canDefinitions, err := s.loadCANDefinitions()
	if err != nil {
		if logKey != "" {
			utils.FileLogWarn(logKey, "加载CAN定义失败: %v，将继续处理但无法匹配消息含义", err)
		}
		canDefinitions = make(map[string]string)
	} else if logKey != "" {
		utils.FileLogInfo(logKey, "成功加载CAN定义，共 %d 条消息定义", len(canDefinitions))
	}

	// CAN协议FIXED格式处理逻辑
	// 为CAN协议添加特定的列,包括Meaning
	canHeaders := append([]string{"协议类型", "消息ID", "数据长度"}, headers...)
	canHeaders = append(canHeaders, "Meaning")

	if logKey != "" {
		utils.FileLogInfo(logKey, "输出表头: %v", canHeaders)
	}

	// 找到Buffer列的索引
	bufferIdx := -1
	for i, h := range headers {
		if strings.ToLower(h) == "buffer" {
			bufferIdx = i
			break
		}
	}

	if logKey != "" {
		if bufferIdx >= 0 {
			utils.FileLogInfo(logKey, "找到Buffer列，索引=%d", bufferIdx)
		} else {
			utils.FileLogWarn(logKey, "未找到Buffer列，无法解析CAN消息ID")
		}
	}

	var canRows [][]string
	filteredCount := 0
	matchedMeanings := make(map[string]int) // 统计匹配到的消息类型

	for rowIdx, row := range rows {
		// 先检查Buffer字段是否为有效的CAN消息格式
		if bufferIdx >= 0 && bufferIdx < len(row) {
			buffer := row[bufferIdx]
			if !isValidCANMessage(buffer) {
				// 跳过不符合CAN消息格式的数据行
				filteredCount++
				if logKey != "" && filteredCount <= 5 {
					utils.FileLogDebug(logKey, "第 %d 行不符合CAN消息格式，已过滤: %s", rowIdx+1, buffer)
				}
				continue
			}
		}

		// 为每行添加CAN协议特定的信息
		canRow := []string{
			"CAN",                                // 协议类型
			"0x" + fmt.Sprintf("%03X", len(row)), // 消息ID（基于数据长度）
			fmt.Sprintf("%d", len(row)),          // 数据长度
		}
		canRow = append(canRow, row...)

		// 尝试从Buffer字段解析ID并查找Meaning
		meaning := ""
		if bufferIdx >= 0 && bufferIdx < len(row) {
			buffer := row[bufferIdx]
			// 解析Buffer: 形如string=2cf:8:[10 40 ff 37 48 c1 0a 00]
			if strings.Contains(buffer, "string=") {
				// 提取ID部分
				parts := strings.Split(buffer, ":")
				if len(parts) >= 1 {
					idPart := strings.TrimPrefix(parts[0], "string=")
					idPart = strings.TrimSpace(idPart)
					// 查找定义
					if def, exists := canDefinitions[strings.ToLower(idPart)]; exists {
						meaning = def
						matchedMeanings[def]++
					}
				}
			}
		}
		canRow = append(canRow, meaning)
		canRows = append(canRows, canRow)
	}

	// 记录统计信息
	if logKey != "" {
		utils.FileLogInfo(logKey, "CAN数据处理完成:")
		utils.FileLogInfo(logKey, "  - 输入行数: %d", len(rows))
		utils.FileLogInfo(logKey, "  - 有效行数: %d", len(canRows))
		utils.FileLogInfo(logKey, "  - 过滤行数: %d", filteredCount)

		if len(matchedMeanings) > 0 {
			utils.FileLogInfo(logKey, "  - 消息类型统计:")
			for meaning, count := range matchedMeanings {
				utils.FileLogInfo(logKey, "      %s: %d 条", meaning, count)
			}
		}

		utils.FileLogInfo(logKey, "===== CAN协议数据处理完成 =====")
	}

	return &models.CSVData{
		Headers: canHeaders,
		Rows:    canRows,
	}
}

// processCANOPENData 处理CANOPEN协议数据（Mobiled格式）
func (s *CSVService) processCANOPENData(headers []string, rows [][]string) *models.CSVData {
	return s.processCANOPENDataWithLog(headers, rows, "")
}

// processCANOPENDataWithLog 处理CANOPEN协议数据（带日志）
func (s *CSVService) processCANOPENDataWithLog(headers []string, rows [][]string, logKey string) *models.CSVData {
	if logKey != "" {
		utils.FileLogInfo(logKey, "===== 开始CANOPEN协议数据处理 =====")
	}

	// CANOPEN协议Mobiled格式处理逻辑
	// 示例：为CANOPEN协议添加特定的列
	canopenHeaders := append([]string{"协议类型", "节点ID", "对象索引", "子索引"}, headers...)

	if logKey != "" {
		utils.FileLogInfo(logKey, "输出表头: %v", canopenHeaders)
	}

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

	if logKey != "" {
		utils.FileLogInfo(logKey, "CANOPEN数据处理完成:")
		utils.FileLogInfo(logKey, "  - 输入行数: %d", len(rows))
		utils.FileLogInfo(logKey, "  - 输出行数: %d", len(canopenRows))
		utils.FileLogInfo(logKey, "===== CANOPEN协议数据处理完成 =====")
	}

	return &models.CSVData{
		Headers: canopenHeaders,
		Rows:    canopenRows,
	}
}
