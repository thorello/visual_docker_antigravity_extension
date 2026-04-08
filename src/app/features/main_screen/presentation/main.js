const vscode = acquireVsCodeApi();

// State
let allContainers = [];
let allServices = [];

// DOM Elements
const btnRefresh = document.getElementById('btn-refresh');
const dockerList = document.getElementById('docker-list');
const swarmList = document.getElementById('swarm-list');
const connectionStatus = document.getElementById('connection-status');
const swarmStatus = document.getElementById('swarm-status');
const containerSearch = document.getElementById('container-search');
const swarmSearch = document.getElementById('swarm-search');

// Logs "Modal" Elements
let logsContainer = document.getElementById('logs-container');
if (!logsContainer) {
    logsContainer = document.createElement('div');
    logsContainer.id = 'logs-container';
    logsContainer.className = 'logs-modal hidden';
    logsContainer.innerHTML = `
        <div class="logs-header">
            <h3>Logs</h3>
            <div class="logs-actions">
                <vscode-button id="btn-copy-logs" appearance="icon" title="Copiar Logs">
                    <span class="codicon codicon-copy"></span>
                </vscode-button>
                <vscode-button id="close-logs" appearance="icon">
                    <span class="codicon codicon-close"></span>
                </vscode-button>
            </div>
        </div>
        <pre id="logs-content">Carregando logs...</pre>
    `;
    document.body.appendChild(logsContainer);
    
    document.getElementById('close-logs').onclick = () => {
        logsContainer.classList.add('hidden');
    };
    
    document.getElementById('btn-copy-logs').onclick = () => {
        const content = document.getElementById('logs-content').innerText;
        navigator.clipboard.writeText(content);
        vscode.window.showInformationMessage('Logs copiados!');
    };
}

const logsContent = document.getElementById('logs-content');

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
            logsContent.innerText = message.error ? `Erro: ${message.error}` : (message.data || 'Nenhum log encontrado.');
            logsContent.scrollTop = logsContent.scrollHeight;
            break;
    }
});

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
        <div class="docker-card" data-id="${container.id}">
            <div class="card-info">
                <span class="container-name">${container.name}</span>
                <span class="container-image">${container.image}</span>
                <span class="container-status ${getStatusClass(container.status)}">${container.status}</span>
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
        card.onclick = () => showLogs(card.getAttribute('data-id'), 'container');
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
                        <span class="container-status ${isHealthy ? 'status-up' : 'status-down'}">${service.replicas} Replicas</span>
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

    tasksDiv.innerHTML = `
        <table class="tasks-table">
            <thead><tr><th>ID</th><th>Node</th><th>Desired</th><th>Current</th></tr></thead>
            <tbody>
                ${tasks.map(task => `
                    <tr class="task-row" data-id="${task.id}" data-node="${task.node}">
                        <td>${task.name}</td><td>${task.node}</td>
                        <td>${task.desired}</td><td><span class="${task.current.includes('Running') ? 'state-running' : ''}">${task.current}</span></td>
                    </tr>`).join('')}
            </tbody>
        </table>`;

    tasksDiv.querySelectorAll('.task-row').forEach(row => {
        row.onclick = (e) => {
            e.stopPropagation();
            showLogs(row.getAttribute('data-id'), 'worker', row.getAttribute('data-node'));
        };
    });
}

function showLogs(id, type, node = null) {
    logsContainer.classList.remove('hidden');
    logsContent.innerText = `Buscando logs...`;
    if (type === 'container') {
        vscode.postMessage({ command: 'getContainerLogs', containerId: id });
        vscode.postMessage({ command: 'openContainerTerminal', containerId: id });
    } else {
        vscode.postMessage({ command: 'getWorkerLogs', taskId: id });
        vscode.postMessage({ command: 'openWorkerTerminal', taskId: id, node: node });
    }
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
