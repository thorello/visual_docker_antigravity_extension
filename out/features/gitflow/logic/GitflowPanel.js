"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitflowPanel = void 0;
const vscode = require("vscode");
const nonce_1 = require("../../../core/utils/nonce");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class GitflowPanel {
    static createOrShow(extensionUri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (GitflowPanel.currentPanel) {
            GitflowPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel('gitflowPanel', 'Gitflow Control', column || vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'resources')],
            retainContextWhenHidden: true,
        });
        GitflowPanel.currentPanel = new GitflowPanel(panel, extensionUri);
    }
    constructor(panel, extensionUri) {
        this._disposables = [];
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._panel.webview.html = this._getHtmlContent(this._panel.webview);
        // Recebe mensagens do WebView
        this._panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'ready':
                    await this._checkCurrentStatus();
                    break;
                case 'startFlow':
                    const { type, name } = message.payload;
                    await this._executeGitflow('start', type, name);
                    break;
                case 'finishFlow':
                    await this._executeGitflow('finish', message.payload.type);
                    break;
                case 'alert':
                    vscode.window.showInformationMessage(message.payload);
                    break;
            }
        }, null, this._disposables);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        // Periodicamente verifica o status do git
        const statusInterval = setInterval(() => this._checkCurrentStatus(), 5000);
        this._disposables.push(new vscode.Disposable(() => clearInterval(statusInterval)));
    }
    async _checkCurrentStatus() {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceFolder)
                return;
            const { stdout } = await execAsync('git branch --show-current', { cwd: workspaceFolder });
            const branchName = stdout.trim();
            let currentFlow = null;
            if (branchName.startsWith('feature/')) {
                currentFlow = { type: 'feature', name: branchName.replace('feature/', '') };
            }
            else if (branchName.startsWith('hotfix/')) {
                currentFlow = { type: 'hotfix', name: branchName.replace('hotfix/', '') };
            }
            else if (branchName.startsWith('release/')) {
                currentFlow = { type: 'release', name: branchName.replace('release/', '') };
            }
            this.sendMessage({ type: 'gitStatus', payload: { currentFlow } });
        }
        catch (error) {
            console.error('Erro ao verificar status do git:', error);
        }
    }
    async _executeGitflow(action, type, name) {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceFolder) {
                this.sendMessage({ type: 'status', payload: { message: 'Nenhum workspace aberto.', type: 'error' } });
                return;
            }
            // 1. Verificar se o gitflow já está inicializado
            try {
                await execAsync('git flow config', { cwd: workspaceFolder });
            }
            catch (e) {
                this.sendMessage({ type: 'status', payload: { message: 'Gitflow não detectado. Inicializando...', type: 'loading' } });
                this.sendMessage({ type: 'terminalLog', payload: { command: 'git flow init -d', output: 'Inicializando com padrões (-d)...' } });
                await execAsync('git flow init -d', { cwd: workspaceFolder });
                this.sendMessage({ type: 'status', payload: { message: 'Gitflow inicializado!', type: 'default' } });
            }
            const statusMsg = action === 'start' ? `Iniciando ${type}: ${name}...` : `Encerrando ${type}...`;
            this.sendMessage({ type: 'status', payload: { message: statusMsg, type: 'loading' } });
            const cmd = action === 'start' ? `git flow ${type} start ${name}` : `git flow ${type} finish -F`;
            // Log do comando no terminal da webview
            this.sendMessage({ type: 'terminalLog', payload: { command: cmd } });
            try {
                // Usamos GIT_EDITOR=true para evitar que o git abra editores de texto interativos (merge/tag messages)
                const { stdout, stderr } = await execAsync(cmd, {
                    cwd: workspaceFolder,
                    env: { ...process.env, GIT_EDITOR: 'true' }
                });
                // Log da saída
                if (stdout)
                    this.sendMessage({ type: 'terminalLog', payload: { command: '', output: stdout, isError: false } });
                if (stderr) {
                    const isTypicalMeta = stderr.includes('Switched to branch') || stderr.includes('Deleted branch') || stderr.includes('Summary of actions');
                    this.sendMessage({ type: 'terminalLog', payload: { command: '', output: stderr, isError: !isTypicalMeta } });
                }
                const successMsg = action === 'start' ? `${type} '${name}' iniciada!` : `${type} encerrada com sucesso!`;
                this.sendMessage({ type: 'status', payload: { message: successMsg, type: 'default' } });
                vscode.window.showInformationMessage(successMsg);
            }
            catch (error) {
                this.sendMessage({ type: 'terminalLog', payload: { command: '', output: `ERRO: ${error.message}`, isError: true } });
                throw error;
            }
            // Atualiza o status imediatamente após a ação
            await this._checkCurrentStatus();
        }
        catch (error) {
            this.sendMessage({ type: 'status', payload: { message: `Erro: ${error.message}`, type: 'error' } });
            vscode.window.showErrorMessage(`Erro: ${error.message}`);
        }
    }
    sendMessage(message) {
        this._panel.webview.postMessage(message);
    }
    dispose() {
        GitflowPanel.currentPanel = undefined;
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
  <title>Gitflow Control</title>
</head>
<body class="gitflow-ui">
  <div id="ag-app">
    <div class="ag-ui-overlay">
      <header class="ag-header">
        <div class="logo-container">
          <span class="ag-icon">🌊</span>
          <h1>Gitflow Manager</h1>
        </div>
        <p class="subtitle">Controle de Fluxo de Trabalho Git</p>
      </header>

      <div id="gitflow-controls" class="gitflow-controls">
        <!-- Input Panel (Hidden by default) -->
        <div id="input-container" class="ag-input-container hidden">
          <div class="input-header">
            <span id="input-type-icon">✨</span>
            <span id="input-type-title">Nova Feature</span>
          </div>
          <div class="input-group">
            <input type="text" id="flow-name" placeholder="nome-da-funcionalidade" autofocus />
            <div class="input-actions">
              <button id="btn-cancel" class="ag-btn-secondary">Cancelar</button>
              <button id="btn-confirm" class="ag-btn-primary">Iniciar</button>
            </div>
          </div>
        </div>

        <!-- Start Flow Buttons -->
        <div id="start-buttons" class="button-group">
          <button id="btn-start-feature" class="gitflow-btn feature">
            <span class="icon">✨</span>
            <div class="btn-text">
              <span class="title">Iniciar Feature</span>
              <span class="desc">Nova funcionalidade</span>
            </div>
          </button>

          <button id="btn-start-hotfix" class="gitflow-btn hotfix">
            <span class="icon">🔥</span>
            <div class="btn-text">
              <span class="title">Iniciar Hotfix</span>
              <span class="desc">Correção urgente</span>
            </div>
          </button>

          <button id="btn-start-release" class="gitflow-btn release">
            <span class="icon">📦</span>
            <div class="btn-text">
              <span class="title">Iniciar Release</span>
              <span class="desc">Preparar versão</span>
            </div>
          </button>
        </div>

        <!-- Active Flow Panel (Hidden by default) -->
        <div id="active-flow-panel" class="ag-active-panel hidden">
          <div class="active-header">
            <span id="active-type-icon">🚀</span>
            <div class="active-info">
              <span class="active-label">Fluxo em Andamento</span>
              <span id="active-flow-name" class="active-name">feature/xyz</span>
            </div>
          </div>
          <button id="btn-finish-flow" class="ag-btn-danger-large">
            Encerrar Fluxo Atual
          </button>
        </div>
      </div>

      <div id="terminal-container" class="ag-terminal">
        <div class="terminal-header">
          <div class="terminal-dots">
            <span class="dot red"></span>
            <span class="dot yellow"></span>
            <span class="dot green"></span>
          </div>
          <span class="terminal-title">Gitflow Output</span>
          <button id="btn-clear-terminal" title="Limpar Console">🗑️</button>
        </div>
        <div id="terminal-log" class="terminal-body">
          <div class="log-entry system">> Terminal pronto. Aguardando comandos...</div>
        </div>
      </div>

      <div id="status-panel" class="status-panel">
        <div class="status-indicator"></div>
        <p id="status-message">Pronto para iniciar novo fluxo.</p>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}
exports.GitflowPanel = GitflowPanel;
//# sourceMappingURL=GitflowPanel.js.map