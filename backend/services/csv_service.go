package services

import (
	"bufio"
	"csv-parser/models"
	"csv-parser/utils"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// 预编译的正则表达式（避免每次调用都重新编译）
var (
	// CAN消息格式: string=ID:Length:[HH HH HH ...]
	canMsgPattern = regexp.MustCompile(`^string=[0-9a-fA-F]{1,4}:\d{1,2}:\[[0-9a-fA-F ]*\]`)
	// ushort格式: string=ushort=X
	ushortPattern = regexp.MustCompile(`^string=ushort=\d+`)
	// 时间格式
	timePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}`)
	// 结构体格式
	structPattern = regexp.MustCompile(`^\{.*\}$`)
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
	// 设置更大的缓冲区以处理较长的行（32G内存服务器可用更大缓冲）
	const maxScanTokenSize = 4 * 1024 * 1024 // 4MB - 增大缓冲区
	buf := make([]byte, 64*1024)             // 初始64KB缓冲
	scanner.Buffer(buf, maxScanTokenSize)

	var headers []string
	// 根据文件大小预估行数，优化内存分配
	estimatedLines := int(fileInfo.Size() / 200) // 假设平均每行200字节
	if estimatedLines < 1000 {
		estimatedLines = 1000
	}
	rows := make([][]string, 0, estimatedLines)
	skippedRows := 0
	lineNumber := 0

	if logKey != "" {
		utils.FileLogInfo(logKey, "开始逐行读取CSV数据（高性能模式，预估 %d 行）...", estimatedLines)
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

	// 收集属于合并组的源文件（需要过滤掉）
	mergedSourceFiles := make(map[string]bool)

	// 首先扫描merged信息目录，获取所有合并文件信息
	mergedInfoDir := s.getMergedInfoDir()
	if mergedEntries, err := os.ReadDir(mergedInfoDir); err == nil {
		for _, entry := range mergedEntries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
				continue
			}

			infoPath := filepath.Join(mergedInfoDir, entry.Name())
			data, err := os.ReadFile(infoPath)
			if err != nil {
				continue
			}

			var info MergedFileInfo
			if err := json.Unmarshal(data, &info); err != nil {
				continue
			}

			// 标记所有源文件
			for _, sourceFile := range info.SourceFiles {
				mergedSourceFiles[sourceFile] = true
			}

			// 计算合并文件的虚拟信息
			var totalSize int64 = 0
			var totalRows int = 0
			var columnCount int = 0
			var latestTime time.Time

			for _, sourceFile := range info.SourceFiles {
				sourcePath := filepath.Join(s.uploadDir, sourceFile)
				if fileInfo, err := os.Stat(sourcePath); err == nil {
					totalSize += fileInfo.Size()
					if fileInfo.ModTime().After(latestTime) {
						latestTime = fileInfo.ModTime()
					}
					if rows, cols, err := s.validateCSV(sourcePath); err == nil {
						totalRows += rows
						if cols > columnCount {
							columnCount = cols
						}
					}
				}
			}

			// 创建合并文件的虚拟记录
			mergedFilename := strings.TrimSuffix(entry.Name(), ".json") + ".csv"
			mergedFile := &models.CSVFile{
				ID:           strings.TrimSuffix(entry.Name(), ".json"),
				Filename:     mergedFilename,
				OriginalName: fmt.Sprintf("合并文件 (%d个)", info.SourceCount),
				Size:         totalSize,
				UploadTime:   latestTime,
				RowCount:     totalRows,
				ColumnCount:  columnCount,
				ProtocolType: info.ProtocolType,
				SourceFiles:  info.OriginalNames, // 原始文件名列表
			}
			files = append(files, mergedFile)
		}
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		filename := entry.Name()

		// 跳过属于合并组的源文件（两种方式检测）
		// 1. 通过合并信息文件中记录的源文件列表
		if mergedSourceFiles[filename] {
			continue
		}
		// 2. 通过文件名中的 _MERGED_ 标记（防止合并信息丢失时源文件仍显示）
		if strings.Contains(filename, "_MERGED_") {
			continue
		}

		// 获取文件信息
		filePath := filepath.Join(s.uploadDir, filename)
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
		originalName := filename
		protocolType := "" // 默认空，表示旧格式文件

		// 按 "_" 分割文件名
		parts := strings.SplitN(filename, "_", 3)
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
			ID:           strings.TrimSuffix(filename, filepath.Ext(filename)),
			Filename:     filename,
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
	// 删除所有相关的缓存文件
	s.DeleteCacheForFile(filename)

	// 检查是否是合并文件
	if strings.HasPrefix(filename, "merged_") {
		// 获取合并文件信息
		info, err := s.GetMergedFileInfo(filename)
		if err == nil {
			// 删除所有源文件
			for _, sourceFile := range info.SourceFiles {
				sourcePath := filepath.Join(s.uploadDir, sourceFile)
				if err := os.Remove(sourcePath); err != nil {
					utils.Warn("删除源文件失败: %s, 错误: %v", sourceFile, err)
				} else {
					utils.Info("已删除源文件: %s", sourceFile)
				}
			}
		}

		// 删除合并文件信息
		baseName := strings.TrimSuffix(filename, filepath.Ext(filename))
		mergedInfoPath := filepath.Join(s.getMergedInfoDir(), baseName+".json")
		if err := os.Remove(mergedInfoPath); err != nil {
			utils.Warn("删除合并文件信息失败: %v", err)
		}

		return nil // 合并文件不是真实文件，无需删除
	}

	// 常规文件删除
	filePath := filepath.Join(s.uploadDir, filename)
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

	// 如果是合并文件，还需要删除关联的源文件信息
	mergedInfoPath := filepath.Join(s.getMergedInfoDir(), baseName+".json")
	if err := os.Remove(mergedInfoPath); err == nil {
		utils.Info("已删除合并文件信息: %s", mergedInfoPath)
	}
}

// getMergedInfoDir 获取合并文件信息目录
func (s *CSVService) getMergedInfoDir() string {
	return filepath.Join(s.uploadDir, "merged")
}

// MergedFileInfo 合并文件的源文件信息
type MergedFileInfo struct {
	SourceFiles   []string `json:"sourceFiles"`   // 上传后的文件名
	OriginalNames []string `json:"originalNames"` // 原始文件名
	ProtocolType  string   `json:"protocolType"`
	MergedAt      string   `json:"mergedAt"`
	SourceCount   int      `json:"sourceCount"`
}

// UploadMultipleFiles 处理多文件上传并创建合并记录
func (s *CSVService) UploadMultipleFiles(files []*multipart.FileHeader, protocolType string) (*models.CSVFile, []string, error) {
	// 生成合并文件的唯一ID
	mergedID := uuid.New().String()
	sourceFiles := make([]string, 0, len(files))
	uploadedFilenames := make([]string, 0, len(files))
	var totalSize int64 = 0
	var totalRows int = 0
	var columnCount int = 0

	// 上传所有源文件
	for _, fileHeader := range files {
		file, err := fileHeader.Open()
		if err != nil {
			// 清理已上传的文件
			for _, fname := range uploadedFilenames {
				os.Remove(filepath.Join(s.uploadDir, fname))
			}
			return nil, nil, fmt.Errorf("failed to open file %s: %v", fileHeader.Filename, err)
		}

		// 为每个源文件生成唯一文件名
		id := uuid.New().String()
		ext := filepath.Ext(fileHeader.Filename)
		baseName := strings.TrimSuffix(fileHeader.Filename, ext)
		// 标记源文件属于哪个合并文件
		newFilename := id + "_" + protocolType + "_MERGED_" + mergedID + "_" + baseName + ext
		filePath := filepath.Join(s.uploadDir, newFilename)

		// 创建目标文件
		dst, err := os.Create(filePath)
		if err != nil {
			file.Close()
			for _, fname := range uploadedFilenames {
				os.Remove(filepath.Join(s.uploadDir, fname))
			}
			return nil, nil, fmt.Errorf("failed to create file %s: %v", fileHeader.Filename, err)
		}

		// 复制文件内容
		size, err := io.Copy(dst, file)
		dst.Close()
		file.Close()

		if err != nil {
			os.Remove(filePath)
			for _, fname := range uploadedFilenames {
				os.Remove(filepath.Join(s.uploadDir, fname))
			}
			return nil, nil, fmt.Errorf("failed to save file %s: %v", fileHeader.Filename, err)
		}

		// 验证CSV格式
		rowCount, colCount, err := s.validateCSV(filePath)
		if err != nil {
			os.Remove(filePath)
			for _, fname := range uploadedFilenames {
				os.Remove(filepath.Join(s.uploadDir, fname))
			}
			return nil, nil, fmt.Errorf("invalid CSV file %s: %v", fileHeader.Filename, err)
		}

		sourceFiles = append(sourceFiles, fileHeader.Filename)
		uploadedFilenames = append(uploadedFilenames, newFilename)
		totalSize += size
		totalRows += rowCount
		if colCount > columnCount {
			columnCount = colCount
		}
	}

	// 创建合并文件信息目录
	mergedInfoDir := s.getMergedInfoDir()
	if err := os.MkdirAll(mergedInfoDir, 0755); err != nil {
		utils.Warn("创建合并文件信息目录失败: %v", err)
	}

	// 保存合并文件信息
	mergedInfo := MergedFileInfo{
		SourceFiles:   uploadedFilenames,
		OriginalNames: sourceFiles, // 原始文件名
		ProtocolType:  protocolType,
		MergedAt:      time.Now().Format(time.RFC3339),
		SourceCount:   len(uploadedFilenames),
	}

	// 合并文件的虚拟文件名
	mergedFilename := "merged_" + mergedID + "_" + protocolType + "_" + fmt.Sprintf("%d", len(files)) + ".csv"

	// 保存合并信息到JSON文件
	mergedInfoPath := filepath.Join(mergedInfoDir, "merged_"+mergedID+"_"+protocolType+"_"+fmt.Sprintf("%d", len(files))+".json")
	infoData, err := json.Marshal(mergedInfo)
	if err == nil {
		os.WriteFile(mergedInfoPath, infoData, 0644)
	}

	// 创建合并文件记录（这是一个虚拟记录，不对应实际的合并文件）
	mergedFile := &models.CSVFile{
		ID:           mergedID,
		Filename:     mergedFilename,
		OriginalName: fmt.Sprintf("合并文件 (%d个)", len(files)),
		Size:         totalSize,
		UploadTime:   time.Now(),
		RowCount:     totalRows,
		ColumnCount:  columnCount,
		ProtocolType: protocolType,
	}

	return mergedFile, sourceFiles, nil
}

// GetMergedFileInfo 获取合并文件的源文件信息
func (s *CSVService) GetMergedFileInfo(mergedFilename string) (*MergedFileInfo, error) {
	baseName := strings.TrimSuffix(mergedFilename, filepath.Ext(mergedFilename))
	mergedInfoPath := filepath.Join(s.getMergedInfoDir(), baseName+".json")

	data, err := os.ReadFile(mergedInfoPath)
	if err != nil {
		return nil, fmt.Errorf("合并文件信息不存在: %v", err)
	}

	var info MergedFileInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return nil, fmt.Errorf("解析合并文件信息失败: %v", err)
	}

	return &info, nil
}

// ParseMergedFiles 解析合并文件（将多个源文件的数据合并）- 并行优化版
func (s *CSVService) ParseMergedFiles(mergedFilename string, protocol string, logKey string) (*models.CSVData, error) {
	// 获取合并文件信息
	info, err := s.GetMergedFileInfo(mergedFilename)
	if err != nil {
		return nil, err
	}

	fileCount := len(info.SourceFiles)
	if logKey != "" {
		utils.FileLogInfo(logKey, "开始并行解析合并文件: %s, 包含 %d 个源文件", mergedFilename, fileCount)
	}

	// 使用并行解析提高性能
	type parseResult struct {
		index   int
		headers []string
		rows    [][]string
		err     error
	}

	results := make(chan parseResult, fileCount)

	// 并行解析所有源文件
	for i, sourceFilename := range info.SourceFiles {
		go func(idx int, filename string) {
			data, err := s.ParseFileWithLog(filename, protocol, "")
			if err != nil {
				results <- parseResult{index: idx, err: err}
				return
			}
			results <- parseResult{index: idx, headers: data.Headers, rows: data.Rows, err: nil}
		}(i, sourceFilename)
	}

	// 收集结果
	parsedResults := make([]parseResult, fileCount)
	for i := 0; i < fileCount; i++ {
		result := <-results
		parsedResults[result.index] = result
	}
	close(results)

	// 合并数据
	var headers []string
	var allRows [][]string

	// 预估总行数以优化内存分配
	estimatedRows := 0
	for _, result := range parsedResults {
		if result.err == nil {
			estimatedRows += len(result.rows)
		}
	}
	allRows = make([][]string, 0, estimatedRows)

	for i, result := range parsedResults {
		if result.err != nil {
			if logKey != "" {
				utils.FileLogWarn(logKey, "解析源文件 %d 失败: %v", i+1, result.err)
			}
			continue
		}

		// 使用第一个成功的文件的headers
		if len(headers) == 0 {
			headers = result.headers
		}

		// 合并所有行
		allRows = append(allRows, result.rows...)

		if logKey != "" {
			utils.FileLogInfo(logKey, "源文件 %d 解析完成，获得 %d 行", i+1, len(result.rows))
		}
	}

	if logKey != "" {
		utils.FileLogInfo(logKey, "合并完成，共 %d 行数据", len(allRows))
	}

	// 按时间列排序 - 使用并行排序优化大数据集
	timeIdx := -1
	for i, h := range headers {
		if strings.ToLower(h) == "time" {
			timeIdx = i
			break
		}
	}

	if timeIdx >= 0 && len(allRows) > 0 {
		if logKey != "" {
			utils.FileLogInfo(logKey, "按Time列排序 %d 行数据...", len(allRows))
		}
		sort.Slice(allRows, func(i, j int) bool {
			if timeIdx < len(allRows[i]) && timeIdx < len(allRows[j]) {
				return allRows[i][timeIdx] < allRows[j][timeIdx]
			}
			return false
		})
	}

	return &models.CSVData{
		Headers: headers,
		Rows:    allRows,
		Total:   len(allRows),
	}, nil
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

	// 使用预编译的正则表达式
	if canMsgPattern.MatchString(buffer) {
		return true
	}

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

	// 并行处理配置 - 针对32G内存服务器优化
	numWorkers := runtime.NumCPU() * 2 // 使用2倍CPU核心数的工作线程
	if numWorkers < 4 {
		numWorkers = 4
	}
	if numWorkers > 32 {
		numWorkers = 32 // 限制最大工作线程数
	}
	rowCount := len(rows)

	// 如果数据量较小，使用较少线程处理
	if rowCount < 500 {
		numWorkers = 1
	} else if rowCount < 5000 {
		numWorkers = runtime.NumCPU()
	}

	if logKey != "" {
		utils.FileLogInfo(logKey, "使用 %d 个并行工作线程处理 %d 行数据", numWorkers, rowCount)
	}

	// 用于存储处理结果的结构
	type processedRow struct {
		index   int
		row     []string
		meaning string
		valid   bool
	}

	// 创建结果通道
	results := make(chan processedRow, rowCount)
	var wg sync.WaitGroup

	// 计算每个worker处理的行数范围
	chunkSize := (rowCount + numWorkers - 1) / numWorkers

	// 启动并行处理
	for w := 0; w < numWorkers; w++ {
		startIdx := w * chunkSize
		endIdx := startIdx + chunkSize
		if endIdx > rowCount {
			endIdx = rowCount
		}
		if startIdx >= rowCount {
			break
		}

		wg.Add(1)
		go func(start, end int) {
			defer wg.Done()
			for rowIdx := start; rowIdx < end; rowIdx++ {
				row := rows[rowIdx]

				// 使用配置驱动的行过滤（注意：日志在并发时可能会乱序，所以禁用）
				if !s.isValidRow(row, filterConfig, headers, "", rowIdx) {
					results <- processedRow{index: rowIdx, valid: false}
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
							}
						}
					}
				}
				canRow = append(canRow, meaning)
				results <- processedRow{index: rowIdx, row: canRow, meaning: meaning, valid: true}
			}
		}(startIdx, endIdx)
	}

	// 等待所有worker完成，然后关闭结果通道
	go func() {
		wg.Wait()
		close(results)
	}()

	// 收集结果并按原始顺序排序
	tempResults := make([]processedRow, 0, rowCount)
	for r := range results {
		tempResults = append(tempResults, r)
	}

	// 按原始索引排序，保持顺序
	sort.Slice(tempResults, func(i, j int) bool {
		return tempResults[i].index < tempResults[j].index
	})

	// 构建最终结果
	var canRows [][]string
	filteredCount := 0
	matchedMeanings := make(map[string]int)

	for _, r := range tempResults {
		if r.valid {
			canRows = append(canRows, r.row)
			if r.meaning != "" {
				matchedMeanings[r.meaning]++
			}
		} else {
			filteredCount++
		}
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
