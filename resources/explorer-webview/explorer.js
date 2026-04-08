const vscode = acquireVsCodeApi();

const noServerMsg = document.getElementById('no-server-msg');
const fileBrowser = document.getElementById('file-browser');
const serverLabel = document.getElementById('server-label');
const navPath = document.getElementById('nav-path');
const fileList = document.getElementById('file-list');
const btnRefresh = document.getElementById('btn-refresh');

window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'server-active':
            noServerMsg.classList.add('hidden');
            fileBrowser.classList.remove('hidden');
            serverLabel.innerText = message.serverLabel || message.serverId;
            loadFiles('/');
            break;
        case 'server-inactive':
            noServerMsg.classList.remove('hidden');
            fileBrowser.classList.add('hidden');
            break;
        case 'files-loaded':
            navPath.value = message.path;
            renderFiles(message.files);
            break;
    }
});

btnRefresh.addEventListener('click', () => {
    loadFiles(navPath.value);
});

navPath.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        loadFiles(navPath.value);
    }
});

function loadFiles(path) {
    fileList.innerHTML = '<p>Loading...</p>';
    vscode.postMessage({ command: 'list-files', data: { path } });
}

function renderFiles(files) {
    fileList.innerHTML = '';
    
    if (navPath.value !== '/') {
        const up = document.createElement('div');
        up.className = 'file-item';
        up.innerHTML = `<span class="file-icon">📁</span><span>..</span>`;
        up.addEventListener('click', () => {
            let parts = navPath.value.replace(/\/$/, '').split('/');
            parts.pop();
            loadFiles(parts.join('/') || '/');
        });
        fileList.appendChild(up);
    }
    
    files.forEach(f => {
        const li = document.createElement('div');
        li.className = 'file-item';
        li.innerHTML = `<span class="file-icon">${f.isDirectory ? '📁' : '📄'}</span><span>${f.filename}</span>`;
        if (f.isDirectory) {
            li.addEventListener('click', () => {
                const current = navPath.value.replace(/\/$/, '');
                loadFiles(`${current}/${f.filename}`);
            });
        }
        fileList.appendChild(li);
    });
}
