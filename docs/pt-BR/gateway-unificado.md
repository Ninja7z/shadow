# Gateway de API do Shadow

O Shadow executa um LiteLLM Proxy local e oferece uma API única para clientes de modelos. Cada clone usa suas próprias credenciais, configuração local e contas de provedores.

## Endpoints padrão

Por padrão, o gateway escuta em 127.0.0.1:4000.

| Protocolo | Endpoint | Clientes comuns |
|---|---|---|
| Base URL OpenAI-compatible | http://127.0.0.1:4000/v1 | OpenCode, Cline, Continue, Kilo Code, Aider |
| OpenAI Chat Completions | http://127.0.0.1:4000/v1/chat/completions | Clientes compatíveis com OpenAI |
| OpenAI Responses | http://127.0.0.1:4000/v1/responses | Clientes Responses; confira suporte upstream |
| Anthropic Messages | http://127.0.0.1:4000/v1/messages | Claude Code e clientes Anthropic-compatible |
| Catálogo de modelos | http://127.0.0.1:4000/v1/models | Descoberta de modelos |

Para clientes OpenAI-compatible, use a Base URL terminada em /v1. Para clientes Anthropic que acrescentam /v1/messages automaticamente, use a raiz do gateway: http://127.0.0.1:4000.

## Autenticação

Use a LITELLM_MASTER_KEY gerada no arquivo privado .env. Ela é a chave administrativa do gateway local, não uma chave de provedor upstream.

A instalação padrão para uma pessoa fica vinculada ao loopback. Não exponha o serviço a outras máquinas ou à internet usando a chave mestra. Para múltiplos usuários, configure PostgreSQL e chaves virtuais LiteLLM com permissões, orçamentos e limites por chave, além de TLS/rede privada.

## Aliases de modelos

Os aliases são gerados a partir do catálogo local e das credenciais habilitadas pelo responsável por cada instalação. Consulte /v1/models e use exatamente o id retornado.

Aliases comuns incluem shadow-local, shadow-auto e shadow-custom-<id>. O conjunto disponível depende da configuração local. A documentação pública não deve presumir o inventário privado de modelos do mantenedor.

## Configuração dos clientes

Consulte [Integração com aplicativos](integracao-clientes.md) para exemplos de instalação nova com OpenCode, Cline, Continue, Kilo Code, Aider e Claude Code.

## Compatibilidade de protocolo e recursos

O gateway traduz formatos de requisição dos clientes para os provedores upstream quando o LiteLLM oferece suporte à rota. Os recursos variam por modelo e provedor: tool calling, streaming, imagens, raciocínio, cache de prompt, contexto e saídas estruturadas precisam ser verificados individualmente.

Mantenha cadeias de fallback compatíveis com o protocolo. Não presuma que um modelo que aceita Chat Completions também oferece todos os recursos do Anthropic Messages.

## API de modelos e MCP são componentes separados

O gateway de modelos é a API HTTP do LiteLLM na porta 4000. O Shadow MCP Hub é um servidor de ferramentas separado, com configuração e credenciais próprias. Conectar a API de modelos não configura automaticamente ferramentas MCP, e o MCP Hub não fornece inferência de modelos.

Consulte [Hub MCP](hub-mcp.md) para requisitos independentes de instalação e segurança.
