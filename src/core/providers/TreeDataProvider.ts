import * as vscode from 'vscode';

export class AntigravityTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): Thenable<TreeItem[]> {
    if (!element) {
      return Promise.resolve(this.getRootItems());
    }
    return Promise.resolve([]);
  }

  private getRootItems(): TreeItem[] {
    return [
      new TreeItem(
        'Painel Principal',
        'Abre a interface Antigravity',
        vscode.TreeItemCollapsibleState.None,
        { command: 'antigravity.openPanel', title: 'Abrir Painel' },
        '$(rocket)'
      ),
      new TreeItem(
        'Executar no Arquivo',
        'Roda Antigravity no arquivo atual',
        vscode.TreeItemCollapsibleState.None,
        { command: 'antigravity.runOnFile', title: 'Executar' },
        '$(play)'
      ),
      new TreeItem(
        'Configurações',
        'Abre as configurações da extensão',
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'workbench.action.openSettings',
          title: 'Configurações',
          arguments: ['antigravity']
        },
        '$(settings-gear)'
      ),
    ];
  }
}

class TreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    tooltip: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    command?: vscode.Command,
    iconId?: string
  ) {
    super(label, collapsibleState);
    this.tooltip = tooltip;
    this.command = command;
    if (iconId) {
      this.iconPath = new vscode.ThemeIcon(iconId.replace('$(', '').replace(')', ''));
    }
  }
}
