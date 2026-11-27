import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
  RUNTIME_FILES,
  copyRuntime,
  findExecutable,
  getInstallDir,
  getPlatformInfo,
  getPythonVenvPath,
  parseDotEnv,
  checkOllama,
  ensurePython,
  showStatus,
  getConfiguredAliases,
  compareVersions,
  checkForCliUpdate,
  inspectInstallation,
  resetManagedRuntime,
  createRuntimeBackup,
  recoverInterruptedInstall,
  acquireInstallLock,
  __test__,
} from '../src/installer.js';

test('getInstallDir uses SHADOW_HOME when provided', () => {
  const home = path.join(os.tmpdir(), 'shadow-home-test');
  assert.equal(getInstallDir({ SHADOW_HOME: './custom-shadow' }, home), path.resolve('./custom-shadow'));
});

test('getInstallDir defaults to a hidden folder under the user home', () => {
  const home = path.join(os.tmpdir(), 'shadow-default-home');
  assert.equal(getInstallDir({}, home), path.join(home, '.shadow'));
});

test('platform detection accepts Linux, macOS and Windows x64/arm64', () => {
  assert.equal(getPlatformInfo('linux', 'x64').supported, true);
  assert.equal(getPlatformInfo('darwin', 'arm64').supported, true);
  assert.equal(getPlatformInfo('win32', 'x64').supported, true);
  assert.equal(getPlatformInfo('freebsd', 'x64').supported, false);
  assert.equal(getPlatformInfo('linux', 'ia32').architecture, false);
});

test('parseDotEnv recognizes exported values without exposing or mutating them', () => {
  const parsed = parseDotEnv([
    '# private file',
    'A=plain',
    "B='quoted value'",
    'export C=value',
    'BAD LINE',
    '=empty',
  ].join('\n'));
  assert.deepEqual(parsed, { A: 'plain', B: 'quoted value', C: 'value' });
});

test('findExecutable searches PATH entries using the native executable suffix', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-bin-'));
  try {
    const executable = path.join(directory, process.platform === 'win32' ? 'uv.exe' : 'uv');
    fs.writeFileSync(executable, process.platform === 'win32' ? 'binary-placeholder' : '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    assert.equal(findExecutable('uv', { PATH: directory }, directory), executable);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('findExecutable honors Windows PATHEXT when Windows environment is simulated', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-win-bin-'));
  try {
    const executable = path.join(directory, 'uv.exe');
    fs.writeFileSync(executable, 'binary-placeholder', { mode: 0o755 });
    assert.equal(findExecutable('uv', { OS: 'Windows_NT', PATH: directory, PATHEXT: '.EXE;.CMD;.BAT' }, directory), executable);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Python venv paths use platform-specific executable locations', () => {
  const root = path.join(os.tmpdir(), 'shadow-paths');
  assert.equal(getPythonVenvPath(root, 'linux'), path.join(root, '.venv', 'bin', 'python'));
  assert.equal(getPythonVenvPath(root, 'win32'), path.join(root, '.venv', 'Scripts', 'python.exe'));
});

test('clean runtime reset removes only Shadow-managed dependencies and preserves user data', () => {
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-clean-reset-'));
  try {
    fs.mkdirSync(path.join(installDir, '.venv', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(installDir, '.venv', 'bin', 'python'), 'broken');
    fs.mkdirSync(path.join(installDir, '.cache', 'shadow-installer'), { recursive: true });
    fs.writeFileSync(path.join(installDir, '.cache', 'shadow-installer', 'partial'), 'partial');
    fs.mkdirSync(path.join(installDir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(installDir, '.env'), 'API_KEY=keep-me');
    fs.writeFileSync(path.join(installDir, 'config', 'shadow.yaml'), 'model_list: []');
    fs.writeFileSync(path.join(installDir, 'user-data.db'), 'keep-me-too');
    resetManagedRuntime(installDir);
    assert.equal(fs.existsSync(path.join(installDir, '.venv')), false);
    assert.equal(fs.existsSync(path.join(installDir, '.cache', 'shadow-installer')), false);
    assert.equal(fs.readFileSync(path.join(installDir, '.env'), 'utf8'), 'API_KEY=keep-me');
    assert.equal(fs.readFileSync(path.join(installDir, 'config', 'shadow.yaml'), 'utf8'), 'model_list: []');
    assert.equal(fs.readFileSync(path.join(installDir, 'user-data.db'), 'utf8'), 'keep-me-too');
  } finally {
    fs.rmSync(installDir, { recursive: true, force: true });
  }
});

test('runtime sync preserves user credentials and local configuration', () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-package-'));
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-install-'));
  try {
    for (const relative of RUNTIME_FILES) {
      const source = path.join(packageRoot, relative);
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, 'package:' + relative);
    }
    const privateFiles = [
      ['.env', 'LOCAL_SECRET=do-not-touch'],
      ['config/shadow.yaml', 'local: true'],
      ['config/providers.local.yaml', 'providers: []'],
    ];
    for (const [relative, content] of privateFiles) {
      const destination = path.join(installDir, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, content);
    }

    const result = copyRuntime(packageRoot, installDir, '0.1.0');
    assert.equal(result.changed, true);
    assert.equal(result.copied, RUNTIME_FILES.length);
    for (const [relative, content] of privateFiles) {
      assert.equal(fs.readFileSync(path.join(installDir, relative), 'utf8'), content);
    }
    assert.equal(fs.readFileSync(path.join(installDir, 'scripts/shadow.py'), 'utf8'), 'package:scripts/shadow.py');
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
    assert.equal(manifest.packageVersion, '0.1.0');
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
    fs.rmSync(installDir, { recursive: true, force: true });
  }
});

