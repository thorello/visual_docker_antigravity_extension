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
exports.SidebarController = void 0;
const vscode = __importStar(require("vscode"));
class SidebarController {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }
    updateActiveService(service) {
        this.activeService = service;
        this.refresh();
        vscode.commands.executeCommand('antigravity.openMainScreen');
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!this.activeService) {
            if (!element) {
                const item = new BlueprintItem("Welcome to Antigravity Blueprint", vscode.TreeItemCollapsibleState.None, "info");
                item.command = {
                    command: 'antigravity.openMainScreen',
                    title: 'Open Main Screen'
                };
                return [item];
            }
            return [];
        }
        // Logic for listing items if connected/active
        return [];
    }
}
exports.SidebarController = SidebarController;
class BlueprintItem extends vscode.TreeItem {
    constructor(label, collapsibleState, contextValue = 'item') {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.contextValue = contextValue;
        this.iconPath = new vscode.ThemeIcon('rocket');
    }
}
//# sourceMappingURL=SidebarController.js.map