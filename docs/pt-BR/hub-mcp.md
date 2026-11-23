# Shadow MCP Hub

O Shadow MCP Hub é o gateway MCP local compartilhado por Claude Code, OpenCode e Cline. Ele agrega GitHub e Runcrate por trás de seis meta-ferramentas:

- `list_servers`
- `list_tools`
- `get_tool_schema`
- `call_tool`
- `wake_server`
- `sleep_server`

O inventário ativo atual é: 46 ferramentas GitHub + 60 Runcrate + 91 Mistral + 4 Hugging Face + 2 Cloudflare Docs + 5 Cloudflare API = **208 ferramentas em seis integrações upstream**. Cada cliente inicia um processo local stdio chamado `shadow`; as ferramentas upstream são descobertas e chamadas sob demanda pelo Hub.

## Clientes conectados

- **Claude Code:** uma entrada MCP de escopo de usuário chamada `shadow`, conectada via stdio. As entradas antigas de GitHub, Runcrate e login temporário do hub foram removidas.
- **OpenCode 2.3.2:** MCP global `shadow` conectado. A antiga entrada direta do Runcrate foi mantida, mas desativada.
- **Cline CLI 3.0.75:** MCP `shadow` configurado e habilitado via stdio. A antiga entrada direta do Runcrate foi mantida, mas desativada; a configuração foi conferida pelo CLI do Cline.
- **Codex e Cursor:** não foi encontrada instalação/configuração executável neste ambiente Linux, portanto não estão conectados.

## Runtime e credenciais

O runtime fica em `~/.local/share/shadow-mcp-hub`. A configuração local fica em `~/.config/shadow/mcp-hub`.

O cabeçalho Authorization Bearer do GitHub é armazenado somente em:

```text
~/.config/shadow/mcp-hub/github.token
```

Esse arquivo deve ter permissão `600`. O wrapper lê o arquivo ao iniciar o processo, exporta o valor para o processo do Hub e nunca o imprime. O token não fica mais armazenado na configuração MCP do Claude Code.

O wrapper também carrega somente `MISTRAL_API_KEY`, `HF_TOKEN` e `CLOUDFLARE_API_TOKEN` do arquivo protegido `extra-providers.env`, exportando esses valores selecionados para o processo do Hub. As demais variáveis de provedores não são exportadas pelo lançador.

O estado OAuth e o token de acesso do Runcrate são armazenados localmente em:

```text
~/.config/shadow/mcp-hub/data/state.json
```

O diretório `data` deve ter permissão `700` e o arquivo de estado, `600`. Nunca faça commit desse estado, de `github.token`, `bootstrap.env` ou do `mcp.json` local.

## Instalar ou reparar

A versão suportada do pacote está fixada em `@ni-c/mcp-hub@0.13.1`. Instale-a no diretório privado de runtime e aplique os patches de compatibilidade:

```bash
mkdir -p ~/.local/share/shadow-mcp-hub
npm install --prefix ~/.local/share/shadow-mcp-hub --no-audit --no-fund --save-exact @ni-c/mcp-hub@0.13.1
cp scripts/patch-mcp-hub-compat.mjs ~/.local/share/shadow-mcp-hub/patch-mcp-hub-compat.mjs
node ~/.local/share/shadow-mcp-hub/patch-mcp-hub-compat.mjs
```

Os patches são idempotentes e preservam os arquivos originais do pacote em `~/.local/share/shadow-mcp-hub/patch-originals/`:

1. Vincula o listener HTTP opcional de OAuth/admin a `127.0.0.1` por padrão.
2. Passa `DATA_PATH` ao ponto de entrada stdio para reutilizar as credenciais OAuth autorizadas pelo Hub HTTP.
3. Desativa a sondagem periódica de ping do Runcrate 1.5.1. Ele aceita chamadas MCP initialize/tools, mas responde `Method not found: ping`; sem o ajuste, o Hub derruba repetidamente uma conexão saudável.

Instale os wrappers:

```bash
install -m 700 scripts/shadow-mcp-hub.sh ~/.local/bin/shadow-mcp-hub
install -m 700 scripts/shadow-mcp-admin.sh ~/.local/bin/shadow-mcp-admin
```

Crie a configuração privada somente se ela ainda não existir:

