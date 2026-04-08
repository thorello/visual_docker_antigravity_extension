import * as vscode from 'vscode';
import { SshService } from '../../../core/SshService';

export class SidebarController implements vscode.TreeDataProvider<BlueprintItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<BlueprintItem | undefined | null> = new vscode.EventEmitter<BlueprintItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<BlueprintItem | undefined | null> = this._onDidChangeTreeData.event;

    private activeService?: SshService;

    constructor(private readonly extensionUri: vscode.Uri) {}

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    public updateActiveService(service: SshService) {
        this.activeService = service;
        this.refresh();
        vscode.commands.executeCommand('antigravity.openMainScreen');
    }

    getTreeItem(element: BlueprintItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: BlueprintItem): Promise<BlueprintItem[]> {
        if (!this.activeService) {
            if (!element) {
                const item = new BlueprintItem(
                    "Welcome to Antigravity Blueprint",
                    vscode.TreeItemCollapsibleState.None,
                    "info"
                );
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

class BlueprintItem extends vscode.TreeItem {
    constructor(
        public override readonly label: string,
        public override readonly collapsibleState: vscode.TreeItemCollapsibleState,
        contextValue: string = 'item'
    ) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
        this.iconPath = new vscode.ThemeIcon('rocket');
    }
}


