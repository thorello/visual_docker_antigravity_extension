import * as vscode from 'vscode';
import { StorageService } from '../../../core/StorageService';
import { SshService } from '../../../core/SshService';

export class SidebarWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'antigravity-sidebar-view';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _sshService: SshService,
        private readonly _storageService: StorageService
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'requestServers': {
                    const servers = await this._storageService.getServers();
                    webviewView.webview.postMessage({ type: 'loadServers', value: servers });
                    break;
                }
                case 'connectServer': {
                    const server = data.value;
                    this._connectToServer(server);
                    break;
                }
                case 'saveAndConnect': {
                    const { host, port, username, password } = data.value;
                    const serverId = `ssh-${host}-${port}-${username}`;
                    const server = { 
                        id: serverId,
                        label: host,
                        host, 
                        port: parseInt(port), 
                        username, 
                        password,
                        isWsl: false
                    };
                    
                    await this._storageService.addServer(server);
                    this._connectToServer(server);
                    
                    // Refresh list after saving
                    const servers = await this._storageService.getServers();
                    webviewView.webview.postMessage({ type: 'loadServers', value: servers });
                    break;
                }
            }
        });
    }

    private async _connectToServer(server: any) {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Conectando a ${server.host}...`,
            cancellable: false
        }, async (progress) => {
            try {
                await this._sshService.connect(server);
                vscode.window.showInformationMessage(`Conectado com sucesso a ${server.host}`);
                
                // Open Main Screen and Terminal
                vscode.commands.executeCommand('antigravity.openMainScreen');
                vscode.commands.executeCommand('antigravity.openTerminal', server.label || server.host);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Falha na conexão: ${err.message}`);
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'app', 'features', 'sidebar', 'presentation', 'sidebar.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'app', 'features', 'sidebar', 'presentation', 'sidebar.js'));
        const toolkitUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'webview-ui-toolkit', 'dist', 'toolkit.min.js'));
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'));

        return `<!DOCTYPE html>
			<html lang="pt-br">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleUri}" rel="stylesheet">
                <link href="${codiconsUri}" rel="stylesheet">
				<title>SSH Sidebar</title>
			</head>
			<body>
				<!-- List Screen -->
                <div id="list-screen" class="screen">
                    <header class="list-header">
                        <h2>Meus Servidores</h2>
                        <vscode-button id="goToAddBtn" appearance="icon" aria-label="Adicionar Servidor">
                            <span class="codicon codicon-add"></span>
                        </vscode-button>
                    </header>
                    <div id="server-list" class="server-list">
                        <!-- Servers will be injected here -->
                    </div>
                </div>

                <!-- Add Screen (Initially Hidden) -->
				<div id="add-screen" class="screen hidden">
					<header>
                        <div class="header-with-back">
                            <vscode-button id="backToListBtn" appearance="icon">
                                <span class="codicon codicon-arrow-left"></span>
                            </vscode-button>
						    <h2>Nova Conexão</h2>
                        </div>
						<p>Configure os detalhes do servidor SSH.</p>
					</header>

					<div class="form-group">
						<vscode-text-field id="host" placeholder="ex: 192.168.1.10">Host / IP</vscode-text-field>
					</div>
					
					<div class="form-group">
						<vscode-text-field id="port" value="22">Porta</vscode-text-field>
					</div>

					<div class="form-group">
						<vscode-text-field id="username" placeholder="root">Usuário</vscode-text-field>
					</div>

					<div class="form-group">
						<vscode-text-field id="password" type="password">Senha</vscode-text-field>
					</div>

					<div class="actions">
						<vscode-button id="saveConnectBtn" appearance="primary">Salvar e Conectar</vscode-button>
					</div>
				</div>

				<script type="module" src="${toolkitUri}"></script>
				<script src="${scriptUri}"></script>
			</body>
			</html>`;
    }
}
