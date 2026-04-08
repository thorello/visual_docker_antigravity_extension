"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MainPanel = void 0;
const vscode = require("vscode");
const nonce_1 = require("../../../core/utils/nonce");
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
  <title>Antigravity - Hexagons</title>
</head>
<body class="ag-spa">
  <div id="ag-app">
    <canvas id="hexagon-canvas"></canvas>
    
    <div class="ag-ui-overlay">
      <header class="ag-mini-header">
        <span class="ag-icon">🚀</span>
        <h1>Antigravity Hex</h1>
      </header>

      <div class="ag-controls">
        <button id="btn-add-hex" class="ag-btn-fab" title="Adicionar Polígono">+</button>
        <button id="btn-rotate-poly" class="ag-btn-fab" title="Rotacionar (30°)">🔄</button>
        <button id="btn-duplicate-hex" class="ag-btn-fab" title="Duplicar Selecionado">📑</button>
        <button id="btn-toggle-style" class="ag-btn-fab" title="Alternar Preenchimento/Borda">🖼️</button>
        <button id="btn-delete-hex" class="ag-btn-fab ag-btn-danger" title="Deletar Selecionado">🗑️</button>
        <button id="btn-clear-canvas" class="ag-btn-fab ag-btn-danger" title="Limpar Tudo">×</button>
      </div>

      <div class="ag-shape-selector">
        <button class="shape-btn active" data-shape="6" title="Hexágono">⬢</button>
        <button class="shape-btn" data-shape="4" title="Quadrado">■</button>
        <button class="shape-btn" data-shape="3" title="Triângulo">▲</button>
      </div>

      <div id="status-panel" class="ag-status-panel">
        <p id="status-message">Arraste para mover • Clique duplo para adicionar</p>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}
exports.MainPanel = MainPanel;
//# sourceMappingURL=MainPanel.js.map