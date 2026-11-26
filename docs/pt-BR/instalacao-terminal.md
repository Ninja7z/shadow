# Instalação pelo terminal (npm)

O instalador oficial do Shadow é distribuído como pacote npm. Ele prepara o gateway e conduz a configuração inteira pelo terminal. A interface web local é um projeto futuro e não faz parte desta instalação.

## Requisitos

- Node.js 20.12+ e npm (necessários para executar npx).
- Internet durante a instalação de uv, Python e dependências do gateway.
- Linux, macOS ou Windows em x64/ARM64.

Python e uv não precisam estar previamente instalados. As dependências do runtime são fixadas em um lockfile multiplataforma com hashes dos pacotes, para que instalações novas e atualizações usem o mesmo conjunto de dependências. O instalador provisiona uv e um runtime Python 3.12 gerenciado pelo próprio usuário, sem reutilizar um ambiente virtual ativado de outro projeto. Ollama é opcional; o instalador detecta o serviço pela API HTTP local e pede confirmação antes de baixar um modelo grande.

## Primeira instalação

```bash
npx shadow-gateway
```

O assistente:

1. Detecta sistema operacional, arquitetura e instalação existente.
2. Instala uv no diretório do Shadow, se necessário.
3. Provisiona Python 3.12 com uv, se necessário.
4. Cria o ambiente virtual privado e instala LiteLLM e dependências.
5. Gera a chave mestra local e cria a configuração inicial.
6. Pergunta se você usará Ollama, provedores remotos ou ambos.
7. Permite configurar provedores do catálogo e endpoints próprios.
8. Valida a configuração e mostra como iniciar o gateway.
9. Oferece instalar globalmente o comando permanente `shadow-gateway` via npm.
10. Mostra os links para dar estrela e enviar feedback.

As chaves de provedores são solicitadas em entrada oculta e gravadas somente no `.env` privado.

No Windows, use os lançadores `.cmd` no PowerShell. Isso evita problemas de política de execução com os atalhos `.ps1` criados pelo npm:

```powershell
npx.cmd shadow-gateway

# Depois da configuração, se instalou o comando global:
shadow-gateway.cmd start
shadow-gateway.cmd status
shadow-gateway.cmd doctor

# Sem instalação global:
npx.cmd shadow-gateway start
```

O Node.js cria os atalhos de comando do npm. Quando necessário, o instalador do Shadow baixa seu próprio `uv.exe` e provisiona o Python 3.12 gerenciado. Não é necessário instalar Python separadamente.

## Depois da instalação

Se você aceitou a instalação global:

```bash
shadow-gateway start
shadow-gateway status
shadow-gateway doctor
shadow-gateway provider add
shadow-gateway provider list
shadow-gateway provider refresh
shadow-gateway clients
shadow-gateway update
```

Se preferir executar sem instalação global:

```bash
npx shadow-gateway start
npx shadow-gateway status
npx shadow-gateway doctor
npx shadow-gateway provider add
```

`start` mantém o gateway em primeiro plano. Use Ctrl+C para encerrá-lo.

## Onde os arquivos ficam

Por padrão, o runtime e os dados da instalação ficam em `~/.shadow` (também no Windows, dentro do diretório do usuário). Você pode mudar esse local definindo `SHADOW_HOME` antes de iniciar o instalador.

A atualização do pacote sincroniza somente os arquivos gerenciados pelo Shadow. O instalador preserva `.env`, `.venv`, `config/shadow.yaml` e `config/providers.local.yaml`, incluindo suas chaves e escolhas pessoais.

## Ollama e modelos locais

Ollama é uma opção, não um requisito do gateway. Se não estiver instalado, o assistente oferece o instalador oficial adequado à plataforma. Se estiver ativo, consulta o catálogo local e permite escolher um modelo de chat já instalado para `shadow-local` e `shadow-auto`; modelos de embeddings/reranking não são oferecidos para chat. As rotas de chat usam o adaptador `ollama_chat/` do LiteLLM e desativam o raciocínio por padrão (`think: false`), garantindo resposta final e tool-calling. Rotas de embeddings devem continuar usando `ollama/`. Se não houver modelo de chat, o assistente pode oferecer o download de `llama3.2:3b`, sempre com confirmação explícita. A detecção usa a API HTTP local com timeout, portanto um Ollama lento ou parado não interrompe a instalação.

## Diagnóstico

```bash
shadow-gateway doctor
shadow-gateway status
```

- `doctor` faz um diagnóstico somente de leitura: manifesto do runtime, Python isolado, executável LiteLLM, chave mestra privada, aliases YAML e permissões POSIX dos arquivos secretos. Não instala nem altera arquivos durante o diagnóstico.
- `setup` é o caminho de reparo. Sincroniza arquivos gerenciados e dependências, preservando `.env` e a configuração local dos provedores.
- `status` consulta o health endpoint e o catálogo de modelos. Se o LiteLLM sem banco bloquear a descoberta autenticada, o comando usa os aliases da configuração local e explica como cadastrá-los manualmente.
- `provider add` cadastra uma API própria OpenAI-compatible ou Anthropic Messages.
- `provider refresh` regenera a configuração do gateway.

## Segurança

- A chave mestra é gerada localmente e não é exibida no terminal.
- As credenciais upstream ficam no `.env` privado, com permissões restritas.
- O gateway escuta em `127.0.0.1` por padrão.
- Não compartilhe a chave mestra administrativa com clientes ou máquinas não confiáveis.
- Provedores remotos continuam sujeitos às cotas, termos, preços e políticas das suas próprias contas.

A ferramenta é totalmente terminal nesta fase. O comando `web-shadow` e uma interface web em localhost só serão introduzidos depois que o fluxo CLI e o gateway estiverem completos e estabilizados.
