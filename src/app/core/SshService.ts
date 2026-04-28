import * as vscode from 'vscode';
import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class SshService {
    private client: Client | null = null;
    private sftpClient: SFTPWrapper | null = null;
    private wslDistro: string | null = null;
    private wslPassword: string | null = null;

    private isMock: boolean = false;
    private _isWsl: boolean = false;

    public configId: string = '';
    public serverLabel: string = 'Remote Server';
    public serverAlias: string = '';
    public serverHost: string = '';


    get isConnected(): boolean {
        return this.client !== null || this._isWsl || this.isMock;
    }

    get isWsl(): boolean {
        return this._isWsl;
    }

    public async connect(config: ConnectConfig & { id?: string, isWsl?: boolean, wslDistro?: string, wslPassword?: string, isMock?: boolean, label?: string, alias?: string }): Promise<void> {
        this.disconnect();
        this.configId = config.id || 'default';
        this.serverAlias = config.alias || '';
        this.serverHost = config.host || '';
        this.serverLabel = config.label || config.host || 'Remote Server';

        return new Promise((resolve, reject) => {
            if (config.isMock) {
                this.isMock = true;
                resolve();
                return;
            }

            if (config.isWsl) {
                this._isWsl = true;
                this.wslDistro = config.wslDistro || null;
                this.wslPassword = config.wslPassword || null;
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
        this.wslPassword = null;
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
                const args = ['sh', '-c', `cat "${remotePath}"`];
                if (this.wslDistro) {
                    args.unshift('-d', this.wslDistro, '--');
                } else {
                    args.unshift('--');
                }

                console.log(`[SshService] Lendo via WSL: wsl ${args.join(' ')}`);
                const child = child_process.spawn('wsl', args);
                
                const chunks: Buffer[] = [];
                child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
                
                child.on('close', (code) => {
                    if (code !== 0) {
                        return reject(new Error(`Erro ao ler arquivo WSL (code ${code})`));
                    }
                    resolve(Buffer.concat(chunks));
                });

                child.on('error', (err) => reject(err));
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
                const args = ['sh', '-c', `stat -c "%F;%s" "${remotePath}"`];
                if (this.wslDistro) {
                    args.unshift('-d', this.wslDistro, '--');
                } else {
                    args.unshift('--');
                }

                console.log(`[SshService] Stat via WSL: wsl ${args.join(' ')}`);
                const child = child_process.spawn('wsl', args);
                
                let stdout = '';
                child.stdout.on('data', data => stdout += data.toString());
                
                child.on('close', (code) => {
                    if (code !== 0) {
                        // Fallback heuristic
                        const isDir = !remotePath.split('/').pop()?.includes('.');
                        return resolve({ isDirectory: isDir, size: 0 });
                    }
                    const [type, sizeStr] = stdout.trim().replace(/"/g, '').split(';');
                    const isDir = type ? type.toLowerCase().includes('directory') : false;
                    resolve({ isDirectory: isDir, size: parseInt(sizeStr) || 0 });
                });

                child.on('error', () => {
                    const isDir = !remotePath.split('/').pop()?.includes('.');
                    resolve({ isDirectory: isDir, size: 0 });
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
            
            // Retorna um objeto que simula o stream do ssh2 para compatibilidade com o SshTerminalProvider
            return {
                write: (data: string) => wslProcess.stdin.write(data),
                kill: () => wslProcess.kill(),
                stdin: wslProcess.stdin,
                stdout: wslProcess.stdout,
                stderr: wslProcess.stderr
            };
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

    /**
     * Abre um canal exec com PTY alocado.
     * Diferente do startShell, passa o comando diretamente ao servidor sem shell interativo,
     * eliminando o problema de mangling de caracteres em strings longas.
     */
    public async startExec(command: string, onData: (data: string) => void, onExit: () => void): Promise<any> {
        if (this.isMock || this._isWsl) {
            const stream = await this.startShell(onData, onExit);
            setTimeout(() => { stream.write(command + '\n'); }, 1000);
            return stream;
        }
        if (!this.client) throw new Error('Not connected');

        return new Promise((resolve, reject) => {
            // { pty: true } aloca PTY; o comando vai direto, sem shell interativo
            this.client!.exec(command, { pty: true }, (err, stream) => {
                if (err) return reject(err);
                stream.on('data', (data: Buffer) => onData(data.toString()));
                stream.stderr.on('data', (data: Buffer) => onData(data.toString()));
                stream.on('close', () => onExit());
                resolve(stream);
            });
        });
    }


    public async executeCommand(command: string): Promise<string> {
        return new Promise((resolve, reject) => {

            if (this.isMock) {
                if (command.includes('docker ps')) {
                    resolve("id1|nginx:latest|Up 2 hours|web-server\nid2|postgres:13|Up 5 hours|db-prod\nid3|redis:alpine|Exited (0) 1 day ago|cache");
                } else if (command.includes('docker service ls')) {
                    resolve("sid1|api-gateway|replicated|3/3|my-api:v1\nsid2|worker-node|replicated|1/2|my-worker:latest\nsid3|monitoring|global|1/1|prometheus:latest");
                } else if (command.includes('docker service ps')) {
                    resolve("t1|api-gateway.1|node-1|Running|Running 2 hours ago\nt2|api-gateway.2|node-2|Running|Running 2 hours ago\nt3|api-gateway.3|node-1|Running|Running 2 hours ago");
                } else if (command.includes('docker service logs')) {
                    resolve("[2026-04-08 20:20:01] INFO: API Gateway started successfully\n[2026-04-08 20:21:05] DEBUG: Received request from 172.18.0.5\n[2026-04-08 20:22:10] WARN: Rate limit reached for IP 10.0.0.55\n[2026-04-08 20:25:33] INFO: Database connection pool health check: OK");
                } else if (command.includes('docker logs')) {
                    resolve("yarn run v1.22.19\n$ node dist/index.js\n[server]: Server is running at http://localhost:3000\n[db]: Connected to PostgreSQL\n[redis]: Cache warmed up\n[api]: GET /api/health - 200 OK\n[api]: POST /api/v1/data - 201 Created");
                } else {
                    resolve(`Comando mock executado: ${command}`);
                }
                return;
            }
            if (this._isWsl) {
                // No WSL, tentamos rodar o comando limpando o 'sudo' se ele estiver no início.
                // Isso porque muitos usuários WSL não configuraram sudo NOPASSWD para o docker,
                // e o docker costuma ser acessível sem sudo se o usuário estiver no grupo 'docker'.
                const cleanCommand = command.startsWith('sudo ') ? command.substring(5) : command;
                
                const args = ['sh', '-c', cleanCommand];
                if (this.wslDistro) {
                    args.unshift('-d', this.wslDistro, '--');
                } else {
                    args.unshift('--');
                }

                console.log(`[SshService] Executando WSL: wsl ${args.join(' ')}`);
                const child = child_process.spawn('wsl', args);
                
                let stdout = '';
                let stderr = '';
                
                child.stdout.on('data', data => stdout += data.toString());
                child.stderr.on('data', data => stderr += data.toString());
                
                child.on('close', (code: number) => {
                    // Se falhou sem sudo e o comando original tinha sudo, tentamos uma última vez com o original
                    // apenas se o erro parecer ser de permissão negada.
                    if (code !== 0 && command.startsWith('sudo ') && stderr.toLowerCase().includes('permission denied')) {
                        let retryCmd = command;
                        if (this.wslPassword) {
                            // Se temos senha, usamos sudo -S para injetar via stdin
                            retryCmd = `echo '${this.wslPassword.replace(/'/g, "'\\''")}' | sudo -S sh -c "${command.substring(5).replace(/"/g, '\\"')}"`;
                        }

                        const originalArgs = ['sh', '-c', retryCmd];
                        if (this.wslDistro) {
                            originalArgs.unshift('-d', this.wslDistro, '--');
                        } else {
                            originalArgs.unshift('--');
                        }
                        
                        const childRetry = child_process.spawn('wsl', originalArgs);
                        let stdoutR = '';
                        let stderrR = '';
                        childRetry.stdout.on('data', data => stdoutR += data.toString());
                        childRetry.stderr.on('data', data => stderrR += data.toString());
                        childRetry.on('close', (codeR: number) => {
                            if (codeR !== 0) {
                                reject(new Error(stderrR || stdoutR || `Comando falhou no WSL com código ${codeR}`));
                            } else {
                                resolve(stdoutR);
                            }
                        });
                    } else if (code !== 0) {
                        reject(new Error(stderr || stdout || `Comando falhou no WSL com código ${code}`));
                    } else {
                        resolve(stdout);
                    }
                });

                child.on('error', (err) => {
                    resolve(`Erro ao iniciar processo WSL: ${err.message}`);
                });
                return;
            }

            if (!this.client) return reject(new Error('Not connected'));
            this.client.exec(command, (err, stream) => {
                if (err) return reject(err);
                let stdout = '';
                let stderr = '';
                stream.on('data', (data: Buffer) => stdout += data.toString());
                stream.stderr.on('data', (data: Buffer) => stderr += data.toString());
                stream.on('close', (code: number) => {
                    if (code !== 0) {
                        reject(new Error(stderr || stdout || `Comando falhou com código ${code}`));
                    } else {
                        resolve(stdout);
                    }
                });
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
