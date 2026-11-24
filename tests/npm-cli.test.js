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
  assert.deepEqual(packageJson.bin, { 'shadow-gateway': 'bin/shadow.js' });
});

test('the CLI provides help without trying to bootstrap Python', () => {
  const script = path.resolve('bin/shadow.js');
  const result = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /npx shadow-gateway/);
  assert.match(result.stdout, /shadow-gateway start/);
  assert.match(result.stdout, /shadow-gateway doctor/);
});
