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

// 已删除 Decode, Time, Messages, View, Window 菜单相关函数

// Graphs 菜单功能
function showGraph(type) {
    const graphTypes = {
        'timeline': '时间线图',
        'distribution': '分布图',
        'statistics': '统计图'
    };

    if (type === 'statistics') {
        // 跳转到统计图页面
        const urlParams = new URLSearchParams(window.location.search);
        const filename = urlParams.get('file');
        const protocol = urlParams.get('protocol') || 'CAN';

        if (filename) {
            window.location.href = `/can/statistics.html?file=${filename}&protocol=${protocol}`;
        } else {
            showMessage('缺少文件参数，无法打开统计图', 'error');
        }
        return;
    }

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
    const paginationContainer = document.getElementById('paginationContainer');

    if (!tableBody || !unifiedRows || unifiedRows.length === 0) return;

    if (!searchTerm) {
        // 如果搜索框为空，显示所有未被过滤的行
        renderTable(unifiedRows.length);
        return;
    }

    // 过滤包含搜索词的行（排除被隐藏的消息ID）
    const filteredRows = unifiedRows.filter(item => {
        if (!item || !item.row) return false;
        if (hiddenMessageIds.has(item.id)) return false;

        return item.row.some(cell =>
            cell.toString().toLowerCase().includes(searchTerm)
        );
    });

    // 列宽配置（与 renderTable 保持一致：#, Time, From->To, Id, Data, Description）
    const columnWidths = ['50px', '230px', '180px', '300px', '200px', 'auto'];

    // 渲染过滤后的结果
    let tableHTML = '';
    if (filteredRows.length === 0) {
        tableHTML = `<tr><td colspan="6" style="text-align: center; color: #999;">未找到匹配的消息</td></tr>`;
    } else {
        tableHTML = filteredRows.map((item, displayIndex) => {
            if (!item || !item.row) return '';

            // 获取行高亮样式
            const highlightStyle = typeof getRowHighlightStyle === 'function' ? getRowHighlightStyle(item.row) : null;
            const rowStyle = highlightStyle ?
                `background-color: ${highlightStyle.backgroundColor || 'inherit'}; color: ${highlightStyle.textColor || 'inherit'};` : '';

            // 构建带行号的行数据（行号从1开始）
            const globalIndex = displayIndex + 1;
            const rowWithLineNumber = [globalIndex, ...item.row];

            return `
                <tr style="${rowStyle}">
                    ${rowWithLineNumber.map((cell, colIndex) => {
                const width = columnWidths[colIndex] || 'auto';
                const cellText = escapeHtml(String(cell));
                // 高亮搜索词（行号列不需要高亮）
                const highlightedText = colIndex === 0 ? cellText : cellText.replace(
                    new RegExp(escapeHtml(searchTerm), 'gi'),
                    match => `<mark>${match}</mark>`
                );
                const cellStyle = highlightStyle && highlightStyle.textColor ?
                    `width: ${width}; color: ${highlightStyle.textColor};` :
                    `width: ${width}`;
                return `<td style="${cellStyle}" title="${cellText}">${highlightedText}</td>`;
            }).join('')}
                </tr>
            `;
        }).join('');
    }

    tableBody.innerHTML = tableHTML;

    // 搜索时隐藏分页控件（显示所有匹配结果）
    if (paginationContainer) {
        paginationContainer.style.display = 'none';
    }

    // 更新预览信息
    const previewInfo = document.getElementById('previewInfo');
    if (previewInfo) {
        previewInfo.textContent = `搜索结果: ${filteredRows.length} 条`;
    }
}
