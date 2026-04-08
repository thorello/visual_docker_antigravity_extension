"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisualServerViewProvider = void 0;
const vscode = require("vscode");
class VisualServerViewProvider {
    constructor(_extensionUri, _context) {
        this._extensionUri = _extensionUri;
        this._context = _context;
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        // Ao abrir a sidebar, garante que o dashboard principal carregue também
        vscode.commands.executeCommand('visualServer.openDashboard');
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'resources')]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'list-files':
                    if (this.sshService && this.sshService.isConnected) {
                        try {
                            const files = await this.sshService.listDirectory(message.data.path);
                            this._view?.webview.postMessage({
                                command: 'files-loaded',
                                serverId: this.activeServerId,
                                path: message.data.path,
                                files
                            });
                        }
                        catch (err) {
                            vscode.window.showErrorMessage(`Erro ao listar arquivos: ${err.message}`);
                        }
                    }
                    else {
                        vscode.window.showErrorMessage("SSH não conectado no Explorer.");
                    }
                    break;
                case 'navigate-parent':
                    // Logic to navigate up in main.js
                    break;
            }
        });
        // Se já houver um servidor conectado, avisa a webview
        if (this.activeServerId) {
            this._view?.webview.postMessage({ command: 'server-active', serverId: this.activeServerId });
        }
    }
    updateActiveServer(config, sshService) {
        this.activeServerId = config.id;
        this.sshService = sshService;
        this._view?.webview.postMessage({ command: 'server-active', serverId: config.id, serverLabel: config.label });
        // Pede para focar a visão
        this._view?.show?.(true);
    }
    clearActiveServer() {
        this.activeServerId = undefined;
        this.sshService = undefined;
        this._view?.webview.postMessage({ command: 'server-inactive' });
    }
    _getHtmlForWebview(webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'explorer-webview', 'explorer.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'explorer-webview', 'explorer.css'));
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>Antigravity Explorer</title>
                <script type="module" src="https://cdn.jsdelivr.net/npm/@vscode/webview-ui-toolkit/dist/toolkit.min.js"></script>
            </head>
            <body>
                <div id="explorer-container">
                    <div id="no-server-msg" class="message">
                        Connect to a server in the Antigravity Dashboard to browse files here.
                    </div>
                    
                    <div id="file-browser" class="hidden">
                        <div class="header">
                            <span id="server-label">Server</span>
                            <vscode-button id="btn-refresh" appearance="icon">
                                <span class="codicon codicon-refresh"></span>
                            </vscode-button>
                        </div>
                        <div class="path-bar">
                             <vscode-text-field id="nav-path" value="/"></vscode-text-field>
                        </div>
                        <div id="file-list"></div>
                    </div>
                </div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}
exports.VisualServerViewProvider = VisualServerViewProvider;
VisualServerViewProvider.viewType = 'visual-server-view';
//# sourceMappingURL=VisualServerViewProvider.js.map