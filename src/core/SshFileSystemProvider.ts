import * as vscode from 'vscode';
import { SshService } from '../services/sshService';
import { StorageService } from '../services/storageService';

export class SshFileSystemProvider implements vscode.FileSystemProvider {
    private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._onDidChangeFile.event;

    private sshServices = new Map<string, SshService>();

    constructor(private context: vscode.ExtensionContext, private storageService: StorageService) {}

    private async getSshService(uri: vscode.Uri): Promise<SshService> {
        const serverId = uri.authority;
        console.log(`[FS Provider] Obtendo serviço para: ${uri.toString()} (Authority: ${serverId})`);
        
        // Decodifica a autoridade caso tenha sido escapada na URI
        const decodedServerId = decodeURIComponent(serverId);
        
        let ssh = this.sshServices.get(decodedServerId);
        if (!ssh || !ssh.isConnected) {
            console.log(`[FS Provider] Criando nova conexão para servidor: ${decodedServerId}`);
            ssh = new SshService();
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

    watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        return new vscode.Disposable(() => {});
    }

    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
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
        } catch (err: any) {
            console.error(`[FS Provider] Stat Erro: ${err.message}`);
            throw vscode.FileSystemError.FileNotFound(uri);
        }
    }

    async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const ssh = await this.getSshService(uri);
        const files = await ssh.listDirectory(uri.path);
        return files.map(f => [f.filename, f.isDirectory ? vscode.FileType.Directory : vscode.FileType.File]);
    }

    createDirectory(_uri: vscode.Uri): void | Thenable<void> {
        throw new Error('Method not implemented.');
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        console.log(`[FS Provider] Read file: ${uri.path}`);
        const ssh = await this.getSshService(uri);
        try {
            const content = await ssh.readRemoteFile(uri.path);
            console.log(`[FS Provider] File read successful! Size: ${content.length}`);
            return new Uint8Array(content);
        } catch (err: any) {
            console.error(`[FS Provider] Read file Erro: ${err.message}`);
            throw vscode.FileSystemError.Unavailable(`Falha ao ler arquivo: ${err.message}`);
        }
    }

    writeFile(_uri: vscode.Uri, _content: Uint8Array, _options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
        throw new Error('Write file not implemented yet.');
    }

    delete(_uri: vscode.Uri, _options: { recursive: boolean; }): void | Thenable<void> {
        throw new Error('Delete not implemented.');
    }

    rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean; }): void | Thenable<void> {
        throw new Error('Rename not implemented.');
    }
}
