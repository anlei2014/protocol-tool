// 全局变量
let currentFiles = [];
let selectedProtocol = 'CAN'; // 默认选择CAN协议

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeUpload();
    initializeProtocolSelection();
    loadFiles();
});

// 初始化上传功能
function initializeUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    // 点击上传区域（排除按钮区域）
    uploadArea.addEventListener('click', (e) => {
        // 如果点击的是按钮，不触发文件选择
        if (e.target.classList.contains('upload-btn')) {
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

// 初始化协议选择
function initializeProtocolSelection() {
    const canBtn = document.getElementById('canBtn');
    const canopenBtn = document.getElementById('canopenBtn');
    
    canBtn.addEventListener('click', () => {
        selectProtocol('CAN');
    });
    
    canopenBtn.addEventListener('click', () => {
        selectProtocol('CANOPEN');
    });
}

// 选择协议
function selectProtocol(protocol) {
    selectedProtocol = protocol;
    
    // 更新按钮状态
    document.querySelectorAll('.protocol-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (protocol === 'CAN') {
        document.getElementById('canBtn').classList.add('active');
    } else {
        document.getElementById('canopenBtn').classList.add('active');
    }
    
    showMessage(`已选择 ${protocol} 协议`, 'info');
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
    filesList.innerHTML = '<div class="loading">加载中...</div>';

    try {
        const response = await fetch('/api/files');
        const result = await response.json();
        
        if (result.success) {
            currentFiles = result.files || [];
            renderFilesList();
        } else {
            filesList.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><p>加载文件列表失败: ' + result.message + '</p></div>';
        }
    } catch (error) {
        filesList.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><p>加载文件列表失败: ' + error.message + '</p></div>';
    }
}

// 渲染文件列表
function renderFilesList() {
    const filesList = document.getElementById('filesList');
    
    if (currentFiles.length === 0) {
        filesList.innerHTML = '<div class="empty-state"><div class="icon">📁</div><p>暂无上传的文件</p></div>';
        return;
    }

    filesList.innerHTML = currentFiles.map(file => `
        <div class="file-item">
            <div class="file-info">
                <h4>${file.originalName}</h4>
                <p>大小: ${formatFileSize(file.size)} | 行数: ${file.rowCount} | 列数: ${file.columnCount} | 上传时间: ${formatDate(file.uploadTime)}</p>
            </div>
            <div class="file-actions">
                <button class="btn btn-primary" onclick="parseFile('${file.filename}', 'CAN')">CAN解析</button>
                <button class="btn btn-info" onclick="parseFile('${file.filename}', 'CANOPEN')">CANOPEN解析</button>
                <button class="btn btn-danger" onclick="deleteFile('${file.filename}')">删除</button>
            </div>
        </div>
    `).join('');
}

// 解析文件
async function parseFile(filename, protocol = null) {
    // 如果没有指定协议，使用当前选择的协议
    const parseProtocol = protocol || selectedProtocol;
    
    try {
        const response = await fetch(`/api/parse/${filename}?protocol=${parseProtocol}`);
        const result = await response.json();
        
        if (result.success) {
            showPreview(result.data, filename, parseProtocol);
        } else {
            showMessage('解析失败: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('解析失败: ' + error.message, 'error');
    }
}

// 显示预览
function showPreview(data, filename, protocol = 'CAN') {
    const previewSection = document.getElementById('previewSection');
    const previewInfo = document.getElementById('previewInfo');
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');

    // 显示预览区域
    previewSection.style.display = 'block';
    
    // 滚动到预览区域
    previewSection.scrollIntoView({ behavior: 'smooth' });

    // 从当前文件列表中找到原始文件名
    const currentFile = currentFiles.find(file => file.filename === filename);
    const displayName = currentFile ? currentFile.originalName : filename;

    // 更新预览信息
    previewInfo.innerHTML = `
        <strong>文件:</strong> ${displayName} | 
        <strong>协议:</strong> ${protocol} | 
        <strong>总行数:</strong> ${data.total} | 
        <strong>列数:</strong> ${data.headers.length}
    `;

    // 渲染表头
    tableHead.innerHTML = `
        <tr>
            ${data.headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}
        </tr>
    `;

    // 渲染表格数据（限制显示前100行以提高性能）
    const maxRows = Math.min(data.rows.length, 100);
    tableBody.innerHTML = data.rows.slice(0, maxRows).map(row => `
        <tr>
            ${row.map(cell => `<td title="${escapeHtml(cell)}">${escapeHtml(cell)}</td>`).join('')}
        </tr>
    `).join('');

    // 如果数据超过100行，显示提示
    if (data.rows.length > 100) {
        const infoRow = document.createElement('tr');
        infoRow.innerHTML = `<td colspan="${data.headers.length}" style="text-align: center; font-style: italic; color: #666;">显示前100行，共${data.rows.length}行数据</td>`;
        tableBody.appendChild(infoRow);
    }
}

// 关闭预览
function closePreview() {
    document.getElementById('previewSection').style.display = 'none';
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
    const messageEl = document.getElementById('message');
    messageEl.textContent = message;
    messageEl.className = `message ${type} show`;
    
    setTimeout(() => {
        messageEl.classList.remove('show');
    }, 3000);
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
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
