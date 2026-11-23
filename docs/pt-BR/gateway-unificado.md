# Gateway de API do Shadow

O Shadow já possui uma API local de modelos multiprovedor. O gateway é o LiteLLM, configurado e operado pelo Shadow. Não é necessário criar um segundo proxy de modelos nem implementar os protocolos do zero.

## Serviço local atual

- Runtime: LiteLLM 1.110.2
- Endereço: `127.0.0.1:4000` (somente loopback)
- Configuração: `~/.config/shadow/config.yaml`
- Credenciais dos provedores: `~/.config/shadow/providers.env` e `~/.config/shadow/extra-providers.env`
- Credencial dos clientes: `LITELLM_MASTER_KEY`
- Catálogo: 48 aliases de modelos configurados
- Roteamento: 37 grupos de fallback

Os 48 itens são aliases de rota. Isso não significa que todas as combinações de provedor/modelo tenham sido testadas novamente de ponta a ponta. Consulte os smoke tests de cada provedor antes de depender de uma rota ou capacidade específica.

## Um host, endpoints compatíveis com cada protocolo

Use o mesmo host local e a mesma credencial do gateway. O caminho muda conforme o protocolo do cliente:

| API | Endpoint | Uso |
|---|---|---|
| OpenAI Chat Completions | `http://127.0.0.1:4000/v1/chat/completions` | OpenCode, Cline, Continue, Kilo, Aider e clientes compatíveis com OpenAI |
| OpenAI Responses | `http://127.0.0.1:4000/v1/responses` | Clientes que usam Responses; verifique o suporte do provedor/modelo |
| Catálogo OpenAI | `http://127.0.0.1:4000/v1/models` | Descoberta e seleção de modelos |
| Anthropic Messages | `http://127.0.0.1:4000/v1/messages` | Claude Code e clientes compatíveis com Anthropic |

Para clientes OpenAI-compatible, use a Base URL `http://127.0.0.1:4000/v1`.

Para SDKs/clientes Anthropic que acrescentam `/v1/messages` automaticamente, use a Base URL `http://127.0.0.1:4000`.

Todos os aliases vêm da mesma lista de modelos. Os clientes devem selecionar o alias exato retornado por `/v1/models`. O gateway traduz os formatos de requisição e resposta entre o protocolo do cliente e cada provedor, respeitando os recursos suportados por cada serviço.

Documentação oficial do LiteLLM: https://docs.litellm.ai/docs/supported_endpoints

## Auditoria das integrações — 23/11/2026

| Cliente | Estado atual | Configuração |
|---|---|---|
| OpenCode | Configurado | Provedor `shadow`, URL `http://127.0.0.1:4000/v1`; chave lida de `LITELLM_MASTER_KEY` |
| Perfil padrão do Cline | Configurado | OpenAI-compatible, `http://127.0.0.1:4000/v1` |
| Perfil isolado do gateway no Cline | Configurado | OpenAI-compatible, `http://127.0.0.1:4000/v1` |
| Continue | Configurado | 17 modelos usando `http://127.0.0.1:4000/v1`; `SHADOW_API_KEY` corresponde à chave atual |
| Claude Code | Configurado | O lançador `claude-route` define o endpoint Anthropic Messages local |
| Aider | Instalado | Não foi encontrada configuração persistente nesta auditoria; pode usar a Base URL OpenAI-compatible e um alias Shadow |
| Kilo Code | Não instalado/detectado neste ambiente Linux | Quando instalado, configure como provedor personalizado OpenAI Compatible |

### Configuração do Kilo Code

O fluxo atual de provedor personalizado do Kilo Code aceita OpenAI Compatible, OpenAI Responses e Anthropic Messages. Para as rotas Chat Completions do Shadow:

- API do provedor: OpenAI Compatible
- Base URL: `http://127.0.0.1:4000/v1`
- API key: credencial local do gateway Shadow (atualmente `LITELLM_MASTER_KEY`; prefira uma chave virtual com escopo quando disponível)
- Modelo: selecione um alias exato de `/v1/models`, por exemplo `router-shadow-free` ou `router-fast`