```bash
mkdir -p ~/.config/shadow/mcp-hub/data
chmod 700 ~/.config/shadow/mcp-hub ~/.config/shadow/mcp-hub/data
cp config/mcp-hub.example.json ~/.config/shadow/mcp-hub/mcp.json
chmod 600 ~/.config/shadow/mcp-hub/mcp.json
```

Não sobrescreva `~/.config/shadow/mcp-hub/data/state.json`. Ele contém estado OAuth, registros de clientes e tokens upstream.

## Configurar Claude Code

Garanta que o cabeçalho Bearer do GitHub esteja em `~/.config/shadow/mcp-hub/github.token`, com permissão `600`. Depois adicione o único MCP no escopo de usuário:

```bash
claude mcp add --scope user shadow ~/.local/bin/shadow-mcp-hub stdio
```

Confira:

```bash
claude mcp list
claude mcp get shadow
```

A lista esperada do Claude Code contém somente `shadow`.

## Configurar OpenCode

A configuração global atual fica em `~/.config/opencode/opencode.json`. O `shadow` está habilitado e conectado; a antiga entrada direta do Runcrate está desativada.

Em uma máquina nova:

```bash
opencode mcp add --global shadow -- ~/.local/bin/shadow-mcp-hub stdio
opencode mcp list
```

## Configurar Cline

O arquivo MCP do Cline fica em `~/.cline/data/settings/cline_mcp_settings.json`. O `shadow` está habilitado como servidor stdio; a antiga entrada Runcrate Streamable HTTP está desativada.

Confira:

```bash
cline config mcp --json
```

Em uma máquina nova:

```bash
cline mcp add shadow --yes -- ~/.local/bin/shadow-mcp-hub stdio
```

Cada cliente mantém suas próprias configurações de provedor de modelos. O MCP Hub compartilha ferramentas e OAuth upstream; ele não unifica as configurações dos provedores de modelos.

## Primeira autorização ou renovação do Runcrate

O listener HTTP é necessário somente para concluir o OAuth pelo navegador. Ele é vinculado ao loopback:

```bash
~/.local/bin/shadow-mcp-hub http
```

Em outro terminal:

```bash
~/.local/bin/shadow-mcp-admin upstream login runcrate --no-wait
```

Abra a URL de autorização impressa no mesmo perfil de navegador que entrou no Hub local. Depois que a página de sucesso do Runcrate aparecer, ela pode tentar enviar o callback por um iframe entre sites. Se o callback for rejeitado, abra a URL do callback como navegação principal do navegador para incluir o cookie de sessão local SameSite=Lax.

Verifique:

```bash
~/.local/bin/shadow-mcp-admin upstream status runcrate
```

A autorização foi concluída em 23/11/2026. O Runcrate forneceu um token de acesso com expiração em 21/02/2027, mas sem token de atualização. Será necessário autorizar novamente antes do vencimento; a renovação automática não está disponível com a resposta atual do provedor.

Após concluir o OAuth, encerre o listener HTTP temporário. O MCP stdio normal continua funcionando sem o painel.

## Encaminhamento verificado

- A busca `search_repositories` do GitHub encontrou `Ninja7z/shadow` por meio de `call_tool`.
- `list_gpu_types` do Runcrate retornou 162 entradas por meio de `call_tool`.
- Inventário final: GitHub 46, Runcrate 60, Mistral 91, Hugging Face 4, Cloudflare Docs 2, Cloudflare API 5 = 208 ferramentas.
- O encaminhamento foi testado novamente após mover o token do GitHub para `github.token`.
- Claude Code, OpenCode e Cline estão configurados para usar o MCP compartilhado `shadow`; Claude Code e OpenCode informam estado conectado.

## Limites de segurança

- O listener HTTP aceita conexões somente pelo loopback. Não exponha a porta 7690 à rede local ou à internet.
- `github.token` e `data/state.json` são segredos locais; mantenha o arquivo com permissão `600` e o diretório pai com `700`.
- A configuração do Hub contém somente uma referência a variável de ambiente para o cabeçalho Authorization do GitHub.
- `bootstrap.env`, `github.token`, `mcp.json` e `data/state.json` são arquivos locais e nunca devem ser commitados.
- Não faça commit de `.claude.json`, armazenamentos de autenticação do Cline/OpenCode, backups de tokens, estado OAuth, tokens de acesso/atualização ou arquivos de runtime gerados.

