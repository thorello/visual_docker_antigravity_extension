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

    public static openContainerTerminal(sshService: SshService, serverLabel: string, containerId: string, semanticName: string, targetNode?: string) {
        // Comando base suprimindo erros (2>/dev/null) para não poluir o terminal durante a busca multi-node
        const localCmd = `sudo docker exec -it ${containerId} bash 2>/dev/null || sudo docker exec -it ${containerId} sh 2>/dev/null`;
        
        let finalCommand = localCmd;

        if (targetNode) {
            // Se falhar local, tenta pivot via SSH para o nó alvo
            const pivotCmd = `ssh -t -o StrictHostKeyChecking=no ${targetNode} "sudo docker exec -it ${containerId} bash || sudo docker exec -it ${containerId} sh"`;
            finalCommand = `${localCmd} || ${pivotCmd}`;
        }

        const fallbackMsg = `echo -e "\\n\\e[31mContainer não encontrado no host atual ou no nó ${targetNode || ''}.\\e[0m"`;
        const command = `${finalCommand} || (${fallbackMsg} && /bin/bash)`;

        const pty = new SshTerminalProvider(sshService, serverLabel, command);
        const terminal = vscode.window.createTerminal({
            name: `Exec: ${semanticName} (${serverLabel})`,
            pty
        });

        terminal.show();
    }

}
