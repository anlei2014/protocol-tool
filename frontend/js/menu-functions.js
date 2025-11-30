// 菜单功能实现

// File 菜单功能
function exportData(format) {
    if (!unifiedRows || unifiedRows.length === 0) {
        showMessage('没有数据可导出', 'warning');
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const filename = urlParams.get('file') || 'export';

    if (format === 'csv') {
        exportToCSV(filename);
    } else if (format === 'json') {
        exportToJSON(filename);
    }
}

function exportToCSV(filename) {
    const headers = ['Time', 'From->To', 'Id', 'Data'];
    let csvContent = headers.join(',') + '\n';

    unifiedRows.forEach(item => {
        if (item && item.row) {
            const row = item.row.map(cell => `"${cell}"`).join(',');
            csvContent += row + '\n';
        }
    });

    downloadFile(csvContent, `${filename}_export.csv`, 'text/csv');
    showMessage('CSV文件导出成功', 'success');
}

function exportToJSON(filename) {
    const jsonData = unifiedRows.map(item => ({
        time: item.row[0],
        fromTo: item.row[1],
        id: item.row[2],
        data: item.row[3]
    }));

    const jsonContent = JSON.stringify(jsonData, null, 2);
    downloadFile(jsonContent, `${filename}_export.json`, 'application/json');
    showMessage('JSON文件导出成功', 'success');
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Decode 菜单功能
function switchProtocol(protocol) {
    const urlParams = new URLSearchParams(window.location.search);
    const filename = urlParams.get('file');

    if (filename) {
        window.location.href = `/preview.html?file=${encodeURIComponent(filename)}&protocol=${protocol}`;
    }
}

// Time 菜单功能
let timeFormat = 'absolute'; // 'absolute' or 'relative'

function setTimeFormat(format) {
    timeFormat = format;
    showMessage(`时间格式已切换为${format === 'absolute' ? '绝对时间' : '相对时间'}`, 'info');
    // 这里可以添加重新渲染表格的逻辑
}

// Messages 菜单功能
let messageTypeFilter = 'all'; // 'all', 'receive', 'publish'

function filterMessagesByType(type) {
    messageTypeFilter = type;
    const typeNames = {
        'all': '全部消息',
        'receive': '接收消息',
        'publish': '发布消息'
    };
    showMessage(`已切换到：${typeNames[type]}`, 'info');
    // 这里可以添加过滤逻辑
}

function clearFilters() {
    hiddenMessageIds.clear();
    messageTypeFilter = 'all';

    // 重新渲染消息列表
    const messageList = document.getElementById('messageList');
    if (messageList && unifiedRows && unifiedRows.length > 0) {
        const uniqueIds = Array.from(new Set(unifiedRows.map(item => item.id)))
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

        messageList.innerHTML = uniqueIds.map(id => `
            <div class="list-group-item list-group-item-action message-filter-item" data-message-id="${escapeHtml(id)}">
                <span class="message-status-icon"></span><span title="${escapeHtml(id)}">${escapeHtml(id)}</span>
            </div>
        `).join('');

        // 重新绑定点击事件
        messageList.querySelectorAll('.message-filter-item').forEach(item => {
            item.addEventListener('click', function () {
                const messageId = this.dataset.messageId;
                toggleMessageFilter(messageId);
            });
        });
    }

    // 重新渲染表格
    if (unifiedRows && unifiedRows.length > 0) {
        renderTable(unifiedRows.length);
    }

    showMessage('已清除所有过滤条件', 'success');
}

// View 菜单功能
let sidebarVisible = true;
let currentZoom = 100;

function toggleSidebar() {
    sidebarVisible = !sidebarVisible;
    const sidebarColumn = document.getElementById('sidebarColumn');
    const tableColumn = document.getElementById('tableColumn');

    if (sidebarColumn && tableColumn) {
        if (sidebarVisible) {
            sidebarColumn.classList.remove('d-none');
            tableColumn.classList.remove('col-md-12');
            tableColumn.classList.add('col-md-10');
            showMessage('侧边栏已显示', 'info');
        } else {
            sidebarColumn.classList.add('d-none');
            tableColumn.classList.remove('col-md-10');
            tableColumn.classList.add('col-md-12');
            showMessage('侧边栏已隐藏', 'info');
        }
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        showMessage('已进入全屏模式', 'info');
    } else {
        document.exitFullscreen();
        showMessage('已退出全屏模式', 'info');
    }
}

function zoomIn() {
    currentZoom = Math.min(currentZoom + 10, 200);
    applyZoom();
}

function zoomOut() {
    currentZoom = Math.max(currentZoom - 10, 50);
    applyZoom();
}

function resetZoom() {
    currentZoom = 100;
    applyZoom();
}

function applyZoom() {
    const dataTable = document.getElementById('dataTable');
    if (dataTable) {
        dataTable.style.fontSize = `${currentZoom}%`;
        showMessage(`缩放: ${currentZoom}%`, 'info');
    }
}

// Window 菜单功能
function refreshData() {
    location.reload();
}

// Graphs 菜单功能
function showGraph(type) {
    const graphTypes = {
        'timeline': '时间线图',
        'distribution': '分布图',
        'statistics': '统计图'
    };
    showMessage(`${graphTypes[type]}功能开发中...`, 'info');
}

// Help 菜单功能
function showHelp() {
    const helpContent = `
        <h5>使用帮助</h5>
        <ul>
            <li><strong>File:</strong> 导出数据为CSV或JSON格式</li>
            <li><strong>Decode:</strong> 切换解析协议（CAN/CANOPEN）</li>
            <li><strong>Time:</strong> 切换时间显示格式</li>
            <li><strong>Messages:</strong> 按消息类型过滤</li>
            <li><strong>View:</strong> 调整视图显示</li>
            <li><strong>Window:</strong> 窗口操作</li>
            <li><strong>Graphs:</strong> 数据可视化（开发中）</li>
        </ul>
        <p>点击左侧消息列表可以过滤显示特定消息。</p>
    `;

    const modal = createModal('使用帮助', helpContent);
    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();

    modal.addEventListener('hidden.bs.modal', function () {
        modal.remove();
    });
}

function showAbout() {
    const aboutContent = `
        <h5>CSV解析工具</h5>
        <p><strong>版本:</strong> 1.0.0</p>
        <p><strong>功能:</strong> CAN/CANOPEN协议CSV文件解析与可视化</p>
        <p><strong>特性:</strong></p>
        <ul>
            <li>支持多种协议解析</li>
            <li>数据过滤与搜索</li>
            <li>数据导出功能</li>
            <li>可调整的界面布局</li>
        </ul>
    `;

    const modal = createModal('关于', aboutContent);
    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();

    modal.addEventListener('hidden.bs.modal', function () {
        modal.remove();
    });
}

function createModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">${title}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                </div>
            </div>
        </div>
    `;
    return modal;
}

// 搜索功能
function searchMessages() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    const searchTerm = searchInput.value.toLowerCase();
    const tableBody = document.getElementById('tableBody');

    if (!tableBody || !unifiedRows || unifiedRows.length === 0) return;

    if (!searchTerm) {
        // 如果搜索框为空，显示所有未被过滤的行
        renderTable(unifiedRows.length);
        return;
    }

    // 过滤包含搜索词的行
    const filteredRows = unifiedRows.filter(item => {
        if (!item || !item.row) return false;
        if (hiddenMessageIds.has(item.id)) return false;

        return item.row.some(cell =>
            cell.toString().toLowerCase().includes(searchTerm)
        );
    });

    // 渲染过滤后的结果
    let tableHTML = '';
    if (filteredRows.length === 0) {
        tableHTML = `<tr><td colspan="4" style="text-align: center; color: #999;">未找到匹配的消息</td></tr>`;
    } else {
        tableHTML = filteredRows.map(item => {
            return `
                <tr>
                    ${item.row.map((cell, colIndex) => {
                const width = colIndex === 0 ? '280px' : 'auto';
                const cellText = escapeHtml(cell);
                // 高亮搜索词
                const highlightedText = cellText.replace(
                    new RegExp(escapeHtml(searchTerm), 'gi'),
                    match => `<mark>${match}</mark>`
                );
                return `<td style="width: ${width}" title="${cellText}">${highlightedText}</td>`;
            }).join('')}
                </tr>
            `;
        }).join('');
    }

    tableBody.innerHTML = tableHTML;
}
