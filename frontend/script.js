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
    const sidebarTitleEl = document.getElementById('sidebarTitle');
    const messageListEl = document.getElementById('messageList');

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

    // 左侧标题根据协议变化
    sidebarTitleEl.textContent = protocol === 'CANOPEN' ? 'Available CANopen messages' : 'Available CAN messages';

    // 统一列映射：Time, From->To, Id, Data
    const unifiedHeaders = ['Time', 'From->To', 'Id', 'Data'];
    tableHead.innerHTML = `
        <tr>
            ${unifiedHeaders.map((h, index) => {
                const width = index === 0 ? '280px' : 'auto'; // Time列调整为180px宽度
                return `<th style="width: ${width}">${h}<div class="resize-handle"></div></th>`;
            }).join('')}
        </tr>
    `;
    
    // 初始化列宽调整功能
    initializeColumnResize();

    // 根据头部名找到相应的列索引（不区分大小写）
    const headerIndex = (name) => {
        const idx = data.headers.findIndex(h => (h || '').toString().toLowerCase() === name.toLowerCase());
        return idx >= 0 ? idx : -1;
    };

    const idxTime = headerIndex('Time');
    const idxSource = headerIndex('Source');
    const idxTarget = headerIndex('Target');
    const idxName = headerIndex('Name');
    const idxBuffer = headerIndex('Buffer');

    // 生成统一视图数据
    const maxRows = Math.min(data.rows.length, 100);
    const unifiedRows = [];
    const idSet = new Set(); // 左侧唯一消息ID

    for (let i = 0; i < maxRows; i++) {
        const row = data.rows[i] || [];
        const time = idxTime >= 0 ? (row[idxTime] || '') : '';
        const source = idxSource >= 0 ? (row[idxSource] || '') : '';
        const target = idxTarget >= 0 ? (row[idxTarget] || '') : '';
        const name = idxName >= 0 ? (row[idxName] || '') : '';
        const buffer = idxBuffer >= 0 ? (row[idxBuffer] || '') : '';

        // 解析 Buffer: 形如 string=2cf:8:[10 40 ff 37 48 c1 0a 00]
        let parsedId = '';
        let parsedData = '';
        if (buffer) {
            const m = buffer.match(/^\s*string=([0-9a-fA-F]+):\d+:\[(.*?)\]\s*$/);
            if (m) {
                parsedId = m[1];
                // 规范化数据字节为大写两位分隔
                parsedData = m[2]
                    .trim()
                    .split(/\s+/)
                    .map(b => b.toUpperCase())
                    .join(' ');
            }
        }

        const fromTo = `${source}->${target}`;
        const id = parsedId || name || 'N/A';
        const dataField = parsedData || buffer || '';

        unifiedRows.push([time, fromTo, id, dataField]);

        // 收集唯一ID
        if (id && id !== 'N/A') {
            idSet.add(id);
        }
    }

    // 渲染表格数据
    tableBody.innerHTML = unifiedRows.map((cols, rowIndex) => `
        <tr>
            ${cols.map((cell, colIndex) => {
                const width = colIndex === 0 ? '280px' : 'auto'; // Time列调整为180px宽度
                return `<td style="width: ${width}" title="${escapeHtml(cell)}">${escapeHtml(cell)}</td>`;
            }).join('')}
        </tr>
    `).join('');

    // 若总数超过100，提示
    if (data.rows.length > 100) {
        const infoRow = document.createElement('tr');
        infoRow.innerHTML = `<td colspan="${unifiedHeaders.length}" style="text-align: center; font-style: italic; color: #666;">显示前100行，共${data.rows.length}行数据</td>`;
        tableBody.appendChild(infoRow);
    }

    // 渲染左侧消息列表（唯一且按字典序）
    const uniqueIds = Array.from(idSet).sort((a,b) => a.localeCompare(b, undefined, {sensitivity:'base'}));
    messageListEl.innerHTML = uniqueIds.map(id => `
        <li>
            <span title="${escapeHtml(id)}">${escapeHtml(id)}</span>
        </li>
    `).join('');
}

// 初始化列宽调整功能
function initializeColumnResize() {
    const table = document.getElementById('dataTable');
    const headers = table.querySelectorAll('th');
    
    headers.forEach((header, index) => {
        const resizeHandle = header.querySelector('.resize-handle');
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = header.offsetWidth;
            header.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            
            e.preventDefault();
            e.stopPropagation();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const deltaX = e.clientX - startX;
            const newWidth = Math.max(50, startWidth + deltaX); // 最小宽度50px
            
            // 设置当前列宽度
            header.style.width = newWidth + 'px';
            
            // 同时设置所有行的对应列宽度
            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const cell = row.children[index];
                if (cell) {
                    cell.style.width = newWidth + 'px';
                }
            });
        });
        
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                header.classList.remove('resizing');
                document.body.style.cursor = '';
            }
        });
    });
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
