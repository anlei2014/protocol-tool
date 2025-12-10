package utils

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// ProtocolType 定义协议类型
type ProtocolType string

const (
	ProtocolCAN     ProtocolType = "can"
	ProtocolCANOPEN ProtocolType = "canopen"
	ProtocolCommon  ProtocolType = "common"
)

// Logger 是单个日志记录器
type Logger struct {
	mu       sync.Mutex
	file     *os.File
	logger   *log.Logger
	logDir   string
	fileName string
}

// LogManager 管理多个协议的日志记录器
type LogManager struct {
	mu              sync.Mutex
	baseDir         string
	commonLogger    *Logger                  // 通用日志记录器
	protocolLoggers map[ProtocolType]*Logger // 协议默认日志记录器
	fileLoggers     map[string]*Logger       // 以文件名为key的日志记录器
}

var (
	logManager *LogManager
	once       sync.Once
)

// InitLogger 初始化日志系统
// logDir: 日志目录路径（相对于项目根目录）
func InitLogger(logDir string) error {
	var initErr error
	once.Do(func() {
		logManager = &LogManager{
			baseDir:         logDir,
			protocolLoggers: make(map[ProtocolType]*Logger),
			fileLoggers:     make(map[string]*Logger),
		}
		initErr = logManager.init()
	})
	return initErr
}

// init 初始化基础日志系统
func (m *LogManager) init() error {
	// 创建各协议的日志目录
	protocols := []ProtocolType{ProtocolCAN, ProtocolCANOPEN, ProtocolCommon}

	for _, protocol := range protocols {
		protocolDir := filepath.Join(m.baseDir, string(protocol))
		if err := os.MkdirAll(protocolDir, 0755); err != nil {
			return fmt.Errorf("failed to create log directory for %s: %v", protocol, err)
		}
	}

	// 创建系统日志目录（独立于协议目录）
	systemDir := filepath.Join(m.baseDir, "system")
	if err := os.MkdirAll(systemDir, 0755); err != nil {
		return fmt.Errorf("failed to create system log directory: %v", err)
	}

	// 创建通用日志记录器（放在 system 目录下）
	startTime := time.Now().Format("2006-01-02_15-04-05")
	commonLogger, err := m.createLogger(systemDir, fmt.Sprintf("system_%s.log", startTime))
	if err != nil {
		return err
	}
	m.commonLogger = commonLogger

	// 记录系统启动
	m.commonLogger.logWithSkip("INFO", 1, "Logger system initialized, base dir: %s", m.baseDir)

	return nil
}

// createLogger 创建一个新的日志记录器
func (m *LogManager) createLogger(dir string, fileName string) (*Logger, error) {
	logPath := filepath.Join(dir, fileName)

	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to open log file: %v", err)
	}

	logger := &Logger{
		logDir:   dir,
		fileName: fileName,
		file:     file,
		logger:   log.New(file, "", 0),
	}

	return logger, nil
}

// CreateFileLogger 为特定文件创建日志记录器
// csvFileName: 上传的CSV文件名
// protocol: 协议类型
// 返回值: 日志键，用于后续日志写入
func CreateFileLogger(csvFileName string, protocol ProtocolType) (string, error) {
	if logManager == nil {
		return "", fmt.Errorf("logger not initialized")
	}
	return logManager.createFileLogger(csvFileName, protocol)
}

func (m *LogManager) createFileLogger(csvFileName string, protocol ProtocolType) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 清理文件名，去除扩展名和特殊字符
	baseName := strings.TrimSuffix(csvFileName, filepath.Ext(csvFileName))
	// 替换不允许的字符
	baseName = strings.ReplaceAll(baseName, " ", "_")

	// 添加时间戳确保唯一性
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	logFileName := fmt.Sprintf("%s_%s.log", baseName, timestamp)

	// 日志键
	logKey := fmt.Sprintf("%s:%s", protocol, csvFileName)

	// 获取协议目录
	protocolDir := filepath.Join(m.baseDir, string(protocol))

	// 创建日志记录器
	logger, err := m.createLogger(protocolDir, logFileName)
	if err != nil {
		return "", err
	}

	m.fileLoggers[logKey] = logger

	// 记录日志文件创建
	logger.logWithSkip("INFO", 2, "========== 开始处理文件: %s ==========", csvFileName)
	logger.logWithSkip("INFO", 2, "协议类型: %s", protocol)
	logger.logWithSkip("INFO", 2, "日志文件: %s", logFileName)

	return logKey, nil
}

// CloseFileLogger 关闭特定文件的日志记录器
func CloseFileLogger(logKey string) {
	if logManager == nil {
		return
	}
	logManager.closeFileLogger(logKey)
}

func (m *LogManager) closeFileLogger(logKey string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if logger, exists := m.fileLoggers[logKey]; exists {
		logger.logWithSkip("INFO", 2, "========== 文件处理完成 ==========")
		if logger.file != nil {
			logger.file.Close()
		}
		delete(m.fileLoggers, logKey)
	}
}

// getFileLogger 获取文件日志记录器
func (m *LogManager) getFileLogger(logKey string) *Logger {
	m.mu.Lock()
	defer m.mu.Unlock()

	if logger, exists := m.fileLoggers[logKey]; exists {
		return logger
	}
	return nil
}

