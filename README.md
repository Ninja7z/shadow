🇧🇷 Português

Shadow

Shadow é um gateway LLM local multi-provedor. Ele oferece aos agentes de código um endpoint estável enquanto roteia requisições para provedores configurados independentemente e opções de modelos gratuitos.

O que ele oferece

· API compatível com OpenAI para OpenCode, Continue, Aider, Cline e outros clientes.
· API Anthropic Messages para Claude Code, usando provedores que expõem uma interface Messages compatível.
· Aliases de modelo explícitos e cadeias de fallback, para que os clientes não precisem de credenciais específicas de provedor.
· Isolamento de credenciais por provedor através de variáveis de ambiente.
· Verificações de saúde locais e validação de configuração.

Importante: O repositório público contém apenas templates e documentação. Ele nunca deve conter chaves de API reais, tokens de conta, arquivos de ambiente de provedores, logs, blobs de modelos ou estado de runtime local.

Primeiros passos para qualquer pessoa que clonar o repositório

Requisitos: Python 3.11+ e Ollama para inferência local.

    git clone https://github.com/Ninja7z/shadow.git
    cd shadow
    python scripts/shadow.py setup
    ollama pull llama3.2:3b
    python scripts/shadow.py start

Isso cria um ambiente Python isolado, uma chave local aleatória e a configuração privada. A API fica em 127.0.0.1:4000. O modo Ollama não precisa de chave de API remota nem cobra inferência em nuvem; usa o hardware e a energia da própria pessoa.

Para adicionar provedores gratuitos ou pagos, preencha as variáveis correspondentes no arquivo .env e execute python scripts/shadow.py refresh. Provedores pagos ficam fora do shadow-auto por padrão. Também é possível conectar qualquer endpoint compatível com OpenAI ou Anthropic usando CUSTOM_OPENAI_* ou CUSTOM_ANTHROPIC_*. Veja docs/self-hosting.md.

O repositório não oferece chaves compartilhadas, hospedagem de inferência nem cotas gratuitas ilimitadas. Cada pessoa usa suas próprias contas e credenciais dos provedores remotos.

Rotas gratuitas verificadas atualmente (contas do mantenedor; não são os padrões de novos clones)

O gateway local atual possui rotas verificadas para:

Provedor Modelo Interfaces verificadas
Requesty nvidia/nemotron-3.5-lightning-30b-a3b Chat Completions e Anthropic Messages; chamadas de ferramentas estruturadas; custo reportado $0
Cloudflare Workers AI @cf/zai-org/glm-4.7-flash Chat Completions; chamadas de ferramentas estruturadas
Gonka Broker zai-org/GLM-5.3-Flash Chat Completions e Anthropic Messages nativas; chamadas de ferramentas estruturadas
BazaarLink nvidia/nemotron-3.5-lightning-free:free Chat Completions; chamadas de ferramentas estruturadas; preço de catálogo $0/$0

Cotas gratuitas e disponibilidade de modelos podem mudar. Verifique o dashboard do próprio provedor e o catálogo atual antes de confiar em um modelo.

API local

Por padrão, o gateway LiteLLM local escuta em:

· Compatível com OpenAI: http://127.0.0.1:4000/v1
· Anthropic Messages: http://127.0.0.1:4000/v1/messages

Use a chave mestra local do Shadow como credencial do cliente. Nunca coloque chaves de provedores upstream na configuração de um agente; mantenha-as no ambiente protegido do gateway.

Variáveis de credenciais

O gateway local usa variáveis de ambiente como:

· LITELLM_MASTER_KEY
· REQUESTY_API_KEY
· CLOUDFLARE_WORKERS_AI_TOKEN
· CLOUDFLARE_API_TOKEN
· GONKA_API_KEY
· BAZAARLINK_API_KEY
· NVIDIA_NIM_API_KEY
· AI_HORDE_API_KEY

Crie um arquivo de ambiente local privado a partir de .env.example ou do seu gerenciador de segredos. Não faça commit desse arquivo.

Lançadores Claude Code

A máquina local possui lançadores dedicados:

· claude-requesty
· claude-gonka
· claude-nvidia

