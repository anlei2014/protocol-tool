// 全局变量
let currentFiles = [];

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
    initializeUpload();
    loadFiles();
});

// 初始化上传功能
function initializeUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    // 点击上传区域（排除按钮区域）
    uploadArea.addEventListener('click', (e) => {
        // 如果点击的是按钮，不触发文件选择
        if (e.target.classList.contains('btn')) {
            return;
        }
        fileInput.click();
    });

    // 文件选择
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadFile(e.target.files[0]);
        }
    });

    // 拖拽功能
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadFile(files[0]);
        }
    });
}

// 上传文件
async function uploadFile(file) {
    // 验证文件类型
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showMessage('请选择CSV文件', 'error');
        return;
    }

    // 显示上传进度
    showUploadProgress(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showMessage('文件上传成功', 'success');
            loadFiles(); // 刷新文件列表
        } else {
            showMessage('上传失败: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('上传失败: ' + error.message, 'error');
    } finally {
        showUploadProgress(false);
        // 清空文件输入
        document.getElementById('fileInput').value = '';
    }
}

// 显示/隐藏上传进度
function showUploadProgress(show) {
    const uploadArea = document.getElementById('uploadArea');
    const uploadProgress = document.getElementById('uploadProgress');

    if (show) {
        uploadArea.style.display = 'none';
        uploadProgress.style.display = 'block';

        // 模拟进度条
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 30;
            if (progress > 90) progress = 90;
            document.getElementById('progressFill').style.width = progress + '%';
        }, 200);

        // 保存interval ID以便清理
        uploadProgress.dataset.intervalId = interval;
    } else {
        uploadArea.style.display = 'block';
        uploadProgress.style.display = 'none';

        // 清理进度条
        const intervalId = uploadProgress.dataset.intervalId;
        if (intervalId) {
            clearInterval(intervalId);
            delete uploadProgress.dataset.intervalId;
        }
        document.getElementById('progressFill').style.width = '0%';
    }
}

// 加载文件列表
async function loadFiles() {
    const filesList = document.getElementById('filesList');
    if (!filesList) return;

    filesList.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">加载中...</span>
            </div>
            <p class="mt-2 text-muted">加载中...</p>
        </div>
    `;

    try {
        // 添加超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch('/api/files', {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.success) {
            currentFiles = result.files || [];
            renderFilesList();
        } else {
            filesList.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-exclamation-triangle display-1 text-warning"></i>
                    <h5 class="mt-3 text-warning">加载文件列表失败</h5>
                    <p class="text-muted">${escapeHtml(result.message || '未知错误')}</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('加载文件列表出错:', error);
        let errorMsg = '无法连接到服务器';

        if (error.name === 'AbortError') {
            errorMsg = '请求超时，请检查服务器是否正常运行';
        } else if (error.message) {
            errorMsg = error.message;
        }

        filesList.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-exclamation-triangle display-1 text-warning"></i>
                <h5 class="mt-3 text-warning">加载文件列表失败</h5>
                <p class="text-muted">${escapeHtml(errorMsg)}</p>
                <button class="btn btn-primary btn-sm mt-3" onclick="loadFiles()">重试</button>
            </div>
        `;
    }
}

// 渲染文件列表
function renderFilesList() {
    const filesList = document.getElementById('filesList');

    if (currentFiles.length === 0) {
        filesList.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-folder-x display-1 text-muted"></i>
                <h5 class="mt-3 text-muted">暂无上传的文件</h5>
                <p class="text-muted">请先上传CSV文件</p>
            </div>
        `;
        return;
    }

    filesList.innerHTML = currentFiles.map(file => `
        <div class="card mb-3 file-item">
            <div class="card-body">
                <div class="row align-items-center">
                    <div class="col-md-8">
                        <h6 class="card-title mb-2">
                            <i class="bi bi-file-earmark-spreadsheet me-2"></i>${file.originalName}
                        </h6>
                        <p class="card-text text-muted small mb-0">
                            <i class="bi bi-hdd me-1"></i>大小: ${formatFileSize(file.size)} | 
                            <i class="bi bi-list-ol me-1"></i>行数: ${file.rowCount} | 
                            <i class="bi bi-columns me-1"></i>列数: ${file.columnCount} | 
                            <i class="bi bi-clock me-1"></i>上传时间: ${formatDate(file.uploadTime)}
                        </p>
                    </div>
                    <div class="col-md-4 text-end">
                        <div class="btn-group" role="group">
                            <button class="btn btn-primary btn-sm" onclick="parseFile('${file.filename}', 'CAN')">
                                <i class="bi bi-tools me-1"></i>CAN解析
                            </button>
                            <button class="btn btn-info btn-sm" onclick="parseFile('${file.filename}', 'CANOPEN')">
                                <i class="bi bi-laptop me-1"></i>CANOPEN解析
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="deleteFile('${file.filename}')">
                                <i class="bi bi-trash me-1"></i>删除
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// 解析文件 - 跳转到协议专用预览页面
function parseFile(filename, protocol = 'CAN') {
    // 根据协议确定预览页面路径
    const protocolPath = protocol.toLowerCase();

    // 跳转到协议专用预览页面
    window.location.href = `/${protocolPath}/preview.html?file=${encodeURIComponent(filename)}&protocol=${encodeURIComponent(protocol)}`;
}


// 删除文件
async function deleteFile(filename) {
    if (!confirm('确定要删除这个文件吗？')) {
        return;
    }

    try {
        const response = await fetch(`/api/file/${filename}`, {
            method: 'DELETE'
        });
        const result = await response.json();

        if (result.success) {
            showMessage('文件删除成功', 'success');
            loadFiles(); // 刷新文件列表
        } else {
            showMessage('删除失败: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('删除失败: ' + error.message, 'error');
    }
}

// 显示消息提示
function showMessage(message, type = 'info') {
    const toastEl = document.getElementById('messageToast');
    const toastBody = document.getElementById('toastBody');
    const toastIcon = document.getElementById('toastIcon');

    // 设置消息内容
    toastBody.textContent = message;

    // 设置图标和颜色
    toastIcon.className = 'me-2';
    switch (type) {
        case 'success':
            toastIcon.classList.add('bi', 'bi-check-circle-fill', 'text-success');
            break;
        case 'error':
            toastIcon.classList.add('bi', 'bi-exclamation-triangle-fill', 'text-danger');
            break;
        case 'info':
        default:
            toastIcon.classList.add('bi', 'bi-info-circle-fill', 'text-primary');
            break;
    }

    // 显示Toast
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 格式化日期
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
}

// HTML转义
function escapeHtml(text) {
    if (text === undefined || text === null) {
        return '';
    }
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
