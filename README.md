<!--
  Shadow · README
  Keep this page aligned with scripts/shadow.py, config/providers.catalog.yaml
  and the public documentation. Do not publish maintainer credentials or
  private runtime inventories here.
-->

<div align="center">

# ◈ Shadow

### Sua central local de provedores de IA.

**Uma API para seus agentes. Seus provedores. Suas regras.**

[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Gateway](https://img.shields.io/badge/Gateway-LiteLLM-111827)](https://docs.litellm.ai/)
[![Protocols](https://img.shields.io/badge/API-OpenAI%20%2B%20Anthropic-2563EB)](#-uma-api-para-seus-clientes)
[![Self-hosted](https://img.shields.io/badge/execução-self--hosted-16A34A)](#-instalação)
[![License](https://img.shields.io/badge/License-PolyForm%20Noncommercial-blue)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Ninja7z/shadow?style=flat)](https://github.com/Ninja7z/shadow/stargazers)

[🇧🇷 Português](#-português) · [🇺🇸 English](#-english) · [Documentação](#-documentação)

</div>

---

## 🇧🇷 Português

Shadow é um gateway de IA **local, self-hosted e multiprovedor**. Ele fica entre seus clientes/agentes e os provedores de modelos, oferecendo uma API unificada compatível com os formatos OpenAI e Anthropic Messages.

Em vez de configurar cada agente com várias chaves e endpoints, você conecta os clientes ao Shadow. O gateway mantém as credenciais dos provedores, disponibiliza aliases estáveis e encaminha as requisições para os modelos configurados.

**Use Ollama localmente, conecte provedores com cotas gratuitas ou adicione suas próprias APIs pagas e endpoints personalizados.** Você escolhe o que habilitar.

> O Shadow é o gateway, não um serviço de inferência hospedado. Cada instalação usa seus próprios modelos locais e/ou suas próprias contas e credenciais de provedores.

## ✦ O que o Shadow oferece

| Recurso | Como funciona |
| --- | --- |
| **API unificada** | Um gateway local com endpoints compatíveis com OpenAI e Anthropic Messages. |
| **Vários provedores** | Centraliza modelos locais, provedores remotos e endpoints personalizados. |
| **Aliases estáveis** | Clientes usam nomes como `shadow-local`, `shadow-auto` e aliases de provedores, sem precisar conhecer cada integração. |
| **Fallback configurável** | Encaminha para alternativas habilitadas e mantém o modelo local como fallback final. |
| **Local-first** | Ollama permite inferência na própria máquina, sem API remota. |
| **Credenciais centralizadas** | Chaves upstream ficam no ambiente privado do gateway, não espalhadas pelos agentes. |
| **Compatibilidade de clientes** | Pode ser usado por clientes que aceitam endpoints OpenAI-compatible ou Anthropic. |
| **Configuração extensível** | Catálogo de provedores e suporte a endpoints OpenAI/Anthropic personalizados. |

## ⌘ Uma API para seus clientes

O gateway é operado pelo [LiteLLM Proxy](https://docs.litellm.ai/) e, por padrão, escuta somente em `127.0.0.1:4000`.

| Protocolo | Endpoint / Base URL |
| --- | --- |
| OpenAI-compatible | `http://127.0.0.1:4000/v1` |
| OpenAI Chat Completions | `http://127.0.0.1:4000/v1/chat/completions` |
| OpenAI Responses | `http://127.0.0.1:4000/v1/responses` |
| Anthropic Messages | `http://127.0.0.1:4000/v1/messages` |
| Catálogo de modelos | `http://127.0.0.1:4000/v1/models` |

Para clientes OpenAI-compatible, use a Base URL terminada em `/v1`. Para clientes Anthropic que acrescentam `/v1/messages` automaticamente, use `http://127.0.0.1:4000` como Base URL.

Use a chave local `LITELLM_MASTER_KEY` gerada durante a instalação. **Nunca coloque as chaves dos provedores upstream nas configurações dos agentes.**

Clientes compatíveis incluem OpenCode, Cline, Kilo Code, Continue, Aider e Claude Code. A configuração exata varia conforme o cliente e o protocolo escolhido.

## 🚀 Instalação

### Requisitos

- Python **3.11 ou superior**.
- Internet para instalar as dependências e baixar modelos.
- [Ollama](https://ollama.com/) se quiser inferência local.
- Chaves próprias somente para os provedores remotos que decidir conectar.

### 1. Clone o repositório

```bash
git clone https://github.com/Ninja7z/shadow.git
cd shadow
```

### 2. Prepare sua instalação

```bash
python scripts/shadow.py setup
```

O comando prepara um ambiente Python isolado em `.venv`, instala as dependências, cria o arquivo privado `.env`, gera uma chave mestra local e monta a configuração inicial em `config/shadow.yaml`.

A configuração inicial não exige chave de provedor remoto.

### 3. Inicie com Ollama (opcional)

Instale o Ollama e baixe um modelo:

```bash
ollama pull llama3.2:3b
```

### 4. Inicie o gateway

```bash
python scripts/shadow.py start
```

A API estará disponível em `http://127.0.0.1:4000`. O gateway fica vinculado ao loopback por padrão, não exposto à rede local ou à internet.

### 5. Valide a instalação

Em outro terminal:

```bash
python scripts/shadow.py validate
curl http://127.0.0.1:4000/health/liveliness
curl http://127.0.0.1:4000/v1/models \
  -H "Authorization: Bearer SUA_LITELLM_MASTER_KEY"
```

A chave é gerada no seu `.env` privado. Não a publique nem a compartilhe.

## 🧠 Provedores e modelos

O catálogo inicial em `config/providers.catalog.yaml` inclui integrações para:

| Provedor | Acesso indicado no catálogo |
| --- | --- |
| Google Gemini | Cota gratuita e planos pagos |
| Groq | Cota gratuita e planos pagos |
| OpenRouter | Modelos gratuitos e pagos |
| Hugging Face | Créditos e planos pagos |
| Requesty | Cota gratuita e planos pagos |
| Gonka Broker | Cota gratuita |
| BazaarLink | Cota gratuita |
| Cloudflare Workers AI | Cota diária gratuita e uso pago |
| DeepSeek | Pago |
| Mistral | Teste gratuito e planos pagos |
| OpenAI | Pago |
| Anthropic | Pago |

Essas classificações descrevem o tipo de acesso indicado no catálogo, **não garantem disponibilidade, elegibilidade, preço ou cota para sua conta**. Planos, modelos, limites e políticas podem mudar. Confirme as condições diretamente com cada provedor.

### Ativar um provedor

1. Abra o arquivo privado `.env`.
2. Preencha a variável de ambiente correspondente ao provedor desejado.
3. Para Cloudflare Workers AI, informe também `CLOUDFLARE_ACCOUNT_ID`.
4. Gere novamente a configuração:

```bash
python scripts/shadow.py refresh
```

5. Reinicie o Shadow para carregar a configuração atualizada.

Para ver os provedores opcionais e o estado das variáveis locais:

```bash
python scripts/shadow.py configure
```

Somente provedores marcados com `auto_fallback: true` no catálogo entram na cadeia automática quando suas credenciais necessárias estão configuradas. Os demais ficam disponíveis por alias, para seleção manual. O modelo local permanece como fallback final.

### Conectar qualquer endpoint compatível

Não encontrou seu provedor no catálogo? Configure um endpoint próprio no `.env`.

OpenAI-compatible:

```env
CUSTOM_OPENAI_API_KEY=sua-chave
CUSTOM_OPENAI_BASE_URL=https://seu-endpoint/v1
CUSTOM_OPENAI_MODEL=nome-do-modelo
```

Anthropic Messages-compatible:

```env
CUSTOM_ANTHROPIC_API_KEY=sua-chave
CUSTOM_ANTHROPIC_BASE_URL=https://seu-endpoint
CUSTOM_ANTHROPIC_MODEL=nome-do-modelo
```

Depois execute `python scripts/shadow.py refresh`. Os aliases serão `shadow-custom-openai` e `shadow-custom-anthropic`, respectivamente. Rotas personalizadas são manuais por padrão e não entram automaticamente no fallback.

## 🔁 Roteamento e fallback

O Shadow oferece dois aliases principais desde a configuração inicial:

- **`shadow-local`**: modelo local configurado via Ollama.
- **`shadow-auto`**: rota automática, que usa os provedores remotos explicitamente habilitados para fallback e termina no modelo local.

A cadeia automática é montada a partir das credenciais presentes no seu próprio `.env` e das entradas marcadas com `auto_fallback: true` no catálogo. Ela não depende das contas privadas do mantenedor e não inclui automaticamente todos os provedores.

Mantenha as rotas de fallback compatíveis com o protocolo do cliente. Nem todo provedor oferece os mesmos recursos: tool calling, streaming, visão, raciocínio, cache, contexto e suporte Anthropic podem variar por modelo.

## 🧩 Hub MCP

Além da API de modelos, o projeto possui um **MCP Hub local** para agregar ferramentas de serviços externos e compartilhá-las entre clientes compatíveis com MCP.

O Hub e o gateway de modelos são componentes separados:

- **API de modelos:** LiteLLM, endpoints HTTP na porta `4000`.
- **MCP Hub:** servidor local via stdio, com configuração e credenciais próprias.

A instalação básica do gateway (`setup`) não configura automaticamente contas OAuth, tokens ou clientes MCP. Consulte o guia do Hub para instalar e autorizar as integrações desejadas. O estado e as credenciais MCP são específicos de cada máquina.

## 🧰 Claude Code

O repositório inclui um template de lançador para usar rotas do Shadow com Claude Code:

- `scripts/claude-route.sh`

Consulte [Integração com Claude Code](docs/pt-BR/integracao-claude-code.md) para requisitos, configuração e limitações. O login do Claude Code e o uso do gateway Shadow são formas diferentes de autenticação; evite configurar simultaneamente credenciais incompatíveis na mesma sessão.

## 🧪 Testes e diagnóstico

Testes unitários:

```bash
python -m unittest discover -s tests -v
```

Verificação segura de saúde:

```bash
python scripts/smoke_test.py
```

O smoke test padrão verifica endpoints e estado do gateway sem executar inferência. Testes de tool calling e Anthropic Messages podem fazer requisições reais e consumir cotas:

```bash
python scripts/smoke_test.py --tool-calls
python scripts/smoke_test.py --anthropic-tools --anthropic-provider requesty
python scripts/smoke_test.py --anthropic-tools --anthropic-provider gonka
```

Use esses testes de inferência conscientemente. Não os execute repetidamente como monitor de saúde.

## 🗂️ Estrutura do repositório

| Caminho | Conteúdo |
| --- | --- |
| `scripts/shadow.py` | CLI de instalação, configuração, validação e inicialização. |
| `config/shadow.example.yaml` | Configuração inicial local-first. |
| `config/providers.catalog.yaml` | Catálogo de integrações opcionais. |
| `config/shadow.runtime.example.yaml` | Exemplo sanitizado de configuração de roteamento. |
| `scripts/smoke_test.py` | Verificações e testes de integração. |
| `scripts/claude-route.sh` | Template de integração com Claude Code. |
| `scripts/shadow-mcp-hub.sh` | Lançador do MCP Hub. |
| `docs/` | Guias de instalação, provedores, MCP, testes e operação. |
| `tests/` | Testes automatizados. |
| `.env.example` | Nomes das variáveis de ambiente, sem credenciais. |

## 🔐 Segurança e privacidade

- Mantenha `.env`, `.venv/`, `config/shadow.yaml`, tokens, estados OAuth e arquivos de runtime fora do Git.
- Nunca publique chaves de API, tokens de acesso, cookies, arquivos de sessão ou backups de credenciais.
- Revise `git status` e `git diff --cached` antes de cada commit.
- O gateway inicia em `127.0.0.1`. Não o exponha diretamente à rede ou à internet sem autenticação adequada, TLS, limites de taxa e configuração segura.
- Não compartilhe a chave mestra administrativa com agentes ou usuários não confiáveis. Para cenários multiusuário, planeje autenticação e chaves virtuais dedicadas.
- Provedores remotos recebem as requisições encaminhadas a eles. Consulte as políticas de privacidade e retenção de cada serviço antes de enviar dados sensíveis.

### Sem promessas de API grátis ilimitada

O Shadow não fornece chaves compartilhadas, hospedagem de inferência nem cotas gratuitas próprias. Você conecta suas contas e credenciais aos provedores que escolher. O modo Ollama processa localmente, usando hardware, armazenamento e energia da sua máquina.

## ⚖️ Licença

O Shadow é distribuído sob a **PolyForm Noncommercial License 1.0.0** (`PolyForm-Noncommercial-1.0.0`).

Ela permite uso, modificação e distribuição para finalidades não comerciais. Inclui usos pessoais e também determinadas organizações não comerciais. **Uso comercial é proibido.** A licença não concede direitos sobre APIs, modelos, SDKs ou serviços de terceiros; cada provedor mantém seus próprios termos, licenças, preços e políticas.

- [Texto oficial da PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)
- [LICENSE do repositório](LICENSE)
- [Explicação em português](docs/pt-BR/licenca.md)

---

## 📚 Documentação

### Português

- [Gateway unificado e endpoints](docs/pt-BR/gateway-unificado.md)
- [Instalação, provedores e auto-hospedagem](docs/pt-BR/auto-hospedagem.md)
- [Integração com Claude Code](docs/pt-BR/integracao-claude-code.md)
- [Hub MCP](docs/pt-BR/hub-mcp.md)
- [Testes smoke e diagnóstico](docs/pt-BR/testes-smoke.md)
- [Licença](docs/pt-BR/licenca.md)
- [Política de segurança](SECURITY.pt-BR.md)

### English

- [Unified gateway and API](docs/unified-gateway.md)
- [Self-hosting and providers](docs/self-hosting.md)
- [Claude Code integration](docs/claude-code.md)
- [MCP Hub](docs/mcp-hub.md)
- [Smoke tests and diagnostics](docs/smoke-tests.md)
- [License](LICENSE)
- [Security policy](SECURITY.md)

---

## 🇺🇸 English

Shadow is a **local, self-hosted, multi-provider AI gateway**. It sits between your coding agents and model providers, exposing one API compatible with OpenAI and Anthropic Messages formats.

Instead of configuring every agent with multiple provider keys and endpoints, point your clients to Shadow. The gateway keeps upstream credentials in a private environment, exposes stable model aliases and routes requests to the providers you enable.

Use Ollama locally, connect providers with free tiers, or bring your own paid APIs and custom endpoints. You control what gets enabled.

> Shadow is gateway software, not a hosted inference service. Each installation uses its own local models and/or its own provider accounts and credentials.

### Features

| Feature | Description |
| --- | --- |
| **Unified API** | One local gateway with OpenAI-compatible and Anthropic Messages endpoints. |
| **Multiple providers** | Local models, remote providers and custom endpoints behind one interface. |
| **Stable aliases** | Clients use aliases such as `shadow-local`, `shadow-auto` and provider-specific names. |
| **Fallback routing** | Routes to enabled alternatives and keeps the local model as the final fallback. |
| **Local-first** | Ollama runs inference on your own machine. |
| **Credential isolation** | Upstream keys stay in the gateway's private environment, not in agent configs. |
| **Extensible catalog** | Optional provider integrations and custom OpenAI/Anthropic-compatible endpoints. |

### API endpoints

The gateway is powered by [LiteLLM Proxy](https://docs.litellm.ai/) and listens on `127.0.0.1:4000` by default.

| Protocol | Endpoint / Base URL |
| --- | --- |
| OpenAI-compatible | `http://127.0.0.1:4000/v1` |
| OpenAI Chat Completions | `http://127.0.0.1:4000/v1/chat/completions` |
| OpenAI Responses | `http://127.0.0.1:4000/v1/responses` |
| Anthropic Messages | `http://127.0.0.1:4000/v1/messages` |
| Model catalog | `http://127.0.0.1:4000/v1/models` |

Use the local `LITELLM_MASTER_KEY` generated during setup. Never put upstream provider keys in your agents' configuration.

### Quick start

Requirements: Python **3.11+** and [Ollama](https://ollama.com/) for local inference.

```bash
git clone https://github.com/Ninja7z/shadow.git
cd shadow

python scripts/shadow.py setup
ollama pull llama3.2:3b
python scripts/shadow.py start
```

Setup creates an isolated Python environment, a private `.env`, a random local master key and the initial runtime config. Ollama is optional; install it and pull a model only if you want local inference.

Validate the setup:

```bash
python scripts/shadow.py validate
curl http://127.0.0.1:4000/health/liveliness
```

### Providers and custom endpoints

The initial catalog includes Google Gemini, Groq, OpenRouter, Hugging Face, Requesty, Gonka Broker, BazaarLink, Cloudflare Workers AI, DeepSeek, Mistral, OpenAI and Anthropic.

Access labels in the catalog describe the listed access model, not a guarantee of availability, price, quota or eligibility. Check each provider's current terms and dashboard.

Add your own provider keys to the private `.env` file and regenerate the runtime configuration:

```bash
python scripts/shadow.py refresh
```

See which optional providers are configured:

```bash
python scripts/shadow.py configure
```

Only catalog entries explicitly marked `auto_fallback: true` join the automatic fallback chain when their required credentials are present. Other providers remain manual-selection routes by default. The local model remains the final fallback.

For any OpenAI-compatible endpoint, set `CUSTOM_OPENAI_API_KEY`, `CUSTOM_OPENAI_BASE_URL` and `CUSTOM_OPENAI_MODEL`. For an Anthropic Messages-compatible endpoint, use `CUSTOM_ANTHROPIC_API_KEY`, `CUSTOM_ANTHROPIC_BASE_URL` and `CUSTOM_ANTHROPIC_MODEL`. Run `refresh` afterwards. Custom routes are manual by default.

### MCP Hub

The repository also includes a local MCP Hub for aggregating external tools and sharing them across MCP-compatible clients.

The MCP Hub and model gateway are separate components:

- **Model API:** LiteLLM HTTP endpoints on port `4000`.
- **MCP Hub:** local stdio server with its own configuration and credentials.

The basic gateway setup does not automatically configure OAuth accounts, tokens or MCP clients. See the [MCP Hub guide](docs/mcp-hub.md) before enabling it.

### Claude Code

A local launcher template is available at `scripts/claude-route.sh`. See [Claude Code integration](docs/claude-code.md) for setup and limitations.

### Tests

Unit tests:

```bash
python -m unittest discover -s tests -v
```

Safe health checks:

```bash
python scripts/smoke_test.py
```

Tool-call and Anthropic Messages integration tests may make real inference requests and consume provider quotas:

```bash
python scripts/smoke_test.py --tool-calls
python scripts/smoke_test.py --anthropic-tools --anthropic-provider requesty
python scripts/smoke_test.py --anthropic-tools --anthropic-provider gonka
```

Do not run inference tests repeatedly as health monitoring.

### Security and privacy

Keep `.env`, `.venv/`, `config/shadow.yaml`, tokens, OAuth state and runtime files out of Git. Never commit API keys, access tokens, cookies, session files or credential backups.

The gateway binds to loopback by default. Do not expose it directly to a network or the public internet without proper authentication, TLS, rate limits and a secure deployment configuration. Remote providers receive the requests routed to them; review each provider's privacy and retention terms before sending sensitive data.

Shadow does not provide shared API keys, hosted inference or unlimited free quotas. Users bring their own provider accounts. Ollama inference runs locally on the user's hardware.

### License

Shadow is distributed under the **PolyForm Noncommercial License 1.0.0** (`PolyForm-Noncommercial-1.0.0`). It permits use, modification and distribution for noncommercial purposes, including personal use and certain noncommercial organizations. Commercial use is prohibited.

The Shadow license does not grant rights to third-party APIs, models, SDKs or services. Each provider retains its own licenses, terms, prices and policies.

See the [official license](https://polyformproject.org/licenses/noncommercial/1.0.0), [LICENSE](LICENSE) and [Portuguese explanation](docs/pt-BR/licenca.md).

---

<div align="center">

**Shadow** · Your agents. Your providers. One local gateway.

[⭐ Give the project a star](https://github.com/Ninja7z/shadow) · [Report an issue](https://github.com/Ninja7z/shadow/issues)

</div>
