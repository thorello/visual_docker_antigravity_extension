import * as vscode from 'vscode';
import { SshService } from './SshService';
import { StorageService } from './StorageService';

export class FileSystemProvider implements vscode.FileSystemProvider {
    private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._onDidChangeFile.event;

    private services = new Map<string, SshService>();

    constructor(private context: vscode.ExtensionContext, private storageService: StorageService) {}

    private async getService(uri: vscode.Uri): Promise<SshService> {
        const id = decodeURIComponent(uri.authority);
        let service = this.services.get(id);
        if (!service) {
            service = new SshService();
            // Logic to initialize service based on id
            this.services.set(id, service);
        }
        return service;
    }

    watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        return new vscode.Disposable(() => {});
    }

    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        return {
            type: vscode.FileType.File,
            ctime: Date.now(),
            mtime: Date.now(),
            size: 0
        };
    }

    async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        return [];
    }

    createDirectory(_uri: vscode.Uri): void | Thenable<void> {
        throw new Error('Method not implemented.');
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        return new Uint8Array(0);
    }

    writeFile(_uri: vscode.Uri, _content: Uint8Array, _options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
        throw new Error('Method not implemented.');
    }

    delete(_uri: vscode.Uri, _options: { recursive: boolean; }): void | Thenable<void> {
        throw new Error('Method not implemented.');
    }

    rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean; }): void | Thenable<void> {
        throw new Error('Method not implemented.');
    }
}


