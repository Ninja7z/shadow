import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
  assert.deepEqual(packageJson.bin, { 'shadow-gateway': 'bin/shadow.js', 'shadow-repository': 'bin/repository.js', 'shadow-feedback': 'bin/feedback.js' });
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
