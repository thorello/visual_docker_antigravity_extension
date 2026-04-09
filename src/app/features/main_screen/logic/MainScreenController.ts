import * as vscode from 'vscode';
import { StorageService } from '../../../core/StorageService';
import { SshService } from '../../../core/SshService';
import { TerminalController } from '../../../core/TerminalController';

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
            MainScreenController.currentPanel.refreshSwarmServices();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'antigravityMain',
            'Visual Docker',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'src', 'app', 'features', 'main_screen', 'presentation'),
                    vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'codicons', 'dist')
                ]
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
                        this.refreshWorkerLogs(message.taskId, message.workerName);
                        break;
                    case 'getContainerLogs':
                        this.refreshContainerLogs(message.containerId, message.containerName);
                        break;
                    case 'openWorkerTerminal':
                        this.openWorkerTerminal(message.taskId, message.node, message.workerName);
                        break;
                    case 'openContainerTerminal':
                        this.openContainerTerminal(message.containerId, message.containerName);
                        break;
                    case 'connectAndShowRecent':
                        this.connectAndShowRecent(message.serverId, message.item);
                        break;
                }
            },
            null,
            this._disposables
        );

        // Auto refresh on start if connected
        this.sendRecentItems();
        if (this.sshService.isConnected) {
            this.refreshDocker();
            this.refreshSwarmServices();
        }
    }

    public async refreshContainerLogs(containerId: string, containerName?: string) {
        if (!this.sshService.isConnected) return;

        try {
            const output = await this.sshService.executeCommand(`sudo docker logs --tail 500 ${containerId}`);
            this._panel.webview.postMessage({ command: 'containerLogs', containerId, data: output });
        } catch (err: any) {
            this._panel.webview.postMessage({ command: 'containerLogs', containerId, data: '', error: err.message });
        }
    }


    public async openContainerTerminal(containerId: string, containerName: string = '') {
        const resolvedId = (await this.sshService.executeCommand(`sudo docker ps -q -f "id=${containerId}" || sudo docker ps -q -f "name=${containerId}"`)).trim();
        await this.storageService.addRecentItem(this.sshService.configId, this.sshService.serverLabel, { type: 'container', id: containerId, name: containerName || containerId });
        this.sendRecentItems();

        TerminalController.openContainerTerminal(this.sshService, this.sshService.serverLabel, resolvedId || containerId, containerName || containerId);
    }

    public async refreshWorkerLogs(taskId: string, workerName?: string, node?: string) {
        if (!this.sshService.isConnected) return;

        try {
            const output = await this.sshService.executeCommand(`sudo docker service logs --tail 200 ${taskId}`);
            this._panel.webview.postMessage({ command: 'workerLogs', taskId, data: output });
        } catch (err: any) {
            this._panel.webview.postMessage({ command: 'workerLogs', taskId, data: '', error: err.message });
        }
    }


    private async connectAndShowRecent(serverId: string, item: any) {
        const servers = await this.storageService.getServers();
        const server = servers.find(s => s.id === serverId);
        
        if (!server) {
            vscode.window.showErrorMessage(`Servidor não encontrado: ${serverId}`);
            return;
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Conectando a ${server.host} para acessar ${item.name}...`,
            cancellable: false
        }, async () => {
            try {
                await this.sshService.connect(server);
                this.refreshDocker();
                this.refreshSwarmServices();
                
                // Mudar para a aba de logs automaticamente
                this._panel.webview.postMessage({ command: 'showTab', tabId: 'tab-logs' });
                
                if (item.type === 'container') {
                    this.refreshContainerLogs(item.id, item.name);
                    this.openContainerTerminal(item.id, item.name);
                } else {
                    this.refreshWorkerLogs(item.id, item.name, item.node);
                    this.openWorkerTerminal(item.id, item.node, item.name);
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(`Falha na conexão automática: ${err.message}`);
            }
        });
    }

    public async openWorkerTerminal(taskId: string, node: string, workerName: string = '') {
        await this.storageService.addRecentItem(this.sshService.configId, this.sshService.serverLabel, { type: 'worker', id: taskId, name: workerName || taskId, node });
        this.sendRecentItems();

        try {
            // No manager, o inspect traz o ContainerID independente do nó em que ele está rodando.
            let containerId = (await this.sshService.executeCommand(`sudo docker inspect ${taskId} --format '{{.Status.ContainerStatus.ContainerID}}'`)).trim();
            
            // Tratamento contra retornos vazios ou erros de formatação
            if (!containerId || containerId.includes("Error") || containerId.includes("no such object")) {
                // Fallback para pesquisar o nome como estava antes
                containerId = (await this.sshService.executeCommand(`sudo docker ps -q -f "label=com.docker.swarm.task.id=${taskId}"`)).trim();
            }

            // Passamos o nó de destino para que o TerminalController possa fazer o pivot via SSH se necessário
            TerminalController.openContainerTerminal(this.sshService, this.sshService.serverLabel, containerId || taskId, workerName || taskId, node);
        } catch (err) {
            TerminalController.openContainerTerminal(this.sshService, this.sshService.serverLabel, taskId, workerName || taskId, node);
        }

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

        this.sendRecentItems();

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

    private sendRecentItems() {
        const serverId = this.sshService.isConnected ? this.sshService.configId : undefined;
        const recent = this.storageService.getRecentItems(serverId);
        this._panel.webview.postMessage({ command: 'recentList', data: recent, isConnected: this.sshService.isConnected });
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
                        <vscode-panels activeid="tab-recent">
                            <vscode-panel-tab id="tab-recent">RECENTES</vscode-panel-tab>
                            <vscode-panel-tab id="tab-containers">CONTAINERS</vscode-panel-tab>
                            <vscode-panel-tab id="tab-swarm">SERVIÇOS (SWARM)</vscode-panel-tab>
                            <vscode-panel-tab id="tab-logs">LOGS</vscode-panel-tab>
                            
                            <vscode-panel-view id="view-recent">
                                <section class="docker-section">
                                    <div class="section-header">
                                        <h2>Acessos Recentes</h2>
                                        <p>Containers e workers acessados ultimamente</p>
                                    </div>
                                    <div id="recent-list" class="docker-list recent-grid">
                                        <div class="empty-state">Nenhum acesso recente registrado.</div>
                                    </div>
                                </section>
                            </vscode-panel-view>

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

                            <vscode-panel-view id="view-logs">
                                <section class="docker-section logs-section" id="logs-section">
                                    <div class="logs-header-inline">
                                        <div class="logs-title-group">
                                            <h2 id="logs-title">Logs</h2>
                                            <vscode-text-field id="logs-filter" placeholder="Filtrar logs..." size="30">
                                                <span slot="start" class="codicon codicon-search"></span>
                                            </vscode-text-field>
                                        </div>
                                        <div class="logs-actions">
                                            <vscode-button id="btn-copy-logs" appearance="icon" title="Copiar Logs">
                                                <span class="codicon codicon-copy"></span>
                                            </vscode-button>
                                            <vscode-button id="btn-clear-logs" appearance="icon" title="Limpar Logs">
                                                <span class="codicon codicon-trash"></span>
                                            </vscode-button>
                                            <vscode-button id="btn-maximize-logs" appearance="icon" title="Expandir/Recolher">
                                                <span class="codicon codicon-screen-full" id="maximize-icon"></span>
                                            </vscode-button>
                                        </div>
                                    </div>
                                    <div class="logs-terminal-container">
                                        <pre id="logs-content">Selecione um container ou worker para visualizar os logs...</pre>
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
