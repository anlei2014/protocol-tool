// 统计图页面 - JavaScript 逻辑

// 全局变量
let hurChart = null;
let rawData = [];
let hurDataPoints = [];

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async function () {
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

    // 设置返回按钮
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.href = `/can/preview.html?file=${filename}&protocol=${protocol}`;
    }

    // 设置文件名显示
    const fileNameEl = document.getElementById('fileName');
    if (fileNameEl) {
        fileNameEl.textContent = filename.substring(0, 20) + (filename.length > 20 ? '...' : '');
    }

    // 加载数据
    await loadData(filename, protocol);

    // 绑定事件
    document.getElementById('chartTypeSelect').addEventListener('change', updateChart);
    document.getElementById('refreshBtn').addEventListener('click', () => loadData(filename, protocol));
});

// 加载数据
async function loadData(filename, protocol) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const dataInfo = document.getElementById('dataInfo');

    console.log('开始加载数据:', filename, protocol);

    try {
        if (loadingOverlay) {
            loadingOverlay.classList.remove('d-none');
            loadingOverlay.classList.add('d-flex');
        }

        const apiUrl = `/api/parse/${filename}?protocol=${protocol}`;
        console.log('API URL:', apiUrl);

        const response = await fetch(apiUrl);
        console.log('API 响应状态:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('API 响应:', result.success, '数据行数:', result.data?.rows?.length);

        if (result.success) {
            rawData = result.data;
            processHURData();

            if (hurDataPoints.length > 0) {
                dataInfo.textContent = `${hurDataPoints.length} 个数据点`;
                dataInfo.className = 'badge bg-success';
                createChart();
            } else {
                dataInfo.textContent = '未找到 0x2CF 数据';
                dataInfo.className = 'badge bg-warning';
                showMessage('未找到 0x2CF (Reply Thermal State) 消息数据', 'warning');
            }
        } else {
            showMessage('加载数据失败: ' + result.message, 'error');
            dataInfo.textContent = '加载失败';
            dataInfo.className = 'badge bg-danger';
        }
    } catch (error) {
        console.error('加载数据失败:', error);
        showMessage('加载数据失败: ' + error.message, 'error');
        if (dataInfo) {
            dataInfo.textContent = '加载失败';
            dataInfo.className = 'badge bg-danger';
        }
    } finally {
        console.log('加载完成，隐藏加载状态');
        if (loadingOverlay) {
            // 移除 d-flex 类并设置 display:none，确保隐藏
            loadingOverlay.classList.remove('d-flex');
            loadingOverlay.classList.add('d-none');
        }
    }
}

// 处理 HUR 数据
function processHURData() {
    hurDataPoints = [];

    if (!rawData || !rawData.rows || !rawData.headers) return;

    // 获取列索引（与 preview.js 保持一致）
    const headerIndex = (name) => {
        const idx = rawData.headers.findIndex(h => (h || '').toString().toLowerCase() === name.toLowerCase());
        return idx >= 0 ? idx : -1;
    };

    const idxTime = headerIndex('Time');
    const idxBuffer = headerIndex('Buffer');

    if (idxBuffer < 0) {
        console.warn('未找到 Buffer 列');
        return;
    }

    rawData.rows.forEach(row => {
        if (!row) return;

        const timeField = idxTime >= 0 ? (row[idxTime] || '') : '';
        const bufferField = row[idxBuffer] || '';

        // 解析 Buffer: 形如 string=2cf:8:[11 80 f2 aa 47 c8 16 00]
        const bufferMatch = bufferField.match(/^\s*string=([0-9a-fA-F]+):\d+:\[(.*?)\]\s*$/);
        if (!bufferMatch) return;

        const parsedId = bufferMatch[1].toLowerCase();
        const dataBytes = bufferMatch[2].trim().split(/\s+/);

        // 检查是否是 0x2CF 消息
        if (parsedId !== '2cf') return;

        // 从数据字节中解析 HUR 值
        // HUR 在字节 5-6 (索引 5 和 6)，uint16_le，scale=0.01
        if (dataBytes.length < 7) return;

        const hurValue = parseHURFromBuffer(bufferField);

        if (hurValue !== null) {
            hurDataPoints.push({
                time: timeField,
                value: hurValue
            });
        }
    });

    // 按时间排序
    hurDataPoints.sort((a, b) => a.time.localeCompare(b.time));

    console.log(`找到 ${hurDataPoints.length} 个 0x2CF HUR 数据点`);
}

