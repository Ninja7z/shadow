# Integração com Claude Code

O Shadow expõe um endpoint Anthropic Messages pelo LiteLLM em `http://127.0.0.1:4000`. O lançador local é `~/.local/bin/claude-route`; os lançadores específicos de provedores chamam esse script usando um alias de modelo.

## Compatibilidade do seletor de modelos

O Claude Code 2.1.257 ou superior oferece suporte a `modelPicker.options[].behavesAs`. O Shadow usa esse recurso para informar ao Claude Code que aliases de provedores personalizados seguem o perfil de capacidade do Claude Sonnet 4.6.

**O ID real do modelo não é reescrito:** o alias da rota continua sendo enviado ao gateway local, e o LiteLLM seleciona o provedor/modelo configurado para aquele alias.

O lançador cria um arquivo privado de configurações para cada alias em `~/.config/shadow/claude-model-settings/`, com permissão `600`. Ele define:

- `modelPicker.options[].model` como o alias real do Shadow.
- `behavesAs: claude-sonnet-4-6` para compatibilidade de capacidade/esforço no Claude Code.
- `autoCompactWindow` com um limite conservador por rota, geralmente 131.072 tokens.

Isso elimina o diagnóstico `[claude-code:unrecognized_model]` sem fingir que o modelo upstream é Claude. O perfil é apenas uma indicação de compatibilidade para o Claude Code; o gateway continua recebendo o alias original.

## Credenciais e gateway

O lançador lê `~/.config/shadow/providers.env` e `extra-providers.env`. Esses arquivos devem ser privados, com permissão `600`.

O Claude Code recebe somente a chave mestra local do LiteLLM como `ANTHROPIC_AUTH_TOKEN`. As chaves dos provedores upstream permanecem no servidor.

Somente `LITELLM_MASTER_KEY` é obrigatória para o lançador. Ele não deve exigir chaves de provedores sem relação com a rota escolhida, como Gemini ou NVIDIA, quando a rota utilizada for Requesty, Gonka ou Cloudflare.

## Rota Requesty atual

- Lançador: `claude-requesty`
- Alias Shadow: `claude-code-requesty-nemotron-free`
- Upstream: `nvidia/nemotron-3.5-lightning-30b-a3b`
- Anthropic Messages e chamadas estruturadas `tool_use` foram testadas diretamente e através do Shadow.
- Um smoke test de uma interação pelo CLI terminou com código 0 e sem diagnóstico `unrecognized_model` após a correção de compatibilidade do seletor.

## Observações

- Aliases de provedores personalizados devem ter uma entrada explícita no seletor de modelos e um limite conservador de compactação de contexto.
- Mantenha as configurações do seletor localmente. Não faça commit dos arquivos gerados em `~/.config/shadow/claude-model-settings/`.
- As cadeias de fallback devem ser compatíveis com o protocolo. Um fallback somente OpenAI não deve ser adicionado a uma rota Anthropic Messages.
