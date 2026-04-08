import * as vscode from 'vscode';
import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class SshService {
    private client: Client | null = null;
    private sftpClient: SFTPWrapper | null = null;
    private wslDistro: string | null = null;

    private isMock: boolean = false;
    private _isWsl: boolean = false;

    get isConnected(): boolean {
        return this.client !== null || this._isWsl || this.isMock;
    }

    get isWsl(): boolean {
        return this._isWsl;
    }

    public async connect(config: ConnectConfig & { isWsl?: boolean, wslDistro?: string, isMock?: boolean }): Promise<void> {
        return new Promise((resolve, reject) => {
            if (config.isMock) {
                this.isMock = true;
                resolve();
                return;
            }

            if (config.isWsl) {
                this._isWsl = true;
                this.wslDistro = config.wslDistro || null;
                console.log(`Conectado ao WSL. Distro: ${this.wslDistro || 'Padrão'}`);
                resolve();
                return;
            }

            this.client = new Client();
            
            this.client.on('ready', () => {
                this.client!.sftp((err, sftp) => {
                    if (err) {
                        this.disconnect();
                        return reject(err);
                    }
                    this.sftpClient = sftp;
                    resolve();
                });
            }).on('error', (err) => {
                this.disconnect();
                reject(err);
            }).connect({
                host: config.host,
                port: config.port,
                username: config.username,
                password: config.password,
                readyTimeout: 15000
            });
        });
    }

    public disconnect(): void {
        if (this.sftpClient) {
            // No direct close for SFTP Wrapper in ssh2, ending client clears it
            this.sftpClient = null;
        }
        if (this.client) {
            this.client.end();
            this.client = null;
        }
        this.wslDistro = null;
        this._isWsl = false;
        this.isMock = false;
    }

    public async listDirectory(dirPath: string): Promise<any[]> {
        return new Promise((resolve, reject) => {
            if (this.isMock) {
                setTimeout(() => {
                    const mockFiles = [
                        { filename: 'home', isDirectory: true },
                        { filename: 'etc', isDirectory: true },
                        { filename: 'var', isDirectory: true },
                        { filename: 'usr', isDirectory: true },
                        { filename: 'README.txt', isDirectory: false },
                        { filename: 'config.json', isDirectory: false },
                        { filename: 'script.sh', isDirectory: false },
                        { filename: 'server.log', isDirectory: false },
                    ];
                    
                    // Simple path simulation
                    if (dirPath !== '/') {
                        const base = dirPath.split('/').pop() || 'dir';
                        resolve([
                            { filename: 'subdir1', isDirectory: true },
                            { filename: `${base}_info.txt`, isDirectory: false },
                            { filename: 'notes.md', isDirectory: false }
                        ]);
                    } else {
                        resolve(mockFiles);
                    }
                }, 300);
                return;
            }

            if (this._isWsl) {
                const args = this.wslDistro ? ['-d', this.wslDistro, '--', 'ls', '-1p', dirPath] : ['--', 'ls', '-1p', dirPath];
                const ls = child_process.spawn('wsl', args);
                let stdout = '';
                let stderr = '';
                
                ls.stdout.on('data', data => stdout += data.toString());
                ls.stderr.on('data', data => stderr += data.toString());
                
                ls.on('close', (code) => {
                    if (code !== 0) {
                        console.error(`WSL ls erro (code ${code}): ${stderr}`);
                        return resolve([]);
                    }
                    const lines = stdout.split('\n').map(l => l.trim()).filter(l => l);
                    const items = lines.map(line => {
                        const isDir = line.endsWith('/');
                        const name = isDir ? line.substring(0, line.length - 1) : line;
                        return { filename: name, isDirectory: isDir };
                    });
                    items.sort((a, b) => {
                        if (a.isDirectory && !b.isDirectory) return -1;
                        if (!a.isDirectory && b.isDirectory) return 1;
                        return a.filename.localeCompare(b.filename);
                    });
                    resolve(items);
                });
                return;
            }

            if (!this.sftpClient) return reject(new Error('Not connected to SFTP'));
            this.sftpClient.readdir(dirPath, (err, list) => {
                if (err) return reject(err);
                const items = list.filter(item => item.filename !== '.' && item.filename !== '..').map(item => {
                    // isDirectory() is not always available, use longname or attrs.mode
                    const isDir = item.longname.startsWith('d') || (item.attrs.mode !== undefined && (item.attrs.mode & 0o040000));
                    return {
                        filename: item.filename,
                        isDirectory: isDir
                    };
                });
                items.sort((a, b) => {
                    if (a.isDirectory && !b.isDirectory) return -1;
                    if (!a.isDirectory && b.isDirectory) return 1;
                    return a.filename.localeCompare(b.filename);
                });
                resolve(items);
            });
        });
    }

    public async readRemoteFile(remotePath: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            if (this.isMock) {
                resolve(Buffer.from(`Este é um conteúdo de exemplo para o arquivo: ${remotePath}\n\nAntigravity está operando.`));
                return;
            }

            if (this._isWsl) {
                const args = this.wslDistro ? ['-d', this.wslDistro, '--', 'cat', `"${remotePath}"`] : ['--', 'cat', `"${remotePath}"`];
                const cmd = `wsl ${args.join(' ')}`;
                console.log(`[SshService] Lendo via WSL: ${cmd}`);
                child_process.exec(cmd, { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 }, (err: any, stdout: Buffer) => {
                    if (err) {
                        console.error(`[SshService] Erro cat WSL: ${err.message}`);
                        return reject(err);
                    }
                    resolve(stdout);
                });
                return;
            }

            if (!this.sftpClient) return reject(new Error('Not connected to SFTP'));
            
            const chunks: Buffer[] = [];
            const stream = this.sftpClient.createReadStream(remotePath);
            
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('error', (err: any) => reject(err));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
        });
    }

    public async getFileInfo(remotePath: string): Promise<{ isDirectory: boolean, size: number }> {
        return new Promise((resolve, reject) => {
            if (this.isMock) {
                // Heurística de Mock mais refinada
                const basename = remotePath.split('/').pop() || '';
                const knownDirs = ['home', 'etc', 'var', 'usr', 'bin', 'lib', 'subdir1', 'tmp'];
                const isDir = knownDirs.includes(basename.toLowerCase()) || (basename === '' && remotePath === '/') || (!basename.includes('.') && !['README', 'LICENSE', 'config'].includes(basename));
                
                console.log(`[Mock SSH] GetFileInfo: ${remotePath} -> isDir: ${isDir}`);
                resolve({ isDirectory: isDir, size: 1024 });
                return;
            }

            if (this._isWsl) {
                // Usamos ; como separador para evitar interpretação do pipe (|) pelo shell do Windows
                const args = this.wslDistro ? ['-d', this.wslDistro, '--', 'stat', '-c', '"%F;%s"', `"${remotePath}"`] : ['--', 'stat', '-c', '"%F;%s"', `"${remotePath}"`];
                const cmd = `wsl ${args.join(' ')}`;
                console.log(`[SshService] Stat via WSL: ${cmd}`);
                child_process.exec(cmd, (err: any, stdout: string) => {
                    if (err) {
                        console.warn(`[SshService] Erro stat WSL: ${err.message}.`);
                        // Se falhar o stat, tentamos uma heurística baseada na extensão para o fallback
                        const isDir = !remotePath.split('/').pop()?.includes('.');
                        resolve({ isDirectory: isDir, size: 0 });
                        return;
                    }
                    console.log(`[SshService] Stat WSL output: ${stdout.trim()}`);
                    const [type, sizeStr] = stdout.trim().replace(/"/g, '').split(';');
                    const isDir = type.toLowerCase().includes('directory');
                    resolve({ isDirectory: isDir, size: parseInt(sizeStr) || 0 });
                });
                return;
            }

            if (!this.sftpClient) return reject(new Error('Not connected to SFTP'));
            
            this.sftpClient.stat(remotePath, (err: any, stats: any) => {
                if (err) return reject(err);
                resolve({
                    isDirectory: stats.isDirectory(),
                    size: stats.size
                });
            });
        });
    }

    public async startShell(onData: (data: string) => void, onExit: () => void): Promise<any> {
        if (this.isMock) {
            let buffer = '';
            const mockEmitter = {
                write: (data: string) => {
                    if (data === '\r' || data === '\n') {
                        onData('\r\n');
                        const cmd = buffer.trim();
                        if (cmd === 'ls') {
                            onData('README.txt  config.json  home  script.sh  server.log\r\n');
                        } else if (cmd === 'pwd') {
                            onData('/home/mock-user\r\n');
                        } else if (cmd === 'whoami') {
                            onData('mock-user\r\n');
                        } else if (cmd === 'exit') {
                            onExit();
                        } else if (cmd) {
                            onData(`mock-sh: command not found: ${cmd}\r\n`);
                        }
                        buffer = '';
                        onData('mock-user@server:~$ ');
                    } else if (data === '\u007f') { // Backspace
                        if (buffer.length > 0) {
                            buffer = buffer.slice(0, -1);
                            onData('\b \b');
                        }
                    } else {
                        buffer += data;
                        onData(data);
                    }
                },
                kill: () => onExit()
            };
            onData('Welcome to Mock SSH Session!\r\n');
            onData('mock-user@server:~$ ');
            return mockEmitter;
        }

        if (this._isWsl) {
            const cmdArgs = this.wslDistro 
                ? ['-d', this.wslDistro, 'script', '-q', '-c', '/bin/bash --login', '/dev/null']
                : ['script', '-q', '-c', '/bin/bash --login', '/dev/null'];
            
            const wslProcess = child_process.spawn('wsl', cmdArgs);
            wslProcess.stdout.on('data', data => onData(data.toString()));
            wslProcess.stderr.on('data', data => onData(data.toString()));
            wslProcess.on('exit', () => onExit());
            return wslProcess;
        }

        if (!this.client) throw new Error('Not connected');
        
        return new Promise((resolve, reject) => {
            this.client!.shell({ term: 'xterm-color', cols: 80, rows: 24 }, (err, stream) => {
                if (err) return reject(err);
                stream.on('data', (data: Buffer) => onData(data.toString()));
                stream.on('close', () => onExit());
                resolve(stream);
            });
        });
    }

    public async executeCommand(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            if (this._isWsl) {
                const cmdPrefix = this.wslDistro ? `wsl -d ${this.wslDistro} --` : `wsl --`;
                child_process.exec(`${cmdPrefix} sh -c "${command}"`, (err, stdout, stderr) => {
                    resolve(stdout + stderr);
                });
                return;
            }

            if (!this.client) return reject(new Error('Not connected'));
            this.client.exec(command, (err, stream) => {
                if (err) return reject(err);
                let output = '';
                stream.on('data', (data: Buffer) => output += data.toString());
                stream.stderr.on('data', (data: Buffer) => output += data.toString());
                stream.on('close', () => resolve(output));
            });
        });
    }

    public async uploadFile(localPath: string, remotePath: string): Promise<void> {
        if (this._isWsl) {
            return new Promise((resolve, reject) => {
                const wslBaseCmd = this.wslDistro ? `wsl -d ${this.wslDistro} --` : `wsl --`;
                child_process.exec(`${wslBaseCmd} wslpath -a -u "${localPath}"`, (err, stdout) => {
                    if (err) return reject(err);
                    const wslPath = stdout.trim();
                    child_process.exec(`${wslBaseCmd} cp "${wslPath}" "${remotePath}"`, (err2) => {
                        if (err2) reject(err2);
                        else resolve();
                    });
                });
            });
        }
        if (!this.sftpClient) throw new Error('SFTP not ready');
        return new Promise((resolve, reject) => {
            this.sftpClient!.fastPut(localPath, remotePath, (err) => {
                if (err) reject(err); else resolve();
            });
        });
    }

    public async downloadFile(remotePath: string, localPath: string): Promise<void> {
        if (this._isWsl) {
            return new Promise((resolve, reject) => {
                const wslBaseCmd = this.wslDistro ? `wsl -d ${this.wslDistro} --` : `wsl --`;
                child_process.exec(`${wslBaseCmd} wslpath -a -u "${localPath}"`, (err, stdout) => {
                    if (err) return reject(err);
                    const wslPath = stdout.trim();
                    child_process.exec(`${wslBaseCmd} cp "${remotePath}" "${wslPath}"`, (err2) => {
                        if (err2) reject(err2);
                        else resolve();
                    });
                });
            });
        }
        if (!this.sftpClient) throw new Error('SFTP not ready');
        return new Promise((resolve, reject) => {
            this.sftpClient!.fastGet(remotePath, localPath, (err) => {
                if (err) reject(err); else resolve();
            });
        });
    }
}
