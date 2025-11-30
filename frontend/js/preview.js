// 全局变量
let unifiedRows = []; // 保存统一视图数据
let hiddenMessageIds = new Set(); // 隐藏的消息ID集合

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
    // 从URL参数获取文件名和协议
    const urlParams = new URLSearchParams(window.location.search);
    const filename = urlParams.get('file');
    const protocol = urlParams.get('protocol') || 'CAN';

    if (!filename) {
        showMessage('缺少文件参数', 'error');
        setTimeout(() => {
            window.location.href = '/';
        }, 2000);
        return;
    }

    // 加载并显示数据
    loadAndDisplayData(filename, protocol);
});

// 加载并显示数据
async function loadAndDisplayData(filename, protocol) {
    try {
        const response = await fetch(`/api/parse/${filename}?protocol=${protocol}`);
        const result = await response.json();

        if (result.success) {
            showPreview(result.data, filename, protocol);
        } else {
            showMessage('解析失败: ' + result.message, 'error');
            setTimeout(() => {
                window.location.href = '/';
            }, 3000);
        }
    } catch (error) {
        showMessage('解析失败: ' + error.message, 'error');
        setTimeout(() => {
            window.location.href = '/';
        }, 3000);
    }
}


// 显示预览
function showPreview(data, filename, protocol = 'CAN') {
    const previewInfo = document.getElementById('previewInfo');
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    const sidebarTitleEl = document.getElementById('sidebarTitle');
    const messageListEl = document.getElementById('messageList');
    const fileNameEl = document.getElementById('fileName');

    // 更新文件名徽章
    if (fileNameEl) {
        fileNameEl.textContent = filename;
    }

    // 更新预览信息徽章
    if (previewInfo) {
        previewInfo.textContent = `${protocol} | 行:${data.total} | 列:${data.headers.length}`;
    }

    // 左侧标题根据协议变化
    if (sidebarTitleEl) {
        sidebarTitleEl.textContent = protocol === 'CANOPEN' ? 'Available CANopen messages' : 'Available CAN messages';
    }


    // 统一列映射：Time, From->To, Id, Data
    const unifiedHeaders = ['Time', 'From->To', 'Id', 'Data'];
    tableHead.innerHTML = `
        <tr>
            ${unifiedHeaders.map((h, index) => {
        const width = index === 0 ? '280px' : 'auto';
        return `<th style="width: ${width}">${h}<div class="resize-handle"></div></th>`;
    }).join('')}
        </tr>
    `;

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
    const idxMeaning = headerIndex('Meaning');

    // 生成统一视图数据
    const maxRows = Math.min(data.rows.length, 100);
    unifiedRows = []; // 重置统一视图数据
    const idMeaningMap = new Map(); // 左侧唯一消息ID和Meaning的映射
    hiddenMessageIds.clear(); // 重置隐藏的消息ID集合

    for (let i = 0; i < maxRows; i++) {
        const row = data.rows[i] || [];
        const time = idxTime >= 0 ? (row[idxTime] || '') : '';
        const source = idxSource >= 0 ? (row[idxSource] || '') : '';
        const target = idxTarget >= 0 ? (row[idxTarget] || '') : '';
        const name = idxName >= 0 ? (row[idxName] || '') : '';
        const buffer = idxBuffer >= 0 ? (row[idxBuffer] || '') : '';
        const meaning = idxMeaning >= 0 ? (row[idxMeaning] || '') : '';

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

        unifiedRows.push({ id: id, row: [time, fromTo, id, dataField] });

        // 收集唯一ID和对应的Meaning
        if (id && id !== 'N/A') {
            // 如果这个ID还没有存储过，或者当前的meaning不为空，则更新
            if (!idMeaningMap.has(id) || meaning) {
                idMeaningMap.set(id, meaning);
            }
        }
    }

    // 渲染表格数据
    renderTable(data.rows.length);

    // 初始化列宽调整功能（必须在renderTable之后调用）
    initializeColumnResize();

    // 渲染左侧消息列表（唯一且按字典序）
    const uniqueIds = Array.from(idMeaningMap.keys()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    messageListEl.innerHTML = uniqueIds.map(id => {
        const meaning = idMeaningMap.get(id);
        // 格式化显示：0xID - Meaning (如果有meaning的话)
        const displayId = '0x' + id.toUpperCase();
        const displayText = meaning ? `${displayId} - ${meaning}` : displayId;

        return `
        <div class="list-group-item list-group-item-action message-filter-item ${hiddenMessageIds.has(id) ? 'filtered' : ''}" data-message-id="${escapeHtml(id)}">
            <span class="message-status-icon"></span><span title="${escapeHtml(displayText)}">${escapeHtml(displayText)}</span>
        </div>
    `;
    }).join('');

    // 为每个消息项添加点击事件
    messageListEl.querySelectorAll('.message-filter-item').forEach(item => {
        item.addEventListener('click', function () {
            const messageId = this.dataset.messageId;
            toggleMessageFilter(messageId);
        });
    });
}

// 渲染表格（带过滤）
function renderTable(totalRows) {
    const tableBody = document.getElementById('tableBody');

    // 如果 unifiedRows 为空，不渲染
    if (!unifiedRows || unifiedRows.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">没有数据</td></tr>';
        return;
    }

    // 过滤数据
    const filteredRows = unifiedRows.filter(item => !hiddenMessageIds.has(item.id));

    // 渲染表格数据
    let tableHTML = '';
    if (filteredRows.length === 0) {
        tableHTML = `<tr><td colspan="4" style="text-align: center; color: #999;">没有数据</td></tr>`;
    } else {
        tableHTML = filteredRows.map(item => {
            if (!item || !item.row) {
                return '';
            }
            return `
                <tr>
                    ${item.row.map((cell, colIndex) => {
                const width = colIndex === 0 ? '280px' : 'auto';
                return `<td style="width: ${width}" title="${escapeHtml(cell)}">${escapeHtml(cell)}</td>`;
            }).join('')}
                </tr>
            `;
        }).join('');
    }

    // 若总数超过100，添加提示
    if (totalRows > 100) {
        const hiddenCount = unifiedRows.length - filteredRows.length;
        tableHTML += `<tr><td colspan="4" style="text-align: center; font-style: italic; color: #666;">显示前100行，共${totalRows}行数据${hiddenCount > 0 ? ` (已隐藏 ${hiddenCount} 行)` : ''}</td></tr>`;
    }

    // 一次性设置innerHTML
    tableBody.innerHTML = tableHTML;
}

// 切换消息过滤
function toggleMessageFilter(messageId) {
    if (hiddenMessageIds.has(messageId)) {
        hiddenMessageIds.delete(messageId);
    } else {
        hiddenMessageIds.add(messageId);
    }

    // 更新UI
    const messageList = document.getElementById('messageList');
    if (!messageList || !unifiedRows || unifiedRows.length === 0) {
        return;
    }

    const uniqueIds = Array.from(new Set(unifiedRows.map(item => item.id))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    messageList.innerHTML = uniqueIds.map(id => `
        <div class="list-group-item list-group-item-action message-filter-item ${hiddenMessageIds.has(id) ? 'filtered' : ''}" data-message-id="${escapeHtml(id)}">
            <span class="message-status-icon"></span><span title="${escapeHtml(id)}">${escapeHtml(id)}</span>
        </div>
    `).join('');

    // 重新绑定点击事件
    messageList.querySelectorAll('.message-filter-item').forEach(item => {
        item.addEventListener('click', function () {
            const id = this.dataset.messageId;
            toggleMessageFilter(id);
        });
    });

    // 重新渲染表格
    const totalRows = unifiedRows.length;
    renderTable(totalRows);
}

// 初始化列宽调整功能
function initializeColumnResize() {
    const table = document.getElementById('dataTable');
    if (!table) return;

    const headers = table.querySelectorAll('th');

    headers.forEach((header, index) => {
        const resizeHandle = header.querySelector('.resize-handle');
        if (!resizeHandle) return;

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

// 显示消息提示
function showMessage(message, type = 'info') {
    const toastEl = document.getElementById('messageToast');
    const toastBody = document.getElementById('toastBody');
    const toastIcon = document.getElementById('toastIcon');

    if (!toastEl || !toastBody || !toastIcon) return;

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

// HTML转义
function escapeHtml(text) {
    if (text === undefined || text === null) {
        return '';
    }
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
