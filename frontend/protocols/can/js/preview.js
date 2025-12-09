// 全局变量
let unifiedRows = []; // 保存统一视图数据
let hiddenMessageIds = new Set(); // 隐藏的消息ID集合
let canDefinitions = {}; // CAN消息定义
let nameDefinitions = {}; // Name字段到Id描述的映射
let rowHighlightConfig = { highlights: [] }; // 行高亮配置
let fromToMapping = { mappings: {}, separator: ' => ' }; // From->To映射配置
let dataParserConfig = {}; // CAN数据解析配置

// 加载CAN定义
async function loadCanDefinitions() {
    try {
        const response = await fetch('/config/can/definitions.json');
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

// 加载Name定义
async function loadNameDefinitions() {
    try {
        const response = await fetch('/config/can/name_definitions.json');
        if (response.ok) {
            nameDefinitions = await response.json();
        } else {
            console.warn('无法加载Name定义文件');
            nameDefinitions = {};
        }
    } catch (error) {
        console.warn('加载Name定义失败:', error);
        nameDefinitions = {};
    }
}

// 加载行高亮配置
async function loadRowHighlightConfig() {
    try {
        const response = await fetch('/config/can/row_highlight.json');
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

// 加载From->To映射配置
async function loadFromToMapping() {
    try {
        const response = await fetch('/config/can/from_to_mapping.json');
        if (response.ok) {
            fromToMapping = await response.json();
        } else {
            console.warn('无法加载From->To映射配置文件');
            fromToMapping = { mappings: {}, separator: ' => ' };
        }
    } catch (error) {
        console.warn('加载From->To映射配置失败:', error);
        fromToMapping = { rules: {}, separator: ' => ' };
    }
}

// 加载数据解析配置
async function loadDataParserConfig() {
    try {
        const response = await fetch('/config/can/data_parser.json');
        if (response.ok) {
            dataParserConfig = await response.json();
        } else {
            console.warn('无法加载数据解析配置文件');
            dataParserConfig = {};
        }
    } catch (error) {
        console.warn('加载数据解析配置失败:', error);
        dataParserConfig = {};
    }
}

// 解析按Name匹配的数据（如RTB信号）
function parseNameData(name) {
    if (!name) return null;

    const config = dataParserConfig[name];
    if (!config || config.matchBy !== 'name') return null;

    // 返回配置中的displayText
    return config.displayText || null;
}

// 解析CAN数据字节（按Z0-Z7 LSB-MSB顺序）
function parseCanData(canId, dataBytes) {
    if (!canId || !dataBytes) return null;

    const idLower = canId.toLowerCase();
    const config = dataParserConfig[idLower];
    if (!config || !config.bytes) return null;

    // 将数据字符串分割为字节数组
    const bytes = dataBytes.trim().split(/\s+/);
    if (bytes.length === 0) return null;

    const parsedFields = [];

    // 遍历配置的字节解析规则（按order字段排序，如果有的话）
    const byteRanges = Object.keys(config.bytes).sort((a, b) => {
        const orderA = config.bytes[a].order !== undefined ? config.bytes[a].order : 999;
        const orderB = config.bytes[b].order !== undefined ? config.bytes[b].order : 999;
        return orderA - orderB;
    });
    for (const byteRange of byteRanges) {
        const fieldConfig = config.bytes[byteRange];
        const fieldName = fieldConfig.name || byteRange;

        let startByte, endByte;
        if (byteRange.includes('-')) {
            const [start, end] = byteRange.split('-').map(Number);
            startByte = start;
            endByte = end;
        } else {
            startByte = endByte = parseInt(byteRange);
        }

        // 检查字节范围是否有效
        if (startByte >= bytes.length) continue;

        // 获取相关字节
        const relevantBytes = bytes.slice(startByte, Math.min(endByte + 1, bytes.length));
        const rawHex = relevantBytes.join(' ');

        let value = null;
        let displayValue = null;

        switch (fieldConfig.type) {
            case 'enum':
                // 单字节枚举值
                const enumKey = relevantBytes[0] ? relevantBytes[0].toLowerCase() : null;
                if (enumKey && fieldConfig.values && fieldConfig.values[enumKey]) {
                    displayValue = fieldConfig.values[enumKey];
                } else {
                    displayValue = rawHex;
                }
                break;

            case 'uint8':
                value = parseInt(relevantBytes[0], 16);
                if (fieldConfig.scale) value *= fieldConfig.scale;
                let uint8Str = fieldConfig.unit ? `${value}${fieldConfig.unit}` : `${value}`;
                displayValue = fieldName && fieldName !== byteRange ? `${fieldName} ${uint8Str}` : uint8Str;
                break;

            case 'uint16_le':
                // 小端序16位无符号整数
                if (relevantBytes.length >= 2) {
                    value = parseInt(relevantBytes[0], 16) + (parseInt(relevantBytes[1], 16) << 8);
                    if (fieldConfig.scale) {
                        const precision = fieldConfig.precision !== undefined ? fieldConfig.precision : 1;
                        value = (value * fieldConfig.scale).toFixed(precision);
                    }
                    let valueStr = fieldConfig.unit ? `${value}${fieldConfig.unit}` : `${value}`;
                    // 如果有字段名且不为空，添加前缀
                    displayValue = fieldName && fieldName !== byteRange ? `${fieldName} ${valueStr}` : valueStr;
                }
                break;

            case 'uint32_le':
                // 小端序32位无符号整数
                if (relevantBytes.length >= 4) {
                    value = parseInt(relevantBytes[0], 16) +
                        (parseInt(relevantBytes[1], 16) << 8) +
                        (parseInt(relevantBytes[2], 16) << 16) +
                        (parseInt(relevantBytes[3], 16) << 24);
                    if (fieldConfig.scale) value = (value * fieldConfig.scale).toFixed(2);
                    let valueStr = fieldConfig.unit ? `${value}${fieldConfig.unit}` : `${value}`;
                    // 如果有字段名且不为空，添加前缀
                    displayValue = fieldName && fieldName !== byteRange ? `${fieldName} ${valueStr}` : valueStr;
                }
                break;

            case 'uint24_le':
                // 小端序24位无符号整数（3字节）
                if (relevantBytes.length >= 3) {
                    value = parseInt(relevantBytes[0], 16) +
                        (parseInt(relevantBytes[1], 16) << 8) +
                        (parseInt(relevantBytes[2], 16) << 16);
                    if (fieldConfig.scale) {
                        const precision = fieldConfig.precision !== undefined ? fieldConfig.precision : 1;
                        value = (value * fieldConfig.scale).toFixed(precision);
                    }
                    let valueStr = fieldConfig.unit ? `${value}${fieldConfig.unit}` : `${value}`;
                    displayValue = fieldName && fieldName !== byteRange ? `${fieldName} ${valueStr}` : valueStr;
                }
                break;

            case 'float32_le':
                // 小端序32位浮点数
                if (relevantBytes.length >= 4) {
                    const buffer = new ArrayBuffer(4);
                    const view = new DataView(buffer);
                    for (let i = 0; i < 4; i++) {
                        view.setUint8(i, parseInt(relevantBytes[i], 16));
                    }
                    value = view.getFloat32(0, true); // true表示小端序
                    const precision = fieldConfig.precision || 2;
                    let floatStr = fieldConfig.unit ? `${value.toFixed(precision)}${fieldConfig.unit}` : `${value.toFixed(precision)}`;
                    displayValue = fieldName && fieldName !== byteRange ? `${fieldName} ${floatStr}` : floatStr;
                }
                break;

            case 'hex8':
                value = parseInt(relevantBytes[0], 16);
                // 支持 zeroText 和 nonZeroText 配置
                if (value === 0 && fieldConfig.zeroText) {
                    displayValue = fieldConfig.zeroText;
                } else if (value !== 0 && fieldConfig.nonZeroText) {
                    displayValue = fieldConfig.nonZeroText;
                } else {
                    displayValue = `0x${relevantBytes[0].toUpperCase()}`;
                }
                break;

            case 'hex16_le':
                if (relevantBytes.length >= 2) {
                    value = parseInt(relevantBytes[0], 16) + (parseInt(relevantBytes[1], 16) << 8);
                    displayValue = `0x${relevantBytes[1].toUpperCase()}${relevantBytes[0].toUpperCase()}`;
                }
                break;

            case 'hex32_le':
                if (relevantBytes.length >= 4) {
                    value = parseInt(relevantBytes[0], 16) +
                        (parseInt(relevantBytes[1], 16) << 8) +
                        (parseInt(relevantBytes[2], 16) << 16) +
                        (parseInt(relevantBytes[3], 16) << 24);
                    displayValue = `0x${relevantBytes[3].toUpperCase()}${relevantBytes[2].toUpperCase()}${relevantBytes[1].toUpperCase()}${relevantBytes[0].toUpperCase()}`;
                    if (fieldName && fieldName !== byteRange) {
                        displayValue = `${fieldName}: ${displayValue}`;
                    }
                }
                break;

            case 'bitfield':
                // 位字段解析：解析单字节中的多个位字段
                if (relevantBytes[0] && fieldConfig.fields) {
                    const byteValue = parseInt(relevantBytes[0], 16);
                    const fieldResults = [];

                    for (const field of fieldConfig.fields) {
                        const mask = ((1 << field.bits) - 1) << field.start;
                        const fieldValue = (byteValue & mask) >> field.start;

                        let fieldDisplay;
                        if (field.values && field.values[fieldValue.toString()]) {
                            fieldDisplay = field.values[fieldValue.toString()];
                        } else if (field.values && field.values[fieldValue]) {
                            fieldDisplay = field.values[fieldValue];
                        } else {
                            fieldDisplay = fieldValue.toString();
                        }

                        if (field.name) {
                            fieldResults.push(`${field.name}:${fieldDisplay}`);
                        } else {
                            fieldResults.push(fieldDisplay);
                        }
                    }

                    displayValue = fieldResults.join(' - ');
                    value = parseInt(relevantBytes[0], 16);
                }
                break;

            case 'ascii':
                // 将字节转换为ASCII字符串
                if (relevantBytes.length > 0) {
                    const asciiChars = relevantBytes
                        .map(hex => parseInt(hex, 16))
                        .filter(code => code >= 32 && code <= 126) // 只保留可打印字符
                        .map(code => String.fromCharCode(code))
                        .join('');
                    if (asciiChars.length > 0) {
                        displayValue = fieldName && fieldName !== byteRange ? `${fieldName}: "${asciiChars}"` : `"${asciiChars}"`;
                    }
                }
                break;

            default:
                displayValue = rawHex;
        }

        // 如果配置了 hideIfZero 且值为0，则不显示该字段
        if (fieldConfig.hideIfZero && (value === 0 || value === null)) {
            continue;
        }

        if (displayValue !== null) {
            parsedFields.push(displayValue);
        }
    }

    return parsedFields.length > 0 ? parsedFields.join(' - ') : null;
}

// 根据Name字段转换From->To显示
function transformFromTo(name, source, target) {
    const rules = fromToMapping.rules || {};
    const separator = fromToMapping.separator || ' => ';
    const defaultFrom = fromToMapping.defaultFrom || source || 'Unknown';
    const defaultTo = fromToMapping.defaultTo || target || 'Unknown';

    // 根据Name字段查找匹配的规则
    if (name && rules[name]) {
        const rule = rules[name];
        const from = rule.from || defaultFrom;
        const to = rule.to || defaultTo;
        return `${from}${separator}${to}`;
    }

    // 如果没有匹配的规则，使用原始的Source和Target
    return `${source || defaultFrom}${separator}${target || defaultTo}`;
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

// 表格样式配置
let tableStyleConfig = {
    table: {
        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
        fontSize: "13px",
        rowOddBackground: "#ffffff",
        rowEvenBackground: "#f0f4f8",
        rowHoverBackground: "#e8f4fc",
        rowBorderColor: "#dee2e6"
    }
};

// 加载表格样式配置
async function loadTableStyleConfig() {
    try {
        const response = await fetch('/protocols/can/config/table_style_config.json');
        if (response.ok) {
            tableStyleConfig = await response.json();
            applyTableStyles();
        } else {
            console.warn('无法加载表格样式配置文件，使用默认样式');
        }
    } catch (error) {
        console.warn('加载表格样式配置失败:', error);
    }
}

// 应用表格样式
function applyTableStyles() {
    const style = tableStyleConfig.table;
    if (!style) return;

    // 创建或更新动态样式
    let styleEl = document.getElementById('dynamicTableStyle');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'dynamicTableStyle';
        document.head.appendChild(styleEl);
    }

    styleEl.textContent = `
        /* 动态表格样式 - 来自配置文件 */
        #dataTable tbody td {
            font-family: ${style.fontFamily};
            font-size: ${style.fontSize};
        }
        
        #dataTable tbody td:first-child {
            letter-spacing: -0.5px;
            white-space: nowrap;
        }

        #dataTable tbody tr:nth-child(odd) {
            background-color: ${style.rowOddBackground};
        }

        #dataTable tbody tr:nth-child(even) {
            background-color: ${style.rowEvenBackground};
        }

        #dataTable tbody tr {
            border-bottom: 1px solid ${style.rowBorderColor};
        }

        #dataTable tbody tr:hover {
            background-color: ${style.rowHoverBackground} !important;
        }
    `;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async function () {
    // 先加载所有配置
    await Promise.all([loadCanDefinitions(), loadNameDefinitions(), loadRowHighlightConfig(), loadFromToMapping(), loadDataParserConfig(), loadTableStyleConfig()]);
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


    // 统一列映射：#, Time, From->To, Id, Data, Description
    const unifiedHeaders = ['#', 'Time', 'From->To', 'Id', 'Data', 'Description'];
    const columnWidths = ['50px', '200px', '180px', '300px', '150px', 'auto']; // #, Time, From->To, Id, Data, Description
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

    // 辅助函数：根据ID获取description
    const getDescriptionById = (id) => {
        if (!id || id === 'N/A') {
            return id;
        }

        // 首先检查nameDefinitions（用于RTB等非CAN消息）
        if (nameDefinitions.definitions && nameDefinitions.definitions[id]) {
            const def = nameDefinitions.definitions[id];
            if (def.description) {
                return def.description;
            }
        }

        const idLower = id.toLowerCase();

        // 尝试直接通过hex匹配canDefinitions
        if (canDefinitions[idLower]) {
            const def = canDefinitions[idLower];
            if (typeof def === 'object' && def.description) {
                return def.description;
            } else if (typeof def === 'string') {
                return def;
            }
        }

        // 尝试通过dec字段匹配canDefinitions
        for (const key in canDefinitions) {
            const def = canDefinitions[key];
            if (typeof def === 'object' && def.dec === id) {
                return def.description || id;
            }
        }

        return id; // 如果找不到description，返回原始ID
    };

    // 辅助函数：检查ID是否应该显示（在任一定义文件中存在）
    const isIdInDefinitions = (id) => {
        // 忽略N/A
        if (!id || id === 'N/A') {
            return false;
        }

        // 检查nameDefinitions
        if (nameDefinitions.definitions && nameDefinitions.definitions[id]) {
            return true;
        }

        // 如果canDefinitions为空对象且nameDefinitions也为空，则接受所有ID（向后兼容）
        if (Object.keys(canDefinitions).length === 0 &&
            (!nameDefinitions.definitions || Object.keys(nameDefinitions.definitions).length === 0)) {
            return true;
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

    // 生成统一视图数据
    const maxRows = Math.min(data.rows.length, 300);
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

        const fromTo = transformFromTo(name, source, target);
        const id = parsedId || name || 'N/A';
        const dataField = parsedData || buffer || '';

        // 只添加在can_definitions中定义的ID的行
        if (isIdInDefinitions(id)) {
            // 获取description用于显示，原始id用于过滤
            const description = getDescriptionById(id);
            // 格式化Id列显示：
            // - 对于十六进制CAN ID：显示 "0xID - Description"
            // - 对于非十六进制ID（如RTB消息）：只显示 description
            const isHexId = /^[0-9a-fA-F]+$/.test(id);
            let idColumnDisplay;
            if (isHexId) {
                const formattedId = '0x' + id.toString().toUpperCase();
                idColumnDisplay = description && description !== id ? `${formattedId} - ${description}` : formattedId;
            } else {
                // 非十六进制ID，只显示description
                idColumnDisplay = description || id;
            }

            // 解析数据含义，放到单独的Description列
            let descriptionField = '';
            if (parsedData && parsedId) {
                // 尝试解析CAN数据
                const parsedMeaning = parseCanData(parsedId, parsedData);
                if (parsedMeaning) {
                    descriptionField = parsedMeaning;
                }
            } else if (name) {
                // 尝试按Name解析（用于RTB等信号）
                const nameMeaning = parseNameData(name);
                if (nameMeaning) {
                    descriptionField = nameMeaning;
                }
            }

            unifiedRows.push({ id: id, lineNumber: i + 2, row: [time, fromTo, idColumnDisplay, dataField, descriptionField] });

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
    // 收集显示ID（支持virtualId合并显示）
    const displayIdMap = new Map(); // displayId -> { ids: Set, description: string }

    Array.from(idMeaningMap.keys()).forEach(id => {
        let displayId = id;
        let description = idMeaningMap.get(id);

        // 检查nameDefinitions是否有virtualId
        if (nameDefinitions.definitions && nameDefinitions.definitions[id]) {
            const def = nameDefinitions.definitions[id];
            if (def.virtualId !== undefined) {
                displayId = def.virtualId;
                description = def.description;
            }
        }

        // 检查canDefinitions
        const idLower = id.toLowerCase();
        if (canDefinitions[idLower]) {
            const def = canDefinitions[idLower];
            if (typeof def === 'object' && def.description) {
                description = def.description;
            } else if (typeof def === 'string') {
                description = def;
            }
        } else {
            for (const key in canDefinitions) {
                const def = canDefinitions[key];
                if (typeof def === 'object' && def.dec === id) {
                    description = def.description;
                    break;
                }
            }
        }

        // 合并到displayIdMap
        if (!displayIdMap.has(displayId)) {
            displayIdMap.set(displayId, { ids: new Set(), description: description });
        }
        displayIdMap.get(displayId).ids.add(id);
    });

    // 按显示ID排序
    const sortedDisplayIds = Array.from(displayIdMap.keys())
        .sort((a, b) => a.toString().localeCompare(b.toString(), undefined, { sensitivity: 'base' }));

    messageListEl.innerHTML = sortedDisplayIds.map(displayId => {
        const info = displayIdMap.get(displayId);
        const description = info.description;
        const originalIds = Array.from(info.ids);

        // 格式化显示：0xID - Description
        const formattedId = '0x' + displayId.toString().toUpperCase();
        const displayText = description ? `${formattedId} - ${description}` : formattedId;

        // 检查是否所有关联的原始ID都被隐藏
        const isFiltered = originalIds.every(id => hiddenMessageIds.has(id));

        return `
        <div class="list-group-item list-group-item-action message-filter-item ${isFiltered ? 'filtered' : ''}" data-message-id="${escapeHtml(originalIds.join(','))}" data-display-id="${escapeHtml(displayId)}">
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
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">没有数据</td></tr>';
        return;
    }

    // 过滤数据
    const filteredRows = unifiedRows.filter(item => !hiddenMessageIds.has(item.id));

    // 渲染表格数据
    let tableHTML = '';
    if (filteredRows.length === 0) {
        tableHTML = `<tr><td colspan="6" style="text-align: center; color: #999;">没有数据</td></tr>`;
    } else {
        const columnWidths = ['50px', '230px', '180px', '300px', '200px', 'auto']; // #, Time, From->To, Id, Data, Description
        tableHTML = filteredRows.map(item => {
            if (!item || !item.row) {
                return '';
            }

            // 获取行高亮样式
            const highlightStyle = getRowHighlightStyle(item.row);
            const rowStyle = highlightStyle ?
                `background-color: ${highlightStyle.backgroundColor || 'inherit'}; color: ${highlightStyle.textColor || 'inherit'};` : '';

            // 构建带行号的行数据
            const rowWithLineNumber = [item.lineNumber, ...item.row];

            return `
                <tr style="${rowStyle}">
                    ${rowWithLineNumber.map((cell, colIndex) => {
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

    // 若总数超过300，添加提示
    if (totalRows > 300) {
        const hiddenCount = unifiedRows.length - filteredRows.length;
        tableHTML += `<tr><td colspan="6" style="text-align: center; font-style: italic; color: #666;">显示前300行，共${totalRows}行数据${hiddenCount > 0 ? ` (已隐藏 ${hiddenCount} 行)` : ''}</td></tr>`;
    }

    // 一次性设置innerHTML
    tableBody.innerHTML = tableHTML;
}

// 切换消息过滤（支持逗号分隔的多个ID）
function toggleMessageFilter(messageIdStr) {
    // 解析逗号分隔的ID列表
    const messageIds = messageIdStr.split(',').map(id => id.trim()).filter(id => id);

    // 检查是否所有ID都被隐藏
    const allHidden = messageIds.every(id => hiddenMessageIds.has(id));

    // 切换所有关联的ID
    messageIds.forEach(id => {
        if (allHidden) {
            hiddenMessageIds.delete(id);
        } else {
            hiddenMessageIds.add(id);
        }
    });

    // 更新UI
    const messageList = document.getElementById('messageList');
    if (!messageList || !unifiedRows || unifiedRows.length === 0) {
        return;
    }

    // 重新构建displayIdMap（与showPreview中相同的逻辑）
    const displayIdMap = new Map();
    const allIds = Array.from(new Set(unifiedRows.map(item => item.id)));

    allIds.forEach(id => {
        let displayId = id;
        let description = '';

        // 检查nameDefinitions是否有virtualId
        if (nameDefinitions.definitions && nameDefinitions.definitions[id]) {
            const def = nameDefinitions.definitions[id];
            if (def.virtualId !== undefined) {
                displayId = def.virtualId;
                description = def.description;
            }
        }

        // 检查canDefinitions
        const idLower = id.toLowerCase();
        if (canDefinitions[idLower]) {
            const def = canDefinitions[idLower];
            if (typeof def === 'object' && def.description) {
                description = def.description;
            } else if (typeof def === 'string') {
                description = def;
            }
        } else {
            for (const key in canDefinitions) {
                const def = canDefinitions[key];
                if (typeof def === 'object' && def.dec === id) {
                    description = def.description;
                    break;
                }
            }
        }

        if (!displayIdMap.has(displayId)) {
            displayIdMap.set(displayId, { ids: new Set(), description: description });
        }
        displayIdMap.get(displayId).ids.add(id);
    });

    // 按显示ID排序
    const sortedDisplayIds = Array.from(displayIdMap.keys())
        .sort((a, b) => a.toString().localeCompare(b.toString(), undefined, { sensitivity: 'base' }));

    messageList.innerHTML = sortedDisplayIds.map(displayId => {
        const info = displayIdMap.get(displayId);
        const description = info.description;
        const originalIds = Array.from(info.ids);

        // 格式化显示
        const formattedId = '0x' + displayId.toString().toUpperCase();
        const displayText = description ? `${formattedId} - ${description}` : formattedId;

        // 检查是否所有关联的原始ID都被隐藏
        const isFiltered = originalIds.every(id => hiddenMessageIds.has(id));

        return `
        <div class="list-group-item list-group-item-action message-filter-item ${isFiltered ? 'filtered' : ''}" data-message-id="${escapeHtml(originalIds.join(','))}" data-display-id="${escapeHtml(displayId)}">
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
