import * as vscode from 'vscode';
import { SshService } from './SshService';
import { SshTerminalProvider } from './SshTerminalProvider';

export class TerminalController {
    private static activeTerminals: Map<string, vscode.Terminal> = new Map();

    public static openSshTerminal(sshService: SshService, serverLabel: string) {
        const pty = new SshTerminalProvider(sshService, serverLabel);
        const terminal = vscode.window.createTerminal({
            name: `Shell: ${serverLabel}`,
            pty
        });

        terminal.show();
    }

    public static openContainerTerminal(sshService: SshService, serverLabel: string, containerId: string, semanticName: string) {
        // Agora recebemos o ID já resolvido pelo backend, mantendo o comando o mais curto possível para evitar mangling.
        const command = `docker exec -it ${containerId} sh -c "[ -f /bin/bash ] && /bin/bash || /bin/sh"`;
        
        const pty = new SshTerminalProvider(sshService, serverLabel, command);
        const terminal = vscode.window.createTerminal({
            name: `Exec: ${semanticName} (${serverLabel})`,
            pty
        });

        terminal.show();
    }
}
