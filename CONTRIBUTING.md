# Contributing to Shadow Gateway

Thank you for helping improve Shadow Gateway. Bug reports, platform feedback, documentation fixes, and focused pull requests are welcome.

## Before opening an issue

- Search existing Issues and Discussions for the same problem or proposal.
- Use the matching issue form: bug report, platform compatibility feedback, or feature request.
- Include your Shadow Gateway version, operating system, exact command, and relevant output when applicable.
- Never publish API keys, provider tokens, passwords, private configuration files, or the local gateway master key. Redact secrets and personal paths from logs.

## Development setup

Requirements:
- Node.js 24 (the CI baseline)
- Python 3.12
- npm

Clone the repository and install the Node development dependencies:

~~~bash
git clone https://github.com/Ninja7z/shadow.git
cd shadow
npm ci --ignore-scripts
python -m pip install --disable-pip-version-check "PyYAML>=6,<7"
~~~

Run the checks used by CI:

~~~bash
npm test
python -m py_compile scripts/shadow.py scripts/smoke_test.py tests/test_shadow_cli.py tests/test_smoke_test.py
python -m unittest discover -s tests -v
python scripts/validate_config.py config/shadow.example.yaml
python scripts/validate_config.py config/shadow.runtime.example.yaml
~~~

On Windows, run the same Python checks from PowerShell. The repository's Windows workflow additionally verifies the packaged command shim and installer bootstrap.

## Pull requests

- Keep changes focused and explain the user-facing reason.
- Add or update tests when behavior changes.
- Update both Portuguese and English documentation when the change affects user-facing instructions.
- Do not commit generated runtime data, local credentials, .env files, model caches, or personal configuration.
- Never change release tags or publish packages from a contribution branch.
- Describe the platforms and commands you actually tested. Do not claim a platform was tested if it was not.

## Provider and billing safety

Shadow Gateway can connect to local, free, and paid providers. A contribution must not silently opt users into paid providers, enable paid fallback without explicit consent, or expose credentials. Preserve explicit user consent and provider-specific terms.

## License and permitted use

Shadow Gateway code is distributed under the **MIT License**, including for commercial use. Contributions must be compatible with that license; do not submit code or assets that you do not have the right to contribute. The MIT License covers only the Gateway code and does not grant rights to provider APIs, models, weights, datasets, SDKs, or services. Each provider retains its own terms, policies, licenses, commercial-use permissions, prices, and limits.

---

# Como contribuir (Português)

Obrigado por ajudar a melhorar a Shadow Gateway. Relatos de bugs, feedback de compatibilidade, correções de documentação e pull requests objetivos são bem-vindos.

## Antes de abrir uma Issue

- Pesquise Issues e Discussions existentes para evitar duplicatas.
- Escolha o formulário adequado: bug, compatibilidade de plataforma ou sugestão de funcionalidade.
- Quando aplicável, informe a versão da Shadow, sistema operacional, comando exato e trecho relevante da saída.
- Nunca publique chaves de API, tokens de provedores, senhas, arquivos de configuração privada ou a chave mestra local do gateway. Remova segredos e caminhos pessoais dos logs.

## Ambiente de desenvolvimento

Requisitos:
- Node.js 24 (versão-base do CI)
- Python 3.12
- npm

Após clonar o repositório, instale as dependências e execute as verificações listadas na seção em inglês acima (testes npm, compilação Python, testes unitários e validação das configurações).

No Windows, execute os mesmos testes Python pelo PowerShell. O workflow específico do Windows também verifica o executável gerado pelo npm e a instalação inicial do ambiente.

## Pull requests

- Mantenha as alterações focadas e explique o benefício para quem usa o projeto.
- Adicione ou atualize testes quando alterar comportamentos.
- Atualize a documentação em português e inglês quando mudar instruções voltadas ao usuário.
- Não envie dados de runtime, credenciais, arquivos .env, caches de modelos ou configurações pessoais.
- Não altere tags de release nem publique pacotes a partir de branches de contribuição.
- Informe quais plataformas e comandos realmente testou. Não declare testes que não executou.

## Segurança de provedores e custos

A Shadow Gateway pode conectar provedores locais, gratuitos e pagos. Uma contribuição não deve ativar silenciosamente provedores pagos, habilitar fallback pago sem consentimento explícito ou expor credenciais. Preserve o consentimento do usuário e os termos específicos de cada provedor.

## Licença e uso permitido

O código da Shadow Gateway é distribuído sob a **MIT License**, inclusive para uso comercial. As contribuições devem ser compatíveis com essa licença; não envie código ou materiais que você não tenha direito de contribuir. A MIT cobre somente o código do Gateway e não concede direitos sobre APIs, modelos, pesos, datasets, SDKs ou serviços de provedores. Cada provedor mantém seus próprios termos, políticas, licenças, permissões para uso comercial, preços e limites.
