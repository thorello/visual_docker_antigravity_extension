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
        this.sshService.startShell(
            (data: string) => {
                this.writeEmitter.fire(data);
            },
            () => {
                this.closeEmitter.fire(0);
            }
        ).then(stream => {
            this.shellStream = stream;
            // Sempre dar sudo su primeiro como pedido pelo usuário
            setTimeout(() => {
                if (this.shellStream && this.shellStream.write) {
                    this.shellStream.write('sudo su\n');
                    
                    if (this.initialCommand) {
                        // Esperamos tempo suficiente para o sudo su ser processado (tempo aumentado para estabilidade)
                        setTimeout(() => {
                            // Limpa a linha caso haja algum eco ou resíduo
                            this.shellStream.write('\u0003\n');
                            setTimeout(() => {
                                // Comando simples agora, o ID é resolvido no backend
                                this.shellStream.write(`${this.initialCommand}\n`);
                            }, 500);
                        }, 3500);
                    }
                }
            }, 1000);
        }).catch(err => {
            this.writeEmitter.fire(`\r\nErro ao abrir shell: ${err.message}\r\n`);
            this.closeEmitter.fire(1);
        });
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
