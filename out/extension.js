"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const SidebarController_1 = require("./app/features/sidebar/logic/SidebarController");
const MainScreenController_1 = require("./app/features/main_screen/logic/MainScreenController");
const FileSystemProvider_1 = require("./app/core/FileSystemProvider");
const StorageService_1 = require("./app/core/StorageService");
function activate(context) {
    console.log('Antigravity Extension Blueprint is active!');
    const storageService = new StorageService_1.StorageService(context);
    const fsProvider = new FileSystemProvider_1.FileSystemProvider(context, storageService);
    vscode.workspace.registerFileSystemProvider('antigravity-fs', fsProvider, { isCaseSensitive: true });
    const sidebarController = new SidebarController_1.SidebarController(context.extensionUri);
    const treeView = vscode.window.createTreeView('antigravity-sidebar-view', {
        treeDataProvider: sidebarController,
        showCollapseAll: true
    });
    // Auto-open Main Screen when sidebar is focused
    treeView.onDidChangeVisibility((e) => {
        if (e.visible) {
            vscode.commands.executeCommand('antigravity.openMainScreen');
        }
    });
    context.subscriptions.push(treeView);
    let openMainScreenCommand = vscode.commands.registerCommand('antigravity.openMainScreen', () => {
        MainScreenController_1.MainScreenController.createOrShow(context.extensionUri, context);
    });
    context.subscriptions.push(openMainScreenCommand);
    // Generic communication commands
    let onConnectedCmd = vscode.commands.registerCommand('antigravity.onConnected', (config) => {
        if (MainScreenController_1.MainScreenController.currentPanel) {
            // Logic for when something connects
            sidebarController.refresh();
        }
    });
    let onDisconnectedCmd = vscode.commands.registerCommand('antigravity.onDisconnected', () => {
        sidebarController.refresh();
    });
    context.subscriptions.push(onConnectedCmd, onDisconnectedCmd);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map