# Shadow Gateway licensing

The original code in this repository is distributed under the **MIT License**. It may be used, studied, modified, and distributed, including in commercial activities and products, provided the copyright and license notice accompany copies or substantial portions of the software.

The MIT License covers **only the code that this project has the rights to license**. It does not grant, combine, sublicense, or replace anyone else's rights.

## Each provider keeps its own terms

Connecting multiple providers through one common endpoint does not combine their contracts into a single license. For every service used, the operator remains independently responsible for reviewing and complying with:

- The provider's terms of service, usage policies, and eligibility requirements.
- Licenses for models, weights, datasets, SDKs, and other third-party components.
- Permissions for commercial use, redistribution, hosting, storage, and data processing.
- Pricing, quotas, rate limits, billing rules, privacy, and data-retention requirements.

Commercial permission under the MIT License for Shadow's code **does not mean** a provider permits commercial use of its API or model. Likewise, possessing an API key does not automatically grant redistribution rights for model weights, datasets, or SDKs.

This license applies only to Shadow Gateway code in this repository; it does not set the license for separate Shadow products or repositories. Shadow Gateway does not represent providers and does not change their terms. Use your own credentials and consult each service's official documentation and agreements before connecting it, especially for commercial operations, hosted products, or services offered to customers.

## What this license covers

- Shadow Gateway code maintained in this repository, to the extent of its authors' rights.
- Modifications and distributions of that code under the MIT License conditions.

It does not automatically cover third-party content, trademarks, APIs, models, data, SDKs, binaries, or services that users include, download, or access. Those components remain subject to their own licenses and terms.

## Dependencies and optional features

Shadow's managed runtime uses a reduced composition of the open-source LiteLLM proxy, pinned with hashes in `requirements.lock`. By default, it does not install the optional Prisma/PostgreSQL migration packages (`litellm-proxy-extras` and PostgreSQL drivers) or the custom-code guardrail sandbox (`RestrictedPython`). These advanced features are not part of Shadow Gateway's default path.

This does not change the licenses of third-party components that remain installed. Every dependency keeps its own license and notices. Anyone who independently adds an optional LiteLLM feature must also review and comply with the licenses and conditions of any extra packages that feature requires.

## Previously published versions

A previously published release does not change its license retroactively because this repository's license changed. The `shadow-gateway@0.1.9` npm package, published before this change, remains subject to the license included in that artifact. The MIT License applies to code distributed with this license and to future releases that include it.

## Full text

See the repository-root [LICENSE](../LICENSE) file for the complete MIT License text.
