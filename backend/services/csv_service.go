package services

import (
	"bufio"
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
func (s *CSVService) UploadFile(filename string, file io.Reader, protocolType string) (*models.CSVFile, error) {
	// 生成唯一文件名，格式：UUID_PROTOCOL_原始文件名
	id := uuid.New().String()
	ext := filepath.Ext(filename)
	baseName := strings.TrimSuffix(filename, ext)
	newFilename := id + "_" + protocolType + "_" + baseName + ext
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
		ProtocolType: protocolType,
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

	// 使用bufio.Scanner逐行读取，对每行独立解析CSV
	// 这样格式错误的行不会影响后续有效行的解析
	scanner := bufio.NewScanner(file)
	// 设置更大的缓冲区以处理较长的行
	const maxScanTokenSize = 1024 * 1024 // 1MB
	buf := make([]byte, maxScanTokenSize)
	scanner.Buffer(buf, maxScanTokenSize)

	var headers []string
	var rows [][]string
	skippedRows := 0
	lineNumber := 0

	if logKey != "" {
		utils.FileLogInfo(logKey, "开始逐行读取CSV数据（增强容错模式）...")
	}

	// 逐行读取，每行独立解析
	for scanner.Scan() {
		lineNumber++
		line := scanner.Text()

		// 跳过空行
		if strings.TrimSpace(line) == "" {
			if logKey != "" {
				utils.FileLogDebug(logKey, "第 %d 行为空行，已跳过", lineNumber)
			}
			skippedRows++
			continue
		}

		// 对每一行独立创建CSV reader进行解析
		lineReader := csv.NewReader(strings.NewReader(line))
		lineReader.FieldsPerRecord = -1 // 允许不同数量的字段
		lineReader.LazyQuotes = true    // 更宽松的引号处理

		record, err := lineReader.Read()
		if err != nil {
			// 跳过格式错误的行，但不影响后续行
			if logKey != "" {
				utils.FileLogWarn(logKey, "第 %d 行解析错误，已跳过: %v (内容: %.100s...)", lineNumber, err, line)
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

	// 检查Scanner错误
	if err := scanner.Err(); err != nil {
		if logKey != "" {
			utils.FileLogError(logKey, "读取文件时发生错误: %v", err)
		}
	}

	if logKey != "" {
		utils.FileLogInfo(logKey, "CSV读取完成: 总行数=%d, 有效数据行=%d, 跳过行数=%d", lineNumber, len(rows), skippedRows)
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

		// 解析文件名: UUID_PROTOCOL_原始文件名.csv 或 UUID_原始文件名.csv（旧格式）
		originalName := entry.Name()
		protocolType := "" // 默认空，表示旧格式文件

		// 按 "_" 分割文件名
		parts := strings.SplitN(entry.Name(), "_", 3)
		if len(parts) >= 3 {
			// 新格式：UUID_PROTOCOL_原始文件名.csv
			protocolType = parts[1]
			originalName = parts[2]
		} else if len(parts) == 2 {
			// 旧格式：UUID_原始文件名.csv
			originalName = parts[1]
		} else {
			// 未知格式
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
			ProtocolType: protocolType,
		}

		files = append(files, file)
	}

	// 按上传时间降序排序，最近上传的文件显示在最上面
	sort.Slice(files, func(i, j int) bool {
		return files[i].UploadTime.After(files[j].UploadTime)
	})

	return files, nil
}

// DeleteFile 删除文件及其缓存
func (s *CSVService) DeleteFile(filename string) error {
	filePath := filepath.Join(s.uploadDir, filename)

	// 删除所有相关的缓存文件
	s.DeleteCacheForFile(filename)

	return os.Remove(filePath)
}

// getCacheDir 获取缓存目录路径
func (s *CSVService) getCacheDir() string {
	return filepath.Join(s.uploadDir, "cache")
}

// getCachePath 获取指定文件和协议的缓存路径
func (s *CSVService) getCachePath(filename, protocol string) string {
	// 使用文件名（不含扩展名）+ 协议作为缓存文件名
	baseName := strings.TrimSuffix(filename, filepath.Ext(filename))
	return filepath.Join(s.getCacheDir(), baseName+"_"+protocol+".cache.json")
}

// GetCachedResult 检查并读取缓存的解析结果
func (s *CSVService) GetCachedResult(filename, protocol string) (*models.CSVData, bool) {
	cachePath := s.getCachePath(filename, protocol)

	// 检查缓存文件是否存在
	if _, err := os.Stat(cachePath); os.IsNotExist(err) {
		return nil, false
	}

	// 读取缓存文件
	data, err := os.ReadFile(cachePath)
	if err != nil {
		utils.Warn("读取缓存文件失败: %v", err)
		return nil, false
	}

	// 解析JSON
	var csvData models.CSVData
	if err := json.Unmarshal(data, &csvData); err != nil {
		utils.Warn("解析缓存数据失败: %v", err)
		return nil, false
	}

	utils.Info("成功读取缓存: %s", cachePath)
	return &csvData, true
}

// SaveCacheResult 保存解析结果到缓存
func (s *CSVService) SaveCacheResult(filename, protocol string, data *models.CSVData) error {
	cacheDir := s.getCacheDir()

	// 确保缓存目录存在
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return fmt.Errorf("创建缓存目录失败: %v", err)
	}

	cachePath := s.getCachePath(filename, protocol)

	// 序列化为JSON
	jsonData, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("序列化缓存数据失败: %v", err)
	}

	// 写入文件
	if err := os.WriteFile(cachePath, jsonData, 0644); err != nil {
		return fmt.Errorf("写入缓存文件失败: %v", err)
	}

	utils.Info("成功保存缓存: %s", cachePath)
	return nil
}

// DeleteCacheForFile 删除指定文件的所有缓存
func (s *CSVService) DeleteCacheForFile(filename string) {
	cacheDir := s.getCacheDir()
	baseName := strings.TrimSuffix(filename, filepath.Ext(filename))

	// 删除所有协议的缓存
	protocols := []string{"CAN", "CANOPEN", "COMMON"}
	for _, protocol := range protocols {
		cachePath := filepath.Join(cacheDir, baseName+"_"+protocol+".cache.json")
		if err := os.Remove(cachePath); err == nil {
			utils.Info("已删除缓存文件: %s", cachePath)
		}
	}
}

// validateCSV 验证CSV文件格式，跳过格式错误的行
func (s *CSVService) validateCSV(filePath string) (rowCount, columnCount int, err error) {
	file, err := os.Open(filePath)
	if err != nil {
		return 0, 0, err
	}
	defer file.Close()

	// 使用bufio.Scanner逐行读取，对每行独立解析CSV
	scanner := bufio.NewScanner(file)
	const maxScanTokenSize = 1024 * 1024 // 1MB
	buf := make([]byte, maxScanTokenSize)
	scanner.Buffer(buf, maxScanTokenSize)

	var validRecords [][]string
	skippedRows := 0
	lineNumber := 0

	// 逐行读取，每行独立解析
	for scanner.Scan() {
		lineNumber++
		line := scanner.Text()

		// 跳过空行
		if strings.TrimSpace(line) == "" {
			skippedRows++
			continue
		}

		// 对每一行独立创建CSV reader进行解析
		lineReader := csv.NewReader(strings.NewReader(line))
		lineReader.FieldsPerRecord = -1 // 允许不同数量的字段
		lineReader.LazyQuotes = true    // 更宽松的引号处理

		record, err := lineReader.Read()
		if err != nil {
			// 跳过格式错误的行，不返回错误
			utils.Warn("Skipping line %d during validation: %v", lineNumber, err)
			skippedRows++
			continue
		}
		validRecords = append(validRecords, record)
	}

	// 检查Scanner错误
	if err := scanner.Err(); err != nil {
		utils.Warn("Error reading file during validation: %v", err)
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

// ColumnPattern 表示列的正则匹配模式
type ColumnPattern struct {
	Name        string `json:"name"`
	Pattern     string `json:"pattern"`
	Description string `json:"description"`
}

// ColumnConfig 列配置
type ColumnConfig struct {
	Name        string          `json:"name"`
	Index       int             `json:"index"`
	Required    bool            `json:"required"`
	MatchType   string          `json:"matchType"` // exact, regex, contains, any
	ValidValues []string        `json:"validValues,omitempty"`
	Pattern     string          `json:"pattern,omitempty"`
	Patterns    []ColumnPattern `json:"patterns,omitempty"`
	Description string          `json:"description"`
}

// RowFilterConfig 行过滤配置
type RowFilterConfig struct {
	Columns        []ColumnConfig `json:"columns"`
	MinColumnCount int            `json:"minColumnCount"`
}

// loadRowFilterConfig 加载行过滤配置
func (s *CSVService) loadRowFilterConfig() (*RowFilterConfig, error) {
	configPath := filepath.Join("..", "backend", "config", "can", "row_filter.json")
	file, err := os.ReadFile(configPath)
	if err != nil {
		// 配置文件不存在时使用默认配置
		return &RowFilterConfig{
			MinColumnCount: 6,
			Columns: []ColumnConfig{
				{Name: "Type", Index: 0, Required: true, MatchType: "exact", ValidValues: []string{"publish", "receive", "receive_request"}},
				{Name: "Source", Index: 1, Required: false, MatchType: "any"},
				{Name: "Target", Index: 2, Required: false, MatchType: "any"},
				{Name: "Name", Index: 3, Required: false, MatchType: "any"},
				{Name: "Time", Index: 4, Required: true, MatchType: "regex", Pattern: `^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}`},
				{Name: "Buffer", Index: 5, Required: true, MatchType: "regex", Patterns: []ColumnPattern{
					{Name: "CAN_MESSAGE", Pattern: `^string=[0-9a-fA-F]{1,4}:\d{1,2}:\[[0-9a-fA-F ]*\]`},
					{Name: "USHORT_VALUE", Pattern: `^string=ushort=\d+`},
					{Name: "STRUCT_VALUE", Pattern: `^\{.*\}$`},
				}},
			},
		}, nil
	}

	var config RowFilterConfig
	if err := json.Unmarshal(file, &config); err != nil {
		return nil, fmt.Errorf("解析row_filter.json失败: %v", err)
	}

	return &config, nil
}

// isValidRow 根据配置检查行是否有效
func (s *CSVService) isValidRow(row []string, config *RowFilterConfig, headers []string, logKey string, rowIdx int) bool {
	// 检查列数
	if len(row) < config.MinColumnCount {
		if logKey != "" {
			utils.FileLogDebug(logKey, "第 %d 行列数不足（期望至少 %d 列，实际 %d 列），已过滤", rowIdx+1, config.MinColumnCount, len(row))
		}
		return false
	}

	// 遍历每个配置的列进行验证
	for _, col := range config.Columns {
		// 跳过不需要验证的列
		if !col.Required {
			continue
		}

		// 检查索引是否有效
		if col.Index < 0 || col.Index >= len(row) {
			if logKey != "" {
				utils.FileLogDebug(logKey, "第 %d 行 %s 列索引无效（索引=%d，行长度=%d），已过滤", rowIdx+1, col.Name, col.Index, len(row))
			}
			return false
		}

		value := row[col.Index]

		// 根据匹配类型进行验证
		switch col.MatchType {
		case "exact":
			// 精确匹配（不区分大小写）
			isValid := false
			valueLower := strings.ToLower(strings.TrimSpace(value))
			for _, validValue := range col.ValidValues {
				if valueLower == strings.ToLower(validValue) {
					isValid = true
					break
				}
			}
			if !isValid {
				if logKey != "" {
					utils.FileLogDebug(logKey, "第 %d 行 %s 列值无效（值='%s'，有效值=%v），已过滤", rowIdx+1, col.Name, value, col.ValidValues)
				}
				return false
			}

		case "regex":
			isValid := false
			// 如果有多个patterns，匹配任一即可
			if len(col.Patterns) > 0 {
				for _, p := range col.Patterns {
					re, err := regexp.Compile(p.Pattern)
					if err != nil {
						continue
					}
					if re.MatchString(value) {
						isValid = true
						break
					}
				}
			} else if col.Pattern != "" {
				// 单个pattern
				re, err := regexp.Compile(col.Pattern)
				if err == nil && re.MatchString(value) {
					isValid = true
				}
			} else {
				// 没有配置pattern，视为有效
				isValid = true
			}
			if !isValid {
				if logKey != "" {
					utils.FileLogDebug(logKey, "第 %d 行 %s 列格式无效（值='%s'），已过滤", rowIdx+1, col.Name, value)
				}
				return false
			}

		case "contains":
			// 包含匹配
			isValid := false
			valueLower := strings.ToLower(value)
			for _, validValue := range col.ValidValues {
				if strings.Contains(valueLower, strings.ToLower(validValue)) {
					isValid = true
					break
				}
			}
			if !isValid {
				if logKey != "" {
					utils.FileLogDebug(logKey, "第 %d 行 %s 列不包含有效值（值='%s'，需包含=%v），已过滤", rowIdx+1, col.Name, value, col.ValidValues)
				}
				return false
			}

		case "any":
			// 不做限制
			continue
		}
	}

	return true
}

// CANDefinition 表示一个CAN消息定义
type CANDefinition struct {
	Hex         string `json:"hex"`
	Dec         string `json:"dec"`
	Description string `json:"description"`
}

// loadCANDefinitions 加载CAN ID定义
func (s *CSVService) loadCANDefinitions() (map[string]string, error) {
	configPath := filepath.Join("..", "backend", "config", "can", "definitions.json")
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

	// 加载行过滤配置
	filterConfig, err := s.loadRowFilterConfig()
	if err != nil {
		if logKey != "" {
			utils.FileLogWarn(logKey, "加载行过滤配置失败: %v，将使用默认配置", err)
		}
	} else if logKey != "" {
		utils.FileLogInfo(logKey, "成功加载行过滤配置: 共 %d 列规则, minColumnCount=%d", len(filterConfig.Columns), filterConfig.MinColumnCount)
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
		// 使用配置驱动的行过滤
		if !s.isValidRow(row, filterConfig, headers, logKey, rowIdx) {
			filteredCount++
			continue
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