test('runtime update replaces managed files but never overwrites local credentials', () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-package-update-'));
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-install-update-'));
  try {
    for (const relative of RUNTIME_FILES) {
      const source = path.join(packageRoot, relative);
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, 'v1:' + relative);
    }
    copyRuntime(packageRoot, installDir, '0.1.0');
    fs.writeFileSync(path.join(packageRoot, 'scripts/shadow.py'), 'v2:shadow.py');
    fs.writeFileSync(path.join(installDir, '.env'), 'LOCAL_SECRET=private');
    const result = copyRuntime(packageRoot, installDir, '0.2.0');
    assert.equal(result.changed, true);
    assert.equal(fs.readFileSync(path.join(installDir, 'scripts/shadow.py'), 'utf8'), 'v2:shadow.py');
    assert.equal(fs.readFileSync(path.join(installDir, '.env'), 'utf8'), 'LOCAL_SECRET=private');
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
    fs.rmSync(installDir, { recursive: true, force: true });
  }
});

test('runtime sync locks down private installation files on POSIX', { skip: process.platform === 'win32' }, () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-package-permissions-'));
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-install-permissions-'));
  try {
    for (const relative of RUNTIME_FILES) {
      const source = path.join(packageRoot, relative);
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, 'package:' + relative);
    }
    fs.mkdirSync(path.join(installDir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(installDir, '.env'), 'LITELLM_MASTER_KEY=private-master-key');
    fs.writeFileSync(path.join(installDir, 'config', 'shadow.yaml'), 'model_list: []');
    fs.chmodSync(installDir, 0o755);
    fs.chmodSync(path.join(installDir, '.env'), 0o644);
    copyRuntime(packageRoot, installDir, '0.1.0');
    assert.equal(fs.statSync(installDir).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(installDir, 'config')).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(installDir, '.env')).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.join(installDir, 'config', 'shadow.yaml')).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
    fs.rmSync(installDir, { recursive: true, force: true });
  }
});

test('doctor inspects configuration and private permissions without exposing secrets', { skip: process.platform === 'win32' }, () => {
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-doctor-inspect-'));
  try {
    fs.mkdirSync(path.join(installDir, 'config'), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(installDir, '.venv', 'bin'), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(installDir, '.shadow-cli.json'), JSON.stringify({ packageVersion: '0.1.9' }), { mode: 0o600 });
    fs.writeFileSync(path.join(installDir, '.env'), 'LITELLM_MASTER_KEY=do-not-print-this-secret\n', { mode: 0o600 });
    fs.writeFileSync(path.join(installDir, '.venv', 'bin', 'python'), '', { mode: 0o700 });
    fs.writeFileSync(path.join(installDir, '.venv', 'bin', 'litellm'), '', { mode: 0o700 });
    fs.writeFileSync(path.join(installDir, 'config', 'shadow.yaml'), 'model_list:\n  - model_name: shadow-local\n    litellm_params: {}\n  - model_name: shadow-auto\n    litellm_params: {}\n', { mode: 0o600 });
    const checks = inspectInstallation(installDir);
    assert.ok(checks.every((item) => item.ok), JSON.stringify(checks));
    assert.equal(JSON.stringify(checks).includes('do-not-print-this-secret'), false);
    fs.chmodSync(path.join(installDir, '.env'), 0o644);
    const unsafe = inspectInstallation(installDir);
    assert.equal(unsafe.find((item) => item.label === '.env permissions').ok, false);
  } finally {
    fs.rmSync(installDir, { recursive: true, force: true });
  }
});

test('doctor reports missing runtime instead of silently installing it', () => {
  const installDir = path.join(os.tmpdir(), 'shadow-doctor-missing-' + process.pid);
  const checks = inspectInstallation(installDir);
  assert.ok(checks.some((item) => item.label === 'Runtime directory' && !item.ok));
  assert.ok(checks.some((item) => item.label === 'Local master key' && !item.ok));
});

test('Python provisioning ignores an activated unrelated project venv', { skip: process.platform === 'win32' }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-python-provision-'));
  try {
    const uv = path.join(directory, 'uv');
    const python = path.join(directory, 'managed-python');
    const logPath = path.join(directory, 'uv-args.log');
    fs.writeFileSync(python, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    fs.writeFileSync(uv, [
      '#!/bin/sh',
      'if [ "${VIRTUAL_ENV+x}" = x ]; then echo inherited-venv-leaked >> "$SHADOW_FAKE_LOG"; exit 4; fi',
      'if [ "$UV_MANAGED_PYTHON" != "1" ]; then echo managed-python-flag-missing >> "$SHADOW_FAKE_LOG"; exit 5; fi',
      'printf "%s\n" "$*" >> "$SHADOW_FAKE_LOG"',
      'if [ "$1" = python ] && [ "$2" = find ]; then printf "%s\n" "$SHADOW_FAKE_PYTHON"; fi',
      'exit 0',
      '',
    ].join('\n'), { mode: 0o755 });
    const result = await ensurePython(uv, {
      env: {
        ...process.env,
        VIRTUAL_ENV: '/home/user/another-project/.venv',
        CONDA_PREFIX: '/home/user/conda-env',
        SHADOW_FAKE_PYTHON: python,
        SHADOW_FAKE_LOG: logPath,
      },
    });
    assert.equal(result, python);
    const logged = fs.readFileSync(logPath, 'utf8');
    assert.match(logged, /python find --managed-python --no-project 3\.12/u);
    assert.doesNotMatch(logged, /inherited-venv-leaked|managed-python-flag-missing/u);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Ollama detection uses the local tags API and exposes installed chat model names', async () => {
  let requestedUrl = '';
  const result = await checkOllama({
    executableFinder: () => '/usr/bin/ollama',
    fetchImpl: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({ models: [{ name: 'nomic-embed-text:latest' }, { name: 'qwen3.5:4b' }] }),
      };
    },
  });
  assert.equal(requestedUrl, 'http://127.0.0.1:11434/api/tags');
  assert.deepEqual(result, { installed: true, running: true, models: ['nomic-embed-text:latest', 'qwen3.5:4b'] });
});

