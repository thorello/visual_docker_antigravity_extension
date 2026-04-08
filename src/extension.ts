import * as vscode from 'vscode';
import { SidebarController } from './app/features/sidebar/logic/SidebarController';
import { MainScreenController } from './app/features/main_screen/logic/MainScreenController';
import { FileSystemProvider } from './app/core/FileSystemProvider';
import { StorageService } from './app/core/StorageService';

export function activate(context: vscode.ExtensionContext) {
    console.log('Antigravity Extension Blueprint is active!');

    const storageService = new StorageService(context);
    const fsProvider = new FileSystemProvider(context, storageService);
    vscode.workspace.registerFileSystemProvider('antigravity-fs', fsProvider, { isCaseSensitive: true });

    const sidebarController = new SidebarController(context.extensionUri);
    const treeView = vscode.window.createTreeView('antigravity-sidebar-view', {
        treeDataProvider: sidebarController,
        showCollapseAll: true
    });
    
    // Auto-open Main Screen when sidebar is focused
    treeView.onDidChangeVisibility((e: vscode.TreeViewVisibilityChangeEvent) => {
        if (e.visible) {
            vscode.commands.executeCommand('antigravity.openMainScreen');
        }
    });

    context.subscriptions.push(treeView);

    let openMainScreenCommand = vscode.commands.registerCommand('antigravity.openMainScreen', () => {
        MainScreenController.createOrShow(context.extensionUri, context);
    });

    context.subscriptions.push(openMainScreenCommand);

    // Generic communication commands
    let onConnectedCmd = vscode.commands.registerCommand('antigravity.onConnected', (config: any) => {
        if (MainScreenController.currentPanel) {
            // Logic for when something connects
            sidebarController.refresh();
        }
    });

    let onDisconnectedCmd = vscode.commands.registerCommand('antigravity.onDisconnected', () => {
        sidebarController.refresh();
    });

    context.subscriptions.push(onConnectedCmd, onDisconnectedCmd);
}

export function deactivate() {}


