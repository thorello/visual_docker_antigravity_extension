import * as vscode from 'vscode';
import { StorageService } from '../../../core/StorageService';
import { SshService } from '../../../core/SshService';
import { MainScreenController } from '../../main_screen/logic/MainScreenController';

export class SidebarWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'antigravity-sidebar-view';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _sshService: SshService,
        private readonly _storageService: StorageService,
        private readonly _extensionVersion: string
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
                case 'requestRecent': {
                    const recent = this._storageService.getRecentItems();
                    webviewView.webview.postMessage({ type: 'loadRecent', value: recent });
                    break;
                }
                case 'connectServer': {
                    const server = data.value;
                    this._connectToServer(server);
                    break;
                }
                case 'connectRecent': {
                    const { serverId, serverLabel, type, id, name } = data.value;
                    const servers = await this._storageService.getServers();
                    const server = servers.find(s => s.id === serverId);
                    if (server) {
                        await this._connectToServer(server);
                        // Optional: trigger specific action on connect (e.g. open log of that container)
                    }
                    break;
                }
                case 'saveAndConnect': {
                    const { id, alias, host, port, username, password, isWsl, wslDistro, wslPassword } = data.value;
                    const serverId = id || (isWsl ? `wsl-${wslDistro || 'default'}-${Date.now()}` : `ssh-${host}-${port}-${username}`);
                    const server = { 
                        id: serverId,
                        label: alias || (isWsl ? `WSL: ${wslDistro || 'Padrão'}` : host),
                        alias,
                        host: host || 'localhost', 
                        port: port ? parseInt(port) : 22, 
                        username: username || 'root', 
                        password,
                        isWsl: !!isWsl,
                        wslDistro: wslDistro || undefined,
                        wslPassword: wslPassword || undefined
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
            title: `Conectando a ${server.alias || server.host}...`,
            cancellable: false
        }, async (progress) => {
            try {
                await this._sshService.connect(server);
                vscode.window.showInformationMessage(`Conectado com sucesso a ${server.alias || server.host}`);
                
                // Open Main Screen and Terminal
                vscode.commands.executeCommand('antigravity.openMainScreen');
                
                // Switch to containers tab specifically
                if (MainScreenController.currentPanel) {
                    MainScreenController.currentPanel.refreshDocker();
                    MainScreenController.currentPanel.showTab('tab-containers');
                }
                
                vscode.commands.executeCommand('antigravity.openTerminal', server.alias || server.host);
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
                <header class="extension-header">
                    <span class="extension-name">Visual Docker</span>
                    <span class="extension-version">${this._extensionVersion}</span>
                </header>
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
						    <h2 id="form-title">Nova Conexão</h2>
                        </div>
						<p>Configure os detalhes do servidor SSH.</p>
					</header>

					<div class="form-group">
						<vscode-text-field id="alias" placeholder="ex: Servidor de Produção">Apelido (Opcional)</vscode-text-field>
					</div>

					<div class="form-group" style="margin-bottom: 10px;">
						<label style="display:block; margin-bottom: 5px; font-size: var(--type-ramp-base-font-size);">Tipo de Conexão</label>
						<vscode-dropdown id="connectionType" style="width: 100%;">
							<vscode-option value="ssh">Servidor Remoto (SSH)</vscode-option>
							<vscode-option value="wsl">Ambiente Local (WSL)</vscode-option>
						</vscode-dropdown>
					</div>

					<div id="sshFields">
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
					</div>

					<div id="wslFields" style="display: none;">
						<div class="form-group">
							<vscode-text-field id="wslDistro" placeholder="ex: Ubuntu-20.04 (vazio para padrão)">Distribuição WSL</vscode-text-field>
						</div>
						<div class="form-group">
							<vscode-text-field id="wslPassword" type="password">Senha Sudo (Opcional)</vscode-text-field>
						</div>
					</div>

                    <input type="hidden" id="serverId">

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
