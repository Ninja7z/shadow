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
- Acesso autenticado ao catálogo de modelos.
- Presença dos aliases padrão shadow-local e shadow-auto.

Use outro gateway ou arquivo de ambiente quando necessário:

~~~bash
python scripts/smoke_test.py --base-url http://127.0.0.1:4000 --env-file .env
~~~

## Verificação opcional de tool call via Chat Completions

~~~bash
python scripts/smoke_test.py --tool-calls --model shadow-auto
~~~

Envia uma única requisição estruturada curta status_check pelo alias escolhido. É uma chamada real de inferência e pode consumir cota ou gerar cobrança. Escolha um alias que ofereça suporte a tool calling.

## Verificação opcional de tool_use via Anthropic Messages

~~~bash
python scripts/smoke_test.py --anthropic-tools --anthropic-model shadow-auto
~~~

Envia uma requisição Anthropic Messages tool_use pelo alias escolhido. O alias precisa existir e sua rota upstream deve oferecer suporte ao recurso solicitado.

Use um timeout maior para provedores lentos:

~~~bash
python scripts/smoke_test.py --tool-calls --model shadow-auto --inference-timeout 60
~~~

Não execute verificações de inferência em loop de monitoramento.

## Testes unitários

~~~bash
python -m unittest discover -s tests -v
~~~

A suíte usa fixtures locais e respostas HTTP simuladas. Não acessa provedores upstream nem consome cota de inferência.
