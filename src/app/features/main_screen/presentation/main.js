const vscode = acquireVsCodeApi();

// State
let allContainers = [];
let allServices = [];
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
const logsContent = document.getElementById('logs-content');
const logsTitle = document.getElementById('logs-title');
const logsFilter = document.getElementById('logs-filter');
const logsSection = document.getElementById('logs-section');
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
    logsContent.innerText = 'Logs limpos.';
};

btnMaximize.onclick = () => {
    const isMaximized = logsSection.classList.toggle('maximized');
    maximizeIcon.className = isMaximized ? 'codicon codicon-screen-normal' : 'codicon codicon-screen-full';
};

logsFilter.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    applyLogsFilter(term);
});

function applyLogsFilter(term) {
    if (!term) {
        logsContent.innerText = originalLogs;
    } else {
        const lines = originalLogs.split('\n');
        const filteredLines = lines.filter(line => line.toLowerCase().includes(term));
        logsContent.innerText = filteredLines.join('\n') || 'Nenhum resultado para o filtro.';
    }
    logsContent.scrollTop = logsContent.scrollHeight;
}

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
                    <span class="container-name">${container.name}</span>
                    <span class="container-image">${container.image}</span>
                    <span class="status-pill container-status ${getStatusClass(container.status)}">${container.status}</span>
                </div>
                <div class="card-actions">
                    ${container.status.includes('Up') 
                        ? `<vscode-button appearance="icon" title="Parar" class="btn-stop" data-id="${container.id}">
                            <span class="codicon codicon-debug-stop"></span>
                           </vscode-button>`
                        : `<vscode-button appearance="icon" title="Iniciar" class="btn-start" data-id="${container.id}">
                            <span class="codicon codicon-debug-start"></span>
                           </vscode-button>`
                    }
                </div>
            </div>
        </div>
    `).join('');

    // Re-attach listeners
    document.querySelectorAll('.btn-stop').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            vscode.postMessage({ command: 'stopContainer', containerId: btn.getAttribute('data-id') });
        };
    });
    document.querySelectorAll('.btn-start').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            vscode.postMessage({ command: 'startContainer', containerId: btn.getAttribute('data-id') });
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
                    <span class="container-name">${service.name}</span>
                    <span class="container-image">${service.image}</span>
                    <div class="service-meta">
                        <span class="status-pill container-status ${isHealthy ? 'status-up' : 'status-down'}">${service.replicas} Replicas</span>
                        <span class="mode-tag">${service.mode}</span>
                    </div>
                </div>
                <div class="card-actions">
                    <vscode-button appearance="icon" title="Escalar" class="btn-scale" data-name="${service.name}" data-current="${current}">
                        <span class="codicon codicon-unfold"></span>
                    </vscode-button>
                    <span class="codicon codicon-chevron-down expand-icon"></span>
                </div>
            </div>
            <div class="service-tasks hidden" id="tasks-${service.id}"></div>
        </div>`;
    }).join('');

    document.querySelectorAll('.service-card').forEach(card => {
        card.onclick = () => {
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
            const replicas = prompt(`Escalar ${name} para:`, btn.getAttribute('data-current'));
            if (replicas !== null) vscode.postMessage({ command: 'scaleService', serviceName: name, replicas: parseInt(replicas) });
        };
    });
}

function renderServiceTasks(serviceId, tasks, error) {
    const tasksDiv = document.getElementById(`tasks-${serviceId}`);
    if (!tasksDiv) return;
    if (error) { tasksDiv.innerHTML = `<div class="error-small">${error}</div>`; return; }
    if (tasks.length === 0) { tasksDiv.innerHTML = '<div class="empty-small">Sem workers.</div>'; return; }

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
            e.stopPropagation();
            const id = row.getAttribute('data-id');
            const node = row.getAttribute('data-node');
            const name = row.querySelector('.worker-id').innerText;
            showLogs(id, 'worker', node, name);
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
    logsContent.innerText = `Buscando logs de ${name || id}...`;
    
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

    if (recent.length === 0) {
        recentList.innerHTML = '<div class="empty-state">Nenhum acesso recente registrado.</div>';
        return;
    }

    recentList.innerHTML = recent.map(item => `
        <div class="docker-card recent-card ${!isClientConnected ? 'disconnected-recent' : ''}" 
             data-id="${item.id}" 
             data-type="${item.type}" 
             data-node="${item.node || ''}"
             data-server-id="${item.serverId}">
            <div class="card-info">
                <span class="container-name">${item.name}</span>
                <span class="server-badge"><span class="codicon codicon-link"></span> ${item.serverLabel || 'Desconhecido'}</span>
                <div class="service-meta" style="margin-top: 8px;">
                    <span class="type-tag">${item.type === 'container' ? 'Container' : 'Worker'}</span>
                    ${item.node ? `<span class="worker-node"><span class="codicon codicon-server"></span> ${item.node}</span>` : ''}
                </div>
            </div>
            <div class="card-actions">
                <span class="codicon codicon-history"></span>
            </div>
        </div>
    `).join('');


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
