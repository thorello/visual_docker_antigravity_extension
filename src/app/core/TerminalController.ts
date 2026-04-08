import * as vscode from 'vscode';
import { SshService } from './SshService';
import { SshTerminalProvider } from './SshTerminalProvider';

export class TerminalController {
    private static activeTerminals: Map<string, vscode.Terminal> = new Map();

    public static openSshTerminal(sshService: SshService, serverLabel: string) {
        // If terminal already exists for this server, just show it
        if (this.activeTerminals.has(serverLabel)) {
            const existing = this.activeTerminals.get(serverLabel);
            existing?.show();
            return;
        }

        const pty = new SshTerminalProvider(sshService, serverLabel);
        const terminal = vscode.window.createTerminal({
            name: `SSH: ${serverLabel}`,
            pty
        });

        terminal.show();
        this.activeTerminals.set(serverLabel, terminal);

        // Remove from map when closed
        vscode.window.onDidCloseTerminal(t => {
            if (t === terminal) {
                this.activeTerminals.delete(serverLabel);
            }
        });
    }
}
