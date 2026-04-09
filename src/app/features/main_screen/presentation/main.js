const vscode = acquireVsCodeApi();

// State
let allContainers = [];
let allServices = [];
let rawRecentItems = [];
let originalLogs = '';
let isClientConnected = false;


// DOM Elements
const btnRefresh = document.getElementById('btn-refresh');
const dockerList = document.getElementById('docker-list');
const swarmList = document.getElementById('swarm-list');
const recentList = document.getElementById('recent-list');

const connectionStatus = document.getElementById('connection-status');
const swarmStatus = document.getElementById('swarm-status');
const containerSearch = document.getElementById('container-search');
const swarmSearch = document.getElementById('swarm-search');
const recentSearch = document.getElementById('recent-search');
const logsContent = document.getElementById('logs-content');
const logsTitle = document.getElementById('logs-title');
const logsFilter = document.getElementById('logs-filter');
const logsSection = document.getElementById('logs-section');
const intervalSelect = document.getElementById('log-interval-select');
const btnMaximize = document.getElementById('btn-maximize-logs');
const maximizeIcon = document.getElementById('maximize-icon');
const mainPanels = document.querySelector('vscode-panels');
const tabContainers = document.getElementById('tab-containers');
const tabSwarm = document.getElementById('tab-swarm');
const viewContainers = document.getElementById('view-containers');
const viewSwarm = document.getElementById('view-swarm');

// Logs Actions
document.getElementById('btn-copy-logs').onclick = () => {
    const content = logsContent.innerText;
    if (content) {
        navigator.clipboard.writeText(content);
    }
};

document.getElementById('btn-clear-logs').onclick = () => {
     originalLogs = '';
    logsContent.innerHTML = highlightLogs('Logs limpos.');
};

btnMaximize.onclick = () => {
    const isMaximized = logsSection.classList.toggle('maximized');
    updateMaximizeIcon(isMaximized);
};

function updateMaximizeIcon(isMaximized) {
    maximizeIcon.className = isMaximized ? 'codicon codicon-screen-normal' : 'codicon codicon-screen-full';
}

// Init Icon State
updateMaximizeIcon(logsSection.classList.contains('maximized'));

logsFilter.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    applyLogsFilter(term);
});

function applyLogsFilter(term) {
    const intervalSelect = document.getElementById('log-interval-select');
    const intervalMinutes = parseInt(intervalSelect?.value || '5');

    let filteredText = originalLogs;
    if (term) {
        const lines = originalLogs.split('\n');
        filteredText = lines.filter(line => line.toLowerCase().includes(term)).join('\n');
    }

    if (!filteredText) {
        logsContent.innerHTML = term 
            ? '<div class="empty-small" style="padding: 20px; text-align: center; opacity: 0.5;">Nenhum resultado para o filtro.</div>'
            : highlightLogs('Aguardando logs...');
        return;
    }

    const groups = groupLogsByTime(filteredText, intervalMinutes);
    logsContent.innerHTML = renderGroupedLogs(groups);
    logsContent.scrollTop = logsContent.scrollHeight;
}

