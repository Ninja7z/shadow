# Execute sua própria API Shadow

> **Aviso de licença:** a Shadow usa a PolyForm Noncommercial License 1.0.0 (`PolyForm-Noncommercial-1.0.0`). Ela permite uso, modificação e distribuição apenas para finalidades não comerciais. Inclui expressamente usos pessoais e determinadas organizações não comerciais (beneficentes, educacionais, de pesquisa pública, saúde/segurança pública, proteção ambiental e instituições governamentais). Uso comercial é proibido. Cada provedor, API, modelo, SDK e serviço continua sujeito à própria licença e aos próprios termos. Consulte o [texto oficial](https://polyformproject.org/licenses/noncommercial/1.0.0), o arquivo LICENSE e a [explicação em português](licenca.md).



O Shadow foi projetado para ser clonado e executado pelo próprio usuário. O software do gateway e sua configuração são gratuitos: você não precisa de uma conta Shadow, de um servidor Shadow hospedado ou da chave de API de outra pessoa.

Há duas formas de obter inferência:

1. **Totalmente local, sem cobrança de API:** execute o Ollama no seu computador e baixe um modelo. Os prompts permanecem na sua máquina. O processamento usa CPU/GPU/RAM e energia locais.
2. **Contas de provedores remotos:** adicione suas próprias credenciais de APIs gratuitas ou pagas. O Shadow normaliza os serviços por trás de um endpoint compatível com OpenAI e aplica cadeias de fallback. Cada provedor controla suas cotas, preços, critérios de acesso e disponibilidade.

Um repositório Git público não pode incluir chaves compartilhadas com segurança nem prometer inferência gratuita e ilimitada de terceiros. Planos gratuitos remotos geralmente exigem que cada pessoa crie sua própria conta/chave, podem ter limites diários e podem mudar sem aviso.

## Requisitos

- Python 3.11 ou superior.
- Ollama para começar com inferência local sem custo de nuvem: https://ollama.com/download
- Acesso à internet para instalação, download de modelos e provedores remotos escolhidos.

## Início rápido

Clone o repositório e execute na pasta raiz:

```bash
python scripts/shadow.py setup
```

Esse comando cria um ambiente isolado `.venv`, instala LiteLLM e dependências, copia `.env.example` para um `.env` privado, gera uma chave aleatória para o gateway local e cria `config/shadow.yaml`. Os arquivos gerados são ignorados pelo Git.

Instale um modelo local:

```bash
ollama pull llama3.2:3b
```

Inicie a API:

```bash
python scripts/shadow.py start
```

Por padrão, o serviço fica vinculado a `127.0.0.1:4000`. Ele não fica exposto à rede local nem à internet pública.

- Base URL OpenAI-compatible: `http://127.0.0.1:4000/v1`
- Base URL Anthropic Messages: `http://127.0.0.1:4000`
- Alias do modelo local: `shadow-local`
- Rota automática: `shadow-auto`
- Catálogo de modelos: `http://127.0.0.1:4000/v1/models`

Use a variável `LITELLM_MASTER_KEY` gerada no seu `.env` privado como chave do cliente. Nunca cole chaves de provedores upstream nas configurações dos agentes de código.

## Adicione provedores gratuitos ou pagos

1. Abra o arquivo privado `.env` em um editor de texto.
2. Adicione as chaves dos provedores escolhidos. Exemplos:

```env
GEMINI_API_KEY=sua-propria-chave
GROQ_API_KEY=sua-propria-chave
OPENROUTER_API_KEY=sua-propria-chave
HF_TOKEN=seu-proprio-token
REQUESTY_API_KEY=sua-propria-chave
GONKA_API_KEY=sua-propria-chave
BAZAARLINK_API_KEY=sua-propria-chave
CLOUDFLARE_ACCOUNT_ID=seu-id-de-conta
CLOUDFLARE_WORKERS_AI_TOKEN=seu-proprio-token
```

3. Gere novamente a configuração:

```bash
python scripts/shadow.py refresh
```

4. Reinicie o Shadow. Os novos aliases aparecerão em `/v1/models`. Somente entradas do catálogo marcadas explicitamente com `auto_fallback: true` podem ser usadas por `shadow-auto`. Rotas pagas, baseadas em créditos ou com mistura de opções gratuitas e pagas permanecem manuais por padrão. Selecione o alias explicitamente quando quiser usá-las. O Ollama local continua como fallback final.

Consulte `config/providers.catalog.yaml` para ver o catálogo, IDs de modelos, variáveis necessárias, classificação de acesso e links oficiais. Uma variável vazia não ativa um provedor.

É possível adicionar qualquer serviço OpenAI-compatible sem editar código usando `CUSTOM_OPENAI_API_KEY`, `CUSTOM_OPENAI_BASE_URL` e `CUSTOM_OPENAI_MODEL`. Para um serviço compatível com Anthropic Messages, use `CUSTOM_ANTHROPIC_API_KEY`, `CUSTOM_ANTHROPIC_BASE_URL` e `CUSTOM_ANTHROPIC_MODEL`. Eles aparecem como `shadow-custom-openai` e `shadow-custom-anthropic`. Rotas personalizadas são manuais por padrão e não entram automaticamente no fallback.

Para um adaptador permanente e reutilizável, adicione uma entrada ao catálogo com o ID do modelo LiteLLM, a API base e o nome da variável de ambiente.

Para ver quais variáveis opcionais de provedores estão habilitadas:

```bash
python scripts/shadow.py configure
```

O catálogo é uma lista inicial de integrações, não uma garantia de plano gratuito. Confirme preços e cotas atuais com cada provedor. Serviços pagos ficam fora de `shadow-auto` por padrão para evitar cobranças inesperadas. Você pode habilitar um provedor para fallback automático definindo `auto_fallback: true` na entrada correspondente, após revisar a cobrança.

## Conecte um cliente

Clientes OpenAI-compatible (OpenCode, Cline, Continue, Kilo, Aider):

- Base URL: `http://127.0.0.1:4000/v1`
- API key: sua `LITELLM_MASTER_KEY` local
- Modelo: `shadow-auto`, `shadow-local` ou um alias de provedor habilitado.

Clientes compatíveis com Anthropic:

- Base URL: `http://127.0.0.1:4000`
- API key: sua `LITELLM_MASTER_KEY` local
- Modelo: escolha um alias compatível com Anthropic Messages no provedor selecionado.

A compatibilidade varia por provedor. Uso de ferramentas, visão, streaming, raciocínio, cache de prompt, tamanho de contexto e tradução Anthropic Messages devem ser verificados por modelo. Não presuma que todo upstream OpenAI-compatible oferece todos os recursos.

## Comandos

```bash
python scripts/shadow.py setup      # cria ambiente e configuração locais
python scripts/shadow.py configure  # mostra configuração opcional de provedores
python scripts/shadow.py refresh    # regenera config após editar .env
python scripts/shadow.py validate   # valida aliases gerados
python scripts/shadow.py start      # inicia a API local
```

A instalação inicial não instala o Ollama nem baixa modelos automaticamente. Assim, o Shadow não consome disco, rede, GPU ou CPU sem sua autorização. Instale somente os modelos desejados.

## Segurança e compartilhamento

- `.env`, `config/shadow.yaml`, `.venv`, logs e dados de runtime são locais e ignorados pelo Git.
- A chave mestra gerada é administrativa. Mantenha-a privada e use-a somente no gateway local.
- O endereço padrão é loopback. Não exponha o gateway em `0.0.0.0` ou na internet sem TLS, autenticação, limites de taxa e uma configuração adequada de banco de dados/gerenciamento de chaves.
- Nunca faça commit de chaves pessoais de API, sessões OAuth, IDs sensíveis de contas, logs de requisições ou backups locais.
- Se hospedar o Shadow para vários usuários, configure chaves virtuais do LiteLLM com PostgreSQL e emita chaves com escopo em vez de compartilhar a chave mestra.
