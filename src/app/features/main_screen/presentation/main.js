const vscode = acquireVsCodeApi();

// DOM Elements
const btnRefresh = document.getElementById('btn-refresh');
const dockerList = document.getElementById('docker-list');
const connectionStatus = document.getElementById('connection-status');

// Message Listener
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'dockerList':
            renderDockerList(message.data, message.error);
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
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            vscode.postMessage({ command: 'stopContainer', containerId: id });
        });
    });

    document.querySelectorAll('.btn-start').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            vscode.postMessage({ command: 'startContainer', containerId: id });
        });
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
        vscode.postMessage({ command: 'refreshDocker' });
    });
}

// Initial request
vscode.postMessage({ command: 'refreshDocker' });