function highlightLogs(text) {
    if (!text) return '';
    
    // Escapar HTML para evitar XSS e quebra de tags
    let escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // Regras de destaque
    const rules = [
        { pattern: /\b(ERROR|ERR|ERR!|CRITICAL|CRIT|FATAL|Exception|Error:)\b/gi, class: 'log-error' },
        { pattern: /\b(WARNING|WARN|WARN!)\b/gi, class: 'log-warning' },
        { pattern: /\b(INFO|STDOUT)\b/gi, class: 'log-info' },
        { pattern: /\b(DEBUG|TRACE)\b/gi, class: 'log-debug' },
        { pattern: /\b(SUCCESS|OK|CONNECTED|UP|RUNNING|STARTING|STARTED)\b/gi, class: 'log-success' },
        // Timestamps (Padrão simples para 2024-..., 09:12:33, etc)
        { pattern: /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/g, class: 'log-timestamp' },
        { pattern: /(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/g, class: 'log-timestamp' }
    ];

    let highlighted = escaped;
    rules.forEach(rule => {
        highlighted = highlighted.replace(rule.pattern, match => `<span class="${rule.class}">${match}</span>`);
    });

    return highlighted;
}

function renderGroupedLogs(groups) {
    if (!groups || groups.length === 0) {
         return '<div class="empty-small" style="padding: 20px; text-align: center; opacity: 0.5;">Sem logs para exibir.</div>';
    }

    return groups.map((group, idx) => {
        const timeStr = group.startTime ? new Date(group.startTime).toLocaleTimeString() : 'Início';
        return `
            <div class="log-group-separator">
                <vscode-button appearance="icon" title="Copiar este intervalo" onclick="copyLogSegment(${idx})">
                    <span class="codicon codicon-copy"></span>
                </vscode-button>
                <span class="log-group-time">${timeStr}</span>
                <div class="separator-line"></div>
            </div>
            <div class="log-segment-content" id="log-segment-${idx}">${highlightLogs(group.lines.join('\n'))}</div>
        `;
    }).join('');
}

window.copyLogSegment = (idx) => {
    const segment = document.getElementById(`log-segment-${idx}`);
    if (segment) {
        navigator.clipboard.writeText(segment.innerText);
    }
};

function groupLogsByTime(logs, intervalMinutes) {
    if (!logs) return [];
    const lines = logs.split('\n');
    const groups = [];
    let currentGroup = { startTime: null, lines: [] };
    const intervalMs = intervalMinutes * 60 * 1000;

    lines.forEach(line => {
        if (!line.trim()) return;
        
        const match = line.match(/^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/);
        let timestamp = null;
        if (match) {
            timestamp = new Date(match[1]).getTime();
        }

        if (timestamp) {
            if (!currentGroup.startTime) {
                currentGroup.startTime = timestamp;
                currentGroup.lines.push(line);
            } else if (Math.abs(timestamp - currentGroup.startTime) < intervalMs) {
                currentGroup.lines.push(line);
            } else {
                groups.push(currentGroup);
                currentGroup = { startTime: timestamp, lines: [line] };
            }
        } else {
            currentGroup.lines.push(line);
        }
    });

    if (currentGroup.lines.length > 0) {
        groups.push(currentGroup);
    }

    return groups;
}

// Event listener para mudança de intervalo
document.addEventListener('change', (e) => {
    if (e.target.id === 'log-interval-select') {
        applyLogsFilter(logsFilter.value);
    }
});

// Message Listener
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'dockerList':
            allContainers = message.data || [];
            renderDockerList(allContainers, message.error);
            break;
        case 'swarmList':
            allServices = message.data || [];
            renderSwarmList(allServices, message.error);
            break;
        case 'serviceTasks':
            renderServiceTasks(message.serviceId, message.data, message.error);
            break;
        case 'workerLogs':
        case 'containerLogs':
            originalLogs = message.error ? `Erro: ${message.error}` : (message.data || '');
            if (message.metadata) {
                renderLogsMetadata(message.metadata);
                const serverInfo = message.metadata.serverAlias 
                    ? `<b>${message.metadata.serverAlias}</b> (${message.metadata.serverHost})`
                    : `<b>${message.metadata.serverHost}</b>`;
                logsTitle.innerHTML = `<span style="opacity: 0.7;">Logs:</span> ${message.metadata.name} <span style="margin: 0 15px; opacity: 0.3;">|</span> <small style="font-weight: 500; font-size: 0.75rem; text-transform: none; letter-spacing: normal;">Servidor: ${serverInfo}</small>`;
            }
            applyLogsFilter(logsFilter.value);
            break;
        case 'recentList':
            isClientConnected = message.isConnected;
            renderRecentList(message.data || []);
            updateTabs();
            break;
        case 'showTab':
            if (mainPanels) {
                mainPanels.activeid = message.tabId;
                mainPanels.setAttribute('activeid', message.tabId);
            }
            break;

    }
});

function renderLogsMetadata(meta) {
    const banner = document.getElementById('logs-info-banner');
    if (!banner) return;
    
    banner.classList.remove('hidden');
    banner.innerHTML = `
        <div class="info-item">
            <span class="info-label">TIPO</span>
            <span class="info-value">${meta.type}</span>
        </div>
        <div class="info-item" title="${meta.id}">
            <span class="info-label">ID</span>
            <span class="info-value">${meta.id.substring(0, 8)}</span>
        </div>
        <div class="info-item" title="${meta.image}">
            <span class="info-label">IMAGEM</span>
            <span class="info-value">${meta.image.length > 30 ? meta.image.substring(0, 30) + '...' : meta.image}</span>
        </div>
        <div class="info-item">
            <span class="info-label">STATUS</span>
            <span class="info-value">${meta.status}</span>
        </div>
        ${meta.node ? `
        <div class="info-item">
            <span class="info-label">NODE</span>
            <span class="info-value">${meta.node}</span>
        </div>` : ''}
    `;
}

