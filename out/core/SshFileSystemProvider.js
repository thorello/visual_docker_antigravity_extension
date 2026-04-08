"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SshFileSystemProvider = void 0;
const vscode = require("vscode");
const sshService_1 = require("../services/sshService");
class SshFileSystemProvider {
    constructor(context, storageService) {
        this.context = context;
        this.storageService = storageService;
        this._onDidChangeFile = new vscode.EventEmitter();
        this.onDidChangeFile = this._onDidChangeFile.event;
        this.sshServices = new Map();
    }
    async getSshService(uri) {
        const serverId = uri.authority;
        console.log(`[FS Provider] Obtendo serviço para: ${uri.toString()} (Authority: ${serverId})`);
        // Decodifica a autoridade caso tenha sido escapada na URI
        const decodedServerId = decodeURIComponent(serverId);
        let ssh = this.sshServices.get(decodedServerId);
        if (!ssh || !ssh.isConnected) {
            console.log(`[FS Provider] Criando nova conexão para servidor: ${decodedServerId}`);
            ssh = new sshService_1.SshService();
            const servers = await this.storageService.getServers();
            const server = servers.find(s => s.id === decodedServerId);
            if (!server) {
                console.error(`[FS Provider] Servidor não encontrado no storage: ${decodedServerId}`);
                throw vscode.FileSystemError.Unavailable(`Configuração do servidor '${decodedServerId}' não encontrada`);
            }
            console.log(`[FS Provider] Tentando conectar a ${server.host || 'WSL (' + server.wslDistro + ')'}`);
            await ssh.connect(server);
            this.sshServices.set(decodedServerId, ssh);
            console.log(`[FS Provider] Conectado e mapeado!`);
        }
        return ssh;
    }
    watch(_uri, _options) {
        return new vscode.Disposable(() => { });
    }
    async stat(uri) {
        console.log(`[FS Provider] Stat: ${uri.path}`);
        const ssh = await this.getSshService(uri);
        try {
            const info = await ssh.getFileInfo(uri.path);
            return {
                type: info.isDirectory ? vscode.FileType.Directory : vscode.FileType.File,
                ctime: Date.now(),
                mtime: Date.now(),
                size: info.size
            };
        }
        catch (err) {
            console.error(`[FS Provider] Stat Erro: ${err.message}`);
            throw vscode.FileSystemError.FileNotFound(uri);
        }
    }
    async readDirectory(uri) {
        const ssh = await this.getSshService(uri);
        const files = await ssh.listDirectory(uri.path);
        return files.map(f => [f.filename, f.isDirectory ? vscode.FileType.Directory : vscode.FileType.File]);
    }
    createDirectory(_uri) {
        throw new Error('Method not implemented.');
    }
    async readFile(uri) {
        console.log(`[FS Provider] Read file: ${uri.path}`);
        const ssh = await this.getSshService(uri);
        try {
            const content = await ssh.readRemoteFile(uri.path);
            console.log(`[FS Provider] File read successful! Size: ${content.length}`);
            return new Uint8Array(content);
        }
        catch (err) {
            console.error(`[FS Provider] Read file Erro: ${err.message}`);
            throw vscode.FileSystemError.Unavailable(`Falha ao ler arquivo: ${err.message}`);
        }
    }
    writeFile(_uri, _content, _options) {
        throw new Error('Write file not implemented yet.');
    }
    delete(_uri, _options) {
        throw new Error('Delete not implemented.');
    }
    rename(_oldUri, _newUri, _options) {
        throw new Error('Rename not implemented.');
    }
}
exports.SshFileSystemProvider = SshFileSystemProvider;
//# sourceMappingURL=SshFileSystemProvider.js.map