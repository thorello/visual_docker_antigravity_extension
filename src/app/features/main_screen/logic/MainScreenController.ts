import * as vscode from 'vscode';
import { StorageService } from '../../../core/StorageService';
import { SshService } from '../../../core/SshService';

export class MainScreenController {
    public static currentPanel: MainScreenController | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private storageService: StorageService;

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext, sshService: SshService) {
        if (MainScreenController.currentPanel) {
            MainScreenController.currentPanel._panel.reveal(vscode.ViewColumn.One);
            // Refresh when showing
            MainScreenController.currentPanel.refreshDocker();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'antigravityMain',
            'Visual Docker',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'src', 'app', 'features', 'main_screen', 'presentation')]
            }
        );

        MainScreenController.currentPanel = new MainScreenController(panel, extensionUri, context, sshService);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext, private sshService: SshService) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.storageService = new StorageService(context);

        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message: any) => {
                switch (message.command) {
                    case 'ping':
                        this._panel.webview.postMessage({ command: 'pong', data: 'Hello from Antigravity Backend!' });
                        break;
                    case 'refreshDocker':
                        this.refreshDocker();
                        break;
                    case 'stopContainer':
                        await this.sshService.executeCommand(`sudo docker stop ${message.containerId}`);
                        this.refreshDocker();
                        break;
                    case 'startContainer':
                        await this.sshService.executeCommand(`sudo docker start ${message.containerId}`);
                        this.refreshDocker();
                        break;
                }
            },
            null,
            this._disposables
        );

        // Auto refresh docker on start if connected
        if (this.sshService.isConnected) {
            this.refreshDocker();
        }
    }

    public async refreshDocker() {
        if (!this.sshService.isConnected) {
            this._panel.webview.postMessage({ command: 'dockerList', data: [], error: 'Não conectado ao servidor' });
            return;
        }

        try {
            // Get docker processes using sudo
            const output = await this.sshService.executeCommand("sudo docker ps -a --format '{{.ID}}|{{.Image}}|{{.Status}}|{{.Names}}'");
            const containers = output.trim().split('\n').filter(l => l).map(line => {
                const [id, image, status, name] = line.split('|');
                return { id, image, status, name };
            });

            this._panel.webview.postMessage({ command: 'dockerList', data: containers });
        } catch (err: any) {
            this._panel.webview.postMessage({ command: 'dockerList', data: [], error: err.message });
        }
    }

    public dispose() {
        MainScreenController.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }

    private _update() {
        this._panel.title = 'Visual Docker - Painel de Controle';
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'app', 'features', 'main_screen', 'presentation', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'app', 'features', 'main_screen', 'presentation', 'style.css'));

        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'));

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <link href="${codiconsUri}" rel="stylesheet">
                <title>Visual Docker</title>
                <script type="module" src="https://cdn.jsdelivr.net/npm/@vscode/webview-ui-toolkit/dist/toolkit.min.js"></script>
            </head>
            <body>
                <div class="app-layout">
                    <header class="main-header">
                        <h1>Visual Docker</h1>
                        <div class="header-actions">
                            <vscode-button id="btn-refresh" appearance="icon" aria-label="Atualizar">
                                <span class="codicon codicon-refresh"></span>
                            </vscode-button>
                        </div>
                    </header>
                    
                    <div class="main-content">
                        <section class="docker-section">
                            <div class="section-header">
                                <h2>Containers Ativos</h2>
                                <p id="connection-status">Verificando conexão...</p>
                            </div>
                            
                            <div id="docker-list" class="docker-list">
                                <div class="loading">Carregando containers...</div>
                            </div>
                        </section>
                    </div>
                </div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}
