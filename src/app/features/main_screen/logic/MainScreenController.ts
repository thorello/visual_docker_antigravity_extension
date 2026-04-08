import * as vscode from 'vscode';
import { StorageService } from '../../../core/StorageService';
import { SshService } from '../../../core/SshService';

export class MainScreenController {
    public static currentPanel: MainScreenController | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private storageService: StorageService;

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        if (MainScreenController.currentPanel) {
            MainScreenController.currentPanel._panel.reveal(vscode.ViewColumn.One);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'antigravityMain',
            'Antigravity Main Screen',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'src', 'app', 'features', 'main_screen', 'presentation')]
            }
        );

        MainScreenController.currentPanel = new MainScreenController(panel, extensionUri, context);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.storageService = new StorageService(context);

        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message: any) => {
                switch (message.command) {
                    case 'ping':
                        this._panel.webview.postMessage({ command: 'pong', data: 'Hello from Antigravity Backend!' });
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public dispose() {
        MainScreenController.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }

    private _update() {
        this._panel.title = 'Antigravity Main Screen';
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'app', 'features', 'main_screen', 'presentation', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'app', 'features', 'main_screen', 'presentation', 'style.css'));

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>Antigravity Blueprint</title>
                <script type="module" src="https://cdn.jsdelivr.net/npm/@vscode/webview-ui-toolkit/dist/toolkit.min.js"></script>
            </head>
            <body>
                <div class="app-layout">
                    <div class="main-content">
                        <h1>Antigravity Extension Blueprint</h1>
                        <p>This is a starting point for your Antigravity IDE extension.</p>
                        <vscode-button id="btn-ping">Send Ping to Backend</vscode-button>
                        <div id="response-container"></div>
                    </div>
                </div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}
