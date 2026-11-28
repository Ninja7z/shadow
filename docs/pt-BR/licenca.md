# Licença do Shadow Gateway

O código próprio deste repositório é distribuído sob a **MIT License**. Ela permite usar, estudar, modificar e distribuir o Shadow Gateway, inclusive em atividades e produtos comerciais, desde que o aviso de copyright e o texto da licença acompanhem as cópias ou partes substanciais do software.

A MIT cobre **somente o código sobre o qual o projeto tem direitos para licenciar**. Ela não concede, agrega, sublicencia nem substitui direitos de terceiros.

## Cada provedor mantém seus próprios termos

Conectar vários provedores por um endpoint comum não transforma seus contratos numa licença única. Para cada serviço utilizado, o operador continua responsável por verificar e cumprir, de forma independente:

- Termos de serviço, políticas de uso e requisitos de elegibilidade do provedor.
- Licenças do modelo, pesos, datasets, SDKs e demais componentes de terceiros.
- Permissões para uso comercial, redistribuição, hospedagem, armazenamento e processamento de dados.
- Preços, cotas, limites de taxa, regras de faturamento, privacidade e retenção de dados.

Uma autorização comercial concedida pela MIT ao código do Shadow **não significa** que um provedor permita uso comercial de sua API ou modelo. Da mesma forma, possuir uma chave de API não concede automaticamente direitos de redistribuição de pesos, datasets ou SDKs.

Esta licença se aplica somente ao código do Shadow Gateway neste repositório; não define a licença de outros produtos ou repositórios Shadow independentes. O Shadow Gateway não representa os provedores e não altera seus termos. Use suas próprias credenciais e consulte a documentação e os contratos oficiais de cada serviço antes de conectá-lo, especialmente em operações comerciais, produtos hospedados ou serviços oferecidos a clientes.

## O que esta licença cobre

- O código do Shadow Gateway mantido neste repositório, conforme os direitos de seus autores.
- Modificações e distribuições desse código sob as condições da MIT License.

Ela não cobre automaticamente conteúdo, marcas, APIs, modelos, dados, SDKs, binários ou serviços de terceiros incluídos, baixados ou acessados pelo usuário. Esses componentes permanecem sob suas licenças e termos próprios.

## Dependências e funções opcionais

O runtime gerenciado do Shadow usa uma composição reduzida do proxy aberto do LiteLLM, fixada em `requirements.lock` com hashes. Por padrão, essa composição não instala os pacotes opcionais de migração Prisma/PostgreSQL (`litellm-proxy-extras` e drivers PostgreSQL) nem o sandbox de guardrails de código customizado (`RestrictedPython`). Esses recursos avançados não fazem parte do caminho padrão do Gateway Shadow.

Essa escolha não altera as licenças dos componentes de terceiros que continuam presentes. Cada dependência mantém sua própria licença e seus avisos. Quem decidir adicionar manualmente uma função opcional do LiteLLM também deverá avaliar e cumprir as licenças e condições dos pacotes adicionais que ela exigir.

## Versões publicadas anteriormente

A licença de uma versão já publicada não muda retroativamente por uma alteração neste repositório. O pacote npm `shadow-gateway@0.1.9`, publicado antes desta mudança, permanece sujeito à licença incluída naquele artefato. A MIT passa a valer para o código distribuído com esta licença e para as versões futuras que a incluírem.

## Texto integral

Consulte o arquivo [LICENSE](../../LICENSE) na raiz do repositório para o texto completo da MIT License.
