import * as vscode from 'vscode';
import { SidebarWebviewProvider } from './app/features/sidebar/logic/SidebarWebviewProvider';
import { MainScreenController } from './app/features/main_screen/logic/MainScreenController';
import { FileSystemProvider } from './app/core/FileSystemProvider';
import { StorageService } from './app/core/StorageService';
import { SshService } from './app/core/SshService';
import { TerminalController } from './app/core/TerminalController';

export function activate(context: vscode.ExtensionContext) {
    console.log('Antigravity Extension Blueprint is active!');

    const storageService = new StorageService(context);
    const sshService = new SshService();
    const fsProvider = new FileSystemProvider(context, storageService);
    vscode.workspace.registerFileSystemProvider('antigravity-fs', fsProvider, { isCaseSensitive: true });

    const sidebarProvider = new SidebarWebviewProvider(context.extensionUri, sshService, storageService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidebarWebviewProvider.viewType, sidebarProvider)
    );
    
    // Commands
    let openTerminalCmd = vscode.commands.registerCommand('antigravity.openTerminal', (serverLabel: string) => {
        TerminalController.openSshTerminal(sshService, serverLabel);
    });

    let openMainScreenCommand = vscode.commands.registerCommand('antigravity.openMainScreen', () => {
        MainScreenController.createOrShow(context.extensionUri, context);
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
}

export function deactivate() {}
