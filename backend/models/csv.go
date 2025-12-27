package models

import "time"

// CSVFile 表示一个CSV文件的基本信息
type CSVFile struct {
	ID           string    `json:"id"`
	Filename     string    `json:"filename"`
	OriginalName string    `json:"originalName"`
	Size         int64     `json:"size"`
	UploadTime   time.Time `json:"uploadTime"`
	RowCount     int       `json:"rowCount"`
	ColumnCount  int       `json:"columnCount"`
	ProtocolType string    `json:"protocolType"`          // 协议类型: CAN 或 CANOPEN
	SourceFiles  []string  `json:"sourceFiles,omitempty"` // 合并文件的源文件名列表
}

// CSVData 表示解析后的CSV数据
type CSVData struct {
	Headers []string   `json:"headers"`
	Rows    [][]string `json:"rows"`
	Total   int        `json:"total"`
}

// UploadResponse 上传响应
type UploadResponse struct {
	Success bool     `json:"success"`
	Message string   `json:"message"`
	File    *CSVFile `json:"file,omitempty"`
}

// ParseResponse 解析响应
type ParseResponse struct {
	Success bool     `json:"success"`
	Message string   `json:"message"`
	Data    *CSVData `json:"data,omitempty"`
	Cached  bool     `json:"cached"` // 是否来自缓存
}

// FileListResponse 文件列表响应
type FileListResponse struct {
	Success bool       `json:"success"`
	Message string     `json:"message"`
	Files   []*CSVFile `json:"files,omitempty"`
}

// MultiFileUploadResponse 多文件上传响应
type MultiFileUploadResponse struct {
	Success     bool     `json:"success"`
	Message     string   `json:"message"`
	MergedFile  *CSVFile `json:"mergedFile,omitempty"`
	SourceFiles []string `json:"sourceFiles,omitempty"` // 源文件名列表
	SourceCount int      `json:"sourceCount"`           // 源文件数量
}
