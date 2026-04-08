(function() {
    const vscode = acquireVsCodeApi();

    const listScreen = document.getElementById('list-screen');
    const addScreen = document.getElementById('add-screen');
    const serverListContainer = document.getElementById('server-list');

    const goToAddBtn = document.getElementById('goToAddBtn');
    const backToListBtn = document.getElementById('backToListBtn');
    const saveConnectBtn = document.getElementById('saveConnectBtn');

    // Form inputs
    const hostInput = document.getElementById('host');
    const portInput = document.getElementById('port');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    // Initial load
    vscode.postMessage({ type: 'requestServers' });

    goToAddBtn.addEventListener('click', () => {
        listScreen.classList.add('hidden');
        addScreen.classList.remove('hidden');
    });

    backToListBtn.addEventListener('click', () => {
        addScreen.classList.add('hidden');
        listScreen.classList.remove('hidden');
    });

    saveConnectBtn.addEventListener('click', () => {
        const host = hostInput.value;
        const port = portInput.value;
        const username = usernameInput.value;
        const password = passwordInput.value;

        if (!host || !username) return;

        vscode.postMessage({
            type: 'saveAndConnect',
            value: { host, port, username, password }
        });

        // Go back to list immediately or wait for message?
        // Let's go back and wait for loadServers to refresh
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
            item.innerHTML = `
                <div class="server-info">
                    <div class="server-name">${server.label || server.host}</div>
                    <div class="server-meta">${server.username}@${server.host}:${server.port}</div>
                </div>
                <div class="server-actions">
                    <span class="codicon codicon-chevron-right"></span>
                </div>
            `;
            
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
