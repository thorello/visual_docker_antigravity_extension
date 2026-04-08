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
exports.FileSystemProvider = void 0;
const vscode = __importStar(require("vscode"));
const SshService_1 = require("./SshService");
class FileSystemProvider {
    constructor(context, storageService) {
        this.context = context;
        this.storageService = storageService;
        this._onDidChangeFile = new vscode.EventEmitter();
        this.onDidChangeFile = this._onDidChangeFile.event;
        this.services = new Map();
    }
    async getService(uri) {
        const id = decodeURIComponent(uri.authority);
        let service = this.services.get(id);
        if (!service) {
            service = new SshService_1.SshService();
            // Logic to initialize service based on id
            this.services.set(id, service);
        }
        return service;
    }
    watch(_uri, _options) {
        return new vscode.Disposable(() => { });
    }
    async stat(uri) {
        return {
            type: vscode.FileType.File,
            ctime: Date.now(),
            mtime: Date.now(),
            size: 0
        };
    }
    async readDirectory(uri) {
        return [];
    }
    createDirectory(_uri) {
        throw new Error('Method not implemented.');
    }
    async readFile(uri) {
        return new Uint8Array(0);
    }
    writeFile(_uri, _content, _options) {
        throw new Error('Method not implemented.');
    }
    delete(_uri, _options) {
        throw new Error('Method not implemented.');
    }
    rename(_oldUri, _newUri, _options) {
        throw new Error('Method not implemented.');
    }
}
exports.FileSystemProvider = FileSystemProvider;
//# sourceMappingURL=FileSystemProvider.js.map