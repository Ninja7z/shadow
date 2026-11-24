#!/usr/bin/env python3
"""Portable self-hosted Shadow multi-provider gateway bootstrap."""
from __future__ import annotations

import argparse
import getpass
import os
import re
import secrets
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
            values[k.strip()] = v.strip().strip('"').strip("'")
    return values


def write_env(values):
    text = (
        "# Private local credentials. Never commit this file.\n"
        "# Add optional provider keys below.\n\n"
        + "\n".join(f"{k}={v}" for k, v in values.items())
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


def build_config(values):
    import yaml
    cfg = yaml.safe_load(STARTER.read_text(encoding="utf-8"))
    providers = enabled_models(values)
    cfg["model_list"].extend(providers)
    catalog = load_yaml(CATALOG, {"providers": []})
    local = load_yaml(LOCAL_PROVIDERS, {"providers": []})
    safe_ids = {
        provider["model_name"]
        for provider in catalog.get("providers", [])
        if provider.get("auto_fallback", False)
    }
    safe_ids.update(
        provider["model_name"]
        for provider in local.get("providers", [])
        if provider.get("auto_fallback", False)
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
    if access == "free":
        auto_fallback = input("Permitir uso no fallback automático? [s/N]: ").strip().lower() in {"s", "sim", "y", "yes"}
    elif access in {"paid", "mixed"}:
        print("ATENÇÃO: o fallback automático pode consumir créditos e gerar cobranças sem seleção manual do alias.")
        auto_fallback = input("Para autorizar esse comportamento, digite SIM: ").strip() == "SIM"

    key_env = "SHADOW_CUSTOM_" + re.sub(r"[^A-Z0-9]+", "_", provider_id.upper()).strip("_") + "_API_KEY"
    api_key = getpass.getpass("Chave de API (não será exibida): ").strip()
    if not api_key:
        print("A chave não pode ficar vazia.")
        return 2

    values = read_env()
    if values.get(key_env):
        print(f"A variável {key_env} já existe. Escolha outro identificador.")
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
    ensure_venv()
    subprocess.run(
        [str(pybin()), str(ROOT / "scripts" / "shadow.py"), "_finish_setup"],
        cwd=ROOT,
        check=True,
    )
    return 0


def ensure_venv():
    if not pybin().exists():
        subprocess.run([sys.executable, "-m", "venv", str(VENV)], check=True)
    subprocess.run([str(pybin()), "-m", "pip", "install", "--upgrade", "pip"], check=True)
    subprocess.run([str(pybin()), "-m", "pip", "install", "-r", str(ROOT / "requirements.txt")], check=True)


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
        auto = "auto-fallback" if provider.get("auto_fallback", False) else "manual-only by default"
        print(f"[{state}] {provider['label']} | {', '.join(required)} | {provider['access']} | {auto} | {provider['docs']}")
    local = load_yaml(LOCAL_PROVIDERS, {"providers": []})
    for provider in local.get("providers", []):
        state = "ATIVO" if values.get(provider["api_key_env"]) else "sem chave"
        auto = "auto-fallback" if provider.get("auto_fallback", False) else "manual-only"
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


def main():
    parser = argparse.ArgumentParser(description="Shadow self-hosted multi-provider API")
    sub = parser.add_subparsers(dest="command", required=True)
    for name, fn in [
        ("setup", setup),
        ("configure", configure),
        ("refresh", refresh),
        ("validate", validate),
        ("add-provider", add_provider),
    ]:
        sub.add_parser(name).set_defaults(func=fn)
    run = sub.add_parser("start")
    run.add_argument("--port", type=int, default=4000)
    run.set_defaults(func=start)
    sub.add_parser("_finish_setup").set_defaults(func=finish_setup)
    args = parser.parse_args()

    # Bootstrap must work on a clean machine with only Python installed.
    # YAML parsing and runtime commands are delegated to the isolated venv.
    if args.command != "_finish_setup" and pybin().exists():
        try:
            if Path(sys.prefix).resolve() != VENV.resolve():
                return subprocess.call([str(pybin()), str(ROOT / "scripts" / "shadow.py"), *sys.argv[1:]], cwd=ROOT)
        except OSError:
            pass
    if args.command not in {"setup", "_finish_setup"} and not pybin().exists():
        print("Run setup first to install Shadow dependencies.")
        return 2
    if args.command != "setup":
        import yaml
        globals()["yaml"] = yaml
    try:
        return int(args.func(args))
    except subprocess.CalledProcessError as error:
        print(f"Comando falhou: exit {error.returncode}")
        return int(error.returncode or 1)


if __name__ == "__main__":
    raise SystemExit(main())
