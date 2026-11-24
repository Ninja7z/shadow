#!/usr/bin/env python3
"""Portable self-hosted Shadow multi-provider gateway bootstrap."""
from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import secrets
import shlex
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"
LOCAL_CONFIG = ROOT / "config" / "shadow.yaml"
STARTER = ROOT / "config" / "shadow.example.yaml"
CATALOG = ROOT / "config" / "providers.catalog.yaml"
LOCAL_PROVIDERS = ROOT / "config" / "providers.local.yaml"
VENV = ROOT / ".venv"
WINDOWS = os.name == "nt"


def read_env():
    values = {}
    if ENV_FILE.exists():
        for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            if line.startswith("export "):
                line = line[7:].lstrip()
            k, v = line.split("=", 1)
            raw_value = v.strip()
            if raw_value and raw_value[0] in {"'", '\"'}:
                try:
                    parsed = shlex.split(raw_value, comments=False, posix=True)
                    raw_value = parsed[0] if len(parsed) == 1 else raw_value
                except ValueError:
                    pass
            values[k.strip()] = raw_value
    return values


def write_env(values):
    text = (
        "# Private local credentials. Never commit this file.\n"
        "# Add optional provider keys below.\n\n"
        + "\n".join(f"{k}={shlex.quote(str(v))}" for k, v in values.items())
        + "\n"
    )
    ENV_FILE.write_text(text, encoding="utf-8")
    try:
        ENV_FILE.chmod(0o600)
    except OSError:
        pass


def pybin():
    return VENV / ("Scripts/python.exe" if WINDOWS else "bin/python")


def litellm_bin():
    return VENV / ("Scripts/litellm.exe" if WINDOWS else "bin/litellm")


def load_yaml(path, default):
    import yaml
    if not path.exists():
        return default
    return yaml.safe_load(path.read_text(encoding="utf-8")) or default


def save_yaml_private(path, data):
    import yaml
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def local_provider_models(values):
    data = load_yaml(LOCAL_PROVIDERS, {"providers": []})
    result = []
    for provider in data.get("providers", []):
        key_env = provider["api_key_env"]
        if not values.get(key_env):
            continue
        protocol = provider["protocol"]
        prefix = "openai/" if protocol == "openai" else "anthropic/"
        params = {
            "model": prefix + provider["model"],
            "api_key": "os.environ/" + key_env,
            "api_base": provider["api_base"],
            "timeout": 120,
        }
        result.append({
            "model_name": provider["model_name"],
            "litellm_params": params,
        })
    return result


def enabled_models(values):
    data = load_yaml(CATALOG, {"providers": []})
    result = []
    for provider in data.get("providers", []):
        required = [provider["api_key_env"], *provider.get("required_env", [])]
        if not all(values.get(key) for key in required):
            continue
        params = {
            "model": provider["model"],
            "api_key": "os.environ/" + provider["api_key_env"],
            "timeout": 120,
        }
        if provider.get("api_base"):
            base = provider["api_base"]
            for key in provider.get("required_env", []):
                base = base.replace("$" + "{" + key + "}", values[key])
            params["api_base"] = base
        if provider.get("extra_headers"):
            params["extra_headers"] = provider["extra_headers"]
        result.append({
            "model_name": provider["model_name"],
            "litellm_params": params,
        })
    result.extend(local_provider_models(values))
    for key_env, base_env, model_env, alias, prefix in [
        ("CUSTOM_OPENAI_API_KEY", "CUSTOM_OPENAI_BASE_URL", "CUSTOM_OPENAI_MODEL", "shadow-custom-openai", "openai/"),
        ("CUSTOM_ANTHROPIC_API_KEY", "CUSTOM_ANTHROPIC_BASE_URL", "CUSTOM_ANTHROPIC_MODEL", "shadow-custom-anthropic", "anthropic/"),
    ]:
        if values.get(key_env) and values.get(base_env) and values.get(model_env):
            result.append({
                "model_name": alias,
                "litellm_params": {
                    "model": prefix + values[model_env],
                    "api_base": values[base_env],
                    "api_key": "os.environ/" + key_env,
                    "timeout": 120,
                },
            })
    return result


