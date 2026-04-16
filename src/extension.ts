import * as vscode from 'vscode';
import { SidebarWebviewProvider } from './app/features/sidebar/logic/SidebarWebviewProvider';
import { MainScreenController } from './app/features/main_screen/logic/MainScreenController';
import { FileSystemProvider } from './app/core/FileSystemProvider';
import { StorageService } from './app/core/StorageService';
import { SshService } from './app/core/SshService';
import { TerminalController } from './app/core/TerminalController';

export async function activate(context: vscode.ExtensionContext) {
    console.log('Antigravity Extension Blueprint is active!');

    const storageService = new StorageService(context);
    const sshService = new SshService();
    const fsProvider = new FileSystemProvider(context, storageService);
    vscode.workspace.registerFileSystemProvider('antigravity-fs', fsProvider, { isCaseSensitive: true });

    const versionPath = vscode.Uri.joinPath(context.extensionUri, '.version');
    let version = 'v1.0.0';
    try {
        const versionData = await vscode.workspace.fs.readFile(versionPath);
        version = new TextDecoder().decode(versionData).trim();
    } catch (e) {
        version = context.extension.packageJSON.version;
    }
    const sidebarProvider = new SidebarWebviewProvider(context.extensionUri, sshService, storageService, version);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidebarWebviewProvider.viewType, sidebarProvider)
    );
    
    // Commands
    let openTerminalCmd = vscode.commands.registerCommand('antigravity.openTerminal', (serverLabel: string) => {
        TerminalController.openSshTerminal(sshService, serverLabel);
    });

    let openMainScreenCommand = vscode.commands.registerCommand('antigravity.openMainScreen', () => {
        MainScreenController.createOrShow(context.extensionUri, context, sshService);
    });

    // Generic communication commands
    let onConnectedCmd = vscode.commands.registerCommand('antigravity.onConnected', (config: any) => {
        if (MainScreenController.currentPanel) {
            // Logic for when something connects
        }
    });

    let onDisconnectedCmd = vscode.commands.registerCommand('antigravity.onDisconnected', () => {
        // Disconnect logic
    });

    context.subscriptions.push(
        openTerminalCmd,
        openMainScreenCommand, 
        onConnectedCmd, 
        onDisconnectedCmd
    );

    // Removido a abertura automática para atender solicitação do usuário
    // vscode.commands.executeCommand('antigravity.openMainScreen');
}


export function deactivate() {}
