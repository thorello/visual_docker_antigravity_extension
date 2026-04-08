"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitflowSidebarProvider = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const nonce_1 = require("../../../core/utils/nonce");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class GitflowSidebarProvider {
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
        this._isBusy = false;
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
        webviewView.webview.html = this._getHtmlContent(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.command) {
                case 'ready':
                    await this._checkCurrentStatus();
                    break;
                case 'startFlow':
                    await this._executeGitflow('start', data.payload.type, data.payload.name);
                    break;
                case 'finishFlow':
                    await this._executeGitflow('finish', data.payload.type);
                    break;
                case 'createVersionFile':
                    await this._createVersionFile();
                    break;
                case 'undoFlow':
                    const confirm = await vscode.window.showWarningMessage(`Tem certeza que deseja desfazer a ${data.payload.type}? Todos os arquivos serão revertidos ao estado do último commit do branch base e o branch atual será excluído permanentemente.`, { modal: true }, 'Sim, Desfazer');
                    if (confirm === 'Sim, Desfazer') {
                        await this._undoGitflow(data.payload.type);
                    }
                    break;
                case 'checkoutBranch':
                    await this._checkoutBranch(data.payload.branch);
                    break;
                case 'deleteBranch':
                    await this._deleteBranch(data.payload.branch);
                    break;
                case 'syncFlow':
                    await this._syncWithDevelop();
                    break;
            }
        });
        // Periodically check status
        const interval = setInterval(() => this._checkCurrentStatus(), 5000);
        webviewView.onDidDispose(() => clearInterval(interval));
    }
    async _checkCurrentStatus() {
        if (!this._view)
            return;
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceFolder)
                return;
            const { stdout: branchesOutput } = await execAsync('git branch', { cwd: workspaceFolder });
            const branches = branchesOutput.split('\n').map(b => b.trim());
            const currentBranchLine = branches.find(b => b.startsWith('*')) || '';
            const branchName = currentBranchLine.replace('*', '').trim();
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
            // Procura qualquer hotfix ou release, mesmo que não seja o atual
            let existingFlow = null;
            for (const b of branches) {
                const name = b.replace('*', '').trim();
                if (name.startsWith('hotfix/')) {
                    existingFlow = { type: 'hotfix', name: name.replace('hotfix/', '') };
                    break;
                }
                else if (name.startsWith('release/')) {
                    existingFlow = { type: 'release', name: name.replace('release/', '') };
                    break;
                }
            }
            const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: workspaceFolder });
            const hasConflicts = statusOutput.includes('UU ') || statusOutput.includes('AA ') || statusOutput.includes('DD ');
            this._view.webview.postMessage({ type: 'gitStatus', payload: { currentFlow, existingFlow, hasConflicts, isBusy: this._isBusy } });
        }
        catch (e) {
            this._view.webview.postMessage({ type: 'gitStatus', payload: { currentFlow: null, existingFlow: null, isBusy: this._isBusy } });
        }
        await this._checkVersion();
    }
    async _checkVersion() {
        if (!this._view)
            return;
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceFolder) {
                this._view.webview.postMessage({ type: 'versionInfo', payload: { exists: false } });
                return;
            }
            const versionPath = path.join(workspaceFolder, '.version');
            const exists = fs.existsSync(versionPath);
            if (exists) {
                const version = fs.readFileSync(versionPath, 'utf8').trim();
                const suggestions = this._getSuggestedVersions(version);
                this._view.webview.postMessage({
                    type: 'versionInfo',
                    payload: { exists: true, version, suggestions }
                });
            }
            else {
                this._view.webview.postMessage({ type: 'versionInfo', payload: { exists: false } });
            }
        }
        catch (e) {
            this._view.webview.postMessage({ type: 'versionInfo', payload: { exists: false } });
            this._view.webview.postMessage({
                type: 'terminalLog',
                payload: { command: '', output: `Erro ao verificar versão: ${e.message}`, isError: true }
            });
        }
    }
    _getSuggestedVersions(version) {
        const match = version.match(/v?(\d+)\.(\d+)\.(\d+)/);
        if (!match)
            return null;
        let [_, major, minor, patch] = match.map(Number);
        return {
            feature: `v${major}.${minor + 1}.0`,
            hotfix: `v${major}.${minor}.${patch + 1}`,
            release: `v${major + 1}.0.0`
        };
    }
    async _createVersionFile() {
        if (this._isBusy)
            return;
        this._isBusy = true;
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceFolder)
                return;
            const versionPath = path.join(workspaceFolder, '.version');
            fs.writeFileSync(versionPath, 'v0.0.0');
            this._isBusy = false;
            await this._checkVersion();
            this._view?.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: 'Arquivo .version criado com v0.0.0', isError: false } });
        }
        catch (error) {
            this._isBusy = false;
            this._view?.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: error.message, isError: true } });
        }
    }
    async _incrementVersion(type, forcedVersion) {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceFolder)
                return;
            const versionPath = path.join(workspaceFolder, '.version');
            if (!fs.existsSync(versionPath))
                return;
            let newVersion = '';
            if (forcedVersion) {
                newVersion = forcedVersion.startsWith('v') ? forcedVersion : `v${forcedVersion}`;
            }
            else {
                let version = fs.readFileSync(versionPath, 'utf8').trim();
                const match = version.match(/v?(\d+)\.(\d+)\.(\d+)/);
                if (!match)
                    return;
                let [_, major, minor, patch] = match.map(Number);
                if (type === 'release') {
                    major++;
                    minor = 0;
                    patch = 0;
                }
                else if (type === 'feature') {
                    minor++;
                    patch = 0;
                }
                else if (type === 'hotfix') {
                    patch++;
                }
                newVersion = `v${major}.${minor}.${patch}`;
            }
            fs.writeFileSync(versionPath, newVersion);
            await this._checkVersion();
            this._view?.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: `Versão atualizada para ${newVersion}`, isError: false } });
        }
        catch (e) { }
    }
    async _executeGitflow(action, type, name) {
        if (!this._view || this._isBusy)
            return;
        this._isBusy = true;
        try {
            await this._checkCurrentStatus();
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceFolder) {
                this._view.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: 'Erro: Nenhum workspace aberto.', isError: true } });
                return;
            }
            // Sanitizar nome caso existam espaços ou caracteres especiais
            const sanitizedName = name ? name.toLowerCase().trim()
                .replace(/\s+/g, '-') // Troca espaços por hifens
                .replace(/[^\w\-/.]/g, '') // Remove caracteres especiais exceto os comuns em git branches
                : '';
            if (action === 'start' && !sanitizedName) {
                throw new Error('O nome da funcionalidade é inválido ou contém apenas caracteres proibidos.');
            }
            let cmd = action === 'start' ? `git flow ${type} start ${sanitizedName}` : `git flow ${type} finish`;
            let currentFlowName = sanitizedName;
            // Capturar nome atual se for 'finish'
            if (action === 'finish') {
                try {
                    const { stdout: current } = await execAsync('git branch --show-current', { cwd: workspaceFolder });
                    currentFlowName = current.trim().replace(`${type}/`, '');
                }
                catch { }
            }
            // Adicionar mensagem padronizada para tags em hotfix e release para evitar erro de 'no tag message'
            if (action === 'finish' && (type === 'hotfix' || type === 'release')) {
                cmd += ' -m "Finalizado pela extensão Gitflow Control"';
            }
            this._view.webview.postMessage({ type: 'terminalLog', payload: { command: cmd } });
            vscode.window.showInformationMessage(`Iniciando ${type} flow: ${sanitizedName || '...'} `);
            // 1. Check init
            try {
                await execAsync('git flow config', { cwd: workspaceFolder });
            }
            catch (e) {
                this._view.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: 'Configurando Gitflow (init -d)...', isError: false } });
                // Tentar detectar se o branch principal é main ou master
                try {
                    const { stdout: branches } = await execAsync('git branch --list main master', { cwd: workspaceFolder });
                    const mainBranch = branches.includes('main') ? 'main' : 'master';
                    await execAsync(`git flow init -d --master ${mainBranch}`, { cwd: workspaceFolder });
                }
                catch (initErr) {
                    await execAsync('git flow init -d', { cwd: workspaceFolder });
                }
            }
            // 2. Check for uncommitted changes before finishing
            if (action === 'finish') {
                try {
                    const { stdout: status } = await execAsync('git status --porcelain', { cwd: workspaceFolder });
                    if (status.trim().length > 0) {
                        const msg = '⚠️ Erro: Existem arquivos não commitados. Por favor, faça o commit ou stash de suas alterações antes de finalizar.';
                        this._view.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: msg, isError: true } });
                        vscode.window.showWarningMessage(msg);
                        await this._checkCurrentStatus(); // Atualizar UI para resetar loading
                        return;
                    }
                }
                catch (e) {
                    // Se falhar o git status, continuamos? Provavelmente melhor parar se der erro no git.
                    console.error('Falha ao verificar status do git:', e.message);
                }
            }
            const { stdout, stderr } = await execAsync(cmd, {
                cwd: workspaceFolder,
                env: { ...process.env, GIT_EDITOR: 'cat' }
            });
            if (stdout)
                this._view.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: stdout, isError: false } });
            if (stderr)
                this._view.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: stderr, isError: false } });
            if (action === 'start') {
                // Para release, usamos o nome como a versão. Para outros, incrementamos auto.
                await this._incrementVersion(type, type === 'release' ? sanitizedName : undefined);
                // Se for release, faz o commit automático e finaliza
                if (type === 'release') {
                    const commitMsg = `chore: bump version to ${sanitizedName}`;
                    this._view.webview.postMessage({ type: 'terminalLog', payload: { command: `git add .version && git commit -m "${commitMsg}"` } });
                    await execAsync('git add .version', { cwd: workspaceFolder });
                    await execAsync(`git commit -m "${commitMsg}"`, { cwd: workspaceFolder });
                    this._isBusy = false; // Liberamos temporariamente para poder chamar o finish recursivo se necessário, ou apenas prosseguimos
                    await this._executeGitflow('finish', 'release');
                    return;
                }
            }
            this._isBusy = false;
            await this._checkCurrentStatus();
            if (action === 'finish') {
                this._view.webview.postMessage({ type: 'operationFinished', payload: { type, name: currentFlowName } });
            }
        }
        catch (error) {
            let userMsg = error.message;
            if (userMsg.toLowerCase().includes('merge conflicts') || userMsg.toLowerCase().includes('failed to merge')) {
                userMsg = '🚨 Conflitos de mesclagem detectados! Por favor, resolva os conflitos no painel de Controle de Origem (SCM) e faça o commit antes de tentar finalizar novamente.';
                vscode.commands.executeCommand('workbench.view.scm');
            }
            this._view?.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: userMsg, isError: true } });
            this._isBusy = false;
            await this._checkCurrentStatus();
        }
    }
    async _undoGitflow(type) {
        if (!this._view || this._isBusy)
            return;
        this._isBusy = true;
        try {
            await this._checkCurrentStatus();
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceFolder)
                return;
            const { stdout: branchNameLine } = await execAsync('git branch --show-current', { cwd: workspaceFolder });
            const currentBranch = branchNameLine.trim();
            let baseBranch = 'develop';
            try {
                if (type === 'hotfix') {
                    const { stdout: master } = await execAsync('git config --get gitflow.branch.master', { cwd: workspaceFolder });
                    baseBranch = master.trim() || 'main';
                }
                else {
                    const { stdout: dev } = await execAsync('git config --get gitflow.branch.develop', { cwd: workspaceFolder });
                    baseBranch = dev.trim() || 'develop';
                }
            }
            catch {
                baseBranch = (type === 'hotfix') ? 'main' : 'develop';
            }
            this._view.webview.postMessage({ type: 'terminalLog', payload: { command: `git checkout ${baseBranch} && git branch -D ${currentBranch} && git reset --hard` } });
            // Forçar limpeza e checkout
            await execAsync('git reset --hard', { cwd: workspaceFolder });
            await execAsync(`git checkout ${baseBranch}`, { cwd: workspaceFolder });
            await execAsync(`git branch -D ${currentBranch}`, { cwd: workspaceFolder });
            await execAsync('git reset --hard', { cwd: workspaceFolder });
            this._view.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: `Fluxo ${type} desfeito com sucesso. Retornando para ${baseBranch}.`, isError: false } });
            this._isBusy = false;
            await this._checkCurrentStatus();
        }
        catch (error) {
            this._view?.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: `Erro ao desfazer: ${error.message}`, isError: true } });
            this._isBusy = false;
            await this._checkCurrentStatus();
        }
    }
    async _checkoutBranch(branch) {
        if (!this._view || this._isBusy)
            return;
        this._isBusy = true;
        try {
            await this._checkCurrentStatus();
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceFolder)
                return;
            this._view.webview.postMessage({ type: 'terminalLog', payload: { command: `git checkout ${branch}` } });
            await execAsync(`git checkout ${branch}`, { cwd: workspaceFolder });
            this._isBusy = false;
            await this._checkCurrentStatus();
        }
        catch (error) {
            this._view?.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: `Erro ao trocar branch: ${error.message}`, isError: true } });
            this._isBusy = false;
            await this._checkCurrentStatus();
        }
    }
    async _deleteBranch(branch) {
        if (!this._view || this._isBusy)
            return;
        this._isBusy = true;
        try {
            await this._checkCurrentStatus();
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceFolder)
                return;
            const confirm = await vscode.window.showWarningMessage(`Deseja realmente excluir a branch ${branch}? Esta ação não pode ser desfeita.`, { modal: true }, 'Sim, Excluir');
            if (confirm !== 'Sim, Excluir')
                return;
            this._view.webview.postMessage({ type: 'terminalLog', payload: { command: `git branch -D ${branch}` } });
            await execAsync(`git branch -D ${branch}`, { cwd: workspaceFolder });
            this._isBusy = false;
            await this._checkCurrentStatus();
            vscode.window.showInformationMessage(`Branch ${branch} excluída.`);
        }
        catch (error) {
            this._view?.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: `Erro ao excluir branch: ${error.message}`, isError: true } });
            this._isBusy = false;
            await this._checkCurrentStatus();
        }
    }
    async _syncWithDevelop() {
        if (!this._view || this._isBusy)
            return;
        this._isBusy = true;
        try {
            await this._checkCurrentStatus();
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceFolder)
                return;
            let devBranch = 'develop';
            try {
                const { stdout: dev } = await execAsync('git config --get gitflow.branch.develop', { cwd: workspaceFolder });
                devBranch = dev.trim() || 'develop';
            }
            catch {
                devBranch = 'develop';
            }
            this._view.webview.postMessage({ type: 'terminalLog', payload: { command: `git fetch --all` } });
            try {
                await execAsync('git fetch --all', { cwd: workspaceFolder });
            }
            catch (fErr) {
                this._view.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: `Aviso fetch: ${fErr.message}`, isError: false } });
            }
            // Verificar se existe origin/[devBranch] ou apenas [devBranch]
            let mergeTarget = `origin/${devBranch}`;
            try {
                await execAsync(`git rev-parse --verify origin/${devBranch}`, { cwd: workspaceFolder });
            }
            catch {
                this._view.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: `Remoto origin/${devBranch} não encontrado. Usando branch local ${devBranch}.`, isError: false } });
                mergeTarget = devBranch;
            }
            this._view.webview.postMessage({ type: 'terminalLog', payload: { command: `git merge ${mergeTarget}` } });
            vscode.window.showInformationMessage(`Sincronizando com ${mergeTarget}...`);
            const { stdout, stderr } = await execAsync(`git merge ${mergeTarget}`, {
                cwd: workspaceFolder,
                env: { ...process.env, GIT_EDITOR: 'cat' }
            });
            if (stdout)
                this._view.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: stdout, isError: false } });
            if (stderr)
                this._view.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: stderr, isError: false } });
            this._isBusy = false;
            await this._checkCurrentStatus();
            vscode.window.showInformationMessage('Sincronização concluída.');
        }
        catch (error) {
            if (error.message.toLowerCase().includes('merge conflicts') || error.message.toLowerCase().includes('failed to merge')) {
                const msg = '🚨 Conflitos detectados na sincronização! Resolva-os no painel SCM antes de continuar.';
                this._view.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: msg, isError: true } });
                vscode.commands.executeCommand('workbench.view.scm');
            }
            else {
                this._view?.webview.postMessage({ type: 'terminalLog', payload: { command: '', output: `Erro ao sincronizar: ${error.message}`, isError: true } });
            }
            this._isBusy = false;
            await this._checkCurrentStatus();
        }
    }
    _getHtmlContent(webview) {
        const nonce = (0, nonce_1.getNonce)();
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'style.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'main.js'));
        return /* html */ `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Gitflow Sidebar</title>
</head>
<body class="gitflow-ui sidebar-mode">
  <canvas id="bg-canvas"></canvas>
  <div id="ag-app">
    <header class="ag-header">
      <div class="logo-container">
        <span class="ag-icon minimal-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        </span>
        <h1>Antigravity</h1>
      </div>
      <p class="subtitle">Gitflow Management System</p>
    </header>

    <div id="gitflow-controls" class="gitflow-controls">
      <div id="version-container" class="version-display-area">
        <div id="current-version-badge" class="version-badge hidden">
          <span class="v-label">VERSION</span>
          <span id="version-text" class="v-number">v0.0.0</span>
        </div>
        <button id="btn-create-version" class="ag-btn-primary full-width hidden">Inicializar .version</button>
      </div>

      <div id="input-container" class="ag-input-container hidden">
        <div class="input-header">
          <span id="input-type-icon" class="minimal-icon small"></span>
          <span id="input-type-title">Nova Feature</span>
        </div>
        <input type="text" id="flow-name" placeholder="id-da-funcionalidade" />
        <div class="input-actions">
          <button id="btn-cancel" class="ag-btn-secondary">Esc</button>
          <button id="btn-confirm" class="ag-btn-primary">Criar</button>
        </div>
      </div>

      <div id="start-buttons" class="button-group">
        <button id="btn-start-feature" class="gitflow-btn feature">
          <span class="icon minimal-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </span>
          <span class="title">Feature</span>
        </button>
        <button id="btn-start-hotfix" class="gitflow-btn hotfix">
          <span class="icon minimal-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
          </span>
          <span class="title">Hotfix</span>
        </button>
        <button id="btn-start-release" class="gitflow-btn release">
          <span class="icon minimal-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          </span>
          <span class="title">Release</span>
        </button>
      </div>

      <div id="active-flow-panel" class="ag-active-panel hidden">
        <div class="active-header">
          <span id="active-type-icon" class="minimal-icon medium"></span>
          <span id="active-flow-name" class="active-name">...</span>
        </div>
        <div class="active-actions button-group">
          <button id="btn-sync-flow" class="ag-btn-secondary">Sincronizar</button>
          <button id="btn-finish-flow" class="ag-btn-danger-large">Finalizar</button>
          <button id="btn-undo-flow" class="ag-btn-secondary margin-top-sm">Desfazer</button>
        </div>
      </div>

      <div id="success-panel" class="ag-success-panel hidden">
        <div class="success-icon minimal-icon huge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <h2>Sucesso!</h2>
        <p id="success-message-text">Operação realizada.</p>
        <button id="btn-back-home" class="ag-btn-primary full-width">Continuar</button>
      </div>

      <div id="existing-flow-alert" class="ag-alert-box hidden">
        <div class="alert-icon minimal-icon small warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        </div>
        <div class="alert-content">
          <span class="alert-title">Fluxo em Aberto</span>
          <p id="existing-flow-msg">...</p>
          <div class="alert-actions">
            <button id="btn-goto-branch" class="ag-btn-warning-small">Ir</button>
            <button id="btn-delete-existing" class="ag-btn-danger-small">Limpar</button>
          </div>
        </div>
      </div>

      <div id="terminal-container" class="ag-terminal">
        <div class="terminal-header">
          <div class="terminal-dots">
            <span class="dot red"></span>
            <span class="dot yellow"></span>
            <span class="dot green"></span>
          </div>
          <span class="terminal-title">Console</span>
          <button id="btn-clear-terminal" class="minimal-icon mini-btn" title="Limpar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        </div>
        <div id="terminal-log" class="terminal-body"></div>
      </div>

      <div id="status-panel" class="status-panel">
        <div class="status-indicator"></div>
        <p id="status-message">Ready</p>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}
exports.GitflowSidebarProvider = GitflowSidebarProvider;
GitflowSidebarProvider.viewType = 'antigravity-hello-view';
//# sourceMappingURL=GitflowSidebarProvider.js.map