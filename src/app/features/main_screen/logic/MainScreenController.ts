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
                    case 'refreshImages':
                        this.refreshImages();
                        break;
                    case 'removeImage':
                        try {
                            await this.sshService.executeCommand(`sudo docker rmi -f ${message.imageId}`);
                            this.refreshImages();
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Falha ao remover imagem: ${err.message}`);
                        }
                        break;
                    case 'stopContainer':
                        try {
                            await this.sshService.executeCommand(`sudo docker stop ${message.containerId}`);
                            this.refreshDocker();
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Erro ao parar container: ${err.message}`);
                        }
                        break;
                    case 'startContainer':
                        try {
                            await this.sshService.executeCommand(`sudo docker start ${message.containerId}`);
                            this.refreshDocker();
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Erro ao iniciar container: ${err.message}`);
                        }
                        break;
                    case 'restartContainer':
                        try {
                            await this.sshService.executeCommand(`sudo docker restart ${message.containerId}`);
                            this.refreshDocker();
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Erro ao reiniciar container: ${err.message}`);
                        }
                        break;
                    case 'removeContainer':
                        try {
                            await this.sshService.executeCommand(`sudo docker rm -f ${message.containerId}`);
                            this.refreshDocker();
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Erro ao remover container: ${err.message}`);
                        }
                        break;
                    case 'restartService':
                        try {
                            await this.sshService.executeCommand(`sudo docker service update --force ${message.serviceName}`);
                            this.refreshSwarmServices();
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Erro ao reiniciar serviço: ${err.message}`);
                        }
                        break;
                    case 'removeService':
                        try {
                            await this.sshService.executeCommand(`sudo docker service rm ${message.serviceName}`);
                            this.refreshSwarmServices();
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Erro ao remover serviço: ${err.message}`);
                        }
                        break;
                    case 'scaleService':
                        try {
                            await this.sshService.executeCommand(`sudo docker service scale ${message.serviceName}=${message.replicas}`);
                            this.refreshSwarmServices();
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Erro ao escalar serviço: ${err.message}`);
                        }
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
            this.refreshAll();
        }
    }

    public async refreshAll() {
        await Promise.all([
            this.refreshDocker(),
            this.refreshImages(),
            this.refreshSwarmServices()
        ]);
    }

    public async refreshContainerLogs(containerId: string, containerName?: string) {
        if (!this.sshService.isConnected) return;

        try {
            const inspect = await this.sshService.executeCommand(`sudo docker inspect ${containerId} --format '{{.Id}}|{{.Config.Image}}|{{.State.Status}}'`);
            const [fullId, image, status] = inspect.trim().split('|');
            
            const output = await this.sshService.executeCommand(`sudo docker logs -t --tail 500 ${containerId}`);
            this._panel.webview.postMessage({ 
                command: 'containerLogs', 
                containerId, 
                data: output,
                metadata: {
                    name: containerName || containerId,
                    id: fullId || containerId,
                    image: image || 'N/A',
                    status: status || 'N/A',
                    type: 'Container',
                    serverAlias: this.sshService.serverAlias,
                    serverHost: this.sshService.serverHost
                }
            });
        } catch (err: any) {
            this._panel.webview.postMessage({ command: 'containerLogs', containerId, data: '', error: err.message });
        }
    }


    public async openContainerTerminal(containerId: string, containerName: string = '') {
        const resolvedId = (await this.sshService.executeCommand(`sudo docker ps -q -f "id=${containerId}" || sudo docker ps -q -f "name=${containerId}"`)).trim();
        await this.storageService.addRecentItem(this.sshService.configId, this.sshService.serverLabel, this.sshService.serverAlias, this.sshService.serverHost, { type: 'container', id: containerId, name: containerName || containerId });
        this.sendRecentItems();

        TerminalController.openContainerTerminal(this.sshService, this.sshService.serverLabel, resolvedId || containerId, containerName || containerId);
    }

    public async refreshWorkerLogs(taskId: string, workerName?: string, node?: string) {
        if (!this.sshService.isConnected) return;

        try {
            const inspect = await this.sshService.executeCommand(`sudo docker inspect ${taskId} --format '{{.ID}}|{{.Spec.ContainerSpec.Image}}|{{.Status.State}}|{{.NodeID}}'`);
            const [fullId, image, state, nodeId] = inspect.trim().split('|');

            const output = await this.sshService.executeCommand(`sudo docker service logs -t --tail 200 ${taskId}`);
            this._panel.webview.postMessage({ 
                command: 'workerLogs', 
                taskId, 
                data: output,
                metadata: {
                    name: workerName || taskId,
                    id: fullId || taskId,
                    image: image || 'N/A',
                    status: state || 'N/A',
                    node: nodeId || 'N/A',
                    type: 'Worker (Swarm Task)',
                    serverAlias: this.sshService.serverAlias,
                    serverHost: this.sshService.serverHost
                }
            });
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
                await this.refreshAll();
                
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
        await this.storageService.addRecentItem(this.sshService.configId, this.sshService.serverLabel, this.sshService.serverAlias, this.sshService.serverHost, { type: 'worker', id: taskId, name: workerName || taskId, node });
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
            const tasks = output.trim().split('\n').filter(l => l && l.includes('|')).map(line => {
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
            const containers = output.trim().split('\n').filter(l => l && l.includes('|')).map(line => {
                const [id, image, status, name] = line.split('|');
                return { id, image, status, name };
            });

            this._panel.webview.postMessage({ command: 'dockerList', data: containers });
        } catch (err: any) {
            this._panel.webview.postMessage({ command: 'dockerList', data: [], error: err.message });
        }
    }

    public async refreshImages() {
        if (!this.sshService.isConnected) {
            this._panel.webview.postMessage({ command: 'imagesList', data: [], error: 'Não conectado ao servidor' });
            return;
        }

        try {
            const output = await this.sshService.executeCommand("sudo docker images --format '{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedSince}}'");
            const images = output.trim().split('\n').filter(l => l && l.includes('|')).map(line => {
                const [id, repository, tag, size, created] = line.split('|');
                return { id, repository, tag, size, created };
            });

            this._panel.webview.postMessage({ command: 'imagesList', data: images });
        } catch (err: any) {
            this._panel.webview.postMessage({ command: 'imagesList', data: [], error: err.message });
        }
    }

    public showTab(tabId: string) {
        this._panel.webview.postMessage({ command: 'showTab', tabId });
    }

    private sendRecentItems() {
        const recent = this.storageService.getRecentItems();
        this._panel.webview.postMessage({ 
            command: 'recentList', 
            data: recent, 
            isConnected: this.sshService.isConnected,
            serverAlias: this.sshService.serverAlias,
            serverHost: this.sshService.serverHost
        });
    }

    public async refreshSwarmServices() {
        if (!this.sshService.isConnected) {
            this._panel.webview.postMessage({ command: 'swarmList', data: [], error: 'Não conectado ao servidor' });
            return;
        }

        try {
            const output = await this.sshService.executeCommand("sudo docker service ls --format '{{.ID}}|{{.Name}}|{{.Mode}}|{{.Replicas}}|{{.Image}}'");
            
            // Se o output contiver erro de daemon ou não for um swarm manager, tratamos como lista vazia/erro amigável
            if (output.includes('Error response from daemon') || output.includes('not a swarm manager')) {
                this._panel.webview.postMessage({ command: 'swarmList', data: [], error: 'Este nó não é um Swarm Manager. Inicialize o swarm para usar esta guia.' });
                return;
            }

            const services = output.trim().split('\n').filter(l => l && l.includes('|')).map(line => {
                const [id, name, mode, replicas, image] = line.split('|');
                return { id, name, mode, replicas, image };
            });

            this._panel.webview.postMessage({ command: 'swarmList', data: services });
        } catch (err: any) {
            const errorMsg = err.message || '';
            if (errorMsg.includes('Error response from daemon') || errorMsg.includes('not a swarm manager')) {
                this._panel.webview.postMessage({ command: 'swarmList', data: [], error: 'Este nó não é um Swarm Manager. Inicialize o swarm para usar esta guia.' });
            } else {
                this._panel.webview.postMessage({ command: 'swarmList', data: [], error: err.message });
            }
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
                        <div id="main-title-container">
                            <h1 id="main-title">Visual Docker</h1>
                        </div>
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
                            <vscode-panel-tab id="tab-images">IMAGENS</vscode-panel-tab>
                            <vscode-panel-tab id="tab-logs">LOGS</vscode-panel-tab>
                            
                            <vscode-panel-view id="view-recent">
                                <section class="docker-section">
                                    <div class="section-header">
                                        <h2>Acessos Recentes</h2>
                                        <p>Containers e workers acessados em todos os seus servidores</p>
                                    </div>
                                    <div class="filter-container">
                                        <vscode-text-field id="recent-search" placeholder="Filtrar por nome ou servidor...">
                                            <span slot="start" class="codicon codicon-search"></span>
                                        </vscode-text-field>
                                    </div>
                                    <div id="recent-list" class="docker-list recent-vertical">
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

                            <vscode-panel-view id="view-images">
                                <section class="docker-section">
                                    <div class="section-header">
                                        <h2>Imagens Docker</h2>
                                        <p id="images-status">Verificando imagens...</p>
                                    </div>
                                    <div class="filter-container">
                                        <vscode-text-field id="images-search" placeholder="Filtrar por repositório ou tag...">
                                            <span slot="start" class="codicon codicon-search"></span>
                                        </vscode-text-field>
                                    </div>
                                    <div id="images-list" class="docker-list">
                                        <div class="loading">Carregando imagens...</div>
                                    </div>
                                </section>
                            </vscode-panel-view>

                            <vscode-panel-view id="view-logs">
                                <section class="docker-section logs-section" id="logs-section">
                                    <div class="logs-header-inline">
                                        <div class="logs-title-group">
                                            <h2 id="logs-title">Logs</h2>
                                            <div class="logs-filter-row">
                                                <vscode-text-field id="logs-filter" placeholder="Filtrar logs..." size="40">
                                                    <span slot="start" class="codicon codicon-search"></span>
                                                </vscode-text-field>
                                            </div>
                                        </div>
                                        <div class="logs-actions">
                                            <vscode-dropdown id="log-interval-select" title="Agrupar por intervalo">
                                                <vscode-option value="1">1 min</vscode-option>
                                                <vscode-option value="5" selected>5 min</vscode-option>
                                                <vscode-option value="10">10 min</vscode-option>
                                                <vscode-option value="30">30 min</vscode-option>
                                                <vscode-option value="60">1h</vscode-option>
                                            </vscode-dropdown>
                                            <vscode-button id="btn-copy-logs" appearance="icon" title="Copiar Tudo">
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
                                    <div id="logs-info-banner" class="logs-info-banner hidden">
                                        <!-- Metadata injected here -->
                                    </div>
                                    <div class="logs-terminal-container">
                                        <div id="logs-content">Selecione um container ou worker para visualizar os logs...</div>
                                    </div>
                                </section>
                            </vscode-panel-view>
                        </vscode-panels>
                    </div>
                </div>

                <!-- Confirmation Modal -->
                <div id="modal-container"></div>

                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}
