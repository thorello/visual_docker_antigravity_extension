# Visual Server Extension

## 1. Instalação de Dependências
```bash
npm install
```

## 2. Desenvolvimento (Debug F5)
Pressione `F5` na janela do seu editor para inicializar o Extension Host.  
Você também deve iniciar a compilação do TypeScript para acompanhar mudanças usando:
```bash
npm run watch
```

Para abrir o Visual Server, utilize na Activity Bar o ícone do servidor e clique em "Open Dashboard" ou aperte Ctrl+Shift+P e procure `Visual Server: Abrir Dashboard`.

## 3. Empacotar e Instalar Permanente
Para exportar a extensão para um pacote ".vsix":

```powershell
# Compilar e empacotar
npx vsce package

# Exemplo para instalar/atualizar
code --install-extension visual-server-0.0.1.vsix --force
```

## 4. Estrutura Semantic
- `src/core/VisualServerPanel.ts`: Webview Backend, gerencia as mensagens do FrontEnd (UI).
- `src/services/sshService.ts`: Wrapper para conectar e executar comandos SSH ou via WSL (`wsl -d`).
- `src/services/storageService.ts`: Usa `SecretStorage` para persistir dados bancários da extensão.
- `resources/webview/`: Interface HTML/CSS/JS (Vanilla) limpa e estilizada consumindo o webview-ui-toolkit.