O template versionado do lançador é scripts/claude-route.sh. Ele gera um arquivo privado de configurações do seletor de modelos usando o perfil de compatibilidade behavesAs documentado do Claude Code, preserva o alias Shadow enviado upstream e limita conservadoramente a compactação de contexto. Veja Integração com Claude Code.

O smoke test do CLI claude-requesty foi concluído com sucesso através do Shadow. Aider, Cline, OpenCode e Continue CLI também passaram nos smoke tests ponta a ponta. O Continue resolve SHADOW_API_KEY a partir do ~/.continue/.env global protegido. O Cline usa uma configuração dedicada em ~/.config/shadow/cline/gateway, deixando o perfil existente do Cline intacto. O diagnóstico inicial unrecognized_model foi eliminado com um perfil de compatibilidade modelPicker.behavesAs por alias. O ID do modelo do provedor enviado ao Shadow permanece inalterado. Esses lançadores selecionam aliases de provedor através do gateway local. O lançador e o alias ativo devem ser testados após alterar o LiteLLM ou a configuração do provedor.

Política de fallback

A cadeia de fallback gratuita atual para chat é ordenada para preferir opções com maior cota ou amplamente disponíveis antes de cotas diárias menores:

Groq OSS → Kilo Auto → Kilo → OpenRouter Nemotron → Gemini Flash-Lite → NVIDIA → Cloudflare Workers AI → Requesty → Gonka → BazaarLink → LLM7 → AI Horde.

O alias Requesty compatível com OpenAI possui uma cadeia de fallback explícita para erros 429 de concorrência: Cloudflare Workers AI → Gonka → BazaarLink → LLM7 → AI Horde.

A rota Requesty específica para Claude Code recorre ao Anthropic Gonka nativo, depois NVIDIA e AI Horde.

Fallbacks de provedor devem ser mantidos compatíveis com o protocolo; uma rota somente OpenAI não deve ser inserida em uma cadeia Anthropic Messages.

Estrutura do repositório

· config/shadow.example.yaml: exemplo mínimo de provedor/fallback.
· config/shadow.runtime.example.yaml: snapshot sanitizado do roteador local atual (48 aliases / 37 fallbacks); todas as credenciais permanecem como referências de ambiente; o ID da conta Cloudflare é um placeholder.
· docs/: status do provedor, notas de cota e orientações operacionais.
· scripts/: validação local, lançador do gateway Claude Code e helpers de manutenção.
· docs/claude-code.md: compatibilidade do seletor de modelos do Claude Code e comportamento do lançador.
· docs/session-closeout-2026-11-23.md: handoff/checkpoint datado para a próxima sessão.
· .env.example: nomes das variáveis necessárias, sem valores.

Segurança

Veja SECURITY.md. Antes de cada commit, revise git status e git diff --cached. Não faça commit de API.txt, .env, extra-providers.env, backups, logs, bancos de dados ou arquivos de modelo.

Testes de fumaça repetíveis

A verificação segura (apenas requisições GET; sem inferência e sem consumo de tokens de modelo) é:

```bash
python3 scripts/smoke_test.py
```

Para executar uma inferência estruturada de chamada de ferramenta por provedor Chat Completions:

```bash
python3 scripts/smoke_test.py --tool-calls
```

Para testar o caminho de uso de ferramentas do Anthropic Messages, opcionalmente para apenas um provedor:

```bash
python3 scripts/smoke_test.py --anthropic-tools --anthropic-provider requesty
python3 scripts/smoke_test.py --anthropic-tools --anthropic-provider gonka
```

Testes de inferência podem consumir cotas gratuitas, então não os execute como um monitor de saúde frequente. Veja docs/smoke-tests.md para verificações, timeouts e notas de cota.

Testes unitários:

```bash
python3 -m unittest discover -s tests -v
```

Gateway unificado Shadow API

A API de modelos local do Shadow é o LiteLLM em 127.0.0.1:4000:

· Clientes compatíveis com OpenAI usam http://127.0.0.1:4000/v1
· Clientes Anthropic Messages usam http://127.0.0.1:4000/v1/messages

O roteador local atual expõe 48 aliases de modelo e 37 grupos de fallback. OpenCode, Cline, Continue e Claude Code estão configurados contra este gateway. O Kilo Code pode usá-lo como um provedor personalizado compatível com OpenAI; o Kilo não está instalado no ambiente Linux auditado. Veja docs/unified-gateway.md.

