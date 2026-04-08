import * as vscode from 'vscode';
import { SshService } from '../services/sshService';

export class VisualServerExplorerProvider implements vscode.TreeDataProvider<RemoteItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<RemoteItem | undefined | null> = new vscode.EventEmitter<RemoteItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<RemoteItem | undefined | null> = this._onDidChangeTreeData.event;

    private activeSshService?: SshService;
    private activeServerId?: string;
    private activeServerName?: string;

    constructor(private readonly extensionUri: vscode.Uri) {}

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    public updateActiveServer(config: any, sshService: SshService) {
        this.activeSshService = sshService;
        this.activeServerId = config.id;
        this.activeServerName = config.label;
        this.refresh();
        
        // Garante que o painel principal esteja aberto se a sidebar for ativada
        vscode.commands.executeCommand('visualServer.openDashboard');
    }

    public clearActiveServer() {
        this.activeSshService = undefined;
        this.activeServerName = undefined;
        this.refresh();
    }

    getTreeItem(element: RemoteItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: RemoteItem): Promise<RemoteItem[]> {
        if (!this.activeSshService || !this.activeSshService.isConnected) {
            if (!element) {
                // If not connected, show a single item that opens the dashboard
                const item = new RemoteItem(
                    "Conecte a um servidor no Dashboard",
                    vscode.TreeItemCollapsibleState.None,
                    "",
                    false,
                    "info"
                );
                item.command = {
                    command: 'visualServer.openDashboard',
                    title: 'Abrir Dashboard'
                };
                return [item];
            }
            return [];
        }

        const path = element ? element.fullPath : '/';
        try {
            const files = await this.activeSshService.listDirectory(path);
            return files.map(f => {
                const fullPath = path === '/' ? `/${f.filename}` : `${path}/${f.filename}`;
                return new RemoteItem(
                    f.filename,
                    f.isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                    fullPath,
                    f.isDirectory,
                    this.activeServerId || 'default'
                );
            });
        } catch (err: any) {
            vscode.window.showErrorMessage(`Falha ao listar diretório: ${err.message}`);
            return [];
        }
    }
}

class RemoteItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly fullPath: string,
        public readonly isDirectory: boolean,
        public readonly serverId: string,
        contextValue: string = isDirectory ? 'directory' : 'file'
    ) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
        this.tooltip = fullPath;
        
        // resourceUri permite que o VS Code mostre o ícone correto do arquivo baseado na extensão
        // Usamos vscode.Uri.from para garantir que caracteres especiais no serverId ou path sejam tratados corretamente
        this.resourceUri = vscode.Uri.from({
            scheme: 'visual-ssh',
            authority: serverId,
            path: fullPath
        });
        
        console.log(`[Explorer] Gerando item para: ${this.resourceUri.toString()}`);
        
        if (isDirectory) {
            this.iconPath = vscode.ThemeIcon.Folder;
        } else if (contextValue === 'info') {
            this.iconPath = new vscode.ThemeIcon('info');
        }
        // Se for arquivo, não definimos iconPath para que o resourceUri cuide do ícone padrão
        
        if (!isDirectory && contextValue !== 'info') {
            this.command = {
                command: 'vscode.open',
                title: "Abrir Arquivo",
                arguments: [this.resourceUri]
            };
        }
    }
}
