# Smoke tests do Shadow

O script `scripts/smoke_test.py` verifica o gateway local e as rotas de provedores atualmente aprovadas sem imprimir credenciais.

## Requisitos

- Python 3.10+
- Gateway Shadow/LiteLLM em execução, normalmente em `http://127.0.0.1:4000`
- Arquivos locais protegidos:
  - `~/.config/shadow/providers.env`
  - `~/.config/shadow/extra-providers.env`

O script lê entradas simples `KEY=VALUE` e `export KEY=VALUE`. Valores já exportados no processo têm prioridade sobre os valores dos arquivos. O script não executa código de shell.

## Modo seguro: somente verificações GET

```bash
python3 scripts/smoke_test.py
```

Esse é o modo padrão e recomendado para verificações frequentes. Ele não executa inferência. Verifica:

- Disponibilidade do gateway local e aliases de modelos.
- Catálogo de modelos Requesty e ID Nemotron esperado.
- Autenticação Gonka e catálogo de modelos.
- Tipo de chave/metadados de plano gratuito BazaarLink e ID do modelo gratuito esperado.
- Estado do token da conta Cloudflare e catálogo de modelos Workers AI.

O script não imprime chaves, cabeçalhos de autorização, corpos de resposta ou impressões digitais de credenciais.

Opções:

```bash
python3 scripts/smoke_test.py --base-url http://127.0.0.1:4000 --timeout 15
```

## Verificações de chamadas de ferramentas estruturadas

```bash
python3 scripts/smoke_test.py --tool-calls
```

Isso envia uma única requisição curta de ferramenta estruturada `status_check` por cada alias Chat Completions:

- Requesty
- Cloudflare Workers AI
- Gonka
- BazaarLink

São requisições reais de inferência e podem consumir cotas gratuitas. Execute somente quando necessário. O timeout de chamadas de ferramentas é separado do timeout seguro das requisições GET:

```bash
python3 scripts/smoke_test.py --tool-calls --inference-timeout 40
```

## Verificações Anthropic Messages com uso de ferramentas

```bash
python3 scripts/smoke_test.py --anthropic-tools
```

Isso envia uma requisição Anthropic `tool_use` por meio dos aliases Requesty e Gonka. Escolha um único provedor para evitar chamadas desnecessárias:

```bash
python3 scripts/smoke_test.py --anthropic-tools --anthropic-provider requesty
python3 scripts/smoke_test.py --anthropic-tools --anthropic-provider gonka --inference-timeout 40
```

A opção exclusiva Anthropic não executa os quatro testes de inferência Chat Completions. Esse comportamento é coberto por um teste unitário.

## Testes unitários

Os testes do parser e dos formatos de resposta usam somente a biblioteca padrão do Python:

```bash
python3 -m unittest discover -s tests -v
```

A suíte atual cobre leitura de arquivos de ambiente, `tool_calls` compatíveis com OpenAI, `tool_use` Anthropic e garante que o modo somente Anthropic não envie chamadas de inferência Chat Completions.

## Observações sobre cotas

- O modo seguro usa somente requisições GET.
- O plano gratuito Requesty anuncia uma cota diária de requisições; confira o painel atual.
- O acesso gratuito Gonka tem limite de taxa (a conta verificada retornou `maxRpm=6`).
- BazaarLink possui uma pequena cota diária ponderada.
- Cloudflare Workers AI consome Neurons.
- Nunca execute `--tool-calls` ou `--anthropic-tools` em um loop de monitoramento frequente.

O script é uma ferramenta de diagnóstico, não uma garantia de cobrança ou disponibilidade. IDs de modelos, cotas e condições de planos gratuitos podem mudar.