def catalog_provider_allows_fallback(provider):
    access = str(provider.get("access", "unknown")).lower()
    return bool(provider.get("auto_fallback", False)) and "paid" not in access and "mixed" not in access


def custom_provider_allows_fallback(provider):
    access = str(provider.get("access", "unknown")).lower()
    return bool(provider.get("auto_fallback", False)) and (
        access == "free" or provider.get("allow_charges", False) is True
    )


def build_config(values):
    import yaml
    cfg = yaml.safe_load(STARTER.read_text(encoding="utf-8"))
    local_model = values.get("SHADOW_OLLAMA_MODEL")
    if local_model:
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]*", local_model):
            raise ValueError("SHADOW_OLLAMA_MODEL must be a valid local Ollama model identifier.")
        for item in cfg.get("model_list", []):
            if item.get("model_name") in {"shadow-local", "shadow-auto"}:
                params = item.setdefault("litellm_params", {})
                if str(params.get("model", "")).startswith("ollama/"):
                    params["model"] = "ollama/" + local_model
    providers = enabled_models(values)
    cfg["model_list"].extend(providers)
    catalog = load_yaml(CATALOG, {"providers": []})
    local = load_yaml(LOCAL_PROVIDERS, {"providers": []})
    safe_ids = {
        provider["model_name"]
        for provider in catalog.get("providers", [])
        if catalog_provider_allows_fallback(provider)
    }
    safe_ids.update(
        provider["model_name"]
        for provider in local.get("providers", [])
        if custom_provider_allows_fallback(provider)
    )
    automatic = [provider for provider in providers if provider["model_name"] in safe_ids]
    if automatic:
        cfg["model_list"][1] = {
            "model_name": "shadow-auto",
            "litellm_params": dict(automatic[0]["litellm_params"]),
        }
        cfg["router_settings"] = {
            "fallbacks": [{
                "shadow-auto": [provider["model_name"] for provider in automatic[1:]] + ["shadow-local"]
            }]
        }
    else:
        cfg["router_settings"] = {"fallbacks": [{"shadow-auto": ["shadow-local"]}]}
    return cfg


def add_provider(_):
    print("\nAdicionar endpoint próprio ao Shadow")
    print("Compatibilidade: OpenAI Chat Completions ou Anthropic Messages.")
    provider_id = input("Identificador curto (ex.: minha-api): ").strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{1,39}", provider_id) or provider_id in {"openai", "anthropic"}:
        print("Identificador inválido ou reservado. Use 2-40 caracteres: letras, números, hífen ou underscore.")
        return 2

    data = load_yaml(LOCAL_PROVIDERS, {"providers": []})
    if any(item.get("id") == provider_id for item in data.get("providers", [])):
        print("Já existe um endpoint com esse identificador.")
        return 2

    label = input("Nome para exibição: ").strip()
    if not label:
        print("O nome é obrigatório.")
        return 2
    protocol = input("Protocolo [1=OpenAI-compatible, 2=Anthropic Messages] (1): ").strip() or "1"
    protocol = {"1": "openai", "2": "anthropic"}.get(protocol)
    if not protocol:
        print("Opção de protocolo inválida.")
        return 2
    if protocol == "openai":
        print("Dica: muitos provedores OpenAI-compatible usam uma Base URL terminada em /v1.")
    else:
        print("Dica: use a raiz da API Anthropic-compatible; não acrescente /v1/messages.")

    api_base = input("Base URL do provedor: ").strip().rstrip("/")
    parsed = urlparse(api_base)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password or parsed.fragment:
        print("URL inválida. Use http(s), sem credenciais embutidas nem fragmento.")
        return 2
    model = input("ID exato do modelo no provedor: ").strip()
    if not model or any(char.isspace() for char in model):
        print("ID do modelo inválido.")
        return 2

    access = input("Acesso [free/paid/mixed/unknown] (unknown): ").strip().lower() or "unknown"
    if access not in {"free", "paid", "mixed", "unknown"}:
        print("Classificação inválida.")
        return 2

    auto_fallback = False
    allow_charges = False
    if access == "free":
        auto_fallback = input("Permitir uso no fallback automático? [s/N]: ").strip().lower() in {"s", "sim", "y", "yes"}
    elif access in {"paid", "mixed"}:
        print("ATENÇÃO: o fallback automático pode consumir créditos e gerar cobranças sem seleção manual do alias.")
        allow_charges = input("Para autorizar esse comportamento, digite SIM: ").strip() == "SIM"
        auto_fallback = allow_charges

    key_env = "SHADOW_CUSTOM_" + re.sub(r"[^A-Z0-9]+", "_", provider_id.upper()).strip("_") + "_API_KEY"
    values = read_env()
    if key_env in values:
        print(f"A variável {key_env} já existe. Escolha outro identificador.")
        return 2
    api_key = getpass.getpass("Chave de API (não será exibida): ").strip()
    if not api_key or any(ord(char) in {0, 10, 13} for char in api_key):
        print("A chave não pode ficar vazia nem conter quebras de linha ou caracteres nulos.")
        return 2
    values[key_env] = api_key
    write_env(values)

    data.setdefault("providers", []).append({
        "id": provider_id,
        "label": label,
        "protocol": protocol,
        "model_name": "shadow-custom-" + provider_id,
        "model": model,
        "api_base": api_base,
        "api_key_env": key_env,
        "access": access,
        "auto_fallback": auto_fallback,
        "allow_charges": allow_charges,
    })
    save_yaml_private(LOCAL_PROVIDERS, data)
    print("\nEndpoint cadastrado. A chave ficou somente no .env privado.")
    print(f"Alias local: shadow-custom-{provider_id}")
    print("Agora execute: python scripts/shadow.py refresh")
    print("Depois reinicie o Shadow. O alias aparecerá em /v1/models.")
    print("Fallback automático habilitado." if auto_fallback else "O endpoint permanece manual e não entra no fallback automático.")
    return 0


