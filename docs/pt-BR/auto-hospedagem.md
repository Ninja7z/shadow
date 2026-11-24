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
python scripts/shadow.py onboard
```

Em um clone novo, esse comando cria o ambiente isolado `.venv`, instala LiteLLM e dependências, copia `.env.example` para um `.env` privado, gera uma chave mestra local, cria `config/shadow.yaml` e abre o menu interativo de onboarding. O menu verifica Ollama, conecta provedores do catálogo, cadastra endpoints próprios e mostra como configurar seus aplicativos. Os arquivos gerados são ignorados pelo Git.

Instale um modelo local se quiser inferência local:

```bash
ollama pull llama3.2:3b
```

Inicie a API em outro terminal:

```bash
python scripts/shadow.py start
```

Valide a instalação em um terceiro terminal:

```bash
python scripts/shadow.py validate
curl -fsS http://127.0.0.1:4000/health/liveliness
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

4. Reinicie o Shadow. Os novos aliases aparecerão em `/v1/models`. Somente entradas marcadas com `auto_fallback: true` e classificadas como exclusivamente gratuitas podem entrar em `shadow-auto`. Qualquer classificação que contenha `paid` ou `mixed` permanece manual, mesmo que a flag esteja ativa. Endpoints próprios começam em modo manual; APIs próprias gratuitas podem optar pelo fallback no assistente, enquanto APIs pagas/mistas exigem digitar `SIM`. O Ollama local continua como fallback final.

Consulte `config/providers.catalog.yaml` para ver o catálogo, IDs de modelos, variáveis necessárias, classificação de acesso e links oficiais. Uma variável vazia não ativa um provedor.

Para cadastrar vários endpoints próprios sem editar código ou o catálogo público, execute `python scripts/shadow.py add-provider`. O assistente aceita endpoints OpenAI Chat Completions ou Anthropic Messages, pede Base URL, ID do modelo e tipo de acesso, e solicita a chave sem exibi-la. As chaves ficam no `.env` privado e os metadados em `config/providers.local.yaml`, arquivo ignorado pelo Git. Execute `refresh`, reinicie o gateway e use o alias `shadow-custom-<id>` exibido em `/v1/models`. Esses endpoints são manuais por padrão. APIs gratuitas podem ser incluídas no fallback automático; APIs pagas ou mistas exigem que você digite `SIM` para confirmar a possibilidade de cobranças. APIs com protocolo proprietário precisam de um adaptador LiteLLM. As variáveis antigas `CUSTOM_OPENAI_*` e `CUSTOM_ANTHROPIC_*` continuam compatíveis.

Para um adaptador permanente e reutilizável, adicione uma entrada ao catálogo com o ID do modelo LiteLLM, a API base e o nome da variável de ambiente.

Para ver quais variáveis opcionais de provedores estão habilitadas:

```bash
python scripts/shadow.py configure
```

O catálogo é uma lista inicial de integrações, não uma garantia de plano gratuito. Confirme preços e cotas atuais com cada provedor. Apenas provedores classificados como exclusivamente gratuitos podem entrar em `shadow-auto`; serviços com acesso misto (gratuito + pago) ou baseados em créditos permanecem manuais, mesmo que `auto_fallback: true` esteja definido. Para endpoints próprios, o assistente exige consentimento explícito antes de incluir uma API paga ou mista no fallback.

## Conecte um cliente

Os dados comuns de conexão são:

- Base URL OpenAI-compatible: `http://127.0.0.1:4000/v1`
- Base URL Anthropic Messages: `http://127.0.0.1:4000`
- API key do cliente: a `LITELLM_MASTER_KEY` local do seu `.env` privado
- Modelo: um alias exato retornado por `/v1/models`

Consulte [Integração com aplicativos](integracao-clientes.md) para instruções prontas de OpenCode, Cline, Continue, Kilo Code, Aider e Claude Code. Não cole chaves de provedores upstream nas configurações dos clientes.

A compatibilidade varia por provedor. Uso de ferramentas, visão, streaming, raciocínio, cache de prompt, tamanho de contexto e tradução Anthropic Messages devem ser verificados por modelo.

## Comandos

```bash
python scripts/shadow.py setup      # cria ambiente e configuração locais
python scripts/shadow.py configure  # mostra catálogo e endpoints próprios
python scripts/shadow.py add-provider  # cadastra uma API própria interativamente
python scripts/shadow.py refresh    # regenera config após editar .env
python scripts/shadow.py validate   # valida aliases gerados
python scripts/shadow.py start      # inicia a API local
```

A instalação inicial não instala o Ollama nem baixa modelos automaticamente. Assim, o Shadow não consome disco, rede, GPU ou CPU sem sua autorização. Instale somente os modelos desejados.

## Segurança e compartilhamento

- `.env`, `config/shadow.yaml`, `config/providers.local.yaml`, `.venv`, logs e dados de runtime são locais e ignorados pelo Git.
- A chave mestra gerada é administrativa. Mantenha-a privada e use-a somente no gateway local.
- O endereço padrão é loopback. Não exponha o gateway em `0.0.0.0` ou na internet sem TLS, autenticação, limites de taxa e uma configuração adequada de banco de dados/gerenciamento de chaves.
- Nunca faça commit de chaves pessoais de API, sessões OAuth, IDs sensíveis de contas, logs de requisições ou backups locais.
- Se hospedar o Shadow para vários usuários, configure chaves virtuais do LiteLLM com PostgreSQL e emita chaves com escopo em vez de compartilhar a chave mestra.
