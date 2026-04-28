const { spawn } = require('child_process');

async function testWslCommand(distro, command) {
    return new Promise((resolve) => {
        const cleanCommand = command.startsWith('sudo ') ? command.substring(5) : command;
        const args = ['-d', distro, '--', 'sh', '-c', cleanCommand];
        
        console.log(`Testando: wsl ${args.join(' ')}`);
        const child = spawn('wsl', args);
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', data => stdout += data.toString());
        child.stderr.on('data', data => stderr += data.toString());
        
        child.on('close', (code) => {
            console.log(`Fim (code ${code})`);
            console.log(`STDOUT: ${stdout.substring(0, 100)}...`);
            if (stderr) console.log(`STDERR: ${stderr}`);
            resolve({ code, stdout, stderr });
        });
    });
}

async function run() {
    const distro = 'Ubuntu';
    const dockerCmd = "sudo docker ps -a --format '{{.ID}}|{{.Image}}|{{.Status}}|{{.Names}}'";
    
    console.log('--- Teste 1: Executando comando Docker no WSL (esperado sucesso sem sudo) ---');
    const res = await testWslCommand(distro, dockerCmd);
    
    if (res.code === 0 && res.stdout.includes('|')) {
        console.log('SUCESSO: Comando executado e formatado corretamente.');
    } else {
        console.log('FALHA: O comando não retornou o formato esperado.');
    }
}

run();
