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
exports.MainScreenController = void 0;
const vscode = __importStar(require("vscode"));
const StorageService_1 = require("../../../core/StorageService");
class MainScreenController {
    static createOrShow(extensionUri, context) {
        if (MainScreenController.currentPanel) {
            MainScreenController.currentPanel._panel.reveal(vscode.ViewColumn.One);
            return;
        }
        const panel = vscode.window.createWebviewPanel('antigravityMain', 'Antigravity Main Screen', vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'src', 'app', 'features', 'main_screen', 'presentation')]
        });
        MainScreenController.currentPanel = new MainScreenController(panel, extensionUri, context);
    }
    constructor(panel, extensionUri, context) {
        this._disposables = [];
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.storageService = new StorageService_1.StorageService(context);
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'ping':
                    this._panel.webview.postMessage({ command: 'pong', data: 'Hello from Antigravity Backend!' });
                    break;
            }
        }, null, this._disposables);
    }
    dispose() {
        MainScreenController.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x)
                x.dispose();
        }
    }
    _update() {
        this._panel.title = 'Antigravity Main Screen';
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    }
    _getHtmlForWebview(webview) {
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
exports.MainScreenController = MainScreenController;
//# sourceMappingURL=MainScreenController.js.map