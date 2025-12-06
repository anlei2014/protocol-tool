// 全局变量
let unifiedRows = []; // 保存统一视图数据
let hiddenMessageIds = new Set(); // 隐藏的消息ID集合
let canDefinitions = {}; // CAN消息定义
let rowHighlightConfig = { highlights: [] }; // 行高亮配置

// 加载CAN定义
async function loadCanDefinitions() {
    try {
        const response = await fetch('/config/can_definitions.json');
        if (response.ok) {
            canDefinitions = await response.json();
        } else {
            console.warn('无法加载CAN定义文件');
            canDefinitions = {};
        }
    } catch (error) {
        console.warn('加载CAN定义失败:', error);
        canDefinitions = {};
    }
}

// 加载行高亮配置
async function loadRowHighlightConfig() {
    try {
        const response = await fetch('/config/row_highlight_config.json');
        if (response.ok) {
            rowHighlightConfig = await response.json();
        } else {
            console.warn('无法加载行高亮配置文件');
            rowHighlightConfig = { highlights: [] };
        }
    } catch (error) {
        console.warn('加载行高亮配置失败:', error);
        rowHighlightConfig = { highlights: [] };
    }
}

// 根据配置获取行的高亮样式
function getRowHighlightStyle(rowData) {
    if (!rowHighlightConfig.highlights || rowHighlightConfig.highlights.length === 0) {
        return null;
    }

    // 将行数据合并为一个字符串用于匹配
    const rowText = Array.isArray(rowData) ? rowData.join(' ') : String(rowData);

    for (const rule of rowHighlightConfig.highlights) {
        let isMatch = false;
        const matchText = rule.match;
        const matchType = rule.matchType || 'contains';

        switch (matchType) {
            case 'equals':
                isMatch = rowText === matchText;
                break;
            case 'startsWith':
                isMatch = rowText.startsWith(matchText);
                break;
            case 'endsWith':
                isMatch = rowText.endsWith(matchText);
                break;
            case 'contains':
            default:
                isMatch = rowText.includes(matchText);
                break;
        }

        if (isMatch) {
            return {
                backgroundColor: rule.backgroundColor || null,
                textColor: rule.textColor || null
            };
        }
    }

    return null;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async function () {
    // 先加载CAN定义和行高亮配置
    await Promise.all([loadCanDefinitions(), loadRowHighlightConfig()]);
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
    const columnWidths = ['280px', '240px', '250px', 'auto']; // Time, From->To, Id, Data
    tableHead.innerHTML = `
        <tr>
            ${unifiedHeaders.map((h, index) => {
        const width = columnWidths[index];
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

    // 辅助函数：检查ID是否在can_definitions中
    const isIdInDefinitions = (id) => {
        // 如果canDefinitions为空对象，则接受所有ID（向后兼容）
        if (Object.keys(canDefinitions).length === 0) {
            return true;
        }

        // 忽略N/A
        if (!id || id === 'N/A') {
            return false;
        }

        const idLower = id.toLowerCase();

        // 检查十六进制形式
        if (canDefinitions.hasOwnProperty(idLower)) {
            return true;
        }

        // 检查十进制形式
        for (const key in canDefinitions) {
            const def = canDefinitions[key];
            if (typeof def === 'object' && (def.dec === id || def.hex === idLower)) {
                return true;
            }
        }

        return false;
    };

    // 辅助函数：根据ID获取description
    const getDescriptionById = (id) => {
        if (!id || id === 'N/A') {
            return id;
        }

        const idLower = id.toLowerCase();

        // 尝试直接通过hex匹配
        if (canDefinitions[idLower]) {
            const def = canDefinitions[idLower];
            if (typeof def === 'object' && def.description) {
                return def.description;
            } else if (typeof def === 'string') {
                return def;
            }
        }

        // 尝试通过dec字段匹配
        for (const key in canDefinitions) {
            const def = canDefinitions[key];
            if (typeof def === 'object' && def.dec === id) {
                return def.description || id;
            }
        }

        return id; // 如果找不到description，返回原始ID
    };

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

        // 只添加在can_definitions中定义的ID的行
        if (isIdInDefinitions(id)) {
            // 获取description用于显示，原始id用于过滤
            const descriptionForDisplay = getDescriptionById(id);
            unifiedRows.push({ id: id, row: [time, fromTo, descriptionForDisplay, dataField] });

            // 收集唯一ID和对应的Meaning
            if (id && id !== 'N/A') {
                // 如果这个ID还没有存储过，或者当前的meaning不为空，则更新
                if (!idMeaningMap.has(id) || meaning) {
                    idMeaningMap.set(id, meaning);
                }
            }
        }
    }

    // 渲染表格数据
    renderTable(data.rows.length);

    // 初始化列宽调整功能（必须在renderTable之后调用）
    initializeColumnResize();

    // 渲染左侧消息列表（唯一且按字典序）
    // idMeaningMap中已经只包含在can_definitions.json中定义的CAN ID
    const uniqueIds = Array.from(idMeaningMap.keys())
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    messageListEl.innerHTML = uniqueIds.map(id => {
        // 从can_definitions获取描述（优先），否则使用CSV中的meaning
        let description = idMeaningMap.get(id);
        const idLower = id.toLowerCase();

        // 尝试从canDefinitions中获取更详细的信息
        if (canDefinitions[idLower]) {
            const def = canDefinitions[idLower];
            if (typeof def === 'object' && def.description) {
                description = def.description;
            } else if (typeof def === 'string') {
                description = def;
            }
        } else {
            // 如果直接匹配失败，尝试通过dec字段匹配
            for (const key in canDefinitions) {
                const def = canDefinitions[key];
                if (typeof def === 'object' && def.dec === id) {
                    description = def.description;
                    break;
                }
            }
        }

        // 格式化显示：0xID - Description
        const displayId = '0x' + id.toUpperCase();
        const displayText = description ? `${displayId} - ${description}` : displayId;

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
        const columnWidths = ['280px', '120px', '80px', 'auto']; // Time, From->To, Id, Data
        tableHTML = filteredRows.map(item => {
            if (!item || !item.row) {
                return '';
            }

            // 获取行高亮样式
            const highlightStyle = getRowHighlightStyle(item.row);
            const rowStyle = highlightStyle ?
                `background-color: ${highlightStyle.backgroundColor || 'inherit'}; color: ${highlightStyle.textColor || 'inherit'};` : '';

            return `
                <tr style="${rowStyle}">
                    ${item.row.map((cell, colIndex) => {
                const width = columnWidths[colIndex] || 'auto';
                const cellStyle = highlightStyle && highlightStyle.textColor ?
                    `width: ${width}; color: ${highlightStyle.textColor};` :
                    `width: ${width}`;
                return `<td style="${cellStyle}" title="${escapeHtml(cell)}">${escapeHtml(cell)}</td>`;
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

    messageList.innerHTML = uniqueIds.map(id => {
        // 从can_definitions获取描述
        let description = '';
        const idLower = id.toLowerCase();

        // 尝试从canDefinitions中获取更详细的信息
        if (canDefinitions[idLower]) {
            const def = canDefinitions[idLower];
            if (typeof def === 'object' && def.description) {
                description = def.description;
            } else if (typeof def === 'string') {
                description = def;
            }
        } else {
            // 如果直接匹配失败，尝试通过dec字段匹配
            for (const key in canDefinitions) {
                const def = canDefinitions[key];
                if (typeof def === 'object' && def.dec === id) {
                    description = def.description;
                    break;
                }
            }
        }

        // 格式化显示：0xID - Description
        const displayId = '0x' + id.toUpperCase();
        const displayText = description ? `${displayId} - ${description}` : displayId;

        return `
        <div class="list-group-item list-group-item-action message-filter-item ${hiddenMessageIds.has(id) ? 'filtered' : ''}" data-message-id="${escapeHtml(id)}">
            <span class="message-status-icon"></span><span title="${escapeHtml(displayText)}">${escapeHtml(displayText)}</span>
        </div>
    `;
    }).join('');

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

    // 重新初始化列宽调整功能
    initializeColumnResize();
}

// 初始化列宽调整功能
function initializeColumnResize() {
    const table = document.getElementById('dataTable');
    if (!table) return;

    const headers = table.querySelectorAll('th');

    headers.forEach((header, index) => {
        const resizeHandle = header.querySelector('.resize-handle');
        if (!resizeHandle) return;

        // 如果已经初始化过，先移除旧的标记
        if (resizeHandle.dataset.initialized === 'true') {
            return;
        }

        // 标记为已初始化
        resizeHandle.dataset.initialized = 'true';

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

// 侧边栏拖拽调整宽度
function initSidebarResize() {
    const resizer = document.getElementById('sidebarResizer');
    const sidebar = document.getElementById('sidebarColumn');

    if (!resizer || !sidebar) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const deltaX = e.clientX - startX;
        const newWidth = Math.max(150, Math.min(500, startWidth + deltaX));
        sidebar.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

// 页面加载后初始化侧边栏拖拽
document.addEventListener('DOMContentLoaded', function () {
    initSidebarResize();
});
