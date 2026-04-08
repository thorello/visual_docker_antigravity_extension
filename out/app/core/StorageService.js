"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
class StorageService {
    constructor(context) {
        this.context = context;
    }
    async getServers() {
        const servers = this.context.globalState.get(StorageService.SERVERS_KEY, []);
        // Populate passwords from secret storage
        for (let s of servers) {
            const pwd = await this.context.secrets.get(`server_pwd_${s.id}`);
            if (pwd)
                s.password = pwd;
        }
        return servers;
    }
    async saveServers(servers) {
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
    async addServer(server) {
        const list = await this.getServers();
        const index = list.findIndex(s => s.id === server.id);
        if (index >= 0) {
            list[index] = server;
        }
        else {
            list.push(server);
        }
        await this.saveServers(list);
    }
    async deleteServer(id) {
        const list = await this.getServers();
        const filtered = list.filter(s => s.id !== id);
        await this.saveServers(filtered);
        await this.context.secrets.delete(`server_pwd_${id}`);
    }
}
exports.StorageService = StorageService;
StorageService.SERVERS_KEY = 'visual_server.servers';
//# sourceMappingURL=StorageService.js.map