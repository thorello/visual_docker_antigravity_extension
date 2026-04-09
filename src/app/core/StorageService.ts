import * as vscode from 'vscode';

export interface ServerConfig {
    id: string;
    label: string;
    alias?: string;
    host: string;
    username: string;
    port: number;
    isWsl: boolean;
    wslDistro?: string;
    password?: string;
}

export class StorageService {
    private static readonly SERVERS_KEY = 'visual_server.servers';
    private static readonly RECENT_KEY = 'visual_server.recent';

    
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

    public getRecentItems(serverId?: string): any[] {
        const allRecent = this.context.globalState.get<any[]>(StorageService.RECENT_KEY, []);
        if (serverId) {
            return allRecent.filter(item => item.serverId === serverId).sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
        }
        return allRecent.sort((a, b) => b.timestamp - a.timestamp).slice(0, 15);
    }

    public async addRecentItem(serverId: string, serverLabel: string, serverAlias: string, serverHost: string, item: { type: 'container' | 'worker', id: string, name: string, node?: string }): Promise<void> {
        let allRecent = this.context.globalState.get<any[]>(StorageService.RECENT_KEY, []);
        
        // Remover entrada duplicada (mesmo ID e mesmo tipo no mesmo servidor)
        allRecent = allRecent.filter(i => !(i.id === item.id && i.type === item.type && i.serverId === serverId));
        
        // Adicionar novo item no topo
        allRecent.unshift({
            ...item,
            serverId,
            serverLabel,
            serverAlias,
            serverHost,
            timestamp: Date.now()
        });

        // Limitar total global (opcional, mas bom pra evitar crescer infinitamente)
        if (allRecent.length > 50) {
            allRecent = allRecent.slice(0, 50);
        }

        await this.context.globalState.update(StorageService.RECENT_KEY, allRecent);
    }
}