def setup(_):
    if not ENV_FILE.exists():
        shutil.copyfile(ROOT / ".env.example", ENV_FILE)
    values = read_env()
    if not values.get("LITELLM_MASTER_KEY"):
        values["LITELLM_MASTER_KEY"] = "sk-shadow-" + secrets.token_urlsafe(36)
        write_env(values)
    else:
        try:
            ENV_FILE.chmod(0o600)
        except OSError:
            pass
    ensure_venv()
    subprocess.run(
        [str(pybin()), str(ROOT / "scripts" / "shadow.py"), "_finish_setup"],
        cwd=ROOT,
        check=True,
    )
    return 0


def ensure_venv():
    uv = shutil.which("uv")
    if not pybin().exists():
        if uv:
            subprocess.run([uv, "venv", str(VENV), "--python", sys.executable], check=True)
        else:
            subprocess.run([sys.executable, "-m", "venv", str(VENV)], check=True)
    if uv:
        subprocess.run([uv, "pip", "install", "--python", str(pybin()), "-r", str(ROOT / "requirements.txt")], check=True)
    else:
        subprocess.run([str(pybin()), "-m", "pip", "install", "--upgrade", "pip"], check=True)
        subprocess.run([str(pybin()), "-m", "pip", "install", "-r", str(ROOT / "requirements.txt")], check=True)


