"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AntigravityTreeProvider = void 0;
const vscode = require("vscode");
class AntigravityTreeProvider {
    constructor(context) {
        this.context = context;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            return Promise.resolve(this.getRootItems());
        }
        return Promise.resolve([]);
    }
    getRootItems() {
        return [
            new TreeItem('Painel Principal', 'Abre a interface Antigravity', vscode.TreeItemCollapsibleState.None, { command: 'antigravity.openPanel', title: 'Abrir Painel' }, '$(rocket)'),
            new TreeItem('Executar no Arquivo', 'Roda Antigravity no arquivo atual', vscode.TreeItemCollapsibleState.None, { command: 'antigravity.runOnFile', title: 'Executar' }, '$(play)'),
            new TreeItem('Configurações', 'Abre as configurações da extensão', vscode.TreeItemCollapsibleState.None, {
                command: 'workbench.action.openSettings',
                title: 'Configurações',
                arguments: ['antigravity']
            }, '$(settings-gear)'),
        ];
    }
}
exports.AntigravityTreeProvider = AntigravityTreeProvider;
class TreeItem extends vscode.TreeItem {
    constructor(label, tooltip, collapsibleState, command, iconId) {
        super(label, collapsibleState);
        this.tooltip = tooltip;
        this.command = command;
        if (iconId) {
            this.iconPath = new vscode.ThemeIcon(iconId.replace('$(', '').replace(')', ''));
        }
    }
}
//# sourceMappingURL=TreeDataProvider.js.map