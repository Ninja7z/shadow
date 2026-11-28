# Testes smoke do Shadow

O scripts/smoke_test.py é independente de provedores. Ele verifica o gateway local e, somente quando solicitado, envia uma requisição pequena de tool call por um alias escolhido pelo responsável pela instalação.

## Requisitos

- Python 3.11+
- Gateway Shadow/LiteLLM em execução, normalmente em http://127.0.0.1:4000
- Arquivo .env privado criado por python scripts/shadow.py setup

O script lê entradas simples KEY=VALUE e export KEY=VALUE do arquivo de ambiente escolhido. Valores já exportados no processo têm prioridade. O script não executa código shell e nunca imprime credenciais nem corpos de resposta.

## Modo seguro: somente GET

~~~bash
python scripts/smoke_test.py
~~~

Este é o modo padrão e recomendado para verificações frequentes. Não executa inferência. Ele verifica:

- Disponibilidade do gateway.
- Acesso autenticado ao catálogo de modelos quando suportado pela versão instalada do LiteLLM.
- Presença dos aliases padrão shadow-local e shadow-auto.

Se o LiteLLM retornar `400 no_db_connection` no catálogo em uma instalação sem banco e protegida por master key, o script usa `config/shadow.yaml` local para validar os aliases. Isso é uma limitação de descoberta desse runtime LiteLLM, não um motivo para desativar a autenticação. Use os aliases exibidos por `shadow-gateway status` manualmente nos clientes.

Use outro gateway ou arquivo de ambiente quando necessário:

~~~bash
python scripts/smoke_test.py --base-url http://127.0.0.1:4000 --env-file .env
~~~

O catálogo do assistente de configuração prioriza OpenAI primeiro, Anthropic em segundo e os demais provedores depois. Isso altera somente a ordem de apresentação no assistente; não transforma provedores pagos em fallback automático nem muda a prioridade de roteamento.

O smoke test não impõe uma configuração de reasoning específica de provedor por padrão. Para modelos locais com thinking, como Qwen 3.5, passe --reasoning-effort none para manter os testes de protocolo curtos e determinísticos. Essa opção é enviada somente nas requisições de teste; não altera os padrões do gateway nem as configurações dos clientes. Use-a apenas quando o upstream selecionado aceitar esse valor.

## Verificação opcional de tool call via Chat Completions

~~~bash
python scripts/smoke_test.py --tool-calls --model shadow-auto
~~~

Envia uma única requisição estruturada curta status_check pelo alias escolhido. É uma chamada real de inferência e pode consumir cota ou gerar cobrança. Escolha um alias que ofereça suporte a tool calling.

## Verificação opcional de streaming/tool call via Chat Completions

~~~bash
python scripts/smoke_test.py --stream-tool-calls --model shadow-auto
~~~

Consome o stream SSE de OpenAI Chat Completions, remonta os argumentos fragmentados do tool call e exige o marcador final [DONE]. É uma chamada real de inferência e pode consumir cota ou gerar cobrança.

## Verificação opcional de function call via OpenAI Responses API

~~~bash
python scripts/smoke_test.py --responses-tools --responses-model shadow-auto
~~~

Exercita o contrato nativo /v1/responses (input, ferramentas de função do Responses, itens function_call na saída e max_output_tokens). É separado de Chat Completions e não é convertido em um payload messages. O LiteLLM expõe essa rota para provedores compatíveis, mas o suporte depende do adaptador e modelo upstream selecionados. É uma chamada real de inferência e pode consumir cota ou gerar cobrança.

## Verificação opcional de tool_use via Anthropic Messages

~~~bash
python scripts/smoke_test.py --anthropic-tools --anthropic-model shadow-auto
~~~

Envia uma requisição Anthropic Messages tool_use pelo alias escolhido usando os headers nativos x-api-key e anthropic-version, esperados por clientes do SDK Anthropic. O alias precisa existir e sua rota upstream deve oferecer suporte ao recurso solicitado. É uma chamada real de inferência e pode consumir cota ou gerar cobrança.

## Verificação opcional de streaming/tool_use via Anthropic Messages

~~~bash
python scripts/smoke_test.py --anthropic-stream-tools --anthropic-model shadow-auto
~~~

Consome os eventos SSE de Anthropic Messages, remonta os fragmentos input_json_delta e exige message_stop antes de aprovar. Usa os headers nativos x-api-key e anthropic-version. É uma chamada real de inferência e pode consumir cota ou gerar cobrança.

Para desativar o thinking opcional em modelos locais, adicione --reasoning-effort none. Essa opção é opcional e não é enviada por padrão.

Use um timeout maior para provedores lentos:

~~~bash
python scripts/smoke_test.py --tool-calls --model router-local --expect-alias router-local --reasoning-effort none --inference-timeout 60
python scripts/smoke_test.py --responses-tools --responses-model router-local --expect-alias router-local --reasoning-effort none --inference-timeout 60
python scripts/smoke_test.py --stream-tool-calls --model router-local --expect-alias router-local --reasoning-effort none --inference-timeout 60
python scripts/smoke_test.py --anthropic-tools --anthropic-model router-local --expect-alias router-local --reasoning-effort none --inference-timeout 60
python scripts/smoke_test.py --anthropic-stream-tools --anthropic-model router-local --expect-alias router-local --reasoning-effort none --inference-timeout 60
~~~

Não execute verificações de inferência em loop de monitoramento.

## Testes unitários

~~~bash
python -m unittest discover -s tests -v
~~~

A suíte usa fixtures locais e respostas HTTP simuladas. Não acessa provedores upstream nem consome cota de inferência.

Os testes do parser Python também incluem fixtures de tool calls paralelos em streaming: duas chamadas OpenAI Chat Completions com índices separados e dois blocos `tool_use` do Anthropic Messages. São fixtures de parser/testes unitários, não testes de inferência com modelos reais.