Agregação MCP única

Claude Code, OpenCode e Cline se conectam ao mesmo MCP local chamado shadow, que agrega GitHub, Runcrate, Mistral, Hugging Face, Cloudflare Docs e Cloudflare API (208 ferramentas em seis upstreams) por trás de seis meta-ferramentas de descoberta/encaminhamento. Configuração, tratamento de tokens, patches de compatibilidade e limites de segurança estão documentados em docs/mcp-hub.md. O script de patch reproduzível é scripts/patch-mcp-hub-compat.mjs.

A API de modelos e o MCP Hub são atualmente endpoints/processos de protocolo separados. Uma prova de conceito do LiteLLM MCP Gateway na porta 4002 retornou 403 para o upstream do Shadow MCP, então o gateway de produção na porta 4000 e as conexões atuais dos clientes MCP foram mantidos inalterados.

---

🇺🇸 English

Shadow

Shadow is a local multi-provider LLM gateway. It gives coding agents one stable endpoint while routing requests to independently configured providers and free-tier model options.

What it provides

· OpenAI-compatible API for OpenCode, Continue, Aider, Cline and other clients.
· Anthropic Messages API for Claude Code, using providers that expose a compatible Messages interface.
· Explicit model aliases and fallback chains, so clients do not need provider-specific credentials.
· Per-provider credential isolation through environment variables.
· Local health checks and configuration validation.

Important: The public repository contains templates and documentation only. It must never contain live API keys, account tokens, provider environment files, logs, model blobs or local runtime state.

Quick start for anyone cloning the repository

Requirements: Python 3.11+ and Ollama for local inference.

    git clone https://github.com/Ninja7z/shadow.git
    cd shadow
    python scripts/shadow.py setup
    ollama pull llama3.2:3b
    python scripts/shadow.py start

This creates an isolated Python environment, a random local gateway key and a private runtime config. The API listens on 127.0.0.1:4000. Ollama mode needs no remote API key and has no cloud inference bill; it uses the owner's hardware and electricity.

To add free or paid providers, fill in the matching variables in .env and run python scripts/shadow.py refresh. Paid providers are excluded from shadow-auto by default. You can also connect any OpenAI-compatible or Anthropic Messages endpoint using CUSTOM_OPENAI_* or CUSTOM_ANTHROPIC_*. See docs/self-hosting.md.

The repository does not provide shared API keys, hosted inference or unlimited third-party free quota. Each person uses their own provider accounts and credentials.

