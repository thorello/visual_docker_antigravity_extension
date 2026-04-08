import * as vscode from 'vscode';

export interface ServerConfig {
    id: string;
    label: string;
    host: string;
    username: string;
    port: number;
    isWsl: boolean;
    wslDistro?: string;
    password?: string;
}

export class StorageService {
    private static readonly SERVERS_KEY = 'visual_server.servers';
    
    constructor(private context: vscode.ExtensionContext) {}

    public async getServers(): Promise<ServerConfig[]> {
        const servers = this.context.globalState.get<ServerConfig[]>(StorageService.SERVERS_KEY, []);
        
        // Populate passwords from secret storage
        for (let s of servers) {
            const pwd = await this.context.secrets.get(`server_pwd_${s.id}`);
            if (pwd) s.password = pwd;
        }
        
        return servers;
    }

    public async saveServers(servers: ServerConfig[]): Promise<void> {
        // Prepare list without passwords
        const publicList = servers.map(s => {
            const { password, ...rest } = s;
            return rest;
        });
        
        await this.context.globalState.update(StorageService.SERVERS_KEY, publicList);
        
        // Save passwords in secrets
        for (let s of servers) {
            if (s.password && s.password.trim() !== '') {
                await this.context.secrets.store(`server_pwd_${s.id}`, s.password);
            }
        }
    }

    public async addServer(server: ServerConfig): Promise<void> {
        const list = await this.getServers();
        const index = list.findIndex(s => s.id === server.id);
        if (index >= 0) {
            list[index] = server;
        } else {
            list.push(server);
        }
        await this.saveServers(list);
    }

    public async deleteServer(id: string): Promise<void> {
        const list = await this.getServers();
        const filtered = list.filter(s => s.id !== id);
        await this.saveServers(filtered);
        await this.context.secrets.delete(`server_pwd_${id}`);
    }
}
