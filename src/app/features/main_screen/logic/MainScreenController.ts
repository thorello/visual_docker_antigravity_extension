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
                    case 'refreshDocker':
                        this.refreshDocker();
                        break;
                    case 'refreshSwarm':
                        this.refreshSwarmServices();
                        break;
                    case 'stopContainer':
                        await this.sshService.executeCommand(`sudo docker stop ${message.containerId}`);
                        this.refreshDocker();
                        break;
                    case 'startContainer':
                        await this.sshService.executeCommand(`sudo docker start ${message.containerId}`);
                        this.refreshDocker();
                        break;
                    case 'scaleService':
                        await this.sshService.executeCommand(`sudo docker service scale ${message.serviceName}=${message.replicas}`);
                        this.refreshSwarmServices();
                        break;
                    case 'getServiceTasks':
                        this.refreshServiceTasks(message.serviceId);
                        break;
                    case 'getWorkerLogs':
                        this.refreshWorkerLogs(message.taskId);
                        break;
                    case 'getContainerLogs':
                        this.refreshContainerLogs(message.containerId);
                        break;
                    case 'openWorkerTerminal':
                        this.openWorkerTerminal(message.taskId, message.node);
                        break;
                    case 'openContainerTerminal':
                        this.openContainerTerminal(message.containerId);
                        break;
                }
            },
            null,
            this._disposables
        );

        // Auto refresh on start if connected
        if (this.sshService.isConnected) {
            this.refreshDocker();
            this.refreshSwarmServices();
        }
    }

    public async refreshContainerLogs(containerId: string) {
        if (!this.sshService.isConnected) return;

        try {
            const output = await this.sshService.executeCommand(`sudo docker logs --tail 500 ${containerId}`);
            this._panel.webview.postMessage({ command: 'containerLogs', containerId, data: output });
        } catch (err: any) {
            this._panel.webview.postMessage({ command: 'containerLogs', containerId, data: '', error: err.message });
        }
    }

    public openContainerTerminal(containerId: string) {
        const terminal = vscode.window.createTerminal(`Container: ${containerId}`);
        terminal.show();
        vscode.window.showInformationMessage(`Abrindo terminal para o container ${containerId}...`);
    }

    public async refreshWorkerLogs(taskId: string) {
        if (!this.sshService.isConnected) return;

        try {
            // Get logs snapshot
            const output = await this.sshService.executeCommand(`sudo docker service logs --tail 200 ${taskId}`);
            this._panel.webview.postMessage({ command: 'workerLogs', taskId, data: output });
        } catch (err: any) {
            this._panel.webview.postMessage({ command: 'workerLogs', taskId, data: '', error: err.message });
        }
    }

    public openWorkerTerminal(taskId: string, node: string) {
        // Since we are connected to the manager, we can try to find the container ID and exec into it
        // Or just open a terminal that says it's connecting to the task
        // For simplicity in this blueprint, we'll open a terminal that runs docker service logs -f
        // as exec requires knowing exactly where the container is and having direct access.
        
        const terminal = vscode.window.createTerminal(`Worker: ${taskId}`);
        terminal.show();
        // This is a bit of a hack since we don't have a direct "exec" command in our SshService yet for terminals
        // But we can suggest the user what to run or if we had a better terminal controller, we'd pipe it.
        // For now, let's just log that we are trying to open.
        vscode.window.showInformationMessage(`Abrindo terminal para worker ${taskId} no node ${node}...`);
    }

    public async refreshServiceTasks(serviceId: string) {
        if (!this.sshService.isConnected) return;

        try {
            const output = await this.sshService.executeCommand(`sudo docker service ps ${serviceId} --format '{{.ID}}|{{.Name}}|{{.Node}}|{{.DesiredState}}|{{.CurrentState}}'`);
            const tasks = output.trim().split('\n').filter(l => l).map(line => {
                const [id, name, node, desired, current] = line.split('|');
                return { id, name, node, desired, current };
            });

            this._panel.webview.postMessage({ command: 'serviceTasks', serviceId, data: tasks });
        } catch (err: any) {
            this._panel.webview.postMessage({ command: 'serviceTasks', serviceId, data: [], error: err.message });
        }
    }

    public async refreshDocker() {
        if (!this.sshService.isConnected) {
            this._panel.webview.postMessage({ command: 'dockerList', data: [], error: 'Não conectado ao servidor' });
            return;
        }

        try {
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

    public async refreshSwarmServices() {
        if (!this.sshService.isConnected) {
            this._panel.webview.postMessage({ command: 'swarmList', data: [], error: 'Não conectado ao servidor' });
            return;
        }

        try {
            const output = await this.sshService.executeCommand("sudo docker service ls --format '{{.ID}}|{{.Name}}|{{.Mode}}|{{.Replicas}}|{{.Image}}'");
            const services = output.trim().split('\n').filter(l => l).map(line => {
                const [id, name, mode, replicas, image] = line.split('|');
                return { id, name, mode, replicas, image };
            });

            this._panel.webview.postMessage({ command: 'swarmList', data: services });
        } catch (err: any) {
            this._panel.webview.postMessage({ command: 'swarmList', data: [], error: err.message });
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
                        <vscode-panels activeid="tab-containers">
                            <vscode-panel-tab id="tab-containers">CONTAINERS</vscode-panel-tab>
                            <vscode-panel-tab id="tab-swarm">SERVIÇOS (SWARM)</vscode-panel-tab>
                            
                            <vscode-panel-view id="view-containers">
                                <section class="docker-section">
                                    <div class="section-header">
                                        <h2>Containers no Host</h2>
                                        <p id="connection-status">Verificando...</p>
                                    </div>
                                    <div class="filter-container">
                                        <vscode-text-field id="container-search" placeholder="Filtrar por nome ou imagem..." focused>
                                            <span slot="start" class="codicon codicon-search"></span>
                                        </vscode-text-field>
                                    </div>
                                    <div id="docker-list" class="docker-list">
                                        <div class="loading">Carregando containers...</div>
                                    </div>
                                </section>
                            </vscode-panel-view>
                            
                            <vscode-panel-view id="view-swarm">
                                <section class="docker-section">
                                    <div class="section-header">
                                        <h2>Serviços do Cluster Swarm</h2>
                                        <p id="swarm-status">Verificando status do cluster...</p>
                                    </div>
                                    <div class="filter-container">
                                        <vscode-text-field id="swarm-search" placeholder="Filtrar por nome ou imagem...">
                                            <span slot="start" class="codicon codicon-search"></span>
                                        </vscode-text-field>
                                    </div>
                                    <div id="swarm-list" class="docker-list">
                                        <div class="loading">Carregando serviços...</div>
                                    </div>
                                </section>
                            </vscode-panel-view>
                        </vscode-panels>
                    </div>
                </div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}
