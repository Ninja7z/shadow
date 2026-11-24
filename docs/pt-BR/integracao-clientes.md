# Conecte seus aplicativos ao Shadow

Guia para uma instalação nova clonada do GitHub. Não depende das contas, modelos, caminhos ou credenciais do mantenedor.

## 1. Inicie e valide

Na pasta do repositório, prepare e configure a instalação:

~~~bash
python scripts/shadow.py onboard
~~~

Em um terminal separado, inicie a API:

~~~bash
python scripts/shadow.py start
~~~

Valide em outro terminal:

~~~bash
python scripts/shadow.py validate
curl -fsS http://127.0.0.1:4000/health/liveliness
~~~

A configuração inicial é local-first. Para inferência local, instale Ollama, baixe um modelo e mantenha o serviço ativo. Para provedores remotos, configure suas próprias contas e credenciais.

## 2. Descubra os aliases

A chave mestra é gerada no arquivo privado .env. Não use chaves upstream nos aplicativos.

~~~bash
set -a
source .env
set +a
curl -fsS http://127.0.0.1:4000/v1/models \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY"
~~~

Use o valor id retornado como nome exato do modelo. Os aliases comuns são:

- **shadow-local:** rota para o modelo Ollama configurado.
- **shadow-auto:** rota automática com provedores habilitados para fallback e rota local final.
- **shadow-custom-<id>:** endpoints próprios cadastrados pelo assistente.
- Outros aliases: provedores catalogados que foram configurados com suas credenciais.

Se um alias não aparecer em /v1/models, não presuma que existe.

## 3. Configuração por aplicativo

Os exemplos usam a chave mestra local. Ela é administrativa e adequada somente para uma instalação individual vinculada a 127.0.0.1. Não compartilhe essa chave com usuários ou máquinas não confiáveis.

### OpenCode

Edite opencode.json ou opencode.jsonc e adicione o provedor:

~~~jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "shadow/shadow-auto",
  "providers": {
    "shadow": {
      "name": "Shadow Gateway",
      "env": ["LITELLM_MASTER_KEY"],
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "http://127.0.0.1:4000/v1"
      },
      "models": {
        "shadow-auto": { "name": "Shadow Auto" },
        "shadow-local": { "name": "Shadow Local" }
      }
    }
  }
}
~~~

Exporte a variável antes de iniciar:

~~~bash
set -a
source /caminho/para/shadow/.env
set +a
opencode
~~~

Para usar outro endpoint, adicione o alias exato de /v1/models em models e selecione shadow/<alias>.

### Cline

1. Abra as configurações do Cline.
2. Em API Provider, selecione **OpenAI Compatible**.
3. Informe:
   - Base URL: http://127.0.0.1:4000/v1
   - API Key: valor de LITELLM_MASTER_KEY do seu .env
   - Model ID: alias exato, por exemplo shadow-auto
4. Salve e use Verify, se disponível na versão instalada.

Não selecione o provedor OpenAI nativo. O tipo correto é OpenAI Compatible.

### Continue

No config.yaml do Continue, adicione:

~~~yaml
name: Shadow Gateway
version: 0.0.1
schema: v1

models:
  - name: Shadow Auto
    provider: openai
    model: shadow-auto
    apiBase: http://127.0.0.1:4000/v1
    apiKey: ${{ secrets.LITELLM_MASTER_KEY }}
    roles:
      - chat
      - edit
      - apply
~~~

Coloque a variável em ~/.continue/.env:

~~~env
LITELLM_MASTER_KEY=sua-chave-mestra-local
~~~

O Continue resolve secrets.* a partir dos arquivos .env suportados por ele. Não dependa apenas de export no terminal ao usar a extensão dentro do editor.

### Kilo Code

1. Abra Settings → Providers → Custom provider.
2. Crie um provedor com ID shadow e nome Shadow Gateway.
3. Em Provider API, selecione **OpenAI Compatible**.
4. Informe:
   - Base URL: http://127.0.0.1:4000/v1
   - API key: LITELLM_MASTER_KEY da sua instalação
   - Models: aliases exatos retornados por /v1/models, como shadow-auto e shadow-local.
5. Salve e escolha o modelo.

Se a descoberta automática falhar, cadastre os aliases manualmente. Não coloque chaves upstream nesse aplicativo.

