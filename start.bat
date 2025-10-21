@echo off
echo Starting CSV Parser Tool...
echo.

REM 检查Go是否安装
go version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Go is not installed or not in PATH
    echo Please install Go from https://golang.org/dl/
    pause
    exit /b 1
)

REM 进入后端目录
cd backend

REM 下载依赖
echo Downloading dependencies...
go mod tidy

REM 启动服务器
echo Starting server on http://localhost:8080
echo Press Ctrl+C to stop the server
echo.
go run main.go