## Outras integrações MCP oficiais

### Mistral Studio

- Endpoint: https://api.mistral.ai/mcp
- Transporte: Streamable HTTP
- Autenticação: `Authorization: Bearer MISTRAL_API_KEY` (referência à variável de ambiente na configuração MCP local).
- A chave é lida de `~/.config/shadow/extra-providers.env`; o lançador exporta somente `MISTRAL_API_KEY`.
- Conectado e verificado com 91 ferramentas. Uma chamada somente leitura `whoami` retornou a conta/workspace configurada.
- Os grupos de ferramentas disponíveis dependem do workspace e dos recursos habilitados para a chave. O servidor oficial pode expor ferramentas com capacidade de escrita (publicar apps, gerenciar conhecimento, excluir bibliotecas/segredos e implantar workflows); revise antes de executar operações de escrita ou destrutivas.

### MCP de documentação Cloudflare

- Endpoint: https://docs.mcp.cloudflare.com/mcp
- Autenticação: não é necessária.
- Conectado e verificado com duas ferramentas somente leitura: `search_cloudflare_documentation` e `migrate_pages_to_workers_guide`.
- Uma busca somente leitura pela documentação de inferência Workers AI retornou trechos da documentação Cloudflare.

### MCP da API Cloudflare

- Endpoint: https://mcp.cloudflare.com/mcp
- Transporte: Streamable HTTP
- Autenticação: o cabeçalho Authorization usa a referência local à variável `CLOUDFLARE_API_TOKEN`.
- O OAuth DCR foi abandonado porque a resposta de autorização da Cloudflare omitiu o parâmetro `iss` esperado pelo Hub, causando incompatibilidade de emissor durante a troca do código.
- O token foi configurado no arquivo protegido `extra-providers.env`, usando o nome correto `CLOUDFLARE_API_TOKEN`.
- O endpoint `Cloudflare /user/tokens/verify` retornou HTTP 200, `success=true`, `status=active`.
- A chamada MCP `whoami` passou e os metadados da ferramenta declaram `readOnlyHint=true`.
- O endpoint de detalhes do token retornou 403, então não foi possível enumerar independentemente os detalhes da política pela API. A configuração usou o template Read All Resources; evite operações de escrita/destrutivas. Somente chamadas de leitura foram testadas. `GET /accounts` retornou sucesso com uma conta; `GET /zones` retornou sucesso sem zonas visíveis.
- O MCP expõe cinco ferramentas: `docs`, `search`, `execute`, `whoami` e `submit_feedback`. A ferramenta `execute` pode invocar operações da API Cloudflare; as permissões efetivas são limitadas pelo token, não pelo nome da ferramenta. Como `execute` pode realizar operações destrutivas, o uso pelo Shadow deve permanecer restrito a requisições GET e ferramentas somente leitura. Não envie chamadas POST, PUT, PATCH ou DELETE para esse upstream.

### MCP do Hugging Face Hub

- Endpoint: https://huggingface.co/mcp
- Transporte: Streamable HTTP
- Autenticação: `Authorization: Bearer HF_TOKEN` (referência à variável de ambiente na configuração MCP local).
- A chave é lida de `~/.config/shadow/extra-providers.env`; o lançador exporta somente `HF_TOKEN`.
- Conectado e verificado com quatro ferramentas básicas: `hf_whoami`, `hub_repo_search`, `hub_repo_details` e `hf_fs`. Uma busca somente leitura por Qwen3.5 retornou resultados de repositórios.
- Ferramentas adicionais, Jobs, sandboxes e Spaces da comunidade dependem das configurações do usuário em https://huggingface.co/settings/mcp e das permissões do token. Jobs/Spaces com computação podem consumir recursos; habilite somente o que pretende usar.

### Provedores que não foram adicionados como upstream MCP

O suporte MCP da Groq é um recurso da Responses API que permite a um modelo hospedado na Groq chamar servidores MCP remotos; isso não significa que a Groq ofereça um serviço MCP hospedado próprio. O NVIDIA NIM também consome ferramentas MCP pelo lado do cliente e não expõe um endpoint MCP gerenciado da NVIDIA na documentação consultada. Essas chaves pertencem à camada de API/roteamento de modelos, não aos upstreams do MCP Hub.
