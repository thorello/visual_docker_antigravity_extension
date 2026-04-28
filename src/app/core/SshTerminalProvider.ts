import * as vscode from 'vscode';
import { SshService } from './SshService';

export class SshTerminalProvider implements vscode.Pseudoterminal {
    private writeEmitter = new vscode.EventEmitter<string>();
    onDidWrite: vscode.Event<string> = this.writeEmitter.event;
    private closeEmitter = new vscode.EventEmitter<number>();
    onDidClose?: vscode.Event<number> = this.closeEmitter.event;

    private shellStream: any;

    constructor(
        private sshService: SshService, 
        private serverName: string,
        private initialCommand?: string
    ) {}

    open(initialDimensions: vscode.TerminalDimensions | undefined): void {
        if (this.initialCommand) {
            // Usa exec com PTY: o comando vai direto ao kernel do servidor, sem shell interativo.
            // Isso elimina completamente o problema de mangling de caracteres em strings longas.
            // No WSL não forçamos sudo su pois pode travar pedindo senha em um terminal não-interativo
            const cmd = this.sshService.isWsl ? this.initialCommand : `sudo su -c '${this.initialCommand.replace(/'/g, "'\\''")}'`;
            
            this.sshService.startExec(cmd,
                (data: string) => { this.writeEmitter.fire(data); },
                () => { this.closeEmitter.fire(0); }
            ).then(stream => {
                this.shellStream = stream;
            }).catch(err => {
                this.writeEmitter.fire(`\r\nErro ao abrir terminal: ${err.message}\r\n`);
                this.closeEmitter.fire(1);
            });
        } else {
            // Sem comando inicial: abre shell interativo normal com sudo su
            this.sshService.startShell(
                (data: string) => { this.writeEmitter.fire(data); },
                () => { this.closeEmitter.fire(0); }
            ).then(stream => {
                this.shellStream = stream;
                setTimeout(() => {
                    if (this.shellStream && this.shellStream.write && !this.sshService.isWsl) {
                        this.shellStream.write('sudo su\n');
                    }
                }, 1000);
            }).catch(err => {
                this.writeEmitter.fire(`\r\nErro ao abrir shell: ${err.message}\r\n`);
                this.closeEmitter.fire(1);
            });
        }
    }

    close(): void {
        if (this.shellStream && this.shellStream.kill) {
            this.shellStream.kill();
        } else if (this.shellStream && this.shellStream.end) {
            this.shellStream.end();
        }
    }

    handleInput(data: string): void {
        if (this.shellStream && this.shellStream.write) {
            this.shellStream.write(data);
        }
    }
}
