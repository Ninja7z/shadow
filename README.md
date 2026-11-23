<!--
  Shadow · README
  Keep provider availability, model counts and smoke-test claims in sync with the repository.
-->

<div align="center">

# ◈ Shadow

### Um gateway local para todas as suas IAs.

**Uma única API. Vários provedores. Seus agentes de código, suas regras.**

[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![API](https://img.shields.io/badge/API-OpenAI%20%2B%20Anthropic-111827)](#-uma-api-para-seus-agentes)
[![Self-hosted](https://img.shields.io/badge/execução-local-16A34A)](#-comece-a-usar)
[![GitHub stars](https://img.shields.io/github/stars/Ninja7z/shadow?style=flat)](https://github.com/Ninja7z/shadow/stargazers)

[🇧🇷 Português](#-português) · [🇺🇸 English](#-english) · [Documentação](docs/)

</div>

---

## 🇧🇷 Português

O **Shadow** é um gateway LLM local e multiprovedor. Ele coloca uma camada única entre seus agentes de desenvolvimento e os serviços de IA, permitindo trocar modelos, organizar aliases e configurar fallbacks sem reconfigurar cada cliente.

Use modelos locais com Ollama, conecte provedores gratuitos ou adicione suas próprias APIs pagas. Você controla as credenciais, os provedores e as rotas.

> **A proposta:** seus agentes falam com o Shadow. O Shadow decide para onde cada requisição vai.

## ✦ O que você ganha

| Recurso | O que faz |
| --- | --- |
| **Uma API, vários provedores** | Endpoint local compatível com OpenAI e Anthropic Messages. |
| **Liberdade de clientes** | Integração com OpenCode, Cline, Continue, Aider, Claude Code e outros clientes compatíveis. |
| **Aliases de modelos** | Use nomes estáveis sem espalhar IDs e configurações de provedores pelos clientes. |
| **Fallback automático** | Encaminha requisições para alternativas configuradas quando uma rota falha. |
| **Local-first** | Use Ollama sem depender de uma API remota para inferência local. |
| **Credenciais isoladas** | As chaves dos provedores ficam no ambiente privado do gateway, não nos agentes. |

## ⌘ Uma API para seus agentes

O gateway LiteLLM local escuta, por padrão, em `127.0.0.1:4000`.

| Protocolo | Endpoint |
| --- | --- |
| OpenAI-compatible | `http://127.0.0.1:4000/v1` |
| Anthropic Messages | `http://127.0.0.1:4000/v1/messages` |

Use a **chave mestra local do Shadow** como credencial nos clientes. Nunca coloque chaves upstream de provedores nas configurações dos agentes.

Clientes que podem apontar para esse gateway:

<div align="center">

**OpenCode** · **Cline** · **Kilo Code** · **Continue** · **Aider** · **Claude Code**

</div>

## 🚀 Comece a usar

### Requisitos

- Python **3.11 ou superior**
- [Ollama](https://ollama.com/) para inferência local
- Credenciais próprias apenas para os provedores remotos que você decidir conectar

### Instalação rápida

```bash
git clone https://github.com/Ninja7z/shadow.git
cd shadow

python scripts/shadow.py setup
ollama pull llama3.2:3b
python scripts/shadow.py start
```

O comando `setup` prepara um ambiente Python isolado, gera uma chave local aleatória e cria a configuração privada de runtime. Depois de iniciar, a API fica disponível em `127.0.0.1:4000`.

**Quer usar apenas modelos locais?** O Ollama não exige chave de API remota nem gera cobrança de inferência em nuvem. O processamento usa o hardware e a energia da sua própria máquina.

### Adicionar provedores

1. Configure as variáveis necessárias no arquivo privado `.env`.
2. Atualize a configuração executando:

```bash
python scripts/shadow.py refresh
```

Provedores pagos ficam fora do alias `shadow-auto` por padrão. Também é possível conectar endpoints próprios compatíveis com OpenAI ou Anthropic usando as famílias `CUSTOM_OPENAI_*` e `CUSTOM_ANTHROPIC_*`.

Consulte [Self-hosting](docs/self-hosting.md) para os detalhes de configuração.

## 🧭 Rotas e fallback

O roteador pode combinar aliases e cadeias de fallback para manter um destino alternativo disponível quando um provedor falhar ou atingir limites.

A cadeia gratuita de chat atualmente configurada no ambiente do mantenedor prioriza opções com cotas maiores ou mais amplamente disponíveis:

```text
Groq OSS
  → Kilo Auto
  → Kilo
  → OpenRouter Nemotron
  → Gemini Flash-Lite
  → NVIDIA
  → Cloudflare Workers AI
  → Requesty
  → Gonka
  → BazaarLink
  → LLM7
  → AI Horde
```

Há também fallbacks específicos para determinadas rotas, incluindo tratamento de erros HTTP 429. As cadeias devem respeitar o protocolo: uma rota somente OpenAI não deve ser usada como fallback de uma cadeia Anthropic Messages.

<details>
<summary><strong>Rotas gratuitas verificadas no ambiente do mantenedor</strong></summary>

Estas rotas foram verificadas usando as contas do mantenedor. **Elas não são configuradas automaticamente para quem clona o repositório.**

| Provedor | Modelo verificado | Interfaces / recursos |
| --- | --- | --- |
| Requesty | `nvidia/nemotron-3.5-lightning-30b-a3b` | Chat Completions, Anthropic Messages e chamadas de ferramentas estruturadas; custo reportado de US$ 0 |
| Cloudflare Workers AI | `@cf/zai-org/glm-4.7-flash` | Chat Completions e chamadas de ferramentas estruturadas |
| Gonka Broker | `zai-org/GLM-5.3-Flash` | Chat Completions, Anthropic Messages nativas e chamadas de ferramentas estruturadas |
| BazaarLink | `nvidia/nemotron-3.5-lightning-free:free` | Chat Completions e chamadas de ferramentas estruturadas; preço de catálogo US$ 0 / US$ 0 |

Cotas, preços e disponibilidade podem mudar. Confira sempre o painel e o catálogo atual de cada provedor antes de depender de uma rota.

</details>

## 🔌 Integrações especiais

### Claude Code

O Shadow inclui lançadores locais dedicados:

- `claude-requesty`
- `claude-gonka`
- `claude-nvidia`

O template versionado fica em `scripts/claude-route.sh`. Ele gera configurações privadas para o seletor de modelos, preserva o alias enviado ao Shadow e aplica limites conservadores à compactação de contexto.

Veja [Integração com Claude Code](docs/claude-code.md).

### Hub MCP

Claude Code, OpenCode e Cline podem se conectar ao mesmo servidor MCP local chamado `shadow`. Ele agrega GitHub, Runcrate, Mistral, Hugging Face, Cloudflare Docs e Cloudflare API: **208 ferramentas em seis integrações upstream**, organizadas por ferramentas de descoberta e encaminhamento.

A API de modelos e o MCP Hub são, atualmente, processos e endpoints separados. Essa separação é intencional no estado atual do projeto.

Veja [MCP Hub](docs/mcp-hub.md).

## 🧪 Testes

Verificação segura de saúde: usa requisições GET, não executa inferência e não consome tokens de modelos.

```bash
python3 scripts/smoke_test.py
```

Teste de chamadas de ferramentas estruturadas em provedores Chat Completions:

```bash
python3 scripts/smoke_test.py --tool-calls
```

Teste do fluxo de ferramentas Anthropic Messages:

```bash
python3 scripts/smoke_test.py --anthropic-tools --anthropic-provider requesty
python3 scripts/smoke_test.py --anthropic-tools --anthropic-provider gonka
```

Testes de inferência podem consumir cotas gratuitas. Não os use como monitor de saúde frequente. Consulte [Smoke tests](docs/smoke-tests.md) para detalhes, timeouts e observações sobre cotas.

Testes unitários:

```bash
python3 -m unittest discover -s tests -v
```

## 🗂️ Estrutura do projeto

| Caminho | Conteúdo |
| --- | --- |
| `config/shadow.example.yaml` | Exemplo mínimo de provedores e fallbacks. |
| `config/shadow.runtime.example.yaml` | Snapshot sanitizado do roteador do mantenedor: 48 aliases e 37 grupos de fallback. |
| `docs/` | Documentação, status de provedores, cotas e guias operacionais. |
| `scripts/` | Setup, validação, lançadores e manutenção. |
| `tests/` | Testes automatizados. |
| `.env.example` | Nomes das variáveis de ambiente, sem valores secretos. |

O snapshot de runtime é apenas uma referência sanitizada. Credenciais são lidas do ambiente e o ID da conta Cloudflare é um placeholder.

## 🔐 Segurança e privacidade

O repositório público deve conter apenas código, templates e documentação.

**Nunca envie para o Git:**

- Chaves de API, tokens ou arquivos `.env`
- `API.txt`, `extra-providers.env` ou configurações privadas
- Backups, logs, bancos de dados ou arquivos de modelos
- Estado de runtime ou dados de contas

Antes de cada commit, revise:

```bash
git status
git diff --cached
```

Leia também a [Política de segurança](SECURITY.md).

> **Transparência sobre o modo gratuito:** o Shadow não fornece chaves compartilhadas, hospedagem de inferência ou cotas gratuitas ilimitadas. Cada pessoa usa suas próprias contas e credenciais nos provedores remotos. O modo local com Ollama utiliza os recursos da própria máquina.

## 📚 Documentação

- [Gateway unificado](docs/unified-gateway.md)
- [Self-hosting e provedores](docs/self-hosting.md)
- [Integração com Claude Code](docs/claude-code.md)
- [Hub MCP](docs/mcp-hub.md)
- [Smoke tests](docs/smoke-tests.md)
- [Política de segurança](SECURITY.md)

---

## 🇺🇸 English

**Shadow** is a local, multi-provider LLM gateway. It gives coding agents one stable endpoint while routing requests to independently configured providers, local models and free-tier options.

Use Ollama for local inference, connect free providers, or add your own paid APIs. You control credentials, providers, aliases and fallback routes.

> **The idea:** your agents talk to Shadow. Shadow decides where each request goes.

### Features

| Feature | Description |
| --- | --- |
| **One API, multiple providers** | Local OpenAI-compatible and Anthropic Messages endpoints. |
| **Client flexibility** | Works with OpenCode, Cline, Continue, Aider, Claude Code and other compatible clients. |
| **Model aliases** | Keep stable model names without spreading provider-specific IDs across clients. |
| **Fallback routing** | Route requests to configured alternatives when a provider fails. |
| **Local-first inference** | Use Ollama without a remote inference API. |
| **Credential isolation** | Provider keys stay in the gateway's private environment, not in agent configs. |

### Quick start

Requirements: Python **3.11+** and [Ollama](https://ollama.com/) for local inference.

```bash
git clone https://github.com/Ninja7z/shadow.git
cd shadow

python scripts/shadow.py setup
ollama pull llama3.2:3b
python scripts/shadow.py start
```

Setup creates an isolated Python environment, a random local gateway key and a private runtime configuration. The API listens on `127.0.0.1:4000`.

Ollama requires no remote API key and has no cloud inference bill. It uses your own machine's hardware and electricity.

To add free or paid providers, configure the matching variables in your private `.env` file and run:

```bash
python scripts/shadow.py refresh
```

Paid providers are excluded from `shadow-auto` by default. Custom OpenAI-compatible and Anthropic Messages endpoints can be connected with `CUSTOM_OPENAI_*` and `CUSTOM_ANTHROPIC_*`. See [Self-hosting](docs/self-hosting.md).

### API endpoints

| Protocol | Endpoint |
| --- | --- |
| OpenAI-compatible | `http://127.0.0.1:4000/v1` |
| Anthropic Messages | `http://127.0.0.1:4000/v1/messages` |

Use the local Shadow master key as the client credential. Never put upstream provider keys in an agent's configuration.

### Routing and verified free routes

The maintainer's current free chat fallback chain prioritizes higher-allowance or broadly available options:

```text
Groq OSS → Kilo Auto → Kilo → OpenRouter Nemotron → Gemini Flash-Lite
→ NVIDIA → Cloudflare Workers AI → Requesty → Gonka → BazaarLink
→ LLM7 → AI Horde
```

The maintainer has verified routes for Requesty, Cloudflare Workers AI, Gonka Broker and BazaarLink. These use the maintainer's own accounts and **are not clone defaults**. Free quotas, prices and model availability can change; check each provider's current dashboard and catalog.

Fallback chains must remain protocol-compatible. An OpenAI-only route must not be inserted into an Anthropic Messages chain.

### Claude Code and MCP

Dedicated local Claude Code launchers are available: `claude-requesty`, `claude-gonka` and `claude-nvidia`. The versioned launcher template is `scripts/claude-route.sh`. See [Claude Code integration](docs/claude-code.md).

Claude Code, OpenCode and Cline can connect to the same local MCP server, `shadow`, which aggregates GitHub, Runcrate, Mistral, Hugging Face, Cloudflare Docs and Cloudflare API: **208 tools across six upstream integrations**. The model API and MCP Hub currently run as separate protocol endpoints/processes. See [MCP Hub](docs/mcp-hub.md).

### Tests

Safe health check (GET requests only; no inference or model tokens):

```bash
python3 scripts/smoke_test.py
```

Structured tool-call inference:

```bash
python3 scripts/smoke_test.py --tool-calls
```

Anthropic Messages tool-use path:

```bash
python3 scripts/smoke_test.py --anthropic-tools --anthropic-provider requesty
python3 scripts/smoke_test.py --anthropic-tools --anthropic-provider gonka
```

Inference tests can consume free quotas. Do not run them as frequent health checks. See [Smoke tests](docs/smoke-tests.md).

Unit tests:

```bash
python3 -m unittest discover -s tests -v
```

### Repository layout

- `config/shadow.example.yaml`: minimal provider/fallback example.
- `config/shadow.runtime.example.yaml`: sanitized maintainer router snapshot (48 aliases / 37 fallback groups).
- `docs/`: provider status, quota notes and operating guides.
- `scripts/`: setup, validation, launchers and maintenance helpers.
- `tests/`: automated tests.
- `.env.example`: environment variable names, without secret values.

### Security

The public repository must contain templates, code and documentation only. Never commit API keys, account tokens, `.env` files, `API.txt`, `extra-providers.env`, backups, logs, databases, model files or private runtime state.

Review before every commit:

```bash
git status
git diff --cached
```

See [SECURITY.md](SECURITY.md).

**Free-tier transparency:** Shadow does not provide shared API keys, hosted inference or unlimited third-party free quotas. Each user brings their own provider accounts and credentials. Local Ollama inference uses the user's own hardware.

---

<div align="center">

**Shadow** · Your agents. Your providers. One local gateway.

[⭐ Give the project a star](https://github.com/Ninja7z/shadow) · [Report an issue](https://github.com/Ninja7z/shadow/issues)

</div>