test('Ollama timeouts are reported as optional runtime unavailability, not thrown', async () => {
  const result = await checkOllama({
    executableFinder: () => '/usr/bin/ollama',
    fetchImpl: async () => { throw new Error('timeout'); },
  });
  assert.equal(result.installed, true);
  assert.equal(result.running, false);
  assert.deepEqual(result.models, []);
  assert.match(result.detail, /timeout/u);
});

test('missing Ollama binary is treated as optional', async () => {
  assert.deepEqual(await checkOllama({ executableFinder: () => null }), {
    installed: false, running: false, models: [],
  });
});

test('the npm package exposes a collision-safe shadow-gateway executable', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  assert.deepEqual(packageJson.bin, { 'shadow-gateway': 'bin/shadow.js', 'shadow-repository': 'bin/repository.js', 'shadow-feedback': 'bin/feedback.js', 'shadow-help': 'bin/help.js' });
});

test('doctor diagnoses a missing install without bootstrapping or creating files', { skip: process.platform === 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-doctor-cli-'));
  const installDir = path.join(root, 'not-installed');
  try {
    const result = spawnSync(process.execPath, [path.resolve('bin/shadow.js'), 'doctor'], {
      encoding: 'utf8', env: { ...process.env, SHADOW_HOME: installDir }, timeout: 12000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout + result.stderr, /CLI runtime manifest: PROBLEM/u);
    assert.equal(fs.existsSync(installDir), false, 'doctor must not create even update-cache files');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the CLI provides help without trying to bootstrap Python', () => {
  const script = path.resolve('bin/shadow.js');
  const result = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /npx shadow-gateway/);
  assert.match(result.stdout, /shadow-gateway start/);
  assert.match(result.stdout, /shadow-gateway doctor/);
});


test('status falls back to local aliases when LiteLLM DB-less auth blocks model discovery', async () => {
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-status-db-less-'));
  const originalFetch = globalThis.fetch;
  const messages = [];
  const originalWarn = console.warn;
  const originalLog = console.log;
  try {
    fs.mkdirSync(path.join(installDir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(installDir, '.env'), 'LITELLM_MASTER_KEY=test-key\n');
    fs.writeFileSync(path.join(installDir, 'config', 'shadow.yaml'), [
      'model_list:',
      '  - model_name: shadow-local',
      '    litellm_params: { model: ollama_chat/test }',
      '  - model_name: shadow-auto',
      '    litellm_params: { model: ollama_chat/test }',
      '  - model_name: shadow-custom-demo',
      '    litellm_params: { model: openai/test }',
    ].join('\n'));
    globalThis.fetch = async (url) => url.endsWith('/health/liveliness')
      ? { ok: true, status: 200 }
      : { ok: false, status: 400, json: async () => ({ error: { type: 'no_db_connection' } }) };
    console.warn = (...args) => messages.push(args.join(' '));
    console.log = (...args) => messages.push(args.join(' '));
    assert.deepEqual(getConfiguredAliases(installDir), ['shadow-local', 'shadow-auto', 'shadow-custom-demo']);
    const result = await showStatus(installDir);
    assert.equal(result, 0);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    console.log = originalLog;
    fs.rmSync(installDir, { recursive: true, force: true });
  }
});


test('Python runtime is hash-locked and included in the npm package', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  const lock = fs.readFileSync(path.resolve('requirements.lock'), 'utf8');
  assert.ok(packageJson.files.includes('requirements.lock'));
  assert.ok(RUNTIME_FILES.includes('requirements.lock'));
  assert.match(lock, /^litellm==1\.110\.3/mu);
  assert.match(lock, /^pyyaml==6\.0\.4/mu);
  assert.match(lock, /--hash=sha256:/u);
});

test('package manifest and lockfile expose identical npm command shims', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.resolve('package-lock.json'), 'utf8'));
  assert.deepEqual(lock.packages[''].bin, packageJson.bin);
});

test('npm package exposes dedicated repository and feedback commands', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  assert.equal(packageJson.bin['shadow-repository'], 'bin/repository.js');
  assert.equal(packageJson.bin['shadow-feedback'], 'bin/feedback.js');
  for (const file of ['bin/repository.js', 'bin/feedback.js']) assert.equal(fs.existsSync(path.resolve(file)), true);
});

