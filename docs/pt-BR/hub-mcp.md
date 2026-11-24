# Shadow MCP Hub

O Shadow MCP Hub agrega servidores MCP upstream opcionais por trás de uma única conexão local via stdio. Ele é separado do gateway de modelos: a API LiteLLM encaminha requisições de modelos, enquanto o MCP Hub encaminha descoberta e chamadas de ferramentas.

A configuração de exemplo fica em config/mcp-hub.example.json. Ela contém definições de endpoints e referências a variáveis de ambiente, não credenciais. Cada pessoa precisa fornecer suas próprias chaves e autorizar suas próprias contas OAuth.

## Componentes e configuração

- Runtime: ~/.local/share/shadow-mcp-hub
- Configuração privada: ~/.config/shadow/mcp-hub/mcp.json
- Estado OAuth e do servidor: ~/.config/shadow/mcp-hub/data
- Arquivo opcional de token GitHub: ~/.config/shadow/mcp-hub/github.token
- Credenciais opcionais de provedores: ~/.config/shadow/extra-providers.env

Nunca faça commit de arquivos desses diretórios privados.

## Instalar ou reparar

A versão testada está fixada em @ni-c/mcp-hub@0.13.1. Instale-a no diretório privado de runtime e aplique o patch de compatibilidade do repositório:

~~~bash
mkdir -p ~/.local/share/shadow-mcp-hub
npm install --prefix ~/.local/share/shadow-mcp-hub --no-audit --no-fund --save-exact @ni-c/mcp-hub@0.13.1
cp scripts/patch-mcp-hub-compat.mjs ~/.local/share/shadow-mcp-hub/patch-mcp-hub-compat.mjs
node ~/.local/share/shadow-mcp-hub/patch-mcp-hub-compat.mjs
~~~

O patch é idempotente e preserva os arquivos originais do pacote no diretório privado de runtime. Ele vincula o listener HTTP opcional de administração/OAuth ao loopback, passa DATA_PATH ao ponto de entrada stdio e desativa uma sondagem periódica de ping do Runcrate que não é suportada pela versão upstream fixada.

Instale os wrappers:

~~~bash
install -m 700 scripts/shadow-mcp-hub.sh ~/.local/bin/shadow-mcp-hub
install -m 700 scripts/shadow-mcp-admin.sh ~/.local/bin/shadow-mcp-admin
~~~

Crie a configuração privada somente se ela ainda não existir:

~~~bash
mkdir -p ~/.config/shadow/mcp-hub/data
chmod 700 ~/.config/shadow/mcp-hub ~/.config/shadow/mcp-hub/data
cp config/mcp-hub.example.json ~/.config/shadow/mcp-hub/mcp.json
chmod 600 ~/.config/shadow/mcp-hub/mcp.json
~~~

Não sobrescreva data/state.json. Ele pode conter estado OAuth, registros de clientes e tokens upstream.

## Configurar credenciais upstream

Habilite somente os servidores upstream que pretende usar no mcp.json privado. A configuração de exemplo inclui endpoints do GitHub, Runcrate, Mistral, Hugging Face e Cloudflare.

- GitHub: quando a entrada GitHub estiver habilitada, salve o valor Bearer em ~/.config/shadow/mcp-hub/github.token com permissão 600. O wrapper carrega o valor como SHADOW_GITHUB_AUTH. Se GitHub não estiver habilitado no mcp.json, o arquivo de token não é obrigatório.
- Mistral, Hugging Face e Cloudflare API: adicione seus próprios valores em ~/.config/shadow/extra-providers.env. O wrapper exporta somente MISTRAL_API_KEY, HF_TOKEN e CLOUDFLARE_API_TOKEN para o processo do Hub.
- Runcrate: autorize pelo fluxo OAuth. O estado e os tokens ficam no diretório privado data.
- Cloudflare Docs: o endpoint de exemplo é público e não exige credencial.

Mantenha o diretório de credenciais privado. Não cole tokens no JSON MCP nem faça commit da configuração local.

## Conectar clientes MCP

O Hub funciona como um único servidor local via stdio. Adicione-o a cada cliente compatível com MCP usando o mecanismo de configuração próprio de cada aplicativo.

Claude Code:

~~~bash
claude mcp add --scope user shadow ~/.local/bin/shadow-mcp-hub stdio
claude mcp list
~~~

OpenCode:

~~~bash
opencode mcp add --global shadow -- ~/.local/bin/shadow-mcp-hub stdio
opencode mcp list
~~~

Cline CLI:

~~~bash
cline mcp add shadow --yes -- ~/.local/bin/shadow-mcp-hub stdio
cline config mcp --json
~~~

Cada cliente mantém suas próprias configurações de provedor de modelos. O MCP Hub compartilha ferramentas e autorização upstream; ele não unifica configurações de modelos.

## Primeira autorização ou renovação do Runcrate

O listener HTTP é necessário somente para concluir o OAuth pelo navegador. Ele fica vinculado ao loopback:

~~~bash
~/.local/bin/shadow-mcp-hub http
~~~

Em outro terminal:

~~~bash
~/.local/bin/shadow-mcp-admin upstream login runcrate --no-wait
~~~

Abra a URL de autorização impressa e conclua o consentimento do provedor. Confira o resultado:

~~~bash
~/.local/bin/shadow-mcp-admin upstream status runcrate
~~~

Se o provedor não emitir refresh token, pode ser necessário repetir a autorização quando o token de acesso expirar. Siga a resposta atual e o painel do provedor; não presuma renovação automática.

Encerre o listener HTTP temporário após a autorização. A operação stdio normal não precisa do painel administrativo.

## Limites de segurança

- O listener HTTP fica no loopback por padrão. Não exponha sua porta à rede local ou à internet.
- Mantenha os diretórios privados de configuração e dados com permissão 700; arquivos de credenciais/estado devem usar 600.
- Os wrappers carregam somente variáveis de credenciais selecionadas, não todas as variáveis do .env do gateway de modelos.
- Nunca faça commit de github.token, extra-providers.env, bootstrap.env, mcp.json, data/state.json, backups OAuth ou armazenamentos de autenticação dos clientes.
- Revise permissões e anotações das ferramentas upstream antes de executar operações de escrita ou destrutivas.
- Serviços upstream recebem as requisições encaminhadas. Revise as políticas de privacidade, retenção e cobrança de cada serviço.