// 从 Buffer 解析 HUR 值
function parseHURFromBuffer(buffer) {
    try {
        // Buffer 格式: "string=2cf:8:[11 80 f2 aa 47 c8 16 00]"
        const match = buffer.match(/\[([0-9a-fA-F\s]+)\]/);
        if (!match) return null;

        const bytes = match[1].trim().split(/\s+/);
        if (bytes.length < 7) return null;

        // HUR 在字节 5-6 (索引 5 和 6)，uint16_le，scale=0.01
        const byte5 = parseInt(bytes[5], 16);
        const byte6 = parseInt(bytes[6], 16);

        if (isNaN(byte5) || isNaN(byte6)) return null;

        // Little-endian: 低字节在前
        const rawValue = byte5 | (byte6 << 8);
        const hurValue = rawValue * 0.01;

        return hurValue;
    } catch (e) {
        console.error('解析 HUR 失败:', e);
        return null;
    }
}

// 创建图表
function createChart() {
    const ctx = document.getElementById('hurChart').getContext('2d');
    const chartType = document.getElementById('chartTypeSelect').value;

    // 准备数据
    const labels = hurDataPoints.map(p => formatTime(p.time));
    const data = hurDataPoints.map(p => p.value);

    // 销毁旧图表
    if (hurChart) {
        hurChart.destroy();
    }

    // 创建新图表
    hurChart = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels,
            datasets: [{
                label: 'HUR (%)',
                data: data,
                borderColor: '#6022A6',
                backgroundColor: chartType === 'line' ? 'rgba(96, 34, 166, 0.1)' : 'rgba(96, 34, 166, 0.6)',
                borderWidth: 2,
                fill: chartType === 'line',
                tension: 0.1,
                pointRadius: chartType === 'line' ? 2 : 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#6022A6',
                pointBorderColor: '#fff',
                pointBorderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                title: {
                    display: true,
                    text: '0x2CF - Reply Thermal State - HUR 随时间变化',
                    font: {
                        size: 16,
                        weight: 'bold'
                    },
                    color: '#333'
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `HUR: ${context.parsed.y.toFixed(2)}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: '时间',
                        font: {
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        maxTicksLimit: 15,
                        maxRotation: 45
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: 'HUR (%)',
                        font: {
                            weight: 'bold'
                        }
                    },
                    min: 0,
                    max: 100
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

// 更新图表类型
function updateChart() {
    if (hurDataPoints.length > 0) {
        createChart();
    }
}

// 格式化时间（简化显示）
function formatTime(timeStr) {
    // 假设时间格式为 "2025-11-24 17:03:48.853.257"
    // 只显示 HH:MM:SS.mmm
    const parts = timeStr.split(' ');
    if (parts.length >= 2) {
        const timePart = parts[1];
        // 截取到毫秒
        const timeComponents = timePart.split('.');
        if (timeComponents.length >= 2) {
            return `${timeComponents[0]}.${timeComponents[1]}`;
        }
        return timePart;
    }
    return timeStr;
}

// 显示消息提示
function showMessage(message, type = 'info') {
    const toastEl = document.getElementById('messageToast');
    const toastBody = document.getElementById('toastBody');
    const toastIcon = document.getElementById('toastIcon');

    if (!toastEl || !toastBody || !toastIcon) return;

    toastBody.textContent = message;

    toastIcon.className = 'me-2';
    switch (type) {
        case 'success':
            toastIcon.classList.add('bi', 'bi-check-circle-fill', 'text-success');
            break;
        case 'error':
            toastIcon.classList.add('bi', 'bi-exclamation-triangle-fill', 'text-danger');
            break;
        case 'warning':
            toastIcon.classList.add('bi', 'bi-exclamation-circle-fill', 'text-warning');
            break;
        case 'info':
        default:
            toastIcon.classList.add('bi', 'bi-info-circle-fill', 'text-primary');
            break;
    }

    const toast = new bootstrap.Toast(toastEl);
    toast.show();
}