function showConfirmation(title, body, confirmText, onConfirm) {
    const container = document.getElementById('modal-container');
    container.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-content">
                <div class="modal-title">${title}</div>
                <div class="modal-body">${body}</div>
                <div class="modal-actions">
                    <vscode-button appearance="secondary" id="modal-cancel">Cancelar</vscode-button>
                    <vscode-button appearance="primary" id="modal-confirm">${confirmText}</vscode-button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modal-cancel').onclick = () => container.innerHTML = '';
    document.getElementById('modal-confirm').onclick = () => {
        onConfirm();
        container.innerHTML = '';
    };
}
function updateTabs() {
    if (isClientConnected) {
        tabContainers?.classList.remove('hidden-tab');
        tabSwarm?.classList.remove('hidden-tab');
        viewContainers?.classList.remove('hidden');
        viewSwarm?.classList.remove('hidden');
    } else {
        tabContainers?.classList.add('hidden-tab');
        tabSwarm?.classList.add('hidden-tab');
        viewContainers?.classList.add('hidden');
        viewSwarm?.classList.add('hidden');
        
        // Se a aba ativa for uma das que foram escondidas, volta para a aba 'recentes'
        if (mainPanels && (mainPanels.activeid === 'tab-containers' || mainPanels.activeid === 'tab-swarm')) {
            mainPanels.activeid = 'tab-recent';
            mainPanels.setAttribute('activeid', 'tab-recent');
        }
    }
}




function renderDockerList(containers, error) {
    if (error) {
        connectionStatus.innerText = `Erro: ${error}`;
        connectionStatus.style.color = 'var(--vscode-errorForeground)';
        dockerList.innerHTML = `<div class="error-state">Falha ao obter containers: ${error}</div>`;
        return;
    }

    connectionStatus.innerText = containers.length > 0 ? 'Conectado' : 'Sem containers';
    connectionStatus.style.color = 'var(--vscode-charts-green)';

    if (containers.length === 0) {
        dockerList.innerHTML = '<div class="empty-state">Nenhum container encontrado.</div>';
        return;
    }

    dockerList.innerHTML = containers.map(container => `
        <div class="docker-card container-card" data-id="${container.id}">
            <div class="card-main">
                <div class="card-info">
                    <span class="container-name" title="${container.name}">${container.name}</span>
                    <span class="container-image" title="${container.image}">${container.image}</span>
                    <span class="status-pill container-status ${getStatusClass(container.status)}">${container.status}</span>
                </div>
                <div class="card-actions">
                    ${container.status.includes('Up') 
                        ? `<vscode-button appearance="icon" title="Parar" class="btn-stop btn-red" data-id="${container.id}" data-name="${container.name}">
                            <span class="codicon codicon-debug-stop"></span>
                           </vscode-button>`
                        : `<vscode-button appearance="icon" title="Iniciar" class="btn-start btn-green" data-id="${container.id}" data-name="${container.name}">
                            <span class="codicon codicon-debug-start"></span>
                           </vscode-button>`
                    }
                    <vscode-button appearance="icon" title="Reiniciar" class="btn-restart btn-blue" data-id="${container.id}" data-name="${container.name}">
                        <span class="codicon codicon-refresh"></span>
                    </vscode-button>
                    <vscode-button appearance="icon" title="Remover" class="btn-remove btn-red" data-id="${container.id}" data-name="${container.name}">
                        <span class="codicon codicon-trash"></span>
                    </vscode-button>
                </div>
            </div>
        </div>
    `).join('');

    // Re-attach listeners
    document.querySelectorAll('.btn-stop').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            showConfirmation('Parar Container', `Tem certeza que deseja parar o container <b>${name}</b>?`, 'Parar', () => {
                vscode.postMessage({ command: 'stopContainer', containerId: id });
            });
        };
    });
    document.querySelectorAll('.btn-start').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            showConfirmation('Iniciar Container', `Deseja iniciar o container <b>${name}</b>?`, 'Iniciar', () => {
                vscode.postMessage({ command: 'startContainer', containerId: id });
            });
        };
    });
    document.querySelectorAll('.btn-restart').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            showConfirmation('Reiniciar Container', `Deseja reiniciar o container <b>${name}</b>?`, 'Reiniciar', () => {
                vscode.postMessage({ command: 'restartContainer', containerId: id });
            });
        };
    });
    document.querySelectorAll('.btn-remove').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            showConfirmation('Remover Container', `<b>ATENÇÃO:</b> Esta ação removerá o container <b>${name}</b> permanentemente. Continuar?`, 'Remover', () => {
                vscode.postMessage({ command: 'removeContainer', containerId: id });
            });
        };
    });
    document.querySelectorAll('#docker-list .docker-card').forEach(card => {
        card.onclick = () => {
            const id = card.getAttribute('data-id');
            const name = card.querySelector('.container-name').innerText;
            showLogs(id, 'container', null, name);
        };
    });
}

