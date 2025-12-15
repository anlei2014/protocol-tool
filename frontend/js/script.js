// 全局变量
let currentFiles = [];
let currentPage = 1;
const PAGE_SIZE = 50;
let selectedProtocol = null; // 当前选择的协议类型

// 获取协议对应的 badge 样式类
function getProtocolBadgeClass(protocol) {
    switch (protocol) {
        case 'CAN': return 'bg-primary';
        case 'CANOPEN': return 'bg-info';
        case 'COMMON': return 'bg-success';
        default: return 'bg-secondary';
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
    initializeUpload();
    // 不自动加载文件列表，需要先选择协议
    updateUIForProtocolSelection();
    initializeUpload();
    initializeProtocolSelection();
    initializeGlobalEvents();
    // 不自动加载文件列表，需要先选择协议
    updateUIForProtocolSelection();
});

// 初始化协议选择事件
function initializeProtocolSelection() {
    const protocols = ['CAN', 'CANOPEN', 'COMMON'];
    protocols.forEach(protocol => {
        const card = document.getElementById('protocol' + protocol);
        if (card) {
            card.addEventListener('click', () => selectProtocol(protocol));
        }
    });
}

// 初始化全局事件
function initializeGlobalEvents() {
    // 文件选择按钮
    const selectFileBtn = document.getElementById('selectFileBtn');
    const fileInput = document.getElementById('fileInput');
    if (selectFileBtn && fileInput) {
        selectFileBtn.addEventListener('click', () => fileInput.click());
    }

    // 刷新按钮 (如果有多个，可以使用class)
    const refreshBtns = document.querySelectorAll('.btn-outline-success, .btn-light.rounded-circle');
    refreshBtns.forEach(btn => {
        btn.addEventListener('click', () => loadFiles());
    });
}

// 选择协议类型
function selectProtocol(protocol) {
    selectedProtocol = protocol;

    // 更新协议卡片选中状态
    document.querySelectorAll('.protocol-card').forEach(card => {
        card.classList.remove('selected');
    });
    const selectedCard = document.getElementById('protocol' + protocol);
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }

    // 更新UI状态
    updateUIForProtocolSelection();

    // 加载对应协议的文件列表
    loadFiles();
}

// 更新UI状态（根据是否选择了协议）
function updateUIForProtocolSelection() {
    const uploadArea = document.getElementById('uploadArea');
    const selectFileBtn = document.getElementById('selectFileBtn');
    const uploadTitle = document.getElementById('uploadTitle');
    const uploadSubtitle = document.getElementById('uploadSubtitle');
    const protocolHint = document.getElementById('protocolHint');
    const selectedProtocolBadge = document.getElementById('selectedProtocolBadge');
    const fileListProtocolBadge = document.getElementById('fileListProtocolBadge');
    const filesList = document.getElementById('filesList');

    if (selectedProtocol) {
        // 已选择协议 - 启用上传
        uploadArea.classList.remove('disabled');
        selectFileBtn.disabled = false;
        uploadTitle.textContent = '拖拽文件到此处或点击选择';
        uploadSubtitle.textContent = '支持 .csv 格式文件';
        protocolHint.innerHTML = `<i class="bi bi-check-circle-fill text-success me-1"></i>已选择 ${selectedProtocol} 协议`;

        // 显示协议 badge
        selectedProtocolBadge.textContent = selectedProtocol;
        selectedProtocolBadge.style.display = 'inline';
        selectedProtocolBadge.className = 'badge ms-2 ' + getProtocolBadgeClass(selectedProtocol);

        fileListProtocolBadge.textContent = selectedProtocol;
        fileListProtocolBadge.style.display = 'inline';
        fileListProtocolBadge.className = 'badge ms-2 ' + getProtocolBadgeClass(selectedProtocol);
    } else {
        // 未选择协议 - 禁用上传
        uploadArea.classList.add('disabled');
        selectFileBtn.disabled = true;
        uploadTitle.textContent = '请先选择协议类型';
        uploadSubtitle.textContent = '选择协议后才能上传CSV文件';
        protocolHint.innerHTML = '<i class="bi bi-info-circle me-1"></i>请先选择协议类型，然后才能上传文件';

        // 隐藏协议 badge
        selectedProtocolBadge.style.display = 'none';
        fileListProtocolBadge.style.display = 'none';

        // 显示提示
        filesList.innerHTML = `
            <div class="empty-state text-center py-4">
                <i class="bi bi-hand-index display-1 text-muted"></i>
                <h5 class="mt-3 text-muted">请先选择协议类型</h5>
                <p class="text-muted">选择协议后将显示对应的文件列表</p>
            </div>
        `;
    }
}

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
        // 检查是否已选择协议
        if (!selectedProtocol) {
            showMessage('请先选择协议类型', 'warning');
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
        if (selectedProtocol) {
            uploadArea.classList.add('dragover');
        }
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');

        if (!selectedProtocol) {
            showMessage('请先选择协议类型', 'warning');
            return;
        }

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadFile(files[0]);
        }
    });
}