### Aider

Entre na pasta do seu projeto de código e execute:

~~~bash
set -a
source /caminho/para/shadow/.env
set +a
export OPENAI_API_BASE=http://127.0.0.1:4000/v1
export OPENAI_API_KEY="$LITELLM_MASTER_KEY"
aider --model openai/shadow-auto
~~~

Para trocar de rota, substitua shadow-auto por outro alias listado em /v1/models.

### Claude Code

O Claude Code usa Anthropic Messages. Use a raiz do gateway, sem acrescentar /v1:

~~~bash
set -a
source /caminho/para/shadow/.env
set +a
unset ANTHROPIC_API_KEY
ANTHROPIC_BASE_URL=http://127.0.0.1:4000 \
ANTHROPIC_AUTH_TOKEN="$LITELLM_MASTER_KEY" \
ANTHROPIC_MODEL=shadow-auto \
claude
~~~

Substitua shadow-auto por um alias listado em /v1/models. Ferramentas, streaming, visão e contexto dependem do modelo upstream e da tradução do LiteLLM. O script scripts/claude-route.sh é um fluxo avançado separado e pode exigir configuração local adicional; o exemplo acima é o caminho direto para uma instalação recém-clonada.

### Windows PowerShell

As etapas pela interface do Cline e Kilo são iguais no Windows. Para OpenCode, Aider ou Claude Code, carregue primeiro a chave gerada no PowerShell:

~~~powershell
$env:LITELLM_MASTER_KEY = ((Get-Content .env | Where-Object { $_ -match '^LITELLM_MASTER_KEY=' } | Select-Object -First 1) -replace '^LITELLM_MASTER_KEY=', '')
~~~

OpenCode:

~~~powershell
opencode
~~~

Aider:

~~~powershell
$env:OPENAI_API_BASE = 'http://127.0.0.1:4000/v1'
$env:OPENAI_API_KEY = $env:LITELLM_MASTER_KEY
aider --model openai/shadow-auto
~~~

Claude Code:

~~~powershell
Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
$env:ANTHROPIC_BASE_URL = 'http://127.0.0.1:4000'
$env:ANTHROPIC_AUTH_TOKEN = $env:LITELLM_MASTER_KEY
$env:ANTHROPIC_MODEL = 'shadow-auto'
claude
~~~

## 4. Diagnóstico

~~~bash
curl -fsS http://127.0.0.1:4000/health/liveliness
set -a && source .env && set +a
curl -fsS http://127.0.0.1:4000/v1/models \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY"
python scripts/shadow.py validate
~~~

- **Connection refused:** inicie o gateway e confirme a porta.
- **401 Unauthorized:** confira se o aplicativo recebeu a chave mestra desta instalação.
- **404 / model not found:** use um alias listado em /v1/models.
- **A API responde, mas a inferência falha:** confira se o provedor/modelo está habilitado, se a chave upstream é válida e se há cota.
- **Ferramentas ou imagens não funcionam:** confirme o suporte do modelo e do protocolo. Compatibilidade de endpoint não significa paridade de recursos.

## 5. Segurança

- LITELLM_MASTER_KEY é administrativa. Use-a somente em uma instalação local individual.
- Não exponha 127.0.0.1:4000 diretamente na rede ou internet.
- Para múltiplos usuários ou dispositivos, configure PostgreSQL e chaves virtuais LiteLLM com escopos, limites e orçamentos próprios antes de compartilhar o serviço.
- Mantenha chaves de provedores somente no ambiente privado do Shadow.
- O gateway não transforma um plano gratuito em uso ilimitado nem elimina limites ou cobranças do provedor.

## Documentação oficial

- [OpenCode: Providers](https://opencode.ai/docs/providers)
- [Cline: OpenAI Compatible](https://docs.cline.bot/provider-config/openai-compatible)
- [Continue: OpenAI-compatible providers](https://docs.continue.dev/customize/model-providers/top-level/openai)
- [Kilo Code: OpenAI Compatible](https://kilo.ai/docs/ai-providers/openai-compatible)
- [Aider: OpenAI-compatible APIs](https://aider.chat/docs/llms/openai-compat.html)
- [Claude Code: Environment settings](https://docs.anthropic.com/en/docs/claude-code/settings)
