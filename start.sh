#!/bin/bash

echo "Starting CSV Parser Tool..."
echo

# 检查Go是否安装
if ! command -v go &> /dev/null; then
    echo "Error: Go is not installed or not in PATH"
    echo "Please install Go from https://golang.org/dl/"
    exit 1
fi

# 进入后端目录
cd backend

# 下载依赖
echo "Downloading dependencies..."
go mod tidy

# 启动服务器
echo "Starting server on http://localhost:8080"
echo "Press Ctrl+C to stop the server"
echo
go run main.go
