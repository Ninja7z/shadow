# Publicação da Shadow

As versões da Shadow usam Trusted Publishing (OIDC do GitHub Actions) e publicação em etapas do npm. O workflow nunca publica diretamente nem altera dist-tags.

## Checklist de release

1. Atualize `version` em `package.json` e `package-lock.json` juntos.
2. Execute `npm test`, a suíte Python, os dois validadores de configuração e `npm pack --dry-run`.
3. Faça commit do release e envie `main`.
4. Crie e envie a tag correspondente: `v<versão-do-pacote>` (por exemplo, `v0.1.1`).
5. O GitHub Actions executa `.github/workflows/publish.yml`. Ele confere se a tag corresponde ao `package.json`, executa as duas suítes e chama `npm stage publish` via OIDC.
6. Revise o pacote staged no npm, inspecione seu conteúdo e aprove com 2FA. O workflow não possui permissão de publicação direta nem de alteração de dist-tags.
7. Depois da aprovação, confira a versão pública e a tag `latest`.

## Configuração do Trusted Publisher

- Publisher: GitHub Actions
- Organização/usuário: `Ninja7z`
- Repositório: `shadow`
- Nome do workflow: `publish.yml`
- Ambiente: vazio
- Ações permitidas: somente `npm stage publish`
- Acesso à publicação: exigir 2FA e impedir tokens de bypass

A primeira publicação staged bem-sucedida desse workflow valida o Trusted Publisher. Mantenha os campos da conexão alinhados à identidade do workflow; o npm não permite alterá-los depois da criação.

## Segurança

- Não adicione token npm de escrita aos GitHub Secrets deste workflow. O mecanismo de autenticação é OIDC.
- Não adicione `npm publish`, `npm dist-tag` ou `NODE_AUTH_TOKEN` ao workflow.
- Staging cria apenas uma versão candidata para revisão. Uma pessoa mantenedora precisa aprová-la no npm com 2FA antes da publicação pública.
- Nunca envie uma tag de release antes de revisar versão, lockfile, testes e conteúdo do pacote.