function renderSwarmList(services, error) {
    if (error) {
        swarmStatus.innerText = `Erro: ${error}`;
        swarmStatus.style.color = 'var(--vscode-errorForeground)';
        swarmList.innerHTML = `<div class="error-state">${error}</div>`;
        return;
    }

    swarmStatus.innerText = services.length > 0 ? 'Cluster Ativo' : 'Sem serviços';
    swarmStatus.style.color = 'var(--vscode-charts-blue)';

    if (services.length === 0) {
        swarmList.innerHTML = '<div class="empty-state">Nenhum serviço encontrado.</div>';
        return;
    }

    swarmList.innerHTML = services.map(service => {
        const [current, target] = service.replicas.split('/');
        const isHealthy = current === target;
        return `
        <div class="docker-card service-card" id="service-${service.id}" data-id="${service.id}">
            <div class="card-main">
                <div class="card-info">
                    <span class="container-name" title="${service.name}">${service.name}</span>
                    <span class="container-image" title="${service.image}">${service.image}</span>
                    <div class="service-meta">
                        <span class="status-pill container-status ${isHealthy ? 'status-up' : 'status-down'}">${service.replicas} Replicas</span>
                        <span class="mode-tag">${service.mode}</span>
                    </div>
                </div>
                <div class="card-actions">
                    <vscode-button appearance="icon" title="Escalar" class="btn-scale btn-blue" data-name="${service.name}" data-current="${current}">
                        <span class="codicon codicon-unfold"></span>
                    </vscode-button>
                    <vscode-button appearance="icon" title="Reiniciar Serviço (Force Update)" class="btn-service-restart btn-blue" data-name="${service.name}">
                        <span class="codicon codicon-refresh"></span>
                    </vscode-button>
                    <vscode-button appearance="icon" title="Remover Serviço" class="btn-service-remove btn-red" data-name="${service.name}">
                        <span class="codicon codicon-trash"></span>
                    </vscode-button>
                    <span class="codicon codicon-chevron-down expand-icon"></span>
                </div>
            </div>
            <div class="service-tasks hidden" id="tasks-${service.id}"></div>
        </div>`;
    }).join('');

    document.querySelectorAll('.service-card').forEach(card => {
        card.onclick = (e) => {
            // Prevent expanding if clicking an action button
            if (e.target.closest('vscode-button')) return;

            const id = card.getAttribute('data-id');
            const tasksDiv = document.getElementById(`tasks-${id}`);
            const isExpanded = !tasksDiv.classList.contains('hidden');
            if (isExpanded) {
                tasksDiv.classList.add('hidden');
                card.querySelector('.expand-icon').classList.replace('codicon-chevron-up', 'codicon-chevron-down');
            } else {
                tasksDiv.classList.remove('hidden');
                tasksDiv.innerHTML = '<div class="loading-small">Carregando workers...</div>';
                card.querySelector('.expand-icon').classList.replace('codicon-chevron-down', 'codicon-chevron-up');
                vscode.postMessage({ command: 'getServiceTasks', serviceId: id });
            }
        };
    });

    document.querySelectorAll('.btn-scale').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const name = btn.getAttribute('data-name');
            const current = btn.getAttribute('data-current');
            
            showScaleDialog(name, current, (target) => {
                vscode.postMessage({ command: 'scaleService', serviceName: name, replicas: target });
            });
        };
    });

    document.querySelectorAll('.btn-service-restart').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const name = btn.getAttribute('data-name');
            showConfirmation('Reiniciar Serviço', `Deseja forçar a atualização (reiniciar) do serviço <b>${name}</b>?`, 'Reiniciar', () => {
                vscode.postMessage({ command: 'restartService', serviceName: name });
            });
        };
    });

    document.querySelectorAll('.btn-service-remove').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const name = btn.getAttribute('data-name');
            showConfirmation('Remover Serviço', `<b>CUIDADO:</b> Isso removerá completamente o serviço <b>${name}</b>. Continuar?`, 'Remover', () => {
                vscode.postMessage({ command: 'removeService', serviceName: name });
            });
        };
    });
}