// logWithSkip 内部日志记录方法，支持指定调用层跳过数
func (l *Logger) logWithSkip(level string, skip int, format string, args ...interface{}) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.logger == nil {
		log.Printf("[%s] %s", level, fmt.Sprintf(format, args...))
		return
	}

	// 获取调用信息
	_, file, line, ok := runtime.Caller(skip + 1)
	if !ok {
		file = "unknown"
		line = 0
	}

	// 获取函数名
	pc, _, _, ok := runtime.Caller(skip + 1)
	funcName := "unknown"
	if ok {
		funcName = filepath.Base(runtime.FuncForPC(pc).Name())
	}

	// 只保留文件名，不包含路径
	fileName := filepath.Base(file)

	// 格式化时间
	timestamp := time.Now().Format("2006-01-02 15:04:05.000")

	// 构建日志消息
	// 格式: [时间] [文件名:行数] [函数名] [级别] 内容
	message := fmt.Sprintf("[%s] [%s:%d] [%s] [%s] %s",
		timestamp,
		fileName,
		line,
		funcName,
		level,
		fmt.Sprintf(format, args...))

	l.logger.Println(message)
}

// ============ 文件特定日志方法 ============

// FileLogInfo 记录信息到特定文件的日志
func FileLogInfo(logKey string, format string, args ...interface{}) {
	if logManager != nil {
		if logger := logManager.getFileLogger(logKey); logger != nil {
			logger.logWithSkip("INFO", 1, format, args...)
		}
	}
}

// FileLogDebug 记录调试信息到特定文件的日志
func FileLogDebug(logKey string, format string, args ...interface{}) {
	if logManager != nil {
		if logger := logManager.getFileLogger(logKey); logger != nil {
			logger.logWithSkip("DEBUG", 1, format, args...)
		}
	}
}

// FileLogWarn 记录警告到特定文件的日志
func FileLogWarn(logKey string, format string, args ...interface{}) {
	if logManager != nil {
		if logger := logManager.getFileLogger(logKey); logger != nil {
			logger.logWithSkip("WARN", 1, format, args...)
		}
	}
}

// FileLogError 记录错误到特定文件的日志
func FileLogError(logKey string, format string, args ...interface{}) {
	if logManager != nil {
		if logger := logManager.getFileLogger(logKey); logger != nil {
			logger.logWithSkip("ERROR", 1, format, args...)
		}
	}
}

// ============ 通用日志方法 (写入common系统日志) ============

// Info 记录信息级别日志到common系统日志
func Info(format string, args ...interface{}) {
	if logManager != nil && logManager.commonLogger != nil {
		logManager.commonLogger.logWithSkip("INFO", 1, format, args...)
	}
}

// Debug 记录调试级别日志到common系统日志
func Debug(format string, args ...interface{}) {
	if logManager != nil && logManager.commonLogger != nil {
		logManager.commonLogger.logWithSkip("DEBUG", 1, format, args...)
	}
}

// Warn 记录警告级别日志到common系统日志
func Warn(format string, args ...interface{}) {
	if logManager != nil && logManager.commonLogger != nil {
		logManager.commonLogger.logWithSkip("WARN", 1, format, args...)
	}
}

// Error 记录错误级别日志到common系统日志
func Error(format string, args ...interface{}) {
	if logManager != nil && logManager.commonLogger != nil {
		logManager.commonLogger.logWithSkip("ERROR", 1, format, args...)
	}
}

// Fatal 记录致命错误并退出程序
func Fatal(format string, args ...interface{}) {
	if logManager != nil && logManager.commonLogger != nil {
		logManager.commonLogger.logWithSkip("FATAL", 1, format, args...)
		Close()
	}
	log.Fatalf("[FATAL] "+format, args...)
}

// ============ 协议特定日志方法（兼容旧接口）============

// LogInfo 记录信息级别日志到指定协议（写入通用日志）
func LogInfo(protocol ProtocolType, format string, args ...interface{}) {
	Info("[%s] %s", protocol, fmt.Sprintf(format, args...))
}

// LogDebug 记录调试级别日志到指定协议
func LogDebug(protocol ProtocolType, format string, args ...interface{}) {
	Debug("[%s] %s", protocol, fmt.Sprintf(format, args...))
}

// LogWarn 记录警告级别日志到指定协议
func LogWarn(protocol ProtocolType, format string, args ...interface{}) {
	Warn("[%s] %s", protocol, fmt.Sprintf(format, args...))
}

// LogError 记录错误级别日志到指定协议
func LogError(protocol ProtocolType, format string, args ...interface{}) {
	Error("[%s] %s", protocol, fmt.Sprintf(format, args...))
}

// ============ 便捷方法 ============

// GetProtocolType 根据协议字符串获取协议类型
func GetProtocolType(protocol string) ProtocolType {
	switch strings.ToUpper(protocol) {
	case "CAN":
		return ProtocolCAN
	case "CANOPEN":
		return ProtocolCANOPEN
	default:
		return ProtocolCommon
	}
}

// Close 关闭所有日志文件
func Close() {
	if logManager != nil {
		logManager.mu.Lock()
		defer logManager.mu.Unlock()

		// 关闭通用日志
		if logManager.commonLogger != nil && logManager.commonLogger.file != nil {
			logManager.commonLogger.file.Close()
		}

		// 关闭所有文件日志
		for _, logger := range logManager.fileLoggers {
			if logger.file != nil {
				logger.file.Close()
			}
		}
	}
}

// GetLogDir 获取日志基础目录
func GetLogDir() string {
	if logManager != nil {
		return logManager.baseDir
	}
	return ""
}
