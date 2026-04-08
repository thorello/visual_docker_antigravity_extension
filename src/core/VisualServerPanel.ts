import * as vscode from 'vscode';
import { StorageService, ServerConfig } from '../services/storageService';
import { SshService } from '../services/sshService';

export class VisualServerPanel {
    public static currentPanel: VisualServerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private storageService: StorageService;
    private sshServices = new Map<string, SshService>();

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        if (VisualServerPanel.currentPanel) {
            VisualServerPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'visualServer',
            'Antigravity Dashboard',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'resources')]
            }
        );

        VisualServerPanel.currentPanel = new VisualServerPanel(panel, extensionUri, context);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.storageService = new StorageService(context);

        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'load-servers':
                        const servers = await this.storageService.getServers();
                        this._panel.webview.postMessage({ command: 'servers-loaded', data: servers });
                        break;
                    case 'save-server':
                        await this.storageService.addServer(message.data);
                        this.sshServices.delete(message.data.id);
                        const updatedServers = await this.storageService.getServers();
                        this._panel.webview.postMessage({ command: 'servers-loaded', data: updatedServers });
                        break;
                    case 'delete-server':
                        await this.storageService.deleteServer(message.data.id);
                        const newServers = await this.storageService.getServers();
                        this._panel.webview.postMessage({ command: 'servers-loaded', data: newServers });
                        break;
                    case 'connect-server':
                        try {
                            const config = message.data;
                            let ssh = this.sshServices.get(config.id);
                            if (!ssh) {
                                ssh = new SshService();
                                this.sshServices.set(config.id, ssh);
                            }
                            if (ssh.isConnected) {
                                ssh.disconnect();
                            }
                            await ssh.connect(config);
                            this._panel.webview.postMessage({ command: 'server-connected', data: config.id });
                            
                            // Notifica a Sidebar sobre a conexão (para mostrar o explorer lá)
                            vscode.commands.executeCommand('visualServer.onServerConnected', config);
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Erro: ${err.message}`);
                        }
                        break;
                    case 'open-terminal':
                        const sId = message.data;
                        const sServ = this.sshServices.get(sId);
                        if (sServ && sServ.isConnected) {
                            this.createNativeTerminal(sId, sServ);
                        }
                        break;
                    case 'disconnect-server':
                        const dId = message.data;
                        const dSsh = this.sshServices.get(dId);
                        if (dSsh) dSsh.disconnect();
                        this._panel.webview.postMessage({ command: 'server-disconnected', data: dId });
                        vscode.commands.executeCommand('visualServer.onServerDisconnected', dId);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public getSshService(serverId: string): SshService | undefined {
        return this.sshServices.get(serverId);
    }

    private async createNativeTerminal(serverId: string, sshService: SshService) {
        const servers = await this.storageService.getServers();
        const server = servers.find(s => s.id === serverId);
        if (!server) return;

        const writeEmitter = new vscode.EventEmitter<string>();
        let streamClosed = false;
        
        try {
            const stream = await sshService.startShell(
                (data) => writeEmitter.fire(data),
                () => { streamClosed = true; writeEmitter.fire('\r\n[Antigravity Terminal Encerrado]\r\n'); }
            );

            const pty: vscode.Pseudoterminal = {
                onDidWrite: writeEmitter.event,
                open: () => {},
                close: () => {
                    streamClosed = true;
                    if (stream.kill) stream.kill();
                    else if (stream.write) stream.end();
                },
                handleInput: data => {
                    if (streamClosed) return;
                    if (stream.write) stream.write(data);
                    else if (stream.stdin) stream.stdin.write(data);
                }
            };

            const terminal = vscode.window.createTerminal({ name: `Antigravity Terminal: ${server.label}`, pty });
            terminal.show();
        } catch (err: any) {
            vscode.window.showErrorMessage(`Falha ao abrir terminal Antigravity: ${err.message}`);
        }
    }

    public dispose() {
        VisualServerPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }

    private _update() {
        this._panel.title = 'Antigravity Dashboard';
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'style.css'));
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>Antigravity Dashboard</title>
                <script type="module" src="https://cdn.jsdelivr.net/npm/@vscode/webview-ui-toolkit/dist/toolkit.min.js"></script>
            </head>
            <body>
                <div class="app-layout">
                    <div class="sidebar">
                        <h2>Servers</h2>
                        <ul id="server-list" class="server-list"></ul>
                        <vscode-button id="btn-add-server" appearance="secondary">Add New Server</vscode-button>
                    </div>

                    <div class="main-content">
                        <div id="form-container" class="panel hidden">
                            <h2>Server Info</h2>
                            <vscode-text-field id="f-label">Label</vscode-text-field>
                            <vscode-text-field id="f-host">Host</vscode-text-field>
                            <vscode-text-field id="f-user">User</vscode-text-field>
                            <vscode-text-field id="f-port" value="22">Port</vscode-text-field>
                            <vscode-checkbox id="f-mock">Mock Connection</vscode-checkbox>
                            <div class="actions">
                                <vscode-button id="btn-save-server">Save</vscode-button>
                                <vscode-button id="btn-cancel-server" appearance="secondary">Cancel</vscode-button>
                            </div>
                        </div>

                        <div id="explorer-container" class="panel hidden">
                            <h2 id="active-server-name">Selected Server</h2>
                            <div class="actions">
                                <vscode-button id="btn-connect">Connect</vscode-button>
                                <vscode-button id="btn-terminal" disabled>Open Antigravity Terminal</vscode-button>
                                <vscode-button id="btn-disconnect" appearance="secondary" disabled>Disconnect</vscode-button>
                            </div>
                        </div>
                    </div>
                </div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}
