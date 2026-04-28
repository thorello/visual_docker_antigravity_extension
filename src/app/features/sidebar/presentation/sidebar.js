(function() {
    const vscode = acquireVsCodeApi();

    const listScreen = document.getElementById('list-screen');
    const addScreen = document.getElementById('add-screen');
    
    const serverListContainer = document.getElementById('server-list');
    const formTitle = document.getElementById('form-title');

    const goToAddBtn = document.getElementById('goToAddBtn');
    const backToListBtn = document.getElementById('backToListBtn');
    const saveConnectBtn = document.getElementById('saveConnectBtn');

    // Form inputs
    const serverIdInput = document.getElementById('serverId');
    const aliasInput = document.getElementById('alias');
    const hostInput = document.getElementById('host');
    const portInput = document.getElementById('port');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const connectionTypeInput = document.getElementById('connectionType');
    const sshFields = document.getElementById('sshFields');
    const wslFields = document.getElementById('wslFields');
    const wslDistroInput = document.getElementById('wslDistro');
    const wslPasswordInput = document.getElementById('wslPassword');

    connectionTypeInput.addEventListener('change', (e) => {
        if (e.target.value === 'wsl') {
            sshFields.style.display = 'none';
            wslFields.style.display = 'block';
        } else {
            sshFields.style.display = 'block';
            wslFields.style.display = 'none';
        }
    });

    // Initial load
    vscode.postMessage({ type: 'requestServers' });

    function clearForm() {
        serverIdInput.value = '';
        aliasInput.value = '';
        hostInput.value = '';
        portInput.value = '22';
        usernameInput.value = '';
        passwordInput.value = '';
        wslDistroInput.value = '';
        wslPasswordInput.value = '';
        connectionTypeInput.value = 'ssh';
        sshFields.style.display = 'block';
        wslFields.style.display = 'none';
        formTitle.innerText = 'Nova Conexão';
    }

    goToAddBtn.addEventListener('click', () => {
        clearForm();
        listScreen.classList.add('hidden');
        addScreen.classList.remove('hidden');
    });

    backToListBtn.addEventListener('click', () => {
        addScreen.classList.add('hidden');
        listScreen.classList.remove('hidden');
    });

    saveConnectBtn.addEventListener('click', () => {
        const id = serverIdInput.value;
        const alias = aliasInput.value;
        const host = hostInput.value;
        const port = portInput.value;
        const username = usernameInput.value;
        const password = passwordInput.value;
        const isWsl = connectionTypeInput.value === 'wsl';
        const wslDistro = wslDistroInput.value;
        const wslPassword = wslPasswordInput.value;

        if (!isWsl && (!host || !username)) return;

        vscode.postMessage({
            type: 'saveAndConnect',
            value: { id, alias, host, port, username, password, isWsl, wslDistro, wslPassword }
        });

        addScreen.classList.add('hidden');
        listScreen.classList.remove('hidden');
    });

    // Handle messages from backend
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'loadServers':
                renderServerList(message.value);
                break;
        }
    });

    function renderServerList(servers) {
        serverListContainer.innerHTML = '';
        
        if (servers.length === 0) {
            serverListContainer.innerHTML = '<p style="opacity: 0.5; text-align: center; margin-top: 20px;">Nenhum servidor salvo.</p>';
            return;
        }

        servers.forEach(server => {
            const item = document.createElement('div');
            item.className = 'server-item';
            
            const metaInfo = server.isWsl ? `WSL${server.wslDistro ? ': ' + server.wslDistro : ''}` : `${server.username}@${server.host}:${server.port}`;

            item.innerHTML = `
                <div class="server-info">
                    <div class="server-name">${server.alias || server.label || server.host}</div>
                    <div class="server-meta">${metaInfo}</div>
                </div>
                <div class="server-actions">
                    <vscode-button appearance="icon" class="edit-btn" title="Editar">
                        <span class="codicon codicon-edit"></span>
                    </vscode-button>
                    <span class="codicon codicon-chevron-right"></span>
                </div>
            `;
            
            // Edit button click
            item.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation(); // Don't trigger connection
                
                serverIdInput.value = server.id;
                aliasInput.value = server.alias || '';
                hostInput.value = server.host || '';
                portInput.value = server.port || '22';
                usernameInput.value = server.username || '';
                passwordInput.value = server.password || '';
                wslDistroInput.value = server.wslDistro || '';
                wslPasswordInput.value = server.wslPassword || '';
                connectionTypeInput.value = server.isWsl ? 'wsl' : 'ssh';
                
                if (server.isWsl) {
                    sshFields.style.display = 'none';
                    wslFields.style.display = 'block';
                } else {
                    sshFields.style.display = 'block';
                    wslFields.style.display = 'none';
                }

                formTitle.innerText = 'Editar Conexão';
                
                listScreen.classList.add('hidden');
                addScreen.classList.remove('hidden');
            });

            // Item click to connect
            item.addEventListener('click', () => {
                vscode.postMessage({
                    type: 'connectServer',
                    value: server
                });
            });
            
            serverListContainer.appendChild(item);
        });
    }
}());