def save_provider_credentials(payload):
    if not isinstance(payload, dict) or not payload:
        raise ValueError("No provider credentials supplied.")
    catalog = load_yaml(CATALOG, {"providers": []})
    allowed = set()
    for provider in catalog.get("providers", []):
        allowed.add(provider["api_key_env"])
        allowed.update(provider.get("required_env", []))
    allowed.add("SHADOW_OLLAMA_MODEL")
    for key in payload:
        if not isinstance(key, str) or not re.fullmatch(r"[A-Z][A-Z0-9_]{1,100}", key):
            raise ValueError("Invalid environment variable name.")
        if key not in allowed and not (key.startswith("SHADOW_CUSTOM_") and key.endswith("_API_KEY")):
            raise ValueError(f"Credential variable is not part of the provider catalog: {key}")
        if key == "LITELLM_MASTER_KEY":
            raise ValueError("The local master key cannot be overwritten by provider setup.")
        if key == "SHADOW_OLLAMA_MODEL" and (not isinstance(payload[key], str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]*", payload[key])):
            raise ValueError("Invalid local Ollama model identifier.")
    if any(not isinstance(value, str) or not value or any(ord(char) in {0, 10, 13} for char in value) for value in payload.values()):
        raise ValueError("Credential values must be non-empty single-line strings.")
    values = read_env()
    values.update(payload)
    write_env(values)
    print(f"Saved {len(payload)} private provider setting(s) to the .env file.")
    return 0


def finish_setup(_):
    values = read_env()
    cfg = build_config(values)
    save_yaml_private(LOCAL_CONFIG, cfg)
    print("Setup concluído. Config local criada e chave mestra gerada.")
    print(f"Provedores remotos ativados: {len(enabled_models(values))}; nenhum é obrigatório.")
    print("Para custo zero: instale Ollama, execute: ollama pull llama3.2:3b")
    print("Depois: python scripts/shadow.py start")
    return 0


def configure(_):
    values = read_env()
    data = load_yaml(CATALOG, {"providers": []})
    print("Provedores do catálogo. Cadastre as variáveis no .env para ativá-los:")
    for provider in data.get("providers", []):
        required = [provider["api_key_env"], *provider.get("required_env", [])]
        state = "ATIVO" if all(values.get(key) for key in required) else "opcional"
        auto = "auto-fallback" if catalog_provider_allows_fallback(provider) else "manual-only by default"
        print(f"[{state}] {provider['label']} | {', '.join(required)} | {provider['access']} | {auto} | {provider['docs']}")
    local = load_yaml(LOCAL_PROVIDERS, {"providers": []})
    for provider in local.get("providers", []):
        state = "ATIVO" if values.get(provider["api_key_env"]) else "sem chave"
        auto = "auto-fallback" if custom_provider_allows_fallback(provider) else "manual-only"
        print(f"[{state}] {provider['label']} | {provider['protocol']} | {provider['access']} | alias={provider['model_name']} | {auto}")
    print("\nPara cadastrar uma API própria: python scripts/shadow.py add-provider")
    return 0


def refresh(_):
    values = read_env()
    if not values.get("LITELLM_MASTER_KEY"):
        print("Execute setup primeiro.")
        return 2
    cfg = build_config(values)
    save_yaml_private(LOCAL_CONFIG, cfg)
    print(f"Config atualizada: {len(cfg['model_list'])} aliases; {len(enabled_models(values))} provedores remotos ativos.")
    return 0


def validate(_):
    if not LOCAL_CONFIG.exists():
        print("Execute setup primeiro.")
        return 2
    cfg = load_yaml(LOCAL_CONFIG, {})
    names = [item["model_name"] for item in cfg.get("model_list", [])]
    if len(names) != len(set(names)) or not {"shadow-local", "shadow-auto"}.issubset(names):
        print("Config inválida.")
        return 2
    print(f"OK: {len(names)} aliases; local e auto presentes.")
    return 0


def start(args):
    if not LOCAL_CONFIG.exists():
        print("Execute setup primeiro.")
        return 2
    values = read_env()
    if not values.get("LITELLM_MASTER_KEY"):
        print("Chave local ausente. Execute setup.")
        return 2
    env = os.environ.copy()
    env.update(values)
    cmd = [str(litellm_bin()), "--config", str(LOCAL_CONFIG), "--host", "127.0.0.1", "--port", str(args.port)]
    print(f"Shadow API em http://127.0.0.1:{args.port}; Ctrl+C encerra.")
    return subprocess.call(cmd, cwd=ROOT, env=env)


def ollama_status():
    binary = shutil.which("ollama")
    if not binary:
        return False, "Ollama não encontrado no PATH."
    try:
        result = subprocess.run([binary, "list"], capture_output=True, text=True, timeout=8, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return False, "Não foi possível consultar Ollama."
    if result.returncode != 0:
        return False, "Ollama não respondeu. Inicie o serviço e tente novamente."
    rows = [line.strip() for line in result.stdout.splitlines()[1:] if line.strip()]
    if not rows:
        return True, "Ollama está disponível, mas ainda não há modelos baixados."
    return True, "Modelos locais: " + ", ".join(row.split()[0] for row in rows[:8])


def configure_catalog_interactively():
    catalog = load_yaml(CATALOG, {"providers": []})
    providers = catalog.get("providers", [])
    if not providers:
        print("O catálogo de provedores está vazio.")
        return 2
    print("\nProvedores catalogados (a disponibilidade depende da sua conta):")
    for index, provider in enumerate(providers, start=1):
        required = [provider["api_key_env"], *provider.get("required_env", [])]
        print(f"  {index}. {provider['label']} — {provider['access']} — alias {provider['model_name']}")
        print(f"     Credenciais: {', '.join(required)}")
        print(f"     Documentação: {provider['docs']}")
    choice = input("\nNúmero do provedor para configurar (0 cancela): ").strip()
    if choice == "0":
        return 0
    if not choice.isdigit() or not 1 <= int(choice) <= len(providers):
        print("Seleção inválida.")
        return 2
    provider = providers[int(choice) - 1]
    values = read_env()
    required = [provider["api_key_env"], *provider.get("required_env", [])]
    pending = {}
    for key in required:
        if values.get(key):
            replace = input(f"{key} já está preenchida. Substituir? [s/N]: ").strip().lower() in {"s", "sim", "y", "yes"}
            if not replace:
                continue
        if key.endswith("_ID"):
            value = input(f"{key}: ").strip()
        else:
            value = getpass.getpass(f"{key} (entrada oculta): ").strip()
        if value and any(ord(char) in {0, 10, 13} for char in value):
            print(f"Valor inválido para {key}: não use quebras de linha ou caracteres nulos.")
            return 2
        if value:
            pending[key] = value
    values.update(pending)
    missing = [key for key in required if not values.get(key)]
    if missing:
        print("Configuração não salva. Faltam: " + ", ".join(missing))
        return 2
    write_env(values)
    print(f"\nCredenciais locais salvas para {provider['label']}. Os valores não foram exibidos.")
    print(f"Alias: {provider['model_name']}")
    print("Fallback automático: " + ("habilitado pelo catálogo" if catalog_provider_allows_fallback(provider) else "desabilitado; seleção manual"))
    return refresh(None)


def print_client_quickstart():
    print("\nConexão do cliente")
    print("OpenAI-compatible Base URL: http://127.0.0.1:4000/v1")
    print("Anthropic Messages Base URL: http://127.0.0.1:4000")
    print("API key: LITELLM_MASTER_KEY do .env privado desta instalação")
    print("Modelo: use o alias exato exibido por /v1/models (ex.: shadow-local ou shadow-auto).")
    print("\nConsulte os exemplos completos:")
    print("  docs/pt-BR/integracao-clientes.md")
    print("  docs/client-integrations.md")
    print("Não copie chaves upstream para OpenCode, Cline, Continue, Kilo, Aider ou Claude Code.")


def onboard(_):
    if not pybin().exists():
        print("Preparando ambiente isolado do Shadow...")
        if not ENV_FILE.exists():
            shutil.copyfile(ROOT / ".env.example", ENV_FILE)
        values = read_env()
        if not values.get("LITELLM_MASTER_KEY"):
            values["LITELLM_MASTER_KEY"] = "sk-shadow-" + secrets.token_urlsafe(36)
            write_env(values)
        else:
            try:
                ENV_FILE.chmod(0o600)
            except OSError:
                pass
        ensure_venv()
        setup_result = subprocess.call([str(pybin()), str(ROOT / "scripts" / "shadow.py"), "_finish_setup"], cwd=ROOT)
        if setup_result != 0:
            return setup_result
        return subprocess.call([str(pybin()), str(ROOT / "scripts" / "shadow.py"), "onboard"], cwd=ROOT)

    if not ENV_FILE.exists() or not LOCAL_CONFIG.exists() or not read_env().get("LITELLM_MASTER_KEY"):
        answer = input("Esta instalação ainda não foi preparada. Executar setup agora? [S/n]: ").strip().lower()
        if answer in {"n", "não", "nao", "no"}:
            print("Execute python scripts/shadow.py setup quando quiser iniciar.")
            return 0
        subprocess.run([str(pybin()), str(ROOT / "scripts" / "shadow.py"), "setup"], cwd=ROOT, check=True)

    print("\n" + "═" * 62)
    print("  SHADOW · ONBOARDING")
    print("  Sua instalação. Seus provedores. Suas regras.")
    print("═" * 62)
    print("A configuração local não exige conta remota nem chave de provedor.")
    print("Provedores gratuitos, pagos e endpoints próprios são opcionais.")
    while True:
        print("\nO que você quer fazer?")
        print("  1. Verificar inferência local (Ollama)")
        print("  2. Conectar um provedor do catálogo")
        print("  3. Adicionar uma API própria")
        print("  4. Ver como conectar seus aplicativos")
        print("  5. Finalizar e atualizar a configuração")
        print("  0. Sair")
        choice = input("\nEscolha [0-5]: ").strip()
        if choice == "0":
            print("Onboarding pausado. Suas configurações salvas foram preservadas.")
            return 0
        if choice == "1":
            available, detail = ollama_status()
            print(("[OK] " if available else "[INFO] ") + detail)
            if available and "ainda não há modelos" in detail:
                print("Para começar: ollama pull llama3.2:3b")
            elif not available:
                print("Instale em https://ollama.com/ ou conecte um provedor remoto pelo catálogo.")
        elif choice == "2":
            configure_catalog_interactively()
        elif choice == "3":
            if add_provider(None) == 0:
                refresh(None)
        elif choice == "4":
            print_client_quickstart()
        elif choice == "5":
            refresh(None)
            print("\nPronto. Inicie o serviço com:")
            print("  python scripts/shadow.py start")
            print("Depois descubra os modelos em:")
            print("  GET http://127.0.0.1:4000/v1/models")
            return 0
        else:
            print("Escolha inválida. Use um número de 0 a 5.")


def main():
    # Private machine-readable hooks used by the npm launcher.
    if len(sys.argv) > 1 and sys.argv[1] == "_import_credentials":
        try:
            payload = json.load(sys.stdin)
            return int(save_provider_credentials(payload))
        except (ValueError, json.JSONDecodeError) as error:
            print(f"Credential import rejected: {error}", file=sys.stderr)
            return 2

    # Private bootstrap hook used by setup/onboard; keep it out of public CLI help.
    if len(sys.argv) > 1 and sys.argv[1] == "_finish_setup":
        if not pybin().exists():
            print("Environment bootstrap failed: isolated Python is missing.")
            return 2
        try:
            if Path(sys.prefix).resolve() != VENV.resolve():
                return subprocess.call([str(pybin()), str(ROOT / "scripts" / "shadow.py"), "_finish_setup"], cwd=ROOT)
        except OSError:
            pass
        import yaml
        globals()["yaml"] = yaml
        try:
            return int(finish_setup(None))
        except subprocess.CalledProcessError as error:
            print(f"Comando falhou: exit {error.returncode}")
            return int(error.returncode or 1)

    parser = argparse.ArgumentParser(description="Shadow self-hosted multi-provider API")
    sub = parser.add_subparsers(dest="command", required=True)
    for name, fn in [
        ("setup", setup),
        ("configure", configure),
        ("refresh", refresh),
        ("validate", validate),
        ("add-provider", add_provider),
        ("onboard", onboard),
    ]:
        sub.add_parser(name).set_defaults(func=fn)
    run = sub.add_parser("start")
    run.add_argument("--port", type=int, default=4000)
    run.set_defaults(func=start)
    args = parser.parse_args()

    # Bootstrap must work on a clean machine with only Python installed.
    # YAML parsing and runtime commands are delegated to the isolated venv.
    if pybin().exists():
        try:
            if Path(sys.prefix).resolve() != VENV.resolve():
                return subprocess.call([str(pybin()), str(ROOT / "scripts" / "shadow.py"), *sys.argv[1:]], cwd=ROOT)
        except OSError:
            pass
    if args.command not in {"setup", "onboard"} and not pybin().exists():
        print("Run setup first to install Shadow dependencies.")
        return 2
    if args.command not in {"setup", "onboard"}:
        import yaml
        globals()["yaml"] = yaml
    try:
        return int(args.func(args))
    except subprocess.CalledProcessError as error:
        print(f"Comando falhou: exit {error.returncode}")
        return int(error.returncode or 1)


if __name__ == "__main__":
    raise SystemExit(main())
