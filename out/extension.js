"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const VisualServerExplorerProvider_1 = require("./core/VisualServerExplorerProvider");
const VisualServerPanel_1 = require("./core/VisualServerPanel");
const SshFileSystemProvider_1 = require("./core/SshFileSystemProvider");
const storageService_1 = require("./services/storageService");
function activate(context) {
    console.log('Visual Server Extension is active!');
    const storageService = new storageService_1.StorageService(context);
    const fsProvider = new SshFileSystemProvider_1.SshFileSystemProvider(context, storageService);
    vscode.workspace.registerFileSystemProvider('visual-ssh', fsProvider, { isCaseSensitive: true });
    const provider = new VisualServerExplorerProvider_1.VisualServerExplorerProvider(context.extensionUri);
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
        VisualServerPanel_1.VisualServerPanel.createOrShow(context.extensionUri, context);
    });
    let openInExplorerCommand = vscode.commands.registerCommand('visualServer.openInExplorer', (serverId) => {
        const uri = vscode.Uri.parse(`visual-ssh://${serverId}/`);
        vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0, 0, {
            uri,
            name: `SSH: ${serverId}`
        });
    });
    // Sincronização: Panel comunica ao Provider quando mudar o servidor ativo
    let serverConnectedCmd = vscode.commands.registerCommand('visualServer.onServerConnected', (config) => {
        if (VisualServerPanel_1.VisualServerPanel.currentPanel) {
            const sshService = VisualServerPanel_1.VisualServerPanel.currentPanel.getSshService(config.id);
            if (sshService) {
                provider.updateActiveServer(config, sshService);
            }
        }
    });
    let serverDisconnectedCmd = vscode.commands.registerCommand('visualServer.onServerDisconnected', (serverId) => {
        provider.clearActiveServer();
    });
    context.subscriptions.push(openDashboardCommand, openInExplorerCommand, serverConnectedCmd, serverDisconnectedCmd);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map