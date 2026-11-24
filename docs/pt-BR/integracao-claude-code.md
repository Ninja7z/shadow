# Integração com Claude Code

O Shadow expõe um endpoint compatível com Anthropic Messages por meio do LiteLLM.

## Configuração em uma instalação nova

Inicie o Shadow e leia a chave mestra local do arquivo privado .env. No terminal:

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

Use o alias exato retornado por GET /v1/models. A raiz do gateway é intencional: o Claude Code acrescenta o caminho do Anthropic Messages.

## Credenciais

O Claude Code recebe somente a LITELLM_MASTER_KEY local. As chaves dos provedores upstream permanecem no .env privado do Shadow e nunca devem ser copiadas para as configurações do Claude Code.

A chave mestra é administrativa. Mantenha essa configuração em uma máquina individual com o gateway vinculado a 127.0.0.1. Para instalações compartilhadas ou remotas, configure chaves virtuais LiteLLM com escopo e proteções de rede antes de conectar clientes.

## Recursos e limitações

O endpoint Anthropic Messages traduz as requisições por meio do LiteLLM. Uso de ferramentas, streaming, visão, raciocínio, tamanho de contexto e cache de prompt dependem do modelo upstream escolhido e de sua compatibilidade com a camada de tradução. Teste cada rota antes de depender de recursos avançados.

O arquivo scripts/claude-route.sh é um lançador avançado para um layout de configuração local separado. Uma instalação recém-clonada não precisa dele; use o fluxo direto com variáveis de ambiente acima, a menos que tenha configurado esse lançador deliberadamente.

Consulte [Integração com aplicativos](integracao-clientes.md) para os exemplos completos de todos os clientes.
