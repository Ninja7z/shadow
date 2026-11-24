from __future__ import annotations

import contextlib
import importlib.util
import io
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / "scripts" / "shadow.py"
SPEC = importlib.util.spec_from_file_location("shadow_cli", MODULE)
assert SPEC and SPEC.loader
shadow = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(shadow)


class GeneratedConfigTests(unittest.TestCase):
    def test_env_writer_round_trips_shell_sensitive_values(self):
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / ".env"
            secret = "token with spaces $HOME 'quoted' # value"
            with patch.object(shadow, "ENV_FILE", env_path):
                shadow.write_env({"LITELLM_MASTER_KEY": "local-test-key", "CUSTOM_API_KEY": secret})
                self.assertEqual(shadow.read_env()["CUSTOM_API_KEY"], secret)
            import subprocess
            sourced = subprocess.run(["bash", "-c", 'set -a; source "$1"; printf %s "$CUSTOM_API_KEY"', "shadow-env-test", str(env_path)], text=True, capture_output=True, check=True)
            self.assertEqual(sourced.stdout, secret)
            self.assertEqual(env_path.stat().st_mode & 0o777, 0o600)

    def test_local_only_config_has_no_remote_provider(self):
        config = shadow.build_config({"LITELLM_MASTER_KEY": "local-secret"})
        names = [item["model_name"] for item in config["model_list"]]
        self.assertEqual(names, ["shadow-local", "shadow-auto"])
        self.assertEqual(config["router_settings"]["fallbacks"], [{"shadow-auto": ["shadow-local"]}])

    def test_optional_providers_require_their_own_credentials(self):
        config = shadow.build_config({"LITELLM_MASTER_KEY": "local-secret", "GEMINI_API_KEY": "gemini-test", "CLOUDFLARE_WORKERS_AI_TOKEN": "cf-test"})
        names = [item["model_name"] for item in config["model_list"]]
        self.assertIn("shadow-gemini-flash", names)
        self.assertNotIn("shadow-cloudflare-free", names)
        self.assertEqual(config["model_list"][1]["model_name"], "shadow-auto")
        self.assertEqual(config["model_list"][1]["litellm_params"]["model"], "ollama/llama3.2:3b")

    def test_only_explicitly_free_providers_join_auto_fallback(self):
        config = shadow.build_config({
            "LITELLM_MASTER_KEY": "local-secret",
            "REQUESTY_API_KEY": "requesty-test",
            "GONKA_API_KEY": "gonka-test",
            "OPENAI_API_KEY": "paid-test",
        })
        names = [row["model_name"] for row in config["model_list"]]
        self.assertEqual(config["model_list"][1]["model_name"], "shadow-auto")
        self.assertEqual(config["model_list"][1]["litellm_params"]["model"], "openai/zai-org/GLM-5.3-Flash")
        fallbacks = config["router_settings"]["fallbacks"][0]["shadow-auto"]
        self.assertEqual(fallbacks, ["shadow-local"])
        self.assertIn("shadow-requesty", names)
        self.assertNotIn("shadow-requesty", fallbacks)
        self.assertNotIn("shadow-openai", fallbacks)

    def test_mixed_access_catalog_provider_is_manual_even_if_flag_is_true(self):
        provider = {"model_name": "shadow-mixed", "access": "free-tier-and-paid", "auto_fallback": True}
        self.assertFalse(shadow.catalog_provider_allows_fallback(provider))

    def test_paid_provider_is_not_automatically_selected(self):
        config = shadow.build_config({"LITELLM_MASTER_KEY": "local-secret", "OPENAI_API_KEY": "openai-test"})
        self.assertIn("shadow-openai", [x["model_name"] for x in config["model_list"]])
        self.assertEqual(config["model_list"][1]["litellm_params"]["model"], "ollama/llama3.2:3b")

    def test_custom_openai_and_anthropic_endpoints_are_supported(self):
        config = shadow.build_config({
            "LITELLM_MASTER_KEY": "local-secret",
            "CUSTOM_OPENAI_API_KEY": "custom-openai-secret",
            "CUSTOM_OPENAI_BASE_URL": "https://example.test/v1",
            "CUSTOM_OPENAI_MODEL": "vendor/model-x",
            "CUSTOM_ANTHROPIC_API_KEY": "custom-anthropic-secret",
            "CUSTOM_ANTHROPIC_BASE_URL": "https://example.test",
            "CUSTOM_ANTHROPIC_MODEL": "claude-compatible-model",
        })
        rows = {x["model_name"]: x["litellm_params"] for x in config["model_list"]}
        self.assertEqual(rows["shadow-custom-openai"]["model"], "openai/vendor/model-x")
        self.assertEqual(rows["shadow-custom-anthropic"]["model"], "anthropic/claude-compatible-model")
        self.assertNotIn("custom-openai-secret", str(config))
        self.assertNotIn("custom-anthropic-secret", str(config))

    def test_cloudflare_requires_account_id_and_substitutes_it(self):
        config = shadow.build_config({"LITELLM_MASTER_KEY": "local-secret", "CLOUDFLARE_WORKERS_AI_TOKEN": "cf-test", "CLOUDFLARE_ACCOUNT_ID": "account-placeholder"})
        item = next(row for row in config["model_list"] if row["model_name"] == "shadow-cloudflare-free")
        self.assertIn("account-placeholder", item["litellm_params"]["api_base"])
        self.assertFalse(item["litellm_params"]["api_base"].startswith("$"))

    def test_keys_are_environment_references_not_literals(self):
        config = shadow.build_config({"LITELLM_MASTER_KEY": "local-secret", "REQUESTY_API_KEY": "requesty-test"})
        item = next(row for row in config["model_list"] if row["model_name"] == "shadow-requesty")
        self.assertEqual(item["litellm_params"]["api_key"], "os.environ/REQUESTY_API_KEY")
        self.assertNotIn("requesty-test", str(config))

    def test_multiple_private_custom_providers_are_supported(self):
        providers = {
            "providers": [
                {"id": "api-a", "label": "API A", "protocol": "openai", "model_name": "shadow-custom-api-a", "model": "vendor/model-a", "api_base": "https://a.example/v1", "api_key_env": "SHADOW_CUSTOM_API_A_API_KEY", "access": "free", "auto_fallback": False},
                {"id": "api-b", "label": "API B", "protocol": "anthropic", "model_name": "shadow-custom-api-b", "model": "model-b", "api_base": "https://b.example", "api_key_env": "SHADOW_CUSTOM_API_B_API_KEY", "access": "paid", "auto_fallback": False},
            ]
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "providers.local.yaml"
            path.write_text(yaml.safe_dump(providers), encoding="utf-8")
            with patch.object(shadow, "LOCAL_PROVIDERS", path):
                config = shadow.build_config({
                    "LITELLM_MASTER_KEY": "local-secret",
                    "SHADOW_CUSTOM_API_A_API_KEY": "secret-a",
                    "SHADOW_CUSTOM_API_B_API_KEY": "secret-b",
                })
        rows = {row["model_name"]: row["litellm_params"] for row in config["model_list"]}
        self.assertEqual(rows["shadow-custom-api-a"]["model"], "openai/vendor/model-a")
        self.assertEqual(rows["shadow-custom-api-b"]["model"], "anthropic/model-b")
        self.assertEqual(rows["shadow-custom-api-a"]["api_key"], "os.environ/SHADOW_CUSTOM_API_A_API_KEY")
        self.assertNotIn("secret-a", str(config))
        self.assertNotIn("secret-b", str(config))
        self.assertEqual(config["router_settings"]["fallbacks"], [{"shadow-auto": ["shadow-local"]}])

    def test_private_custom_provider_without_key_is_not_enabled(self):
        providers = {
            "providers": [
                {"id": "api-a", "label": "API A", "protocol": "openai", "model_name": "shadow-custom-api-a", "model": "vendor/model-a", "api_base": "https://a.example/v1", "api_key_env": "SHADOW_CUSTOM_API_A_API_KEY", "access": "unknown", "auto_fallback": False},
            ]
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "providers.local.yaml"
            path.write_text(yaml.safe_dump(providers), encoding="utf-8")
            with patch.object(shadow, "LOCAL_PROVIDERS", path):
                config = shadow.build_config({"LITELLM_MASTER_KEY": "local-secret"})
        self.assertNotIn("shadow-custom-api-a", [row["model_name"] for row in config["model_list"]])

    def test_paid_custom_provider_needs_charge_consent_even_if_flag_is_true(self):
        providers = {
            "providers": [
                {"id": "paid-api", "label": "Paid API", "protocol": "openai", "model_name": "shadow-custom-paid-api", "model": "vendor/model", "api_base": "https://paid.example/v1", "api_key_env": "SHADOW_CUSTOM_PAID_API_API_KEY", "access": "paid", "auto_fallback": True, "allow_charges": False},
            ]
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "providers.local.yaml"
            path.write_text(yaml.safe_dump(providers), encoding="utf-8")
            with patch.object(shadow, "LOCAL_PROVIDERS", path):
                config = shadow.build_config({"LITELLM_MASTER_KEY": "local-secret", "SHADOW_CUSTOM_PAID_API_API_KEY": "paid-key"})
        fallbacks = config["router_settings"]["fallbacks"][0]["shadow-auto"]
        self.assertEqual(fallbacks, ["shadow-local"])
        self.assertIn("shadow-custom-paid-api", [row["model_name"] for row in config["model_list"]])

    def test_custom_provider_can_be_opted_into_auto_fallback(self):
        providers = {
            "providers": [
                {"id": "api-a", "label": "API A", "protocol": "openai", "model_name": "shadow-custom-api-a", "model": "vendor/model-a", "api_base": "https://a.example/v1", "api_key_env": "SHADOW_CUSTOM_API_A_API_KEY", "access": "free", "auto_fallback": True},
            ]
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "providers.local.yaml"
            path.write_text(yaml.safe_dump(providers), encoding="utf-8")
            with patch.object(shadow, "LOCAL_PROVIDERS", path):
                config = shadow.build_config({"LITELLM_MASTER_KEY": "local-secret", "SHADOW_CUSTOM_API_A_API_KEY": "api-key"})
        self.assertEqual(config["model_list"][1]["model_name"], "shadow-auto")
        self.assertEqual(config["model_list"][1]["litellm_params"]["model"], "openai/vendor/model-a")
        self.assertEqual(config["router_settings"]["fallbacks"], [{"shadow-auto": ["shadow-local"]}])


class AddProviderWizardTests(unittest.TestCase):
    def test_wizard_keeps_key_out_of_provider_metadata_and_console(self):
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / ".env"
            providers_path = Path(directory) / "providers.local.yaml"
            prompts = ["my-api", "My API", "1", "https://api.example/v1", "vendor/model-x", "free", "n"]
            output = io.StringIO()
            with patch.object(shadow, "ENV_FILE", env_path), patch.object(shadow, "LOCAL_PROVIDERS", providers_path), patch("builtins.input", side_effect=prompts), patch("getpass.getpass", return_value="top-secret-key"), contextlib.redirect_stdout(output):
                result = shadow.add_provider(None)
            self.assertEqual(result, 0)
            self.assertIn("SHADOW_CUSTOM_MY_API_API_KEY=top-secret-key", env_path.read_text(encoding="utf-8"))
            metadata = providers_path.read_text(encoding="utf-8")
            self.assertIn("shadow-custom-my-api", metadata)
            self.assertNotIn("top-secret-key", metadata)
            self.assertNotIn("top-secret-key", output.getvalue())
            saved = yaml.safe_load(metadata)
            self.assertFalse(saved["providers"][0]["auto_fallback"])
            if hasattr(env_path.stat(), "st_mode"):
                self.assertEqual(env_path.stat().st_mode & 0o777, 0o600)

    def test_custom_provider_rejects_newline_in_api_key(self):
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / ".env"
            providers_path = Path(directory) / "providers.local.yaml"
            prompts = ["injection-api", "Injection API", "1", "https://api.example/v1", "vendor/model-x", "free", "n"]
            output = io.StringIO()
            with patch.object(shadow, "ENV_FILE", env_path), patch.object(shadow, "LOCAL_PROVIDERS", providers_path), patch("builtins.input", side_effect=prompts), patch("getpass.getpass", return_value="valid-key\nINJECTED=value"), contextlib.redirect_stdout(output):
                result = shadow.add_provider(None)
            self.assertEqual(result, 2)
            self.assertFalse(env_path.exists())
            self.assertFalse(providers_path.exists())
            self.assertNotIn("INJECTED", output.getvalue())

    def test_paid_provider_requires_explicit_sim_confirmation_for_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / ".env"
            providers_path = Path(directory) / "providers.local.yaml"
            prompts = ["paid-api", "Paid API", "1", "https://api.example/v1", "vendor/model-x", "paid", "SIM"]
            with patch.object(shadow, "ENV_FILE", env_path), patch.object(shadow, "LOCAL_PROVIDERS", providers_path), patch("builtins.input", side_effect=prompts), patch("getpass.getpass", return_value="paid-secret"), contextlib.redirect_stdout(io.StringIO()):
                result = shadow.add_provider(None)
            saved = yaml.safe_load(providers_path.read_text(encoding="utf-8"))
            self.assertEqual(result, 0)
            self.assertTrue(saved["providers"][0]["auto_fallback"])
            self.assertTrue(saved["providers"][0]["allow_charges"])

    def test_paid_custom_provider_with_recorded_consent_can_join_fallback(self):
        providers = {
            "providers": [
                {"id": "paid-api", "label": "Paid API", "protocol": "openai", "model_name": "shadow-custom-paid-api", "model": "vendor/model", "api_base": "https://paid.example/v1", "api_key_env": "SHADOW_CUSTOM_PAID_API_API_KEY", "access": "paid", "auto_fallback": True, "allow_charges": True},
            ]
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "providers.local.yaml"
            path.write_text(yaml.safe_dump(providers), encoding="utf-8")
            with patch.object(shadow, "LOCAL_PROVIDERS", path):
                config = shadow.build_config({"LITELLM_MASTER_KEY": "local-secret", "SHADOW_CUSTOM_PAID_API_API_KEY": "paid-key"})
        self.assertEqual(config["model_list"][1]["model_name"], "shadow-auto")
        self.assertEqual(config["model_list"][1]["litellm_params"]["model"], "openai/vendor/model")


class NpmCredentialBridgeTests(unittest.TestCase):
    def test_import_credentials_allows_catalog_keys_and_keeps_them_private(self):
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / ".env"
            env_path.write_text("LITELLM_MASTER_KEY=local-master\n", encoding="utf-8")
            output = io.StringIO()
            secret = "gemini secret with spaces"
            with patch.object(shadow, "ENV_FILE", env_path), contextlib.redirect_stdout(output):
                result = shadow.save_provider_credentials({"GEMINI_API_KEY": secret})
                loaded = shadow.read_env()
            saved = env_path.read_text(encoding="utf-8")
            self.assertEqual(result, 0)
            self.assertIn("GEMINI_API_KEY=", saved)
            self.assertEqual(loaded["GEMINI_API_KEY"], secret)
            self.assertNotIn(secret, output.getvalue())
            self.assertEqual(env_path.stat().st_mode & 0o777, 0o600)

    def test_import_credentials_rejects_master_key_and_unknown_variables(self):
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / ".env"
            with patch.object(shadow, "ENV_FILE", env_path):
                with self.assertRaises(ValueError):
                    shadow.save_provider_credentials({"LITELLM_MASTER_KEY": "overwrite"})
                with self.assertRaises(ValueError):
                    shadow.save_provider_credentials({"UNKNOWN_TOKEN": "secret"})
            self.assertFalse(env_path.exists())

    def test_import_credentials_rejects_newlines(self):
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / ".env"
            with patch.object(shadow, "ENV_FILE", env_path):
                with self.assertRaises(ValueError):
                    shadow.save_provider_credentials({"GEMINI_API_KEY": "secret\nINJECTED=1"})
            self.assertFalse(env_path.exists())


class OnboardingTests(unittest.TestCase):
    def test_onboarding_menu_shows_client_setup_and_finishes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env_path = root / ".env"
            env_path.write_text("LITELLM_MASTER_KEY=local-test-key\\n", encoding="utf-8")
            config_path = root / "shadow.yaml"
            config_path.write_text("model_list: []\\n", encoding="utf-8")
            python_path = root / "python"
            python_path.write_text("test", encoding="utf-8")
            output = io.StringIO()
            with patch.object(shadow, "ENV_FILE", env_path), patch.object(shadow, "LOCAL_CONFIG", config_path), patch.object(shadow, "pybin", return_value=python_path), patch("builtins.input", side_effect=["4", "5"]), contextlib.redirect_stdout(output):
                result = shadow.onboard(None)
            self.assertEqual(result, 0)
            self.assertIn("http://127.0.0.1:4000/v1", output.getvalue())
            self.assertIn("integracao-clientes.md", output.getvalue())
            self.assertIn("Pronto. Inicie o serviço", output.getvalue())

    def test_catalog_wizard_saves_only_local_env_and_refreshes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env_path = root / ".env"
            env_path.write_text("LITELLM_MASTER_KEY=local-test-key\\n", encoding="utf-8")
            config_path = root / "shadow.yaml"
            output = io.StringIO()
            with patch.object(shadow, "ENV_FILE", env_path), patch.object(shadow, "LOCAL_CONFIG", config_path), patch("builtins.input", side_effect=["1"]), patch("getpass.getpass", return_value="gemini-private-test-key"), contextlib.redirect_stdout(output):
                result = shadow.configure_catalog_interactively()
            self.assertEqual(result, 0)
            self.assertIn("GEMINI_API_KEY=gemini-private-test-key", env_path.read_text(encoding="utf-8"))
            generated = config_path.read_text(encoding="utf-8")
            self.assertIn("shadow-gemini-flash", generated)
            self.assertNotIn("gemini-private-test-key", generated)
            self.assertNotIn("gemini-private-test-key", output.getvalue())
            self.assertEqual(env_path.stat().st_mode & 0o777, 0o600)

    def test_ollama_status_reports_missing_binary(self):
        with patch.object(shadow.shutil, "which", return_value=None):
            available, detail = shadow.ollama_status()
        self.assertFalse(available)
        self.assertIn("não encontrado", detail)

    def test_first_onboard_bootstrap_creates_private_master_key(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env.example").write_text("# empty template", encoding="utf-8")
            env_path = root / ".env"
            python_path = root / ".venv" / "bin" / "python"
            output = io.StringIO()
            with patch.object(shadow, "ROOT", root), patch.object(shadow, "ENV_FILE", env_path), patch.object(shadow, "pybin", return_value=python_path), patch.object(shadow, "ensure_venv") as ensure, patch.object(shadow.subprocess, "call", side_effect=[0, 0]) as call, contextlib.redirect_stdout(output):
                result = shadow.onboard(None)
            self.assertEqual(result, 0)
            ensure.assert_called_once()
            self.assertIn("LITELLM_MASTER_KEY=sk-shadow-", env_path.read_text(encoding="utf-8"))
            self.assertEqual(env_path.stat().st_mode & 0o777, 0o600)
            self.assertIn("_finish_setup", call.call_args_list[0].args[0])
            self.assertIn("onboard", call.call_args_list[1].args[0])
            self.assertNotIn("sk-shadow-", output.getvalue())

    def test_onboard_command_is_registered(self):
        import subprocess
        result = subprocess.run([sys.executable, str(MODULE), "--help"], text=True, capture_output=True, check=True)
        self.assertIn("onboard", result.stdout)


if __name__ == "__main__":
    unittest.main()
