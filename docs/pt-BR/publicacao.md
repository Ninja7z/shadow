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

## Aviso de atualização para versões antigas

As versões até **0.1.6** (incluindo pré-lançamentos anteriores a **0.1.7**) foram publicadas antes do verificador de atualização do CLI. Depois de autenticar como responsável pelo pacote no npm, aplique um aviso de depreciação no registro.

Execute **npm login** e depois **npm run deprecate:legacy**.

O script primeiro verifica npm whoami e a versão da tag latest; depois aplica npm deprecate para o intervalo shadow-gateway@<0.1.7. O npm mostra o aviso quando alguém instala uma dessas versões antigas e na página de cada versão marcada. Isso não altera binários já instalados: quem já usa um CLI antigo ainda precisa executar um comando npm para instalar a versão mais recente. O comando não remove versões, não substitui tarballs, não publica pacote novo e não altera dist-tags.

Para conferir exatamente o que será aplicado, sem autenticação ou gravação no registro, execute **npm run deprecate:legacy -- --plan**.

Se o npm exigir uma senha temporária (2FA), digite-a somente no terminal local. No Linux/macOS, este comando oculta a digitação e passa o código apenas ao processo do npm.

```bash
read -rsp "Código 2FA do npm: " NPM_OTP; echo
npm_config_otp="$NPM_OTP" npm run deprecate:legacy
unset NPM_OTP
```

Não cole códigos temporários no chat, em arquivos-fonte, no histórico do shell ou em GitHub Secrets.

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