O Kilo pode buscar os modelos automaticamente em `/v1/models`. Não coloque chaves upstream no Kilo; mantenha-as somente no ambiente protegido do Shadow.

Guia oficial: https://kilo.ai/docs/ai-providers/openai-compatible

## Autenticação e próximos passos de segurança

Os clientes atuais usam uma única `LITELLM_MASTER_KEY`. Isso funciona para um gateway de usuário único vinculado ao loopback, mas essa chave também é a chave administrativa do LiteLLM Proxy. Não é a credencial ideal para uso compartilhado a longo prazo.

As chaves virtuais do LiteLLM permitem listas de modelos autorizados, orçamentos, limites de taxa e credenciais separadas por aplicativo. O gateway atual não possui `DATABASE_URL` nem PostgreSQL local. O LiteLLM exige PostgreSQL para gerenciamento de chaves virtuais e controle de gastos; esses recursos não estão disponíveis na configuração atual sem banco de dados.

Antes de expor o Shadow a outras máquinas ou usuários:

1. Configure um PostgreSQL privado para o gerenciamento de chaves do LiteLLM.
2. Reserve `LITELLM_MASTER_KEY` para administração do gateway.
3. Emita chaves virtuais separadas para OpenCode, Cline, Kilo, Continue, Claude Code e Aider.
4. Restrinja cada chave aos aliases necessários e, quando o gateway MCP estiver habilitado, somente aos servidores/ferramentas MCP exigidos por aquele cliente.
5. Defina orçamentos e limites de taxa por chave, quando aplicável.
6. Mantenha o serviço em loopback ou exponha-o somente por rede privada autenticada/proxy reverso com TLS. Não vincule o gateway diretamente a `0.0.0.0` sem proteção.

Documentação oficial: https://docs.litellm.ai/docs/proxy/virtual_keys

## API de modelos e ferramentas MCP são protocolos separados

- **API de modelos:** requisições de modelos compatíveis com OpenAI/Anthropic, na porta 4000.
- **MCP Hub:** ferramentas do GitHub, Runcrate, Mistral, Hugging Face, Cloudflare Docs e Cloudflare API, atualmente disponibilizadas pelo servidor local `shadow-mcp-hub` via stdio para clientes compatíveis com MCP.

O inventário atual do MCP Hub possui 208 ferramentas. Claude Code, OpenCode e Cline conectam-se a esse Hub compartilhado. A conexão MCP é independente da configuração do provedor de modelos.

O LiteLLM possui seu próprio MCP Gateway, capaz de expor servidores MCP upstream em `/mcp` e integrar ferramentas MCP a requisições Chat Completions/Responses compatíveis. Uma prova de conceito local foi testada na porta 4002 usando o `shadow-mcp-hub` como processo stdio upstream:

- `/v1/models` retornou os 48 aliases.
- O servidor MCP `shadow_tools` foi registrado, mas `tools/list` retornou 403 Forbidden do upstream.
- O gateway de laboratório foi encerrado e seus arquivos temporários de configuração/log/PID foram removidos.
- A porta de produção 4000 e o MCP Hub funcional não foram alterados.

Não substitua o MCP Hub atual nem direcione clientes para `:4000/mcp` até que a integração stdio/autorização seja corrigida e o catálogo completo de ferramentas e os testes de encaminhamento somente leitura sejam aprovados.

## Limitações importantes

- Um gateway único não elimina cotas gratuitas, limites de requisição, mudanças de disponibilidade ou diferenças de recursos entre provedores.
- Uso de ferramentas, streaming, visão, raciocínio, cache de prompt e limites de contexto variam por modelo/provedor e precisam ser verificados por alias.
- Mantenha cadeias de fallback compatíveis com o protocolo. Uma rota somente OpenAI não deve entrar em uma cadeia Anthropic Messages.
- Os 48 aliases e 37 grupos de fallback representam o inventário configurado atual. Não são 48 provedores independentes nem garantem que todas as rotas estejam saudáveis.