test('CLI help documents the clean reinstall command', () => {
  const result = spawnSync(process.execPath, ['bin/shadow.js', '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /shadow-gateway reinstall/u);
  assert.match(result.stdout, /preserve credentials/u);
  assert.match(result.stdout, /provider catalog, activation status and custom providers/u);
});

test('CLI help documents repository and feedback commands', () => {
  const result = spawnSync(process.execPath, [path.resolve('bin/shadow.js'), '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /shadow-repository/u);
  assert.match(result.stdout, /shadow-feedback/u);
});

test('version comparison detects newer npm releases', () => {
  assert.equal(compareVersions('0.1.7', '0.1.8'), 1);
  assert.equal(compareVersions('0.1.8', '0.1.7'), -1);
  assert.equal(compareVersions('0.1.7', '0.1.7'), 0);
  assert.equal(compareVersions('invalid', '0.1.8'), 0);
});

test('update check caches registry metadata and returns only newer versions', async () => {
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-update-check-'));
  let requests = 0;
  try {
    const fetchImpl = async () => { requests += 1; return { ok: true, json: async () => ({ version: '0.1.8' }) }; };
    assert.equal(await checkForCliUpdate('0.1.7', { installDir, fetchImpl, now: 100000 }), '0.1.8');
    assert.equal(await checkForCliUpdate('0.1.7', { installDir, fetchImpl, now: 100001 }), '0.1.8');
    assert.equal(requests, 1);
    assert.equal(await checkForCliUpdate('0.1.8', { installDir, fetchImpl, now: 100002 }), null);
  } finally { fs.rmSync(installDir, { recursive: true, force: true }); }
});

test('update check fails silently when registry is unavailable', async () => {
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-update-offline-'));
  try {
    assert.equal(await checkForCliUpdate('0.1.7', { installDir, fetchImpl: async () => { throw new Error('offline'); } }), null);
  } finally { fs.rmSync(installDir, { recursive: true, force: true }); }
});

test('offline update checks are throttled for one hour', async () => {
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-update-throttle-'));
  let requests = 0;
  try {
    const fetchImpl = async () => { requests += 1; throw new Error('offline'); };
    assert.equal(await checkForCliUpdate('0.1.7', { installDir, fetchImpl, now: 100000 }), null);
    assert.equal(await checkForCliUpdate('0.1.7', { installDir, fetchImpl, now: 100001 }), null);
    assert.equal(requests, 1);
  } finally { fs.rmSync(installDir, { recursive: true, force: true }); }
});


test('dedicated community commands display update notices and open their own URLs', { skip: process.platform !== 'linux' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-community-cli-'));
  const home = path.join(root, 'home');
  const bin = path.join(root, 'bin');
  const cache = path.join(home, '.cache');
  const urls = path.join(root, 'opened-urls.txt');
  fs.mkdirSync(cache, { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  try {
    fs.writeFileSync(path.join(cache, 'npm-update-check.json'), JSON.stringify({ checkedAt: Date.now(), latestVersion: '999.0.0' }));
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    fs.writeFileSync(path.join(bin, opener), '#!/bin/sh\nprintf "%s\\n" "$1" >> "$SHADOW_CAPTURED_URLS"\n', { mode: 0o755 });
    const env = { ...process.env, SHADOW_HOME: home, SHADOW_CAPTURED_URLS: urls, PATH: bin + path.delimiter + process.env.PATH };
    const installedVersion = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')).version;
    for (const [file, expectedUrl] of [
      ['repository.js', 'https://github.com/Ninja7z/shadow'],
      ['feedback.js', 'https://github.com/Ninja7z/shadow/issues/new/choose'],
    ]) {
      const result = spawnSync(process.execPath, [path.resolve('bin', file)], { encoding: 'utf8', env, timeout: 5000 });
      assert.equal(result.status, 0, result.stderr);
      assert.ok((result.stdout + result.stderr).includes(`A new Shadow CLI version is available: 999.0.0 (you have ${installedVersion}).`));
      const opened = fs.readFileSync(urls, 'utf8').trim().split(/\r?\n/u);
      assert.equal(opened.at(-1), expectedUrl);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('dedicated community wrappers pass package version into the update checker', () => {
  for (const [file, command] of [['bin/repository.js', 'repository'], ['bin/feedback.js', 'feedback']]) {
    const source = fs.readFileSync(path.resolve(file), 'utf8');
    assert.match(source, /createRequire\(import\.meta\.url\)/u);
    assert.ok(source.includes("const { version } = require('../package.json');"));
    assert.ok(source.includes(`runCli(['${command}'], { packageVersion: version })`));
  }
});


test('community subcommands route to the repository and feedback destinations', () => {
  const source = fs.readFileSync(path.resolve('src/installer.js'), 'utf8');
  assert.ok(source.includes("const GITHUB_REPO = 'https://github.com/Ninja7z/shadow';"));
  assert.ok(source.includes("const ISSUES_URL = GITHUB_REPO + '/issues/new/choose';"));
  assert.ok(source.includes("openExternal(GITHUB_REPO)"));
  assert.ok(source.includes("openExternal(ISSUES_URL)"));
});


test('shadow-help is a dedicated executable and prints bilingual explanations for every CLI command', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  assert.equal(packageJson.bin['shadow-help'], 'bin/help.js');
  assert.equal(fs.existsSync(path.resolve('bin/help.js')), true);
  const result = spawnSync(process.execPath, ['bin/help.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  for (const command of [
    'shadow-help', 'shadow-gateway setup', 'shadow-gateway onboard', 'shadow-gateway start',
    'shadow-gateway status', 'shadow-gateway doctor',
    'shadow-gateway provider list', 'shadow-gateway provider add',
    'shadow-gateway provider refresh', 'shadow-gateway clients',
    'shadow-gateway update', 'shadow-gateway reinstall',
    'shadow-repository', 'shadow-feedback',
  ]) assert.match(result.stdout, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  assert.match(result.stdout, /EN:/u);
  assert.match(result.stdout, /PT:/u);
  assert.match(result.stdout, /preserve credentials/u);
  assert.match(result.stdout, /provider catalog, activation status and custom providers/u);
});


test('runtime update rollback restores the previous runtime generation and keeps private user files', () => {
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-rollback-'));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-rollback-package-'));
  try {
    for (const relative of RUNTIME_FILES) {
      const source = path.join(packageRoot, relative);
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, 'v1:' + relative);
    }
    copyRuntime(packageRoot, installDir, '0.1.0');
    const removedInOldGeneration = 'docs/client-integrations.md';
    fs.rmSync(path.join(installDir, removedInOldGeneration));
    fs.mkdirSync(path.join(installDir, '.venv', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(installDir, '.venv', 'bin', 'previous-python'), 'old environment');
    fs.mkdirSync(path.join(installDir, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(installDir, 'bin', 'uv'), 'previous uv');
    fs.writeFileSync(path.join(installDir, '.env'), 'API_KEY=keep-private');
    fs.writeFileSync(path.join(installDir, 'config', 'shadow.yaml'), 'local: true');

    createRuntimeBackup(installDir, '0.1.0', '0.2.0');
    assert.equal(fs.existsSync(path.join(installDir, '.venv')), false);
    for (const relative of RUNTIME_FILES) {
      fs.writeFileSync(path.join(packageRoot, relative), 'v2:' + relative);
    }
    copyRuntime(packageRoot, installDir, '0.2.0');
    fs.mkdirSync(path.join(installDir, '.venv', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(installDir, '.venv', 'bin', 'new-python'), 'new environment');

    const recovered = recoverInterruptedInstall(installDir);
    assert.deepEqual(recovered, { recovered: true, rolledBack: true });
    assert.equal(fs.readFileSync(path.join(installDir, 'scripts/shadow.py'), 'utf8'), 'v1:scripts/shadow.py');
    assert.equal(fs.existsSync(path.join(installDir, removedInOldGeneration)), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(installDir, '.shadow-cli.json'), 'utf8')).packageVersion, '0.1.0');
    assert.equal(fs.readFileSync(path.join(installDir, '.venv', 'bin', 'previous-python'), 'utf8'), 'old environment');
    assert.equal(fs.existsSync(path.join(installDir, '.venv', 'bin', 'new-python')), false);
    assert.equal(fs.readFileSync(path.join(installDir, 'bin', 'uv'), 'utf8'), 'previous uv');
    assert.equal(fs.readFileSync(path.join(installDir, '.env'), 'utf8'), 'API_KEY=keep-private');
    assert.equal(fs.readFileSync(path.join(installDir, 'config', 'shadow.yaml'), 'utf8'), 'local: true');
    assert.equal(fs.existsSync(path.join(installDir, '.shadow-rollback')), false);
    assert.equal(fs.existsSync(path.join(installDir, '.shadow-install-state.json')), false);
  } finally {
    fs.rmSync(installDir, { recursive: true, force: true });
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test('install lock blocks concurrent operations and releases cleanly', () => {
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-lock-'));
  try {
    const release = acquireInstallLock(installDir);
    assert.throws(() => acquireInstallLock(installDir), /already running/u);
    release();
    const releaseAgain = acquireInstallLock(installDir);
    releaseAgain();
    assert.equal(fs.existsSync(path.join(installDir, '.shadow-install.lock')), false);
  } finally {
    fs.rmSync(installDir, { recursive: true, force: true });
  }
});

test('recovery restores the previous venv if the process stops while preparing the rollback generation', () => {
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-rollback-prep-'));
  try {
    const tempBackup = path.join(installDir, '.shadow-rollback.tmp');
    fs.mkdirSync(path.join(installDir, '.venv', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(installDir, '.venv', 'bin', 'python'), 'previous environment');
    fs.mkdirSync(tempBackup, { recursive: true });
    fs.writeFileSync(path.join(tempBackup, 'backup.json'), JSON.stringify({ previousVersion: '0.1.0', packageVersion: '0.2.0', existingFiles: [], hadManifest: false, hadVenv: true }));
    fs.renameSync(path.join(installDir, '.venv'), path.join(tempBackup, '.venv'));
    const recovered = recoverInterruptedInstall(installDir);
    assert.deepEqual(recovered, { recovered: false, rolledBack: false });
    assert.equal(fs.readFileSync(path.join(installDir, '.venv', 'bin', 'python'), 'utf8'), 'previous environment');
    assert.equal(fs.existsSync(tempBackup), false);
  } finally { fs.rmSync(installDir, { recursive: true, force: true }); }
});

test('install lock reclaims a dead same-host process but does not steal an unreadable lock', () => {
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-lock-stale-'));
  const lockPath = path.join(installDir, '.shadow-install.lock');
  try {
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 2147483647, hostname: os.hostname(), startedAt: 'old' }));
    const release = acquireInstallLock(installDir);
    release();
    fs.writeFileSync(lockPath, 'not-json');
    assert.throws(() => acquireInstallLock(installDir), /Lock retained/u);
  } finally { fs.rmSync(installDir, { recursive: true, force: true }); }
});

test('committed update marker prevents recovery from restoring a partially cleaned backup', () => {
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-commit-cleanup-'));
  try {
    fs.mkdirSync(path.join(installDir, '.shadow-rollback'), { recursive: true });
    fs.writeFileSync(path.join(installDir, '.shadow-rollback', 'partial'), 'already being cleaned');
    fs.writeFileSync(path.join(installDir, '.shadow-cli.json'), JSON.stringify({ packageVersion: '0.2.0' }));
    fs.writeFileSync(path.join(installDir, '.shadow-install-state.json'), JSON.stringify({ status: 'committed', packageVersion: '0.2.0' }));
    const recovered = recoverInterruptedInstall(installDir);
    assert.deepEqual(recovered, { recovered: true, rolledBack: false });
    assert.equal(JSON.parse(fs.readFileSync(path.join(installDir, '.shadow-cli.json'), 'utf8')).packageVersion, '0.2.0');
    assert.equal(fs.existsSync(path.join(installDir, '.shadow-rollback')), false);
    assert.equal(fs.existsSync(path.join(installDir, '.shadow-install-state.json')), false);
  } finally { fs.rmSync(installDir, { recursive: true, force: true }); }
});


test('process termination during rollback restoration is idempotently recoverable', () => {
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-kill-rollback-'));
  const oldPackage = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-kill-rollback-old-'));
  const newPackage = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-kill-rollback-new-'));
  const childScript = String.raw`
    import fs from 'node:fs';
    import path from 'node:path';
    import {
      acquireInstallLock, createRuntimeBackup, copyRuntime, restoreRuntimeBackup, RUNTIME_FILES,
    } from './src/installer.js';

    const [installDir, packageRoot] = process.argv.slice(1);
    acquireInstallLock(installDir);
    createRuntimeBackup(installDir, '0.1.0', '0.2.0');
    copyRuntime(packageRoot, installDir, '0.2.0');
    fs.mkdirSync(path.join(installDir, '.venv', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(installDir, '.venv', 'bin', 'python'), 'new-python');
    restoreRuntimeBackup(installDir, {
      onRestoreStep: (kind, relative) => {
        if (kind === 'runtime-file' && relative === RUNTIME_FILES[0]) {
          process.stdout.write('INTENTIONAL_TERMINATION:rollback-mid-restore\\n');
          process.kill(process.pid, 'SIGKILL');
          process.exit(137);
        }
      },
    });
    process.exit(98);
  `;

  try {
    for (const relative of RUNTIME_FILES) {
      for (const [root, version] of [[oldPackage, 'v1'], [newPackage, 'v2']]) {
        const file = path.join(root, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, version + ':' + relative);
      }
    }
    copyRuntime(oldPackage, installDir, '0.1.0');
    fs.mkdirSync(path.join(installDir, '.venv', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(installDir, '.venv', 'bin', 'python'), 'previous-python');
    fs.mkdirSync(path.join(installDir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(installDir, '.env'), 'PRIVATE_TOKEN=keep-this');
    fs.writeFileSync(path.join(installDir, 'config', 'shadow.yaml'), 'local: preserve');

    const crashed = spawnSync(process.execPath, [
      '--input-type=module', '-e', childScript, installDir, newPackage,
    ], { cwd: path.resolve('.'), encoding: 'utf8', timeout: 10000 });
    assert.equal(crashed.error, undefined, 'rollback child must not time out');
    assert.ok(
      crashed.stdout.includes('INTENTIONAL_TERMINATION:rollback-mid-restore'),
      'rollback child must reach the mid-restore interruption checkpoint',
    );

    const release = acquireInstallLock(installDir);
    let recovered;
    try {
      recovered = recoverInterruptedInstall(installDir);
    } finally {
      release();
    }
    assert.deepEqual(recovered, { recovered: true, rolledBack: true });
    assert.equal(fs.readFileSync(path.join(installDir, 'scripts/shadow.py'), 'utf8'), 'v1:scripts/shadow.py');
    assert.equal(fs.readFileSync(path.join(installDir, '.venv', 'bin', 'python'), 'utf8'), 'previous-python');
    assert.equal(fs.readFileSync(path.join(installDir, '.env'), 'utf8'), 'PRIVATE_TOKEN=keep-this');
    assert.equal(fs.readFileSync(path.join(installDir, 'config', 'shadow.yaml'), 'utf8'), 'local: preserve');
    assert.equal(fs.existsSync(path.join(installDir, '.shadow-rollback')), false);
    assert.equal(fs.existsSync(path.join(installDir, '.shadow-install-state.json')), false);
    assert.equal(fs.existsSync(path.join(installDir, '.shadow-install.lock')), false);
  } finally {
    fs.rmSync(installDir, { recursive: true, force: true });
    fs.rmSync(oldPackage, { recursive: true, force: true });
    fs.rmSync(newPackage, { recursive: true, force: true });
  }
});


test('installer orchestration recovers after real child-process termination at runtime phase hooks', async () => {
  const phases = [
    'during_backup_file',
    'during_backup_venv_move',
    'after_backup',
    'during_runtime_sync',
    'after_runtime_sync',
    'after_uv_bootstrap',
    'after_python_provision',
    'after_managed_reset',
    'after_venv_create',
    'after_dependencies',
    'after_import_validation',
    'after_commit',
  ];
  const childScript = String.raw`
    import fs from 'node:fs';
    import path from 'node:path';
    import {
      acquireInstallLock, __test__, RUNTIME_FILES,
    } from './src/installer.js';

    const [installDir, packageRoot, targetPhase] = process.argv.slice(1);
    const release = acquireInstallLock(installDir);
    const phase = (name) => {
      if (name !== targetPhase) return;
      process.stdout.write('INSTALLER_CHECKPOINT:' + name + '\\n');
      process.kill(process.pid, 'SIGKILL');
      process.exit(137);
    };

    const hooks = {
      onPhase: phase,
      onBackupFileCopied: (relative) => {
        if (relative === RUNTIME_FILES[0]) phase('during_backup_file');
      },
      onRuntimeFileCopied: (relative) => {
        if (relative === RUNTIME_FILES[0]) phase('during_runtime_sync');
      },
      ensureUv: async (root) => {
        const uv = path.join(root, 'bin', 'uv');
        fs.mkdirSync(path.dirname(uv), { recursive: true });
        fs.writeFileSync(uv, 'uv-v2');
        return { path: uv, installed: true };
      },
      ensurePython: async () => path.join(installDir, 'test-managed-python'),
      isRuntimeHealthy: async (venvPython) =>
        fs.existsSync(path.resolve(path.dirname(venvPython), '..', 'import-health.ok')),
      run: async (_python, args) => {
        if (args.at(-1) !== 'setup') throw new Error('Unexpected child runtime command in test fixture');
        const venv = path.join(installDir, '.venv');
        const pythonDir = process.platform === 'win32' ? 'Scripts' : 'bin';
        const pythonName = process.platform === 'win32' ? 'python.exe' : 'python';
        const venvPython = path.join(venv, pythonDir, pythonName);
        fs.mkdirSync(path.dirname(venvPython), { recursive: true });
        fs.writeFileSync(venvPython, 'new-python');
        phase('after_venv_create');
        fs.mkdirSync(path.join(venv, 'site-packages', 'litellm'), { recursive: true });
        fs.writeFileSync(path.join(venv, 'site-packages', 'litellm', '__init__.py'), 'installed');
        phase('after_dependencies');
        fs.writeFileSync(path.join(venv, 'import-health.ok'), 'imports-ok');
      },
    };

    await __test__.installCoreDependenciesLocked(installDir, packageRoot, '0.2.0', {
      quiet: true,
      hooks,
    });
    release();
    process.exit(98);
  `;

  for (const targetPhase of phases) {
    const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-installer-orchestration-'));
    const oldPackage = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-installer-old-package-'));
    const newPackage = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-installer-new-package-'));
    try {
      for (const relative of RUNTIME_FILES) {
        for (const [root, version] of [[oldPackage, 'v1'], [newPackage, 'v2']]) {
          const file = path.join(root, relative);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, version + ':' + relative);
        }
      }
      copyRuntime(oldPackage, installDir, '0.1.0');
      const previousPython = getPythonVenvPath(installDir);
      fs.mkdirSync(path.dirname(previousPython), { recursive: true });
      fs.writeFileSync(previousPython, 'previous-python');
      fs.mkdirSync(path.join(installDir, 'bin'), { recursive: true });
      fs.writeFileSync(path.join(installDir, 'bin', 'uv'), 'uv-v1');
      fs.mkdirSync(path.join(installDir, 'config'), { recursive: true });
      fs.writeFileSync(path.join(installDir, '.env'), 'PRIVATE_TOKEN=preserve');
      fs.writeFileSync(path.join(installDir, 'config', 'shadow.yaml'), 'local: keep');
      fs.writeFileSync(path.join(installDir, 'config', 'providers.local.yaml'), 'providers: []');
      fs.writeFileSync(path.join(installDir, 'user-data.db'), 'do-not-delete');

      const crashed = spawnSync(process.execPath, [
        '--input-type=module', '-e', childScript, installDir, newPackage, targetPhase,
      ], { cwd: path.resolve('.'), encoding: 'utf8', timeout: 10000 });
      assert.equal(crashed.error, undefined, targetPhase + ': child must not time out');
      assert.ok(
        crashed.stdout.includes('INSTALLER_CHECKPOINT:' + targetPhase),
        targetPhase + ': actual installer orchestration did not reach the checkpoint. stdout=' +
          crashed.stdout + ' stderr=' + crashed.stderr,
      );

      const release = acquireInstallLock(installDir);
      let recovered;
      try {
        recovered = recoverInterruptedInstall(installDir);
      } finally {
        release();
      }

      const committed = targetPhase === 'after_commit';
      const backupPreparationInterrupted = targetPhase.startsWith('during_backup_');
      assert.deepEqual(
        recovered,
        backupPreparationInterrupted
          ? { recovered: false, rolledBack: false }
          : { recovered: true, rolledBack: !committed },
        targetPhase,
      );
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(installDir, '.shadow-cli.json'), 'utf8')).packageVersion,
        committed ? '0.2.0' : '0.1.0',
        targetPhase,
      );
      assert.equal(
        fs.readFileSync(path.join(installDir, 'scripts/shadow.py'), 'utf8'),
        (committed ? 'v2:' : 'v1:') + 'scripts/shadow.py',
        targetPhase,
      );
      assert.equal(fs.readFileSync(path.join(installDir, '.env'), 'utf8'), 'PRIVATE_TOKEN=preserve', targetPhase);
      assert.equal(fs.readFileSync(path.join(installDir, 'config', 'shadow.yaml'), 'utf8'), 'local: keep', targetPhase);
      assert.equal(fs.readFileSync(path.join(installDir, 'config', 'providers.local.yaml'), 'utf8'), 'providers: []', targetPhase);
      assert.equal(fs.readFileSync(path.join(installDir, 'user-data.db'), 'utf8'), 'do-not-delete', targetPhase);
      assert.equal(fs.existsSync(path.join(installDir, '.shadow-install.lock')), false, targetPhase);
      assert.equal(fs.existsSync(path.join(installDir, '.shadow-rollback')), false, targetPhase);
      assert.equal(fs.existsSync(path.join(installDir, '.shadow-rollback.tmp')), false, targetPhase);
      assert.equal(fs.existsSync(path.join(installDir, '.shadow-install-state.json')), false, targetPhase);
      assert.equal(
        fs.readFileSync(getPythonVenvPath(installDir), 'utf8'),
        committed ? 'new-python' : 'previous-python',
        targetPhase,
      );
      assert.equal(
        fs.readFileSync(path.join(installDir, 'bin', 'uv'), 'utf8'),
        committed ? 'uv-v2' : 'uv-v1',
        targetPhase,
      );
    } finally {
      fs.rmSync(installDir, { recursive: true, force: true });
      fs.rmSync(oldPackage, { recursive: true, force: true });
      fs.rmSync(newPackage, { recursive: true, force: true });
    }
  }
});


test('uv installer download uses an atomic temporary file and removes partial data on stream failure', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-uv-download-'));
  const destination = path.join(directory, 'install-uv.sh');
  try {
    const failedFetch = async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('partial-installer'));
        controller.error(new Error('simulated network interruption'));
      },
    }), { status: 200 });

    await assert.rejects(
      __test__.fetchInstaller('https://unit.test/uv-installer', destination, {
        timeoutMs: 100,
        fetchImpl: failedFetch,
      }),
      /simulated network interruption/u,
    );
    assert.equal(fs.existsSync(destination), false);
    assert.equal(fs.existsSync(destination + '.part'), false);

    await __test__.fetchInstaller('https://unit.test/uv-installer', destination, {
      timeoutMs: 100,
      fetchImpl: async () => new Response('complete-installer', { status: 200 }),
    });
    assert.equal(fs.readFileSync(destination, 'utf8'), 'complete-installer');
    assert.equal(fs.existsSync(destination + '.part'), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('uv installer download timeout leaves no partial installer behind', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-uv-timeout-'));
  const destination = path.join(directory, 'install-uv.sh');
  try {
    const hangingFetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    await assert.rejects(
      __test__.fetchInstaller('https://unit.test/slow-installer', destination, {
        timeoutMs: 25,
        fetchImpl: hangingFetch,
      }),
      /timed out|abort/u,
    );
    assert.equal(fs.existsSync(destination), false);
    assert.equal(fs.existsSync(destination + '.part'), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('run timeout terminates child process trees instead of leaving orphan installers', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-run-tree-'));
  const marker = path.join(directory, 'orphan-survived.txt');
  const childSource = [
    'const { spawn } = require("node:child_process");',
    'const fs = require("node:fs");',
    'const marker = ' + JSON.stringify(marker) + ';',
    'const grandchild = spawn(process.execPath, ["-e", "setTimeout(() => require(\\\"node:fs\\\").writeFileSync(" + JSON.stringify(marker) + ", \\\"orphan\\\"), 1800)"], { stdio: "ignore" });',
    'grandchild.unref();',
    'setInterval(() => {}, 1000);',
  ].join('\n');
  try {
    await assert.rejects(
      __test__.run(process.execPath, ['-e', childSource], {
        timeoutMs: 120,
        stdio: 'ignore',
      }),
      /timed out after 120 ms/u,
    );
    await new Promise((resolve) => setTimeout(resolve, 2100));
    assert.equal(fs.existsSync(marker), false, 'grandchild must not survive a timed-out installer process');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});


test('capture timeout terminates spawned process trees', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-capture-tree-'));
  const marker = path.join(directory, 'capture-orphan-survived.txt');
  const childSource = [
    'const { spawn } = require("node:child_process");',
    'const marker = ' + JSON.stringify(marker) + ';',
    'const grandchild = spawn(process.execPath, ["-e", "setTimeout(() => require(\\\"node:fs\\\").writeFileSync(" + JSON.stringify(marker) + ", \\\"orphan\\\"), 1600)"], { stdio: "ignore" });',
    'grandchild.unref();',
    'setInterval(() => {}, 1000);',
  ].join('\n');
  try {
    await assert.rejects(
      __test__.capture(process.execPath, ['-e', childSource], { timeoutMs: 100 }),
      /timed out after 100 ms/u,
    );
    await new Promise((resolve) => setTimeout(resolve, 1900));
    assert.equal(fs.existsSync(marker), false, 'capture must not leave an orphaned grandchild');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('run abort signal terminates the full process tree', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-run-abort-'));
  const marker = path.join(directory, 'aborted-child-survived.txt');
  const childSource = [
    'const { spawn } = require("node:child_process");',
    'const marker = ' + JSON.stringify(marker) + ';',
    'const grandchild = spawn(process.execPath, ["-e", "setTimeout(() => require(\\\"node:fs\\\").writeFileSync(" + JSON.stringify(marker) + ", \\\"orphan\\\"), 1300)"], { stdio: "ignore" });',
    'grandchild.unref();',
    'setInterval(() => {}, 1000);',
  ].join('\n');
  const controller = new AbortController();
  try {
    const execution = __test__.run(process.execPath, ['-e', childSource], {
      signal: controller.signal,
      stdio: 'ignore',
    });
    setTimeout(() => controller.abort(new Error('test cancellation')), 100);
    await assert.rejects(execution, /test cancellation/u);
    await new Promise((resolve) => setTimeout(resolve, 1600));
    assert.equal(fs.existsSync(marker), false, 'aborted process tree must not leave orphan descendants');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});


test('uv temporary cleanup removes only stale owned temp directories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-uv-cleanup-test-'));
  const stale = fs.mkdtempSync(path.join(root, 'shadow-uv-stale-'));
  const fresh = fs.mkdtempSync(path.join(root, 'shadow-uv-fresh-'));
  const unrelated = fs.mkdtempSync(path.join(root, 'other-installer-'));
  const symlink = path.join(root, 'shadow-uv-link');
  let symlinkCreated = false;
  try {
    fs.writeFileSync(path.join(stale, 'install-uv.sh.part'), 'partial download');
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    fs.utimesSync(stale, old, old);
    try {
      fs.symlinkSync(unrelated, symlink, 'dir');
      symlinkCreated = true;
    } catch (error) {
      if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
    }

    const removed = __test__.cleanupStaleUvTempDirs({ tempRoot: root, now: Date.now() });
    assert.equal(removed, 1);
    assert.equal(fs.existsSync(stale), false);
    assert.equal(fs.existsSync(fresh), true);
    assert.equal(fs.existsSync(unrelated), true);
    if (symlinkCreated) assert.equal(fs.lstatSync(symlink).isSymbolicLink(), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('local HTTP download interruption removes partial uv installer data', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-http-download-'));
  const destination = path.join(directory, 'install-uv.sh');
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Length': '4096', 'Content-Type': 'text/plain' });
    response.write('partial installer body');
    setTimeout(() => response.destroy(), 30);
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    await assert.rejects(
      __test__.fetchInstaller('http://127.0.0.1:' + address.port + '/uv.sh', destination, {
        timeoutMs: 1000,
      }),
    );
    assert.equal(fs.existsSync(destination), false);
    assert.equal(fs.existsSync(destination + '.part'), false);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
