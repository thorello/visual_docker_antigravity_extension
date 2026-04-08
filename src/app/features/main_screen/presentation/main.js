const vscode = acquireVsCodeApi();

// DOM Elements
const btnPing = document.getElementById('btn-ping');
const responseContainer = document.getElementById('response-container');

// Message Listener
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'pong':
            const p = document.createElement('p');
            p.innerText = `[${new Date().toLocaleTimeString()}] ${message.data}`;
            responseContainer.appendChild(p);
            break;
    }
});

// Event Listeners
if (btnPing) {
    btnPing.addEventListener('click', () => {
        vscode.postMessage({ command: 'ping' });
    });
}
