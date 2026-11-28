# Third-party dependency notices

Inventory snapshot: 2026-11-28. This file describes the exact versions pinned by the current Python lock and the npm dependency tree. It is a compliance aid, not legal advice or a substitute for reviewing each upstream license and the exact artifacts distributed in a product.

## Scope and method

- Python lock: 118 pinned distributions in requirements.lock. All 118 package/version records were checked against the corresponding PyPI JSON metadata. The 114 distributions installed in the Linux runtime matched their locked versions; four additional lock entries are platform/marker variants not installed in this Linux environment.
- Where PyPI supplied License-Expression, it is reproduced as the SPDX expression. Otherwise, the table uses the upstream License field or OSI classifier where available, clearly marked as metadata rather than a normalized SPDX expression. Incomplete metadata should be checked against the license files in the exact wheel.
- The Python packages are installed separately from PyPI by uv using requirements.lock. The npm package includes this notice inventory and lock, not a prebuilt Python environment. The installed wheels retain their own license and notice files under their respective .dist-info directories.
- The lock excludes litellm-enterprise, litellm-proxy-extras, psycopg, psycopg-binary and RestrictedPython. Those names may be present in older installations, but are not dependencies in this locked runtime.

## Python runtime packages

| Distribution | Locked version | Reported license / evidence | Upstream package |
|---|---:|---|---|
| aiohappyeyeballs | 2.7.1 | PSF-2.0 (PyPI License field) | [PyPI](https://pypi.org/project/aiohappyeyeballs/2.7.1/) |
| aiohttp | 3.14.5 | Apache-2.0 AND MIT (SPDX expression) | [PyPI](https://pypi.org/project/aiohttp/3.14.5/) |
| aiosignal | 1.4.0 | Apache 2.0 (PyPI License field) | [PyPI](https://pypi.org/project/aiosignal/1.4.0/) |
| annotated-doc | 0.0.7 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/annotated-doc/0.0.7/) |
| annotated-types | 0.8.0 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/annotated-types/0.8.0/) |
| anyio | 4.16.0 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/anyio/4.16.0/) |
| apscheduler | 3.11.3 | MIT (PyPI License field) | [PyPI](https://pypi.org/project/apscheduler/3.11.3/) |
| attrs | 26.1.0 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/attrs/26.1.0/) |
| azure-core | 1.41.0 | MIT (installed wheel LICENSE) | [PyPI](https://pypi.org/project/azure-core/1.41.0/) |
| azure-identity | 1.27.0 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/azure-identity/1.27.0/) |
| azure-storage-blob | 12.31.1 | MIT License (PyPI License field) | [PyPI](https://pypi.org/project/azure-storage-blob/12.31.1/) |
| backoff | 2.2.1 | MIT (PyPI License field) | [PyPI](https://pypi.org/project/backoff/2.2.1/) |
| backports-zstd | 1.8.0 | PSF-2.0 (SPDX expression) | [PyPI](https://pypi.org/project/backports-zstd/1.8.0/) |
| boto3 | 1.44.11 | Apache-2.0 (PyPI License field) | [PyPI](https://pypi.org/project/boto3/1.44.11/) |
| botocore | 1.44.11 | Apache-2.0 (PyPI License field) | [PyPI](https://pypi.org/project/botocore/1.44.11/) |
| certifi | 2026.11.20 | MPL-2.0 (PyPI License field) | [PyPI](https://pypi.org/project/certifi/2026.11.20/) |
| cffi | 2.1.1 | MIT-0 (SPDX expression) | [PyPI](https://pypi.org/project/cffi/2.1.1/) |
| charset-normalizer | 3.5.3 | MIT (PyPI License field) | [PyPI](https://pypi.org/project/charset-normalizer/3.5.3/) |
| click | 8.5.1 | BSD-3-Clause (SPDX expression) | [PyPI](https://pypi.org/project/click/8.5.1/) |
| colorama | 0.4.6 | BSD License (PyPI classifier; not SPDX-normalized) | [PyPI](https://pypi.org/project/colorama/0.4.6/) |
| croniter | 7.0.0 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/croniter/7.0.0/) |
| cryptography | 50.0.2 | Apache-2.0 OR BSD-3-Clause (SPDX expression) | [PyPI](https://pypi.org/project/cryptography/50.0.2/) |
| dnspython | 2.9.2 | ISC (SPDX expression) | [PyPI](https://pypi.org/project/dnspython/2.9.2/) |
| email-validator | 2.4.0 | Unlicense (PyPI License field) | [PyPI](https://pypi.org/project/email-validator/2.4.0/) |
| expression | 5.8.0 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/expression/5.8.0/) |
| fastapi | 0.165.0 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/fastapi/0.165.0/) |
| fastapi-sso | 0.23.0 | MIT (PyPI License field) | [PyPI](https://pypi.org/project/fastapi-sso/0.23.0/) |
| fastuuid | 0.14.0 | BSD License (PyPI classifier; not SPDX-normalized) | [PyPI](https://pypi.org/project/fastuuid/0.14.0/) |
| filelock | 4.3.1 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/filelock/4.3.1/) |
| frozenlist | 1.8.0 | Apache-2.0 (PyPI License field) | [PyPI](https://pypi.org/project/frozenlist/1.8.0/) |
| fsspec | 2026.9.0 | BSD-3-Clause (SPDX expression) | [PyPI](https://pypi.org/project/fsspec/2026.9.0/) |
| granian | 2.8.9 | BSD-3-Clause (PyPI License field) | [PyPI](https://pypi.org/project/granian/2.8.9/) |
| gunicorn | 23.0.0 | MIT (PyPI License field) | [PyPI](https://pypi.org/project/gunicorn/23.0.0/) |
| h11 | 0.16.0 | MIT (PyPI License field) | [PyPI](https://pypi.org/project/h11/0.16.0/) |
| h2 | 4.4.1 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/h2/4.4.1/) |
| hf-xet | 1.8.0 | Apache-2.0 (SPDX expression) | [PyPI](https://pypi.org/project/hf-xet/1.8.0/) |
| hiredis | 3.5.0 | MIT (PyPI License field) | [PyPI](https://pypi.org/project/hiredis/3.5.0/) |
| hpack | 4.2.0 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/hpack/4.2.0/) |
| httpcore | 1.0.9 | BSD-3-Clause (SPDX expression) | [PyPI](https://pypi.org/project/httpcore/1.0.9/) |
| httpcore2 | 2.16.2 | BSD-3-Clause (SPDX expression) | [PyPI](https://pypi.org/project/httpcore2/2.16.2/) |
| httpx | 0.28.1 | BSD-3-Clause (PyPI License field) | [PyPI](https://pypi.org/project/httpx/0.28.1/) |
| httpx2 | 2.16.2 | BSD-3-Clause (SPDX expression) | [PyPI](https://pypi.org/project/httpx2/2.16.2/) |
| httpx2-jsfetch | 1.0 | BSD-3-Clause (SPDX expression) | [PyPI](https://pypi.org/project/httpx2-jsfetch/1.0/) |
| huggingface-hub | 2.4.0 | Apache-2.0 (PyPI License field) | [PyPI](https://pypi.org/project/huggingface-hub/2.4.0/) |
| hyperframe | 6.1.0 | MIT (PyPI OSI classifier; included wheel LICENSE) | [PyPI](https://pypi.org/project/hyperframe/6.1.0/) |
| idna | 3.20 | BSD-3-Clause (SPDX expression) | [PyPI](https://pypi.org/project/idna/3.20/) |
| importlib-metadata | 8.9.0 | Apache-2.0 (SPDX expression) | [PyPI](https://pypi.org/project/importlib-metadata/8.9.0/) |
| inquirerpy | 0.3.4 | MIT (PyPI License field) | [PyPI](https://pypi.org/project/inquirerpy/0.3.4/) |
| isodate | 0.7.2 | BSD (PyPI OSI classifier; included wheel LICENSE) | [PyPI](https://pypi.org/project/isodate/0.7.2/) |
| jinja2 | 3.1.6 | BSD License (PyPI classifier; not SPDX-normalized) | [PyPI](https://pypi.org/project/jinja2/3.1.6/) |
| jiter | 0.19.0 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/jiter/0.19.0/) |
| jmespath | 1.1.0 | MIT (PyPI License field) | [PyPI](https://pypi.org/project/jmespath/1.1.0/) |
| jsonschema | 4.26.0 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/jsonschema/4.26.0/) |
| jsonschema-specifications | 2025.9.1 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/jsonschema-specifications/2025.9.1/) |
| litellm | 1.110.3 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/litellm/1.110.3/) |
| litellm-proxy | 1.110.3 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/litellm-proxy/1.110.3/) |
| markdown-it-py | 4.3.0 | MIT License (PyPI classifier; not SPDX-normalized) | [PyPI](https://pypi.org/project/markdown-it-py/4.3.0/) |
| markupsafe | 3.0.4 | BSD-3-Clause (SPDX expression) | [PyPI](https://pypi.org/project/markupsafe/3.0.4/) |
| mcp | 2.3.0 | MIT (PyPI License field) | [PyPI](https://pypi.org/project/mcp/2.3.0/) |
| mcp-types | 2.3.0 | MIT (PyPI License field) | [PyPI](https://pypi.org/project/mcp-types/2.3.0/) |
| mdurl | 0.1.2 | MIT License (PyPI classifier; not SPDX-normalized) | [PyPI](https://pypi.org/project/mdurl/0.1.2/) |
| msal | 1.39.0 | MIT (PyPI License field) | [PyPI](https://pypi.org/project/msal/1.39.0/) |
| msal-extensions | 1.3.1 | MIT License (PyPI License field) | [PyPI](https://pypi.org/project/msal-extensions/1.3.1/) |
| multidict | 7.2.1 | Apache-2.0 (SPDX expression) | [PyPI](https://pypi.org/project/multidict/7.2.1/) |
| numpy | 2.5.5 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 (SPDX expression) | [PyPI](https://pypi.org/project/numpy/2.5.5/) |
| oauthlib | 4.0.1 | BSD-3-Clause (PyPI License field) | [PyPI](https://pypi.org/project/oauthlib/4.0.1/) |
| openai | 3.59.0 | Apache-2.0 (SPDX expression) | [PyPI](https://pypi.org/project/openai/3.59.0/) |
| opentelemetry-api | 1.45.2 | Apache-2.0 (SPDX expression) | [PyPI](https://pypi.org/project/opentelemetry-api/1.45.2/) |
| orjson | 3.13.0 | MPL-2.0 AND (Apache-2.0 OR MIT) (SPDX expression) | [PyPI](https://pypi.org/project/orjson/3.13.0/) |
| packaging | 26.4 | Apache-2.0 OR BSD-2-Clause (SPDX expression) | [PyPI](https://pypi.org/project/packaging/26.4/) |
| pfzy | 0.3.4 | MIT (PyPI License field) | [PyPI](https://pypi.org/project/pfzy/0.3.4/) |
| polars | 1.44.2 | MIT (PyPI OSI classifier; included wheel LICENSE) | [PyPI](https://pypi.org/project/polars/1.44.2/) |
| polars-runtime-32 | 1.44.2 | MIT (PyPI License field) | [PyPI](https://pypi.org/project/polars-runtime-32/1.44.2/) |
| prompt-toolkit | 3.0.53 | BSD License (PyPI classifier; not SPDX-normalized) | [PyPI](https://pypi.org/project/prompt-toolkit/3.0.53/) |
| propcache | 0.5.4 | Apache-2.0 (PyPI License field) | [PyPI](https://pypi.org/project/propcache/0.5.4/) |
| pycparser | 3.12 | BSD-3-Clause (SPDX expression) | [PyPI](https://pypi.org/project/pycparser/3.12/) |
| pydantic | 2.14.4 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/pydantic/2.14.4/) |
| pydantic-core | 2.50.5 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/pydantic-core/2.50.5/) |
| pydantic-settings | 2.16.3 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/pydantic-settings/2.16.3/) |
| pygments | 2.21.0 | BSD-2-Clause (SPDX expression) | [PyPI](https://pypi.org/project/pygments/2.21.0/) |
| pyjwt | 2.15.1 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/pyjwt/2.15.1/) |
| pynacl | 1.6.2 | Apache-2.0 (PyPI License field) | [PyPI](https://pypi.org/project/pynacl/1.6.2/) |
| pyroscope-io | 0.8.16 | Apache 2.0 (PyPI License field) | [PyPI](https://pypi.org/project/pyroscope-io/0.8.16/) |
| python-dateutil | 2.9.0.post0 | Dual License (PyPI License field) | [PyPI](https://pypi.org/project/python-dateutil/2.9.0.post0/) |
| python-dotenv | 1.2.4 | BSD-3-Clause (PyPI License field) | [PyPI](https://pypi.org/project/python-dotenv/1.2.4/) |
| python-multipart | 0.0.34 | Apache-2.0 (SPDX expression) | [PyPI](https://pypi.org/project/python-multipart/0.0.34/) |
| pywin32 | 312 | PSF (PyPI License field) | [PyPI](https://pypi.org/project/pywin32/312/) |
| pyyaml | 6.0.4 | MIT (PyPI License field) | [PyPI](https://pypi.org/project/pyyaml/6.0.4/) |
| redis | 8.2.0 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/redis/8.2.0/) |
| referencing | 0.37.0 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/referencing/0.37.0/) |
| regex | 2026.11.23 | Apache-2.0 AND CNRI-Python (SPDX expression) | [PyPI](https://pypi.org/project/regex/2026.11.23/) |
| requests | 2.34.2 | Apache-2.0 (PyPI License field) | [PyPI](https://pypi.org/project/requests/2.34.2/) |
| rich | 13.9.4 | MIT (PyPI License field) | [PyPI](https://pypi.org/project/rich/13.9.4/) |
| rpds-py | 2026.9.1 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/rpds-py/2026.9.1/) |
| rq | 2.12.0 | BSD-2-Clause (SPDX expression) | [PyPI](https://pypi.org/project/rq/2.12.0/) |
| s3transfer | 0.19.3 | Apache License 2.0 (PyPI License field) | [PyPI](https://pypi.org/project/s3transfer/0.19.3/) |
| semver | 3.1.2 | BSD-3-Clause (SPDX expression) | [PyPI](https://pypi.org/project/semver/3.1.2/) |
| six | 1.17.0 | MIT (PyPI License field) | [PyPI](https://pypi.org/project/six/1.17.0/) |
| sniffio | 1.3.1 | MIT OR Apache-2.0 (PyPI License field) | [PyPI](https://pypi.org/project/sniffio/1.3.1/) |
| soundfile | 0.14.0 | BSD-3-Clause (Python wrapper) + LGPL-2.1 (bundled libsndfile) + LGPL-2+ (libmp3lame) + LGPL-2.1 (libmpg123); see component notes below | [PyPI](https://pypi.org/project/soundfile/0.14.0/) |
| sse-starlette | 3.7.1 | BSD-3-Clause (SPDX expression) | [PyPI](https://pypi.org/project/sse-starlette/3.7.1/) |
| starlette | 1.10.0 | BSD-3-Clause (SPDX expression) | [PyPI](https://pypi.org/project/starlette/1.10.0/) |
| tiktoken | 0.14.0 | MIT (included wheel LICENSE text) | [PyPI](https://pypi.org/project/tiktoken/0.14.0/) |
| tokenizers | 0.23.3 | Apache Software License (PyPI OSI classifier; inspect upstream LICENSE) | [PyPI](https://pypi.org/project/tokenizers/0.23.3/) |
| tomlkit | 0.15.3 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/tomlkit/0.15.3/) |
| tqdm | 4.70.1 | MPL-2.0 AND MIT (PyPI License field) | [PyPI](https://pypi.org/project/tqdm/4.70.1/) |
| truststore | 0.10.5 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/truststore/0.10.5/) |
| typing-extensions | 4.16.0 | PSF-2.0 (SPDX expression) | [PyPI](https://pypi.org/project/typing-extensions/4.16.0/) |
| typing-inspection | 0.4.5 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/typing-inspection/0.4.5/) |
| tzdata | 2026.6 | Apache-2.0 (PyPI License field) | [PyPI](https://pypi.org/project/tzdata/2026.6/) |
| tzlocal | 5.4.5 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/tzlocal/5.4.5/) |
| urllib3 | 2.8.0 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/urllib3/2.8.0/) |
| uvicorn | 0.54.0 | BSD-3-Clause (SPDX expression) | [PyPI](https://pypi.org/project/uvicorn/0.54.0/) |
| uvloop | 0.23.0 | MIT License (PyPI License field) | [PyPI](https://pypi.org/project/uvloop/0.23.0/) |
| wcwidth | 0.9.5 | MIT License (PyPI classifier; not SPDX-normalized) | [PyPI](https://pypi.org/project/wcwidth/0.9.5/) |
| websockets | 15.0.1 | BSD-3-Clause (PyPI License field) | [PyPI](https://pypi.org/project/websockets/15.0.1/) |
| yarl | 1.25.1 | Apache-2.0 (PyPI License field) | [PyPI](https://pypi.org/project/yarl/1.25.1/) |
| zipp | 4.1.2 | MIT (SPDX expression) | [PyPI](https://pypi.org/project/zipp/4.1.2/) |

## Component requiring additional attention: soundfile / libsndfile

The locked soundfile 0.14.0 wrapper declares BSD-3-Clause. Its installed wheel also contains _soundfile_data/libsndfile_x86_64.so and an LGPL-2.1 COPYING file. The wheel includes licensing/license_notes.md, which identifies the bundled codec components and their licenses:

- libsndfile: LGPL-2.1 (COPYING bundled in the wheel).
- libmp3lame: LGPL-2+.
- libmpg123: LGPL-2.1.
- libFLAC component used by this build: BSD-3-Clause (the notes distinguish it from other differently licensed FLAC components).
- libogg, libopus and libvorbis: BSD-3-Clause.

LiteLLM 1.110.3 declares soundfile as a dependency of its proxy extra. The wheel observed in the Linux runtime reports libsndfile 1.2.2 and contains the shared library as a separate file. This is not a change to the Gateway source license, but it is a third-party binary with its own conditions. For any distribution that bundles this wheel or the installed runtime, preserve the soundfile notices and LGPL text, provide the corresponding source or another compliant LGPL source mechanism, and ensure recipients can replace or relink the library as the applicable LGPL terms require. The exact wheel/binary and replacement mechanism should be reviewed for each target OS/architecture before shipping a bundled installer or image.

Official references: [GNU LGPL 2.1](https://www.gnu.org/licenses/old-licenses/lgpl-2.1.en.html) and [GNU LGPL 2.1 Section 6 text](https://www.gnu.de/documents/lgpl-2.1.en.html). The LGPL does not by itself prohibit commercial use, but redistribution requires satisfying its conditions.

## Other weak-copyleft / multi-license entries

- certifi 2026.11.20: MPL-2.0.
- orjson 3.13.0: MPL-2.0 AND (Apache-2.0 OR MIT).
- tqdm 4.70.1: MPL-2.0 AND MIT.
- numpy 2.5.5: BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 (including separately identified third-party subcomponent license files).
- aiohttp 3.14.5: Apache-2.0 AND MIT; its wheel includes a separate license for vendored llhttp.
- cryptography 50.0.2: Apache-2.0 OR BSD-3-Clause.
- sniffio 1.3.1: MIT OR Apache-2.0.
- regex 2026.11.23: Apache-2.0 AND CNRI-Python.
- python-dateutil 2.9.0.post0: upstream metadata identifies a dual license; the wheel includes its license text.

MPL-2.0 is file-level copyleft, not a blanket license change to the Gateway. If covered MPL files are redistributed or modified, preserve notices and satisfy the source obligations for those covered files. See the [Mozilla MPL 2.0 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) and [MPL 2.0 text](https://www.mozilla.org/en-US/MPL/2.0/).

## JavaScript / npm dependency packages

| Package | Locked version | License metadata |
|---|---:|---|
| @clack/core | 1.6.0 | MIT |
| @clack/prompts | 1.9.0 | MIT |
| fast-string-truncated-width | 3.0.3 | MIT |
| fast-string-width | 3.0.2 | MIT |
| fast-wrap-ansi | 0.2.2 | MIT |
| sisteransi | 2.0.0 | MIT |
| yaml | 2.9.1 | ISC |

The npm dependency tree contains seven packages (two direct dependencies plus five transitive packages). Their license files are included in node_modules during development/install and must be retained when redistributing those package artifacts.

## Distribution checklist

1. Do not describe third-party dependencies as MIT merely because Shadow Gateway source is MIT.
2. When redistributing dependency wheels or a prebuilt .shadow/.venv, retain each package license and NOTICE file from the installed distribution, including bundled subcomponent notices.
3. For soundfile/lib* components, complete a target-platform LGPL review and provide the required corresponding source/replacement mechanism before shipping bundled binaries.
4. Preserve Apache, BSD, ISC, MIT, PSF, MPL and other upstream notices and meet any source-disclosure obligations for MPL-covered files that are modified and redistributed.
5. Re-run this inventory whenever requirements.txt, requirements.lock, package-lock.json or the packaged runtime changes.

This is a dependency inventory, not a legal opinion. Provider API terms, model licenses, trademarks, datasets and services remain separate from these package licenses and from the Gateway MIT license.
