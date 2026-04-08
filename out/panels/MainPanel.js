"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MainPanel = void 0;
const vscode = require("vscode");
const nonce_1 = require("../utils/nonce");
class MainPanel {
    static createOrShow(extensionUri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (MainPanel.currentPanel) {
            MainPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel('antigravityPanel', 'Antigravity', column || vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'resources')],
            retainContextWhenHidden: true,
        });
        MainPanel.currentPanel = new MainPanel(panel, extensionUri);
    }
    constructor(panel, extensionUri) {
        this._disposables = [];
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._panel.webview.html = this._getHtmlContent(this._panel.webview);
        // Recebe mensagens do WebView
        this._panel.webview.onDidReceiveMessage((message) => {
            switch (message.type) {
                case 'ready':
                    vscode.window.showInformationMessage('Antigravity Panel carregado!');
                    break;
                case 'openSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'antigravity');
                    break;
                case 'alert':
                    vscode.window.showInformationMessage(message.payload);
                    break;
            }
        }, null, this._disposables);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }
    /** Envia mensagem para o WebView */
    sendMessage(message) {
        this._panel.webview.postMessage(message);
    }
    dispose() {
        MainPanel.currentPanel = undefined;
        this._panel.dispose();
        this._disposables.forEach((d) => d.dispose());
        this._disposables = [];
    }
    _getHtmlContent(webview) {
        const nonce = (0, nonce_1.getNonce)();
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'style.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'main.js'));
        return /* html */ `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             img-src ${webview.cspSource} data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Antigravity</title>
</head>
<body>
  <header class="ag-header">
    <div class="ag-logo">
      <span class="ag-icon">🚀</span>
      <h1>Antigravity</h1>
    </div>
    <p class="ag-subtitle">Sua extensão está ativa e pronta.</p>
  </header>

  <main class="ag-main">
    <section class="ag-card" id="hexagon-card">
      <h2>Visualização Hexagonal</h2>
      <canvas id="hexagon-canvas" width="200" height="200"></canvas>
      <p id="status-message">Aguardando ação…</p>
    </section>

    <section class="ag-card" id="output-card">
      <h2>Saída</h2>
      <pre id="output-area" class="ag-output">Nenhuma saída ainda.</pre>
    </section>

    <section class="ag-card ag-actions">
      <h2>Ações Rápidas</h2>
      <button class="ag-btn ag-btn--primary" id="btn-run">▶ Executar no Arquivo Atual</button>
      <button class="ag-btn ag-btn--secondary" id="btn-settings">⚙ Configurações</button>
      <button class="ag-btn ag-btn--ghost" id="btn-clear">✕ Limpar Saída</button>
    </section>
  </main>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}
exports.MainPanel = MainPanel;
//# sourceMappingURL=MainPanel.js.map