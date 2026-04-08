const vscode = acquireVsCodeApi();

// DOM Elements
const btnRefresh = document.getElementById('btn-refresh');
const dockerList = document.getElementById('docker-list');
const swarmList = document.getElementById('swarm-list');
const connectionStatus = document.getElementById('connection-status');
const swarmStatus = document.getElementById('swarm-status');

// Message Listener
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'dockerList':
            renderDockerList(message.data, message.error);
            break;
        case 'swarmList':
            renderSwarmList(message.data, message.error);
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

    connectionStatus.innerText = containers.length > 0 ? 'Conectado e monitorando' : 'Conectado (Nenhum container encontrado)';
    connectionStatus.style.color = 'var(--vscode-charts-green)';

    if (containers.length === 0) {
        dockerList.innerHTML = '<div class="empty-state">Nenhum container Docker encontrado neste servidor.</div>';
        return;
    }

    dockerList.innerHTML = containers.map(container => `
        <div class="docker-card">
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

    // Add event listeners to buttons
    document.querySelectorAll('.btn-stop').forEach(btn => {
        btn.onclick = () => {
            const id = btn.getAttribute('data-id');
            vscode.postMessage({ command: 'stopContainer', containerId: id });
        };
    });

    document.querySelectorAll('.btn-start').forEach(btn => {
        btn.onclick = () => {
            const id = btn.getAttribute('data-id');
            vscode.postMessage({ command: 'startContainer', containerId: id });
        };
    });
}

function renderSwarmList(services, error) {
    if (error) {
        swarmStatus.innerText = `Erro: ${error}`;
        swarmStatus.style.color = 'var(--vscode-errorForeground)';
        swarmList.innerHTML = `<div class="error-state">Falha ao obter serviços Swarm: ${error}</div>`;
        return;
    }

    swarmStatus.innerText = services.length > 0 ? 'Cluster ativo' : 'Sem serviços ativos no cluster';
    swarmStatus.style.color = 'var(--vscode-charts-blue)';

    if (services.length === 0) {
        swarmList.innerHTML = '<div class="empty-state">Este servidor não parece ser um Swarm manager ou não possui serviços.</div>';
        return;
    }

    swarmList.innerHTML = services.map(service => {
        const [current, target] = service.replicas.split('/');
        const isHealthy = current === target;
        
        return `
        <div class="docker-card service-card">
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
            </div>
        </div>
        `;
    }).join('');

    document.querySelectorAll('.btn-scale').forEach(btn => {
        btn.onclick = () => {
            const name = btn.getAttribute('data-name');
            const current = btn.getAttribute('data-current');
            const replicas = prompt(`Escalar serviço ${name} para quantas réplicas?`, current);
            if (replicas !== null) {
                vscode.postMessage({ command: 'scaleService', serviceName: name, replicas: parseInt(replicas) });
            }
        };
    });
}

function getStatusClass(status) {
    if (status.includes('Up')) return 'status-up';
    if (status.includes('Exited')) return 'status-down';
    return 'status-other';
}

// Event Listeners
if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
        dockerList.innerHTML = '<div class="loading">Atualizando...</div>';
        swarmList.innerHTML = '<div class="loading">Atualizando...</div>';
        vscode.postMessage({ command: 'refreshDocker' });
        vscode.postMessage({ command: 'refreshSwarm' });
    });
}

// Initial request
vscode.postMessage({ command: 'refreshDocker' });
vscode.postMessage({ command: 'refreshSwarm' });