function showScaleDialog(name, current, onConfirm) {
    const container = document.getElementById('modal-container');
    container.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-content">
                <div class="modal-title">Escalar Serviço</div>
                <div class="modal-body">
                    <p>Quantas réplicas deseja para <b>${name}</b>?</p>
                    <div style="margin-top: 15px;">
                        <vscode-text-field id="replicas-input" type="number" value="${current}" autofocus style="width: 100%;"></vscode-text-field>
                    </div>
                </div>
                <div class="modal-actions">
                    <vscode-button appearance="secondary" id="modal-cancel">Cancelar</vscode-button>
                    <vscode-button appearance="primary" id="modal-confirm">Escalar</vscode-button>
                </div>
            </div>
        </div>
    `;

    const input = document.getElementById('replicas-input');
    setTimeout(() => input?.focus(), 100);

    document.getElementById('modal-cancel').onclick = () => container.innerHTML = '';
    document.getElementById('modal-confirm').onclick = () => {
        const val = parseInt(input.value);
        if (!isNaN(val)) {
            onConfirm(val);
        }
        container.innerHTML = '';
    };
}

function renderServiceTasks(serviceId, tasks, error) {
    const tasksDiv = document.getElementById(`tasks-${serviceId}`);
    if (!tasksDiv) return;
    if (error) { tasksDiv.innerHTML = `<div class="error-small">${error}</div>`; return; }
    if (tasks.length === 0) { tasksDiv.innerHTML = '<div class="empty-small">Sem trabalhadores (tasks) ativos.</div>'; return; }

    tasksDiv.innerHTML = tasks.map(task => `
        <div class="worker-row" data-id="${task.id}" data-node="${task.node}">
            <div class="worker-info">
                <div class="worker-main">
                    <span class="worker-id" title="${task.id}">${task.name}</span>
                    <span class="worker-node"><span class="codicon codicon-server"></span> ${task.node}</span>
                </div>
                <div class="worker-status-line">
                    <span class="task-state ${task.current.includes('Running') ? 'state-running' : 'state-pending'}">${task.current}</span>
                    <span class="task-desired" style="opacity: 0.6;">Alvo: ${task.desired}</span>
                </div>
            </div>
            <div class="worker-actions">
                <vscode-button appearance="icon" title="Reiniciar Worker" class="btn-worker-restart btn-blue" data-id="${task.id}" data-name="${task.name}">
                    <span class="codicon codicon-refresh"></span>
                </vscode-button>
                <vscode-button appearance="icon" title="Ver Logs" class="btn-worker-logs" data-id="${task.id}" data-node="${task.node}">
                    <span class="codicon codicon-output"></span>
                </vscode-button>
                <vscode-button appearance="icon" title="Abrir Terminal" class="btn-worker-term" data-id="${task.id}" data-node="${task.node}">
                    <span class="codicon codicon-terminal"></span>
                </vscode-button>
            </div>
        </div>
    `).join('');

    tasksDiv.querySelectorAll('.worker-row').forEach(row => {
        row.onclick = (e) => {
            if (e.target.closest('vscode-button')) return;
            e.stopPropagation();
            const id = row.getAttribute('data-id');
            const node = row.getAttribute('data-node');
            const name = row.querySelector('.worker-id').innerText;
            showLogs(id, 'worker', node, name);
        };
    });

    tasksDiv.querySelectorAll('.btn-worker-restart').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            showConfirmation('Reiniciar Worker', `Deseja reiniciar este trabalhador (container) específico: <b>${name}</b>?<br><small>Isso reiniciará o container no nó em que ele reside.</small>`, 'Reiniciar', () => {
                vscode.postMessage({ command: 'restartContainer', containerId: id });
            });
        };
    });

    tasksDiv.querySelectorAll('.btn-worker-logs').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const node = btn.getAttribute('data-node');
            const row = btn.closest('.worker-row');
            const name = row.querySelector('.worker-id').innerText;
            showLogs(id, 'worker', node, name);
        };
    });

    tasksDiv.querySelectorAll('.btn-worker-term').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const node = btn.getAttribute('data-node');
            const row = btn.closest('.worker-row');
            const name = row.querySelector('.worker-id').innerText;
            vscode.postMessage({ command: 'openWorkerTerminal', taskId: id, node: node, workerName: name });
        };
    });
}

function showLogs(id, type, node = null, name = '') {
    if (mainPanels) {
        mainPanels.activeid = 'tab-logs';
        mainPanels.setAttribute('activeid', 'tab-logs');
    }

    
    if (logsFilter) {
        logsFilter.value = '';
    }
    
    logsTitle.innerText = `Logs: ${name || id}`;
    logsContent.innerHTML = highlightLogs(`Buscando logs de ${name || id}...`);
    
    if (type === 'container') {
        vscode.postMessage({ command: 'getContainerLogs', containerId: id, containerName: name });
        vscode.postMessage({ command: 'openContainerTerminal', containerId: id, containerName: name });
    } else {
        vscode.postMessage({ command: 'getWorkerLogs', taskId: id, workerName: name, node: node });
        vscode.postMessage({ command: 'openWorkerTerminal', taskId: id, node: node, workerName: name });
    }
}

function renderRecentList(recent) {
    if (!recentList) return;
    rawRecentItems = recent;

    if (recent.length === 0) {
        recentList.innerHTML = '<div class="empty-state">Nenhum acesso recente registrado.</div>';
        return;
    }

    // Grouping by server
    const grouped = {};
    recent.forEach(item => {
        if (!grouped[item.serverId]) {
            grouped[item.serverId] = {
                alias: item.serverAlias,
                host: item.serverHost,
                label: item.serverLabel,
                items: []
            };
        }
        grouped[item.serverId].items.push(item);
    });

    recentList.innerHTML = Object.keys(grouped).map(serverId => {
        const group = grouped[serverId];
        const displayLabel = group.alias 
            ? `<b>${group.alias}</b> <small style="opacity: 0.6; margin-left: 5px;">(${group.host})</small>` 
            : `<b>${group.host}</b>`;

        return `
            <div class="recent-server-group">
                <div class="server-group-header">
                    <span class="codicon codicon-server"></span>
                    <span>${displayLabel}</span>
                </div>
                <div class="server-group-items">
                    ${group.items.map(item => `
                        <div class="docker-card recent-card ${!isClientConnected ? 'disconnected-recent' : ''}" 
                             data-id="${item.id}" 
                             data-type="${item.type}" 
                             data-node="${item.node || ''}"
                             data-server-id="${item.serverId}">
                            <div class="card-main">
                                <div class="card-info">
                                    <span class="container-name">${item.name}</span>
                                    <div class="service-meta" style="margin-top: 4px;">
                                        <span class="type-tag">${item.type === 'container' ? 'Container' : 'Worker'}</span>
                                        ${item.node ? `<span class="worker-node"><span class="codicon codicon-server"></span> ${item.node}</span>` : ''}
                                    </div>
                                </div>
                                <div class="card-actions">
                                    <span class="codicon codicon-history"></span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.recent-card').forEach(card => {
        card.onclick = () => {
            const id = card.getAttribute('data-id');
            const type = card.getAttribute('data-type');
            const node = card.getAttribute('data-node');
            const serverId = card.getAttribute('data-server-id');
            const name = card.querySelector('.container-name').innerText;
            
            if (!isClientConnected) {
                vscode.postMessage({ 
                    command: 'connectAndShowRecent', 
                    serverId: serverId,
                    item: { id, type, node, name }
                });
            } else {
                showLogs(id, type, node || null, name);
            }
        };
    });
}

// Recent search
recentSearch.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = rawRecentItems.filter(item => 
        item.name.toLowerCase().includes(term) || 
        (item.serverLabel && item.serverLabel.toLowerCase().includes(term)) ||
        (item.serverAlias && item.serverAlias.toLowerCase().includes(term)) ||
        (item.serverHost && item.serverHost.toLowerCase().includes(term))
    );
    renderRecentList(filtered);
});



function getStatusClass(status) {
    if (status.includes('Up')) return 'status-up';
    if (status.includes('Exited')) return 'status-down';
    return 'status-other';
}

// Filter Logic
containerSearch.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allContainers.filter(c => 
        c.name.toLowerCase().includes(term) || c.image.toLowerCase().includes(term)
    );
    renderDockerList(filtered);
});

swarmSearch.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allServices.filter(s => 
        s.name.toLowerCase().includes(term) || s.image.toLowerCase().includes(term)
    );
    renderSwarmList(filtered);
});

// Refresh
if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
        vscode.postMessage({ command: 'refreshDocker' });
        vscode.postMessage({ command: 'refreshSwarm' });
    });
}

// Init
vscode.postMessage({ command: 'refreshDocker' });
vscode.postMessage({ command: 'refreshSwarm' });