// 上传文件
async function uploadFile(file) {
    // 检查是否选择了协议
    if (!selectedProtocol) {
        showMessage('请先选择协议类型', 'warning');
        return;
    }

    // 验证文件类型
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showMessage('请选择CSV文件', 'error');
        return;
    }

    // 显示上传进度
    showUploadProgress(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('protocolType', selectedProtocol); // 添加协议类型

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showMessage(`文件上传成功，正在跳转到解析页面...`, 'success');
            // 自动跳转到解析页面
            parseFile(result.file.filename, selectedProtocol);
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
// 渲染文件列表 - 带分页功能
function renderFilesList() {
    const filesList = document.getElementById('filesList');
    const allFiles = currentFiles || [];

    if (allFiles.length === 0) {
        filesList.innerHTML = `
            <div class="empty-state text-center py-4">
                <i class="bi bi-folder-x display-1 text-muted"></i>
                <h5 class="mt-3 text-muted">暂无文件记录</h5>
                <p class="text-muted">上传的文件将在此处显示</p>
            </div>
        `;
        return;
    }

    // 按上传时间排序
    const sortedFiles = [...allFiles].sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime));

    // 计算分页
    const totalFiles = sortedFiles.length;
    const totalPages = Math.ceil(totalFiles / PAGE_SIZE);
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const pageFiles = sortedFiles.slice(startIdx, startIdx + PAGE_SIZE);

    let html = pageFiles.map(file => {
        const fileProtocol = file.protocolType || 'COMMON';
        const protocolBadge = `<span class="badge ${getProtocolBadgeClass(fileProtocol)} ms-2">${fileProtocol}</span>`;
        return `
        <div class="card mb-3 file-item">
            <div class="card-body">
                <div class="row align-items-center">
                    <div class="col-md-8">
                        <h6 class="card-title mb-2">
                            <i class="bi bi-file-earmark-spreadsheet me-2"></i>${escapeHtml(file.originalName)}
                            ${protocolBadge}
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
                            <button class="btn btn-primary btn-sm" onclick="parseFile('${file.filename}', '${fileProtocol}')">
                                <i class="bi bi-eye me-1"></i>查看
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="deleteFile('${file.filename}')">
                                <i class="bi bi-trash me-1"></i>删除
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `}).join('');

    // 添加分页导航
    if (totalPages > 1) {
        html += renderPagination(currentPage, totalPages, totalFiles);
    } else {
        html += `<div class="text-center text-muted small mt-3">共 ${totalFiles} 条记录</div>`;
    }
    filesList.innerHTML = html;
}

// 渲染分页导航
function renderPagination(current, total, totalFiles) {
    let pages = '';
    let startPage = Math.max(1, current - 2);
    let endPage = Math.min(total, current + 2);

    if (endPage - startPage < 4) {
        if (startPage === 1) endPage = Math.min(total, 5);
        else startPage = Math.max(1, total - 4);
    }

    if (startPage > 1) {
        pages += `<li class="page-item"><a class="page-link" href="#" onclick="goToPage(1); return false;">1</a></li>`;
        if (startPage > 2) pages += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        pages += i === current
            ? `<li class="page-item active"><span class="page-link">${i}</span></li>`
            : `<li class="page-item"><a class="page-link" href="#" onclick="goToPage(${i}); return false;">${i}</a></li>`;
    }

    if (endPage < total) {
        if (endPage < total - 1) pages += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        pages += `<li class="page-item"><a class="page-link" href="#" onclick="goToPage(${total}); return false;">${total}</a></li>`;
    }

    return `
        <nav class="mt-4">
            <div class="d-flex justify-content-between align-items-center">
                <small class="text-muted">共 ${totalFiles} 条，第 ${current}/${total} 页</small>
                <ul class="pagination pagination-sm mb-0">
                    <li class="page-item ${current === 1 ? 'disabled' : ''}">
                        <a class="page-link" href="#" onclick="goToPage(${current - 1}); return false;"><i class="bi bi-chevron-left"></i></a>
                    </li>
                    ${pages}
                    <li class="page-item ${current === total ? 'disabled' : ''}">
                        <a class="page-link" href="#" onclick="goToPage(${current + 1}); return false;"><i class="bi bi-chevron-right"></i></a>
                    </li>
                </ul>
            </div>
        </nav>
    `;
}

// 跳转到指定页
function goToPage(page) {
    const totalPages = Math.ceil((currentFiles || []).length / PAGE_SIZE);
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        renderFilesList();
        document.getElementById('filesList').scrollIntoView({ behavior: 'smooth' });
    }
}
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

// ==================== 面板切换功能 ====================

// 切换到历史记录面板
function toggleHistoryPanel() {
    const wrapper = document.getElementById('sliderWrapper');
    if (wrapper) {
        wrapper.classList.add('slide-left');
        // 加载历史记录
        loadFiles();
    }
}

// 切换回配置面板
function toggleConfigPanel() {
    const wrapper = document.getElementById('sliderWrapper');
    if (wrapper) {
        wrapper.classList.remove('slide-left');

        // 重置滚动位置
        window.scrollTo(0, 0);

        // 清空历史记录面板内容，恢复默认状态
        const filesList = document.getElementById('filesList');
        if (filesList) {
            filesList.innerHTML = `
                <div class="empty-state text-center py-5">
                    <i class="bi bi-inbox display-4 text-light"></i>
                    <h5 class="mt-3 text-muted">暂无文件记录</h5>
                    <p class="text-muted small">上传的文件将在此处归档</p>
                </div>
            `;
        }

        // 重置分页
        currentPage = 1;
    }
}
