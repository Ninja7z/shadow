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


### Reinstalação limpa e recuperação de instalação interrompida

Se a instalação for interrompida ou o ambiente Python gerenciado falhar na verificação de integridade, a próxima execução da CLI reconstruirá automaticamente o `.venv` usando o `requirements.lock` com hashes. Um marcador de estado registra a instalação em andamento; se o processo for interrompido novamente, a próxima execução tentará a reconstrução limpa.

O download do bootstrap do uv é feito em streaming com limite rígido de 4 MiB e conferido contra um SHA-256 fixado para a versão do instalador oficial Unix ou Windows. Um Content-Length acima do limite é rejeitado antes da leitura; respostas em chunks são interrompidas assim que ultrapassam o limite. O arquivo temporário é sincronizado e promovido atomicamente somente após o download completo. No POSIX, as permissões privadas só são aplicadas a arquivos e diretórios regulares confirmados dentro da raiz gerenciada; symlinks nunca são seguidos pelo chmod, e o Doctor aponta caminhos não regulares/externos como problema de permissões.

A execução de instaladores externos tem limites de tempo. Se um comando exceder o prazo ou for cancelado, a Shadow encerra toda a árvore de processos (incluindo instaladores filhos) antes de liberar o bloqueio da instalação. O script de inicialização do uv é baixado primeiro para um arquivo temporário `.part` e só é promovido após o download completo e a validação do tamanho. Pastas temporárias `shadow-uv-*` abandonadas há mais de 24 horas são removidas de forma conservadora; pastas recentes, links simbólicos e dados temporários de outros programas são preservados.

Durante uma atualização, a Shadow também preserva a geração anterior do ambiente antes de substituir os arquivos gerenciados. O `.venv` anterior é movido para uma geração de rollback no mesmo sistema de arquivos, em vez de ser duplicado, reduzindo o uso de disco. Se a preparação ou a validação falhar, a Shadow restaura o ambiente anterior; se o processo for encerrado inesperadamente, a próxima execução detecta a transação, restaura a geração anterior e tenta a atualização novamente. Um bloqueio de instalação impede que operações simultâneas de instalação/atualização modifiquem o mesmo ambiente. O rollback cobre os arquivos de runtime gerenciados pela Shadow e seu binário privado do `uv`; `.env`, configurações locais dos provedores, configurações do usuário e dados pessoais ficam fora dessa área de rollback.

Para solicitar uma reconstrução manual, execute `shadow-gateway reinstall` (ou `npx shadow-gateway reinstall`). O comando pede confirmação e remove somente o `.venv` e o cache do instalador gerenciados pela Shadow. Preserva `.env`, credenciais de provedores, `config/`, dados do usuário, instalações e modelos do Ollama e caches compartilhados de pacotes.
