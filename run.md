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
Use este fluxo para testar a extensão diretamente no Antigravity:

```powershell
# 1. Carrega a versão do arquivo .version (remove o 'v' se presente)
$VERSION = (Get-Content .version).Trim().Replace('v', '')

# 2. Sincroniza a versão no package.json (sem criar commit/tag)
npm version $VERSION --no-git-tag-version

# 3. Gera o arquivo .vsix
npx vsce package --allow-missing-repository --allow-star-activation

# 4. Instala/Atualiza no Antigravity usando a versão dinâmica
antigravity --install-extension "visual-server-$VERSION.vsix" --force
```


## 4. Estrutura Semantic (Feature-First)
- `src/app/core/`: Infraestrutura global (Storage, SSH Service, FileSystem Provider).
- `src/app/features/main_screen/`: Lógica e apresentação da tela principal (Dashboard).
- `src/app/features/sidebar/`: Interface de conexão SSH e explorer lateral.
- `src/app/features/activitybar_icon/`: Ativos e ícones da Activity Bar.
