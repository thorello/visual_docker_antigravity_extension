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

## 4. Estrutura Semantic (Feature-First)
- `src/app/core/`: Infraestrutura global (Storage, SSH Service, FileSystem Provider).
- `src/app/features/main_screen/`: Lógica e apresentação da tela principal (Dashboard).
- `src/app/features/sidebar/`: Interface de conexão SSH e explorer lateral.
- `src/app/features/activitybar_icon/`: Ativos e ícones da Activity Bar.