Current verified free routes (maintainer's own accounts; not clone defaults)

The current local gateway has verified routes for:

Provider Model Verified interfaces
Requesty nvidia/nemotron-3.5-lightning-30b-a3b Chat Completions and Anthropic Messages; structured tool calls; reported cost $0
Cloudflare Workers AI @cf/zai-org/glm-4.7-flash Chat Completions; structured tool calls
Gonka Broker zai-org/GLM-5.3-Flash Chat Completions and native Anthropic Messages; structured tool calls
BazaarLink nvidia/nemotron-3.5-lightning-free:free Chat Completions; structured tool calls; catalog price $0/$0

Free quotas and model availability can change. Check the provider's own dashboard and current catalog before relying on a model.

Local API

By default, the local LiteLLM gateway listens on:

· OpenAI-compatible: http://127.0.0.1:4000/v1
· Anthropic Messages: http://127.0.0.1:4000/v1/messages

Use the local Shadow master key as the client credential. Never put upstream provider keys in an agent's configuration; keep them in the gateway's protected environment.

Credential variables

The local gateway uses environment variables such as:

· LITELLM_MASTER_KEY
· REQUESTY_API_KEY
· CLOUDFLARE_WORKERS_AI_TOKEN
· CLOUDFLARE_API_TOKEN
· GONKA_API_KEY
· BAZAARLINK_API_KEY
· NVIDIA_NIM_API_KEY
· AI_HORDE_API_KEY

Create a private local environment file from .env.example or your secret manager. Do not commit that file.

Claude Code launchers

The local machine has dedicated launchers:

· claude-requesty
· claude-gonka
· claude-nvidia

The versioned launcher template is scripts/claude-route.sh. It generates a private model-picker settings file using Claude Code's documented behavesAs compatibility profile, preserves the Shadow alias sent upstream, and conservatively caps context compaction. See Claude Code integration.

The claude-requesty CLI smoke test completed successfully through Shadow. Aider, Cline, OpenCode and Continue CLI also passed end-to-end smoke tests. Continue resolves SHADOW_API_KEY from the protected global ~/.continue/.env. Cline uses a dedicated config at ~/.config/shadow/cline/gateway, leaving the existing Cline profile untouched. The initial unrecognized_model diagnostic was eliminated with a per-alias modelPicker.behavesAs compatibility profile. The provider model ID sent to Shadow remains unchanged. These launchers select provider aliases through the local gateway. The launcher and active alias should be tested after changing LiteLLM or provider configuration.

Fallback policy

The current free chat fallback chain is ordered to prefer higher-allowance or broadly available options before smaller daily quotas:

Groq OSS → Kilo Auto → Kilo → OpenRouter Nemotron → Gemini Flash-Lite → NVIDIA → Cloudflare Workers AI → Requesty → Gonka → BazaarLink → LLM7 → AI Horde.

The OpenAI-compatible Requesty alias has an explicit fallback chain for concurrency 429s: Cloudflare Workers AI → Gonka → BazaarLink → LLM7 → AI Horde.

The Claude Code-specific Requesty route falls back to native Anthropic Gonka, then NVIDIA and AI Horde.

Provider fallbacks should be kept protocol-compatible; an OpenAI-only route must not be inserted into an Anthropic Messages chain.

Repository layout

· config/shadow.example.yaml: minimal provider/fallback example.
· config/shadow.runtime.example.yaml: sanitized snapshot of the current local router (48 aliases / 37 fallbacks); all credentials remain environment references; Cloudflare Account ID is a placeholder.
· docs/: provider status, quota notes and operating guidance.
· scripts/: local validation, Claude Code gateway launcher and maintenance helpers.
· docs/claude-code.md: Claude Code model-picker compatibility and launcher behavior.
· docs/session-closeout-2026-11-23.md: dated handoff/checkpoint for the next session.
· .env.example: names of required variables, no values.

Security

See SECURITY.md. Before every commit, review git status and git diff --cached. Do not commit API.txt, .env, extra-providers.env, backups, logs, databases or model files.

Repeatable smoke tests

The safe check (GET requests only; no inference and no model tokens consumed) is:

```bash
python3 scripts/smoke_test.py
```

To run one structured tool-call inference per Chat Completions provider:

```bash
python3 scripts/smoke_test.py --tool-calls
```

To test the Anthropic Messages tool-use path, optionally for one provider only:

```bash
python3 scripts/smoke_test.py --anthropic-tools --anthropic-provider requesty
python3 scripts/smoke_test.py --anthropic-tools --anthropic-provider gonka
```

Inference tests can consume free quotas, so do not run them as a frequent health monitor. See docs/smoke-tests.md for checks, timeouts and quota notes.

Unit tests:

```bash
python3 -m unittest discover -s tests -v
```

Unified Shadow API Gateway

The local Shadow model API is LiteLLM on 127.0.0.1:4000:

· OpenAI-compatible clients use http://127.0.0.1:4000/v1
· Anthropic Messages clients use http://127.0.0.1:4000/v1/messages

The current local router exposes 48 model aliases and 37 fallback groups. OpenCode, Cline, Continue and Claude Code are configured against this gateway. Kilo Code can use it as an OpenAI Compatible custom provider; Kilo is not installed in the audited Linux environment. See docs/unified-gateway.md.

Single MCP aggregation

Claude Code, OpenCode and Cline connect to the same local MCP named shadow, which aggregates GitHub, Runcrate, Mistral, Hugging Face, Cloudflare Docs and Cloudflare API (208 tools across six upstreams) behind six discovery/forwarding meta-tools. Setup, token handling, compatibility patches and security boundaries are documented in docs/mcp-hub.md. The reproducible patch script is scripts/patch-mcp-hub-compat.mjs.

The model API and MCP Hub are currently separate protocol endpoints/processes. A LiteLLM MCP Gateway proof of concept on port 4002 returned a 403 for the Shadow MCP upstream, so the production gateway on port 4000 and current MCP client connections were left unchanged.