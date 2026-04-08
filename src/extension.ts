import * as vscode from 'vscode';
import { VisualServerExplorerProvider } from './core/VisualServerExplorerProvider';
import { VisualServerPanel } from './core/VisualServerPanel';
import { SshFileSystemProvider } from './core/SshFileSystemProvider';
import { StorageService } from './services/storageService';

export function activate(context: vscode.ExtensionContext) {
    console.log('Visual Server Extension is active!');

    const storageService = new StorageService(context);
    const fsProvider = new SshFileSystemProvider(context, storageService);
    vscode.workspace.registerFileSystemProvider('visual-ssh', fsProvider, { isCaseSensitive: true });

    const provider = new VisualServerExplorerProvider(context.extensionUri);
    const treeView = vscode.window.createTreeView('visual-server-view', {
        treeDataProvider: provider,
        showCollapseAll: true
    });
    
    // Automatiza abertura do Dashboard ao focar na sidebar
    treeView.onDidChangeVisibility(e => {
        if (e.visible) {
            vscode.commands.executeCommand('visualServer.openDashboard');
        }
    });

    context.subscriptions.push(treeView);

    let openDashboardCommand = vscode.commands.registerCommand('visualServer.openDashboard', () => {
        VisualServerPanel.createOrShow(context.extensionUri, context);
    });

    let openInExplorerCommand = vscode.commands.registerCommand('visualServer.openInExplorer', (serverId: string) => {
        const uri = vscode.Uri.parse(`visual-ssh://${serverId}/`);
        vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0, 0, {
            uri,
            name: `SSH: ${serverId}`
        });
    });

    // Sincronização: Panel comunica ao Provider quando mudar o servidor ativo
    let serverConnectedCmd = vscode.commands.registerCommand('visualServer.onServerConnected', (config: any) => {
        if (VisualServerPanel.currentPanel) {
            const sshService = VisualServerPanel.currentPanel.getSshService(config.id);
            if (sshService) {
                provider.updateActiveServer(config, sshService);
            }
        }
    });

    let serverDisconnectedCmd = vscode.commands.registerCommand('visualServer.onServerDisconnected', (serverId: string) => {
        provider.clearActiveServer();
    });

    context.subscriptions.push(openDashboardCommand, openInExplorerCommand, serverConnectedCmd, serverDisconnectedCmd);
}

export function deactivate() {}

