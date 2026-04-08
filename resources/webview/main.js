const vscode = acquireVsCodeApi();

// State
let servers = [];
let selectedServer = null;

// DOM Elements
const serverList = document.getElementById('server-list');
const btnAddServer = document.getElementById('btn-add-server');
const formContainer = document.getElementById('form-container');
const explorerContainer = document.getElementById('explorer-container');
const activeServerName = document.getElementById('active-server-name');

// Form elements
const fLabel = document.getElementById('f-label');
const fHost = document.getElementById('f-host');
const fUser = document.getElementById('f-user');
const fPort = document.getElementById('f-port');
const fWsl = document.getElementById('f-wsl');
const fWslDistro = document.getElementById('f-wsl-distro');
const fMock = document.getElementById('f-mock');
const fPass = document.getElementById('f-pass');
const btnSaveServer = document.getElementById('btn-save-server');
const btnCancelServer = document.getElementById('btn-cancel-server');

// Connected elements
const btnConnect = document.getElementById('btn-connect');
const btnTerminal = document.getElementById('btn-terminal');
const btnDisconnect = document.getElementById('btn-disconnect');

// Initialize
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'servers-loaded':
            servers = message.data;
            renderServers();
            break;
        case 'server-connected':
            if (selectedServer && selectedServer.id === message.data) {
                btnConnect.disabled = true;
                if (btnTerminal) btnTerminal.disabled = false;
                if (btnDisconnect) btnDisconnect.disabled = false;
            }
            break;
        case 'server-disconnected':
            if (selectedServer && selectedServer.id === message.data) {
                btnConnect.disabled = false;
                if (btnTerminal) btnTerminal.disabled = true;
                if (btnDisconnect) btnDisconnect.disabled = true;
            }
            break;
    }
});

// Request initial data
vscode.postMessage({ command: 'load-servers' });

btnAddServer.addEventListener('click', () => {
    selectedServer = null;
    showForm();
});

btnSaveServer.addEventListener('click', () => {
    const config = {
        id: selectedServer ? selectedServer.id : 'srv_' + new Date().getTime(),
        label: fLabel.value,
        host: fHost.value,
        username: fUser.value,
        port: parseInt(fPort.value),
        isWsl: fWsl.checked,
        wslDistro: fWslDistro.value,
        isMock: fMock.checked,
        password: fPass.value
    };
    vscode.postMessage({ command: 'save-server', data: config });
    showExplorer();
});

btnCancelServer.addEventListener('click', () => {
    if (servers.length > 0) {
        selectServer(servers[0]);
    } else {
        formContainer.classList.add('hidden');
        explorerContainer.classList.add('hidden');
    }
});

btnConnect.addEventListener('click', () => {
    if (selectedServer) {
        vscode.postMessage({ command: 'connect-server', data: selectedServer });
    }
});

btnDisconnect.addEventListener('click', () => {
    if (selectedServer) {
        vscode.postMessage({ command: 'disconnect-server', data: selectedServer.id });
    }
});

if (btnTerminal) {
    btnTerminal.addEventListener('click', () => {
        if (selectedServer) {
            vscode.postMessage({ command: 'open-terminal', data: selectedServer.id });
        }
    });
}

function renderServers() {
    serverList.innerHTML = '';
    servers.forEach(server => {
        const li = document.createElement('li');
        li.className = 'server-item';
        if (selectedServer && selectedServer.id === server.id) {
            li.classList.add('active');
        }
        
        const label = document.createElement('span');
        label.innerText = server.label;
        
        const actions = document.createElement('div');
        actions.className = 'server-item-actions';
        
        const btnDelete = document.createElement('button');
        btnDelete.innerText = '🗑️';
        btnDelete.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Delete server?')) {
                vscode.postMessage({ command: 'delete-server', data: { id: server.id } });
            }
        });
        
        actions.appendChild(btnDelete);
        li.appendChild(label);
        li.appendChild(actions);
        
        li.addEventListener('click', () => selectServer(server));
        serverList.appendChild(li);
    });
    
    if (servers.length > 0 && !selectedServer) {
        selectServer(servers[0]);
    } else if (servers.length === 0) {
        showForm();
    }
}

function selectServer(server) {
    selectedServer = server;
    renderServers();
    showExplorer();
    activeServerName.innerText = server.label;
    
    btnConnect.disabled = false;
    if (btnTerminal) btnTerminal.disabled = true;
    if (btnDisconnect) btnDisconnect.disabled = true;
}

function showForm() {
    formContainer.classList.remove('hidden');
    explorerContainer.classList.add('hidden');
    
    if (selectedServer) {
        fLabel.value = selectedServer.label || '';
        fHost.value = selectedServer.host || '';
        fUser.value = selectedServer.username || '';
        fPort.value = selectedServer.port || 22;
        fWsl.checked = selectedServer.isWsl || false;
        fWslDistro.value = selectedServer.wslDistro || '';
        fMock.checked = selectedServer.isMock || false;
        fPass.value = '';
    } else {
        fLabel.value = '';
        fHost.value = '';
        fUser.value = '';
        fPort.value = '22';
        fWsl.checked = false;
        fWslDistro.value = '';
        fMock.checked = false;
        fPass.value = '';
    }
}

function showExplorer() {
    formContainer.classList.add('hidden');
    explorerContainer.classList.remove('hidden');
}
