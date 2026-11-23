# Política de segurança

O Shadow é um gateway para diversos provedores externos de IA. As credenciais desses provedores são informações altamente sensíveis.

## Nunca faça commit

- Arquivos `.env`, `*.env`, `providers.env` e `extra-providers.env`.
- Chaves de API de provedores, tokens de conta Cloudflare, chaves mestras LiteLLM, tokens OAuth ou arquivos JSON de contas de serviço.
- Backups de configuração de runtime, logs, bancos SQLite, rastros de requisições, arquivos de modelos, caches ou ambientes virtuais locais.
- Capturas de tela ou saídas de diagnóstico que possam conter cabeçalhos de autorização ou valores de tokens.

## Tratamento local de segredos

- Mantenha as credenciais fora do repositório, de preferência em um gerenciador de segredos local ou em arquivos com permissão `600`.
- Mantenha `.env` privado. O arquivo `.env.example` pode conter apenas nomes de variáveis e placeholders vazios.
- O gateway deve receber credenciais upstream por referências a variáveis de ambiente, como `os.environ/REQUESTY_API_KEY`.
- Clientes de código devem autenticar no gateway local Shadow usando a chave mestra local. Não forneça diretamente aos clientes as chaves dos provedores upstream, a menos que queira ignorar intencionalmente o Shadow.

## Antes de cada commit

1. Execute `git status --short`.
2. Revise a lista de arquivos preparados e `git diff --cached`.
3. Procure prefixos comuns de tokens e `Authorization: Bearer` nos arquivos preparados.
4. Confirme que arquivos de ambiente, logs e backups estão sendo ignorados pelo Git.

## Se uma credencial for commitada

Revogue ou rotacione imediatamente a credencial no painel do provedor, remova-a do histórico do repositório, substitua-a no armazenamento local de segredos e valide a nova credencial. Excluir o arquivo em um commit posterior não o remove do histórico do Git.
