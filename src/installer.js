import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  cancel, confirm, intro, isCancel, log, note, outro, password, select, spinner, text,
} from '@clack/prompts';
import { parse as parseYaml } from 'yaml';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(THIS_DIR, '..');
const UV_VERSION = '0.13.9';
const PYTHON_VERSION = '3.12';
const PACKAGE_NAME = 'shadow-gateway';
const GITHUB_REPO = 'https://github.com/Ninja7z/shadow';
const STAR_URL = GITHUB_REPO + '/stargazers';
const ISSUES_URL = GITHUB_REPO + '/issues/new/choose';
const REGISTRY_LATEST_URL = 'https://registry.npmjs.org/' + PACKAGE_NAME + '/latest';
const UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;
const UPDATE_CHECK_FAILURE_TTL_MS = 60 * 60 * 1000;

export const RUNTIME_FILES = [
  '.env.example', 'requirements.txt', 'requirements.lock', 'LICENSE',
  'config/shadow.example.yaml', 'config/providers.catalog.yaml',
  'config/shadow.runtime.example.yaml', 'config/mcp-hub.example.json',
  'scripts/shadow.py', 'scripts/smoke_test.py', 'scripts/validate_config.py',
  'scripts/shadow-mcp-hub.sh', 'scripts/shadow-mcp-admin.sh',
  'scripts/patch-mcp-hub-compat.mjs',
  'docs/client-integrations.md', 'docs/claude-code.md', 'docs/mcp-hub.md',
  'docs/smoke-tests.md', 'docs/unified-gateway.md',
  'docs/pt-BR/integracao-clientes.md', 'docs/pt-BR/integracao-claude-code.md',
  'docs/pt-BR/hub-mcp.md', 'docs/pt-BR/testes-smoke.md',
  'docs/pt-BR/gateway-unificado.md', 'docs/pt-BR/licenca.md',
];

const PRIVATE_RUNTIME_FILES = new Set([
  '.env', 'config/shadow.yaml', 'config/providers.local.yaml', 'config/runtime.yaml',
]);

const MANAGED_RUNTIME_FILES = [...RUNTIME_FILES, 'bin/uv', 'bin/uv.exe'];

export function getInstallDir(env = process.env, home = os.homedir()) {
  return path.resolve((env.SHADOW_HOME || '').trim() || path.join(home, '.shadow'));
}

export function getPlatformInfo(platform = process.platform, arch = process.arch) {
  const supported = ['linux', 'darwin', 'win32'].includes(platform);
  const architecture = ['x64', 'arm64'].includes(arch);
  return { platform, arch, supported, architecture, label: platform + '/' + arch };
}

export function parseDotEnv(input) {
  const values = {};
  for (const raw of String(input).split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7).trimStart() : line;
    const separator = normalized.indexOf('=');
    if (separator < 1) continue;
    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) continue;
    if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    } else if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function pathEntries(env = process.env) {
  return String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
}

export function findExecutable(name, env = process.env, home = os.homedir()) {
  const windows = env.OS === 'Windows_NT' || process.platform === 'win32';
  const extensions = windows
    ? (env.PATHEXT || '.EXE;.CMD;.BAT').split(';').map((item) => item.toLowerCase())
    : [''];
  const candidates = pathEntries(env).flatMap((directory) =>
    extensions.map((extension) => path.join(directory, name + extension)));
  candidates.push(path.join(home, '.local', 'bin', name));
  candidates.push(path.join(home, '.local', 'bin', name + '.exe'));
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Try the next PATH entry.
    }
  }
  return null;
}

function securePrivatePaths(installDir) {
  if (process.platform === 'win32') return;
  for (const directory of [installDir, path.join(installDir, 'config')]) {
    if (fs.existsSync(directory)) fs.chmodSync(directory, 0o700);
  }
  for (const relative of PRIVATE_RUNTIME_FILES) {
    const target = path.join(installDir, relative);
    if (fs.existsSync(target) && fs.statSync(target).isFile()) fs.chmodSync(target, 0o600);
  }
  const manifest = path.join(installDir, '.shadow-cli.json');
  if (fs.existsSync(manifest)) fs.chmodSync(manifest, 0o600);
}

export function copyRuntime(packageRoot, installDir, packageVersion, { force = false } = {}) {
  const manifestPath = path.join(installDir, '.shadow-cli.json');
  let previousVersion = null;
  try {
    previousVersion = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).packageVersion || null;
  } catch {
    // New installation or an incomplete previous manifest.
  }
  const changed = force || previousVersion !== packageVersion;
  fs.mkdirSync(installDir, { recursive: true, mode: 0o700 });
  let copied = 0;

  for (const relative of RUNTIME_FILES) {
    const source = path.join(packageRoot, relative);
    if (!fs.existsSync(source)) {
      throw new Error('The npm package is incomplete. Missing runtime file: ' + relative);
    }
    const destination = path.join(installDir, relative);
    if (!changed && fs.existsSync(destination)) continue;
    if (PRIVATE_RUNTIME_FILES.has(relative) && fs.existsSync(destination)) continue;
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.copyFileSync(source, destination);
    copied += 1;
  }

  const manifest = {
    packageName: PACKAGE_NAME,
    packageVersion,
    runtimeUpdatedAt: new Date().toISOString(),
  };
  const tempPath = manifestPath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tempPath, manifestPath);
  securePrivatePaths(installDir);
  return { changed, copied, previousVersion, manifestPath };
}

export function getPythonVenvPath(installDir, platform = process.platform) {
  return platform === 'win32'
    ? path.join(installDir, '.venv', 'Scripts', 'python.exe')
    : path.join(installDir, '.venv', 'bin', 'python');
}

function getUvPath(installDir, platform = process.platform) {
  return platform === 'win32'
    ? path.join(installDir, 'bin', 'uv.exe')
    : path.join(installDir, 'bin', 'uv');
}

function mergePath(env, extraDirectory) {
  const key = Object.hasOwn(env, 'Path') && !Object.hasOwn(env, 'PATH') ? 'Path' : 'PATH';
  return { ...env, [key]: [extraDirectory, env[key]].filter(Boolean).join(path.delimiter) };
}

function withoutInheritedPythonEnv(env) {
  const clean = { ...env };
  delete clean.VIRTUAL_ENV;
  delete clean.VIRTUAL_ENV_PROMPT;
  delete clean.CONDA_PREFIX;
  delete clean.PYTHONHOME;
  return clean;
}

function run(command, args, options = {}) {
  const cwd = options.cwd;
  const env = options.env || process.env;
  const input = options.input;
  const timeoutMs = options.timeoutMs || 0;
  const stdio = input === undefined ? (options.stdio || 'inherit') : ['pipe', 'inherit', 'inherit'];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, shell: false, stdio, windowsHide: false });
    let timer;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(path.basename(command) + ' timed out after ' + timeoutMs + ' ms.'));
      }, timeoutMs);
      timer.unref?.();
    }
    child.once('error', (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve({ code, signal });
      else reject(new Error(path.basename(command) + ' exited with code ' + (code ?? 'unknown') + (signal ? ' (' + signal + ')' : '') + '.'));
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

function capture(command, args, options = {}) {
  const cwd = options.cwd;
  const env = options.env || process.env;
  const timeoutMs = options.timeoutMs || 15000;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(path.basename(command) + ' timed out after ' + timeoutMs + ' ms.'));
    }, timeoutMs);
    timer.unref?.();
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function fetchInstaller(url, destination) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45000), redirect: 'follow' });
  if (!response.ok) throw new Error('Could not download the official uv installer (HTTP ' + response.status + ').');
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length === 0 || body.length > 4 * 1024 * 1024) {
    throw new Error('The downloaded uv installer has an unexpected size.');
  }
  fs.writeFileSync(destination, body, { mode: 0o600 });
}

export async function ensureUv(installDir, { env = process.env } = {}) {
  const privateUv = getUvPath(installDir);
  if (fs.existsSync(privateUv)) return { path: privateUv, installed: false };
  const existing = findExecutable('uv', env);
  if (existing) return { path: existing, installed: false };
  if (!['linux', 'darwin', 'win32'].includes(process.platform)) {
    throw new Error('Automatic uv installation is not supported on ' + process.platform + '.');
  }
  const binDir = path.join(installDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true, mode: 0o700 });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-uv-'));
  const windows = process.platform === 'win32';
  const installerPath = path.join(tempDir, windows ? 'install-uv.ps1' : 'install-uv.sh');
  const installerUrl = windows
    ? 'https://astral.sh/uv/' + UV_VERSION + '/install.ps1'
    : 'https://astral.sh/uv/' + UV_VERSION + '/install.sh';
  try {
    await fetchInstaller(installerUrl, installerPath);
    const installEnv = {
      ...mergePath(env, binDir),
      UV_INSTALL_DIR: binDir,
      UV_NO_MODIFY_PATH: '1',
    };
    if (windows) {
      const programFiles = installEnv.ProgramW6432 || installEnv.ProgramFiles || 'C:\\Program Files';
      const pwshDefault = path.join(programFiles, 'PowerShell', '7', 'pwsh.exe');
      const shell = findExecutable('pwsh.exe', installEnv)
        || (fs.existsSync(pwshDefault) ? pwshDefault : null)
        || findExecutable('powershell.exe', installEnv)
        || 'powershell.exe';
      await run(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installerPath], {
        env: installEnv, timeoutMs: 180000,
      });
    } else {
      await run('sh', [installerPath], { env: installEnv, timeoutMs: 180000 });
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  const installedPath = getUvPath(installDir);
  if (fs.existsSync(installedPath)) return { path: installedPath, installed: true };
  const discovered = findExecutable('uv', mergePath(env, binDir));
  if (!discovered) throw new Error('uv installer finished but the uv executable was not found.');
  return { path: discovered, installed: true };
}

export async function ensurePython(uvPath, { env = process.env } = {}) {
  // Do not let an activated project venv (e.g. a different Shadow project) become
  // the base interpreter for a fresh gateway installation.
  const pythonEnv = { ...withoutInheritedPythonEnv(env), UV_MANAGED_PYTHON: '1', UV_NO_PROJECT: '1' };
  const findArgs = ['python', 'find', '--managed-python', '--no-project', PYTHON_VERSION];
  let found = await capture(uvPath, findArgs, { env: pythonEnv, timeoutMs: 30000 });
  if (found.code !== 0 || !found.stdout) {
    await run(uvPath, ['python', 'install', PYTHON_VERSION], { env: pythonEnv, timeoutMs: 600000 });
    found = await capture(uvPath, findArgs, { env: pythonEnv, timeoutMs: 30000 });
  }
  if (found.code !== 0 || !found.stdout) {
    throw new Error('uv could not provision managed Python ' + PYTHON_VERSION + '. ' + found.stderr);
  }
  const pythonPath = found.stdout.split(/\r?\n/u).at(-1)?.trim();
  if (!pythonPath || !fs.existsSync(pythonPath)) {
    throw new Error('uv returned a Python path that does not exist.');
  }
  return pythonPath;
}

async function runCore(installDir, args, options = {}) {
  const python = getPythonVenvPath(installDir);
  if (!fs.existsSync(python)) throw new Error('Shadow Python environment is missing. Run shadow-gateway setup first.');
  return run(python, [path.join(installDir, 'scripts', 'shadow.py'), ...args], {
    cwd: installDir,
    env: options.env || mergePath(withoutInheritedPythonEnv(process.env), path.join(installDir, 'bin')),
    input: options.input,
    timeoutMs: options.timeoutMs || 0,
  });
}

async function readCatalog(installDir) {
  const yamlPath = path.join(installDir, 'config', 'providers.catalog.yaml');
  const catalog = parseYaml(fs.readFileSync(yamlPath, 'utf8'));
  if (!catalog || !Array.isArray(catalog.providers)) throw new Error('Provider catalog is invalid.');
  return catalog.providers;
}

async function configureCatalogProviders(installDir) {
  const providers = await readCatalog(installDir);
  const selected = new Set();
  while (true) {
    const options = providers.filter((provider) => !selected.has(provider.id)).map((provider) => ({
      value: provider.id,
      label: provider.label,
      hint: provider.access + ' · ' + provider.model_name,
    }));
    options.push({ value: '__done__', label: 'Done selecting providers', hint: 'Continue to the next setup step' });
    const choice = await select({ message: 'Which provider would you like to connect?', options });
    if (isCancel(choice)) return false;
    if (choice === '__done__') break;
    const provider = providers.find((item) => item.id === choice);
    if (!provider) continue;
    selected.add(choice);
    const keys = [provider.api_key_env, ...(provider.required_env || [])];
    const envText = fs.existsSync(path.join(installDir, '.env'))
      ? fs.readFileSync(path.join(installDir, '.env'), 'utf8')
      : '';
    const envValues = parseDotEnv(envText);
    const credentials = {};
    for (const key of keys) {
      if (envValues[key]) {
        const replace = await confirm({ message: key + ' is already configured. Replace it?', initialValue: false });
        if (isCancel(replace)) return false;
        if (!replace) continue;
      }
      const isIdentifier = key.endsWith('_ID') || key.endsWith('_ACCOUNT');
      const value = isIdentifier
        ? await text({ message: provider.label + ': ' + key, validate: (input) => input.trim() ? undefined : 'This value is required.' })
        : await password({ message: provider.label + ': ' + key, validate: (input) => input.trim() ? undefined : 'API key cannot be empty.' });
      if (isCancel(value)) return false;
      credentials[key] = value.trim();
    }
    if (Object.keys(credentials).length > 0) {
      await runCore(installDir, ['_import_credentials'], { input: JSON.stringify(credentials) });
      log.success(provider.label + ' credentials saved locally.');
    } else {
      log.info(provider.label + ' was left unchanged.');
    }
  }
  if (selected.size > 0) await runCore(installDir, ['refresh']);
  return true;
}

export async function checkOllama({ executableFinder = findExecutable, fetchImpl = globalThis.fetch, timeoutMs = 6000 } = {}) {
  const executable = executableFinder('ollama');
  if (!executable) return { installed: false, running: false, models: [] };
  try {
    const response = await fetchImpl('http://127.0.0.1:11434/api/tags', {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { installed: true, running: false, models: [], detail: 'Ollama returned HTTP ' + response.status };
    }
    const data = await response.json();
    const models = Array.isArray(data.models)
      ? data.models.map((model) => String(model.name || '').trim()).filter(Boolean)
      : [];
    return { installed: true, running: true, models };
  } catch (error) {
    return {
      installed: true,
      running: false,
      models: [],
      detail: error instanceof Error ? error.message : 'Ollama API did not respond',
    };
  }
}

async function persistOllamaModel(installDir, modelName) {
  await runCore(installDir, ['_import_credentials'], {
    input: JSON.stringify({ SHADOW_OLLAMA_MODEL: modelName }),
  });
}

async function installOllamaIfMissing() {
  const available = await checkOllama();
  if (available.installed) return available;

  const proceed = await confirm({
    message: 'Ollama is missing. Would you like to install it now?',
    initialValue: true,
  });
  if (isCancel(proceed) || !proceed) {
    log.info('You can install Ollama later from https://ollama.com/download.');
    return available;
  }

  if (process.platform === 'linux') {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-ollama-'));
    const installerPath = path.join(tempDir, 'install-ollama.sh');
    try {
      const installSpin = spinner();
      installSpin.start('Downloading the official Ollama installer');
      await fetchInstaller('https://ollama.com/install.sh', installerPath);
      installSpin.stop('Official installer downloaded');
      await run('sh', [installerPath], { timeoutMs: 600000 });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } else if (process.platform === 'win32') {
    const winget = findExecutable('winget');
    if (!winget) {
      log.warn('WinGet is not available. Opening the official Ollama download page.');
      openExternal('https://ollama.com/download/windows');
      return { installed: false, running: false, models: [] };
    }
    await run(winget, [
      'install', '--id', 'Ollama.Ollama', '--exact',
      '--accept-package-agreements', '--accept-source-agreements',
    ], { timeoutMs: 600000 });
  } else if (process.platform === 'darwin') {
    const brew = findExecutable('brew');
    if (!brew) {
      log.warn('Homebrew is not available. Opening the official Ollama download page.');
      openExternal('https://ollama.com/download/mac');
      return { installed: false, running: false, models: [] };
    }
    await run(brew, ['install', '--cask', 'ollama'], { timeoutMs: 600000 });
  } else {
    log.warn('Automatic Ollama installation is not supported on this platform.');
    openExternal('https://ollama.com/download');
    return { installed: false, running: false, models: [] };
  }

  const after = await checkOllama();
  if (!after.installed) {
    log.warn('Ollama installer finished, but its command is not visible in this terminal yet. Open a new terminal after installation.');
  } else if (!after.running) {
    log.warn('Ollama was installed. Start the application/service and run setup again to select a model.');
  } else {
    log.success('Ollama installed and responding.');
  }
  return after;
}


function openExternal(url) {
  let command;
  let args;
  if (process.platform === 'win32') {
    command = 'cmd.exe';
    args = ['/c', 'start', '', url];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => log.info('Open this link in your browser: ' + url));
  child.unref();
}

function npmCommandSpec(args) {
  const npm = findExecutable('npm');
  if (!npm) throw new Error('npm was not found. Install Node.js/npm first.');
  if (process.platform === 'win32' && /\.(cmd|bat)$/iu.test(npm)) {
    const commandLine = '""' + npm + '" ' + args.join(' ') + '"';
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', commandLine] };
  }
  return { command: npm, args };
}

async function runNpm(args, options = {}) {
  const spec = npmCommandSpec(args);
  return run(spec.command, spec.args, options);
}

async function updateCliAndRuntime(installDir) {
  const release = acquireInstallLock(installDir);
  const spin = spinner();
  try {
    spin.start('Updating Shadow CLI from the npm registry');
    await runNpm(['install', '--global', PACKAGE_NAME + '@latest'], { cwd: installDir, timeoutMs: 300000 });
    const rootSpec = npmCommandSpec(['root', '--global']);
    const globalRoot = await capture(rootSpec.command, rootSpec.args, { timeoutMs: 30000 });
    if (globalRoot.code !== 0 || !globalRoot.stdout) throw new Error('npm updated the CLI but its global package directory could not be found.');
    const packageRoot = path.join(globalRoot.stdout.split(/\r?\n/u).at(-1).trim(), PACKAGE_NAME);
    const packageJsonPath = path.join(packageRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) throw new Error('The updated Shadow package was not found in npm global modules.');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    await installCoreDependenciesLocked(installDir, packageRoot, packageJson.version, { quiet: true });
    spin.stop('Shadow CLI and local runtime updated to ' + packageJson.version);
    return 0;
  } finally {
    release();
  }
}

const INSTALL_STATE_FILE = '.shadow-install-state.json';

function managedRuntimePaths(installDir) {
  const root = path.resolve(installDir);
  return {
    venv: path.join(root, '.venv'),
    cache: path.join(root, '.cache', 'shadow-installer'),
    state: path.join(root, INSTALL_STATE_FILE),
    rollback: path.join(root, '.shadow-rollback'),
    rollbackTemp: path.join(root, '.shadow-rollback.tmp'),
    lock: path.join(root, '.shadow-install.lock'),
  };
}

export function resetManagedRuntime(installDir) {
  const root = path.resolve(installDir);
  const paths = managedRuntimePaths(root);
  // Deliberately narrow: never remove .env, config/, user data, Ollama models,
  // the shared uv cache, or files outside the exact Shadow-managed paths.
  for (const target of [paths.venv, paths.cache]) {
    if (path.dirname(target) !== root && !target.startsWith(root + path.sep)) {
      throw new Error('Refusing to clean a path outside the Shadow installation.');
    }
    fs.rmSync(target, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(paths.cache), { recursive: true, mode: 0o700 });
  return paths;
}

async function isRuntimeHealthy(venvPython) {
  if (!fs.existsSync(venvPython)) return false;
  const result = await capture(venvPython, ['-c', 'import litellm, yaml'], { timeoutMs: 30000 });
  return result.code === 0;
}

function writeInstallState(statePath, state) {
  const tempPath = statePath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tempPath, statePath);
}

export function createRuntimeBackup(installDir, previousVersion, packageVersion) {
  const paths = managedRuntimePaths(installDir);
  fs.rmSync(paths.rollbackTemp, { recursive: true, force: true });
  fs.mkdirSync(paths.rollbackTemp, { recursive: true, mode: 0o700 });
  const existingFiles = [];
  for (const relative of MANAGED_RUNTIME_FILES) {
    const source = path.join(installDir, relative);
    if (!fs.existsSync(source)) continue;
    const destination = path.join(paths.rollbackTemp, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.copyFileSync(source, destination);
    existingFiles.push(relative);
  }
  const manifestPath = path.join(installDir, '.shadow-cli.json');
  const hadManifest = fs.existsSync(manifestPath);
  if (hadManifest) fs.copyFileSync(manifestPath, path.join(paths.rollbackTemp, '.shadow-cli.json'));
  const venvPath = paths.venv;
  const hadVenv = fs.existsSync(venvPath);
  const metadata = { previousVersion, packageVersion, existingFiles, hadManifest, hadVenv };
  fs.writeFileSync(path.join(paths.rollbackTemp, 'backup.json'), JSON.stringify(metadata, null, 2) + '\n', { mode: 0o600 });
  if (hadVenv) fs.renameSync(venvPath, path.join(paths.rollbackTemp, '.venv'));
  try {
    fs.rmSync(paths.rollback, { recursive: true, force: true });
    fs.renameSync(paths.rollbackTemp, paths.rollback);
    writeInstallState(paths.state, {
      status: 'updating',
      packageVersion,
      previousVersion,
      backupReady: true,
      startedAt: new Date().toISOString(),
    });
    return metadata;
  } catch (error) {
    try {
      if (fs.existsSync(paths.rollback)) restoreRuntimeBackup(installDir);
      else if (fs.existsSync(path.join(paths.rollbackTemp, '.venv')) && !fs.existsSync(paths.venv)) {
        fs.renameSync(path.join(paths.rollbackTemp, '.venv'), paths.venv);
      }
      fs.rmSync(paths.rollbackTemp, { recursive: true, force: true });
    } catch { /* Keep any recoverable backup on disk for the next invocation. */ }
    throw error;
  }
}

export function restoreRuntimeBackup(installDir) {
  const paths = managedRuntimePaths(installDir);
  if (!fs.existsSync(paths.rollback)) return false;
  const metadataPath = path.join(paths.rollback, 'backup.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const existing = new Set(metadata.existingFiles || []);
  for (const relative of MANAGED_RUNTIME_FILES) {
    const destination = path.join(installDir, relative);
    const backup = path.join(paths.rollback, relative);
    if (existing.has(relative)) {
      if (!fs.existsSync(backup)) throw new Error('Rollback backup is incomplete: ' + relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      fs.copyFileSync(backup, destination);
    } else {
      fs.rmSync(destination, { force: true });
    }
  }

  const manifestPath = path.join(installDir, '.shadow-cli.json');
  const backupManifest = path.join(paths.rollback, '.shadow-cli.json');
  if (metadata.hadManifest) {
    if (!fs.existsSync(backupManifest)) throw new Error('Rollback backup is missing the previous runtime manifest.');
    fs.copyFileSync(backupManifest, manifestPath);
  } else {
    fs.rmSync(manifestPath, { force: true });
  }

  if (metadata.hadVenv) {
    const backupVenv = path.join(paths.rollback, '.venv');
    if (fs.existsSync(backupVenv)) {
      fs.rmSync(paths.venv, { recursive: true, force: true });
      fs.renameSync(backupVenv, paths.venv);
    } else if (!fs.existsSync(paths.venv)) {
      throw new Error('Rollback backup is missing the previous Python environment.');
    }
  } else {
    fs.rmSync(paths.venv, { recursive: true, force: true });
  }

  securePrivatePaths(installDir);
  writeInstallState(paths.state, { status: 'rolled_back', restoredAt: new Date().toISOString() });
  try {
    fs.rmSync(paths.rollback, { recursive: true, force: true });
    fs.rmSync(paths.rollbackTemp, { recursive: true, force: true });
    fs.rmSync(paths.state, { force: true });
    fs.rmSync(paths.state + '.tmp', { force: true });
  } catch { /* The rolled_back marker makes cleanup resumable on the next run. */ }
  return true;
}

export function recoverInterruptedInstall(installDir) {
  const paths = managedRuntimePaths(installDir);
  let state = null;
  try { state = JSON.parse(fs.readFileSync(paths.state, 'utf8')); } catch { /* Missing or legacy marker. */ }
  if (state?.status === 'committed' || state?.status === 'rolled_back') {
    // A crash during backup cleanup must never try to restore a partially
    // deleted generation after the new generation was committed/restored.
    fs.rmSync(paths.rollback, { recursive: true, force: true });
    fs.rmSync(paths.rollbackTemp, { recursive: true, force: true });
    fs.rmSync(paths.state, { force: true });
    fs.rmSync(paths.state + '.tmp', { force: true });
    return { recovered: true, rolledBack: state.status === 'rolled_back' };
  }
  if (fs.existsSync(paths.rollback)) {
    restoreRuntimeBackup(installDir);
    return { recovered: true, rolledBack: true };
  }
  // A legacy marker without a rollback generation came from the older
  // clean-rebuild installer. Rebuild it safely rather than trusting partial files.
  if (fs.existsSync(paths.state)) {
    fs.rmSync(paths.state, { force: true });
    fs.rmSync(paths.state + '.tmp', { force: true });
    return { recovered: true, rolledBack: false };
  }
  if (fs.existsSync(paths.rollbackTemp)) {
    const tempVenv = path.join(paths.rollbackTemp, '.venv');
    if (fs.existsSync(tempVenv) && !fs.existsSync(paths.venv)) fs.renameSync(tempVenv, paths.venv);
    fs.rmSync(paths.rollbackTemp, { recursive: true, force: true });
  }
  return { recovered: false, rolledBack: false };
}

async function installCoreDependenciesLocked(installDir, packageRoot, packageVersion, { quiet = false, forceClean = false } = {}) {
  const paths = managedRuntimePaths(installDir);
  const recovery = recoverInterruptedInstall(installDir);
  let installedVersion = null;
  try {
    installedVersion = JSON.parse(fs.readFileSync(path.join(installDir, '.shadow-cli.json'), 'utf8')).packageVersion || null;
  } catch { /* Fresh installation or missing manifest. */ }

  const transaction = Boolean(installedVersion && (installedVersion !== packageVersion || forceClean));
  if (transaction) createRuntimeBackup(installDir, installedVersion, packageVersion);

  try {
    const update = copyRuntime(packageRoot, installDir, packageVersion);
    const interrupted = fs.existsSync(paths.state);
    const binDir = path.join(installDir, 'bin');
    const currentEnv = mergePath(withoutInheritedPythonEnv(process.env), binDir);
    const uvResult = await ensureUv(installDir, { env: currentEnv });
    const env = mergePath(currentEnv, path.dirname(uvResult.path));
    const pythonExe = await ensurePython(uvResult.path, { env });
    const venvPython = getPythonVenvPath(installDir);
    const healthy = await isRuntimeHealthy(venvPython);
    const rebuild = forceClean || interrupted || update.changed || !healthy;

    if (rebuild) {
      fs.mkdirSync(installDir, { recursive: true, mode: 0o700 });
      if (!transaction) {
        writeInstallState(paths.state, {
          status: 'installing', packageVersion, startedAt: new Date().toISOString(),
        });
      }
      if (!quiet) {
        log.info(recovery.rolledBack
          ? 'An interrupted update was rolled back. Preparing the restored runtime.'
          : interrupted
            ? 'An interrupted installation was detected. Rebuilding the managed runtime cleanly.'
            : 'Preparing a clean Shadow runtime installation.');
      }
      resetManagedRuntime(installDir);
      writeInstallState(paths.state, {
        status: transaction ? 'updating' : 'installing',
        packageVersion,
        previousVersion: installedVersion,
        backupReady: transaction,
        startedAt: new Date().toISOString(),
      });
      await run(pythonExe, [path.join(installDir, 'scripts', 'shadow.py'), 'setup'], { cwd: installDir, env });
      if (!(await isRuntimeHealthy(venvPython))) throw new Error('The rebuilt Python runtime failed its import health check.');
    }

    const envFile = path.join(installDir, '.env');
    const localConfig = path.join(installDir, 'config', 'shadow.yaml');
    if (!fs.existsSync(envFile) || !fs.existsSync(localConfig)) {
      await run(pythonExe, [path.join(installDir, 'scripts', 'shadow.py'), 'setup'], { cwd: installDir, env });
    }
    securePrivatePaths(installDir);

    // Commit point: only discard the previous generation after the new
    // runtime has passed its import check and required user config exists.
    if (!fs.existsSync(envFile) || !fs.existsSync(localConfig)) {
      throw new Error('Runtime validation failed: required local configuration is missing.');
    }
    writeInstallState(paths.state, { status: 'committed', packageVersion, committedAt: new Date().toISOString() });
    let cleanupDeferred = false;
    try {
      fs.rmSync(paths.rollback, { recursive: true, force: true });
      fs.rmSync(paths.rollbackTemp, { recursive: true, force: true });
      fs.rmSync(paths.state, { force: true });
      fs.rmSync(paths.state + '.tmp', { force: true });
    } catch { cleanupDeferred = true; }
    if (cleanupDeferred && !quiet) log.warn('Update succeeded. Final rollback cleanup will resume on the next Shadow command.');

    if (!quiet && update.changed && update.previousVersion) {
      log.success('Shadow runtime updated from ' + update.previousVersion + ' to ' + packageVersion + '.');
    }
    return { installDir, env, uvPath: uvResult.path, pythonExe, venvPython, update, rebuilt: rebuild };
  } catch (error) {
    if (transaction && fs.existsSync(paths.rollback)) {
      try {
        restoreRuntimeBackup(installDir);
        throw new Error('Update failed. The previous working Shadow runtime was restored. ' + (error?.message || String(error)));
      } catch (rollbackError) {
        if (rollbackError.message.startsWith('Update failed. The previous working Shadow runtime was restored.')) {
          throw rollbackError;
        }
        throw new Error('Update failed and automatic rollback could not finish. The previous generation was retained for recovery. ' + (rollbackError?.message || String(rollbackError)));
      }
    }
    // For a first installation there is no previous generation. Keep the
    // marker so the next invocation knows to clean and retry.
    throw new Error((transaction ? 'Shadow update failed. ' : 'Clean runtime installation failed. User credentials and configuration were preserved. ') +
      (error?.message || String(error)) + (transaction ? '' : ' Run the command again to retry.'));
  }
}


export function acquireInstallLock(installDir) {
  const paths = managedRuntimePaths(installDir);
  fs.mkdirSync(installDir, { recursive: true, mode: 0o700 });
  const lockInfo = { pid: process.pid, hostname: os.hostname(), startedAt: new Date().toISOString() };
  let fd;
  try {
    fd = fs.openSync(paths.lock, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let existing = null;
    try { existing = JSON.parse(fs.readFileSync(paths.lock, 'utf8')); } catch { /* Treat unreadable locks as active. */ }
    if (!existing || existing.hostname !== os.hostname() || !Number.isInteger(existing.pid)) {
      throw new Error('Another Shadow installation operation may be active. Lock retained at ' + paths.lock);
    }
    let alive = true;
    try { process.kill(existing.pid, 0); } catch (probeError) { alive = probeError.code !== 'ESRCH'; }
    if (alive) throw new Error('Another Shadow installation operation is already running (PID ' + existing.pid + ').');
    const stalePath = paths.lock + '.stale-' + process.pid + '-' + Date.now();
    try { fs.renameSync(paths.lock, stalePath); }
    catch (renameError) {
      throw new Error('The Shadow installation lock changed while it was being recovered. Retry the command.');
    }
    try {
      fd = fs.openSync(paths.lock, 'wx', 0o600);
    } catch (createError) {
      fs.rmSync(stalePath, { force: true });
      if (createError.code === 'EEXIST') throw new Error('Another Shadow installation operation started concurrently.');
      throw createError;
    }
    fs.rmSync(stalePath, { force: true });
  }
  try {
    fs.writeFileSync(fd, JSON.stringify(lockInfo) + '\n');
  } catch (writeError) {
    fs.closeSync(fd);
    fs.rmSync(paths.lock, { force: true });
    throw writeError;
  }
  fs.closeSync(fd);
  return () => {
    try {
      const current = JSON.parse(fs.readFileSync(paths.lock, 'utf8'));
      if (current.pid === lockInfo.pid && current.startedAt === lockInfo.startedAt) fs.rmSync(paths.lock, { force: true });
    } catch { /* The lock may already have been recovered or removed. */ }
  };
}

async function installCoreDependencies(installDir, packageRoot, packageVersion, options = {}) {
  const release = acquireInstallLock(installDir);
  try {
    return await installCoreDependenciesLocked(installDir, packageRoot, packageVersion, options);
  } finally {
    release();
  }
}

async function ensureInstalled({ packageVersion, packageRoot = PACKAGE_ROOT, quiet = false } = {}) {
  const installDir = getInstallDir();
  return installCoreDependencies(installDir, packageRoot, packageVersion, { quiet });
}

async function interactiveInstall(packageVersion, packageRoot = PACKAGE_ROOT) {
  const platform = getPlatformInfo();
  if (!platform.supported || !platform.architecture) {
    throw new Error('Unsupported platform ' + platform.label + '. Supported: Linux/macOS/Windows on x64 or arm64.');
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('The Shadow installer needs an interactive terminal. Run it from a terminal window.');
  }

  intro('◈ SHADOW  /  PERSONAL AI GATEWAY');
  note('One gateway for local models, free-tier providers and your own paid APIs.\nYour credentials stay in your own Shadow installation.', 'Welcome');
  log.info('The installer will provision uv, Python 3.12 and isolated gateway dependencies if they are missing.');

  const target = await select({
    message: 'How would you like to use Shadow?',
    options: [
      { value: 'local', label: 'Local-first', hint: 'Use Ollama on this machine' },
      { value: 'remote', label: 'Connect cloud providers', hint: 'Use your own free or paid API accounts' },
      { value: 'both', label: 'Local + cloud providers', hint: 'Keep Ollama local and add APIs' },
      { value: 'later', label: 'Set up the gateway first', hint: 'Configure providers later' },
    ],
  });
  if (isCancel(target)) {
    cancel('Setup cancelled. No existing configuration was removed.');
    return 0;
  }

  const spin = spinner();
  spin.start('Preparing the Shadow runtime');
  const installed = await ensureInstalled({ packageVersion, packageRoot, quiet: true });
  spin.stop('Runtime ready · Python environment and gateway dependencies are installed');

  if (target === 'local' || target === 'both') {
    let ollama = await checkOllama();
    if (!ollama.installed) ollama = await installOllamaIfMissing();
    if (!ollama.installed) {
      log.warn('Local inference is not configured yet. You can continue with remote providers or install Ollama later.');
    } else if (!ollama.running) {
      log.warn('Ollama is installed but did not answer. Start Ollama before using local models.');
    } else {
      log.success('Ollama detected · ' + (ollama.models.slice(0, 5).join(', ') || 'service ready'));
      const chatModels = ollama.models.filter((name) => !/(embed|embedding|rerank|whisper|tts)/iu.test(name));
      if (chatModels.length > 0) {
        const selectedModel = await select({
          message: 'Which installed Ollama model should power shadow-local and shadow-auto?',
          options: chatModels.map((name) => ({ value: name, label: name, hint: 'Installed locally' })),
        });
        if (isCancel(selectedModel)) {
          cancel('Local model selection cancelled. The existing local configuration was preserved.');
          return 0;
        }
        await persistOllamaModel(installed.installDir, selectedModel);
        log.success('Local model saved · ollama/' + selectedModel + ' (kept across refresh and updates)');
      } else {
        log.info('Ollama is ready, but no chat model is installed (embedding/reranking models are not used for chat).');
        const pull = await confirm({
          message: 'Download the starter chat model llama3.2:3b now? This may download several GB.',
          initialValue: false,
        });
        if (isCancel(pull)) {
          cancel('Setup paused. Download a model later with: ollama pull llama3.2:3b');
          return 0;
        }
        if (pull) {
          spin.start('Downloading llama3.2:3b through Ollama');
          await run('ollama', ['pull', 'llama3.2:3b'], { cwd: installed.installDir, timeoutMs: 900000 });
          spin.stop('Starter model downloaded');
          await persistOllamaModel(installed.installDir, 'llama3.2:3b');
        }
      }
    }
  }

  if (target === 'remote' || target === 'both') {
    const keepGoing = await configureCatalogProviders(installed.installDir);
    if (!keepGoing) {
      cancel('Provider setup cancelled. Previously saved credentials were preserved.');
      return 0;
    }
  }

  const addCustom = await confirm({
    message: 'Would you like to add a custom OpenAI-compatible or Anthropic API endpoint?',
    initialValue: false,
  });
  if (isCancel(addCustom)) {
    cancel('Setup paused. You can add an API later with shadow-gateway provider add.');
    return 0;
  }
  if (addCustom) {
    note('API keys are entered in a hidden prompt and saved only in the private .env file.', 'Custom provider');
    await runCore(installed.installDir, ['add-provider']);
    await runCore(installed.installDir, ['refresh']);
  }

  await runCore(installed.installDir, ['refresh']);
  await runCore(installed.installDir, ['validate']);

  const addGlobal = await confirm({
    message: 'Install the permanent shadow-gateway command globally with npm?',
    initialValue: true,
  });
  let globalInstalled = false;
  if (isCancel(addGlobal)) {
    cancel('Setup completed. Global installation can be done later.');
  } else if (addGlobal) {
    if (!findExecutable('npm')) {
      log.warn('npm was not found. Use npx ' + PACKAGE_NAME + ' start or install Node.js/npm first.');
    } else {
      const globalSpin = spinner();
      globalSpin.start('Installing the permanent Shadow command');
      await runNpm(['install', '--global', PACKAGE_NAME + '@' + packageVersion], {
        cwd: installed.installDir, timeoutMs: 300000,
      });
      globalSpin.stop('Global command installed');
      globalInstalled = true;
    }
  }

  note([
    'Start the gateway:',
    '  ' + (globalInstalled ? 'shadow-gateway start' : 'npx ' + PACKAGE_NAME + ' start'),
    '',
    'Useful commands:',
    '  ' + (globalInstalled ? 'shadow-gateway status' : 'npx ' + PACKAGE_NAME + ' status'),
    '  ' + (globalInstalled ? 'shadow-gateway doctor' : 'npx ' + PACKAGE_NAME + ' doctor'),
    '  ' + (globalInstalled ? 'shadow-gateway provider add' : 'npx ' + PACKAGE_NAME + ' provider add'),
    '',
    'Community:',
    '  ' + (globalInstalled ? 'shadow-repository' : 'npx -p ' + PACKAGE_NAME + ' shadow-repository') + '  (⭐ star the repository)',
    '  ' + (globalInstalled ? 'shadow-feedback' : 'npx -p ' + PACKAGE_NAME + ' shadow-feedback') + '  (feedback and bug reports)',
    '',
    'Install folder: ' + installed.installDir,
    'OpenAI-compatible: http://127.0.0.1:4000/v1',
    'Anthropic Messages: http://127.0.0.1:4000',
  ].join('\n'), 'You are ready');
  log.message('⭐ Give Shadow a star: run shadow-repository');
  log.message('💬 Share feedback or report a problem: run shadow-feedback');
  log.message('You can also open these links anytime with the commands above.');
  outro('Shadow is ready. Your gateway, your rules.');
  return 0;
}

export function getConfiguredAliases(installDir) {
  const configPath = path.join(installDir, 'config', 'shadow.yaml');
  try {
    const config = parseYaml(fs.readFileSync(configPath, 'utf8')) || {};
    return [...new Set((Array.isArray(config.model_list) ? config.model_list : [])
      .map((item) => item?.model_name).filter((name) => typeof name === 'string' && name))];
  } catch {
    return [];
  }
}

export async function showStatus(installDir) {
  const envPath = path.join(installDir, '.env');
  const env = fs.existsSync(envPath) ? parseDotEnv(fs.readFileSync(envPath, 'utf8')) : {};
  const url = process.env.SHADOW_BASE_URL || 'http://127.0.0.1:4000';
  try {
    const health = await fetch(url + '/health/liveliness', { signal: AbortSignal.timeout(4000) });
    if (!health.ok) {
      log.warn('Gateway responded with HTTP ' + health.status + '.');
      return 1;
    }
    log.success('Gateway online · ' + url);
    if (env.LITELLM_MASTER_KEY) {
      const models = await fetch(url + '/v1/models', {
        headers: { Authorization: 'Bearer ' + env.LITELLM_MASTER_KEY },
        signal: AbortSignal.timeout(5000),
      });
      if (models.ok) {
        const data = await models.json();
        log.success((Array.isArray(data.data) ? data.data.length : 0) + ' model aliases available through the API.');
      } else {
        let error = {};
        try { error = (await models.json()).error || {}; } catch { /* Non-JSON upstream response. */ }
        if (models.status === 400 && error.type === 'no_db_connection') {
          const aliases = getConfiguredAliases(installDir);
          if (aliases.length) {
            log.warn('LiteLLM model discovery requires a database with master-key auth in this runtime.');
            log.success(aliases.length + ' model aliases loaded from your local Shadow config: ' + aliases.join(', '));
            log.info('You can enter these aliases manually in clients while API catalog discovery is unavailable.');
          } else {
            log.warn('Model catalog needs a database and no local aliases could be read.');
          }
        } else {
          log.warn('Model catalog responded with HTTP ' + models.status + '.');
        }
      }
    } else {
      log.warn('Local master key is missing from the private .env file.');
    }
    return 0;
  } catch {
    log.warn('Gateway offline · ' + url);
    log.info('Start it with: shadow-gateway start');
    return 1;
  }
}

export function inspectInstallation(installDir, { platform = process.platform } = {}) {
  const check = (label, ok, detail = '') => ({ label, ok: Boolean(ok), detail });
  const envPath = path.join(installDir, '.env');
  const configPath = path.join(installDir, 'config', 'shadow.yaml');
  const pythonPath = getPythonVenvPath(installDir, platform);
  const litellmPath = path.join(installDir, '.venv', platform === 'win32' ? 'Scripts/litellm.exe' : 'bin/litellm');
  const checks = [
    check('Runtime directory', fs.existsSync(installDir), installDir),
    check('CLI runtime manifest', fs.existsSync(path.join(installDir, '.shadow-cli.json'))),
    check('Python environment', fs.existsSync(pythonPath)),
    check('LiteLLM executable', fs.existsSync(litellmPath)),
  ];

  let env = {};
  if (fs.existsSync(envPath)) {
    try { env = parseDotEnv(fs.readFileSync(envPath, 'utf8')); }
    catch { /* Report unreadable environment without exposing its contents. */ }
  }
  checks.push(check('Private environment', fs.existsSync(envPath) && Object.keys(env).length > 0));
  checks.push(check('Local master key', typeof env.LITELLM_MASTER_KEY === 'string' && env.LITELLM_MASTER_KEY.length >= 16));

  let configOk = false;
  let configDetail = 'missing';
  if (fs.existsSync(configPath)) {
    try {
      const config = parseYaml(fs.readFileSync(configPath, 'utf8')) || {};
      const names = Array.isArray(config.model_list) ? config.model_list.map((item) => item?.model_name).filter(Boolean) : [];
      configOk = new Set(names).size === names.length && names.includes('shadow-local') && names.includes('shadow-auto');
      configDetail = configOk ? names.length + ' model aliases' : 'required aliases missing or duplicated';
    } catch {
      configDetail = 'invalid YAML';
    }
  }
  checks.push(check('Gateway configuration', configOk, configDetail));

  if (platform !== 'win32') {
    for (const [label, target] of [['.env permissions', envPath], ['Gateway config permissions', configPath]]) {
      let privateMode = false;
      try { privateMode = (fs.statSync(target).mode & 0o077) === 0; } catch { /* Missing file is reported by its own check. */ }
      checks.push(check(label, privateMode, privateMode ? 'owner-only' : 'must be chmod 600'));
    }
  }
  return checks;
}

async function runDoctor(installDir) {
  const checks = inspectInstallation(installDir);
  for (const item of checks) {
    const detail = item.detail ? ' · ' + item.detail : '';
    (item.ok ? log.success : log.error)(item.label + ': ' + (item.ok ? 'OK' : 'PROBLEM') + detail);
  }
  const ollama = await checkOllama();
  if (ollama.installed && ollama.running) log.success('Ollama: ' + ollama.models.length + ' model(s)');
  else log.info('Ollama: ' + (ollama.installed ? 'installed, not responding (optional)' : 'optional and not installed'));
  if (checks.some((entry) => !entry.ok)) {
    log.info('Run shadow-gateway setup to repair the local installation. Existing credentials and local configuration are preserved.');
    return 1;
  }
  return showStatus(installDir);
}

function printHelp() {
  console.log([
    'Shadow · Self-hosted AI Gateway',
    'Commands and explanations / Comandos e explicações',
    '',
    'GENERAL / GERAL',
    '  shadow-help',
    '    EN: Display this complete command list.',
    '    PT: Exibe esta lista completa de comandos.',
    '  shadow-gateway',
    '    EN: Launch the interactive setup wizard (same as setup).',
    '    PT: Inicia o assistente interativo de configuração (equivalente a setup).',
    '  shadow-gateway setup',
    '    EN: Open the interactive installer to install, repair or configure Shadow.',
    '    PT: Abre o instalador interativo para instalar, reparar ou configurar a Shadow.',
    '  shadow-gateway onboard',
    '    EN: Alias for the interactive setup wizard.',
    '    PT: Atalho para o assistente interativo de configuração.',
    '  shadow-gateway --help | -h | help',
    '    EN: Display the complete command reference.',
    '    PT: Exibe a referência completa de comandos.',
    '  shadow-gateway --version | -v | version',
    '    EN: Print the installed CLI version.',
    '    PT: Exibe a versão instalada do CLI.',
    '',
    'GATEWAY / SERVIDOR',
    '  shadow-gateway start [--port 4000]',
    '    EN: Start the local API gateway, optionally on a custom port.',
    '    PT: Inicia o gateway de API local, opcionalmente em uma porta personalizada.',
    '  shadow-gateway status',
    '    EN: Check gateway health and configured model aliases.',
    '    PT: Verifica a saúde do gateway e os aliases de modelos configurados.',
    '  shadow-gateway doctor',
    '    EN: Diagnose the installation, runtime and configuration without repairing them.',
    '    PT: Diagnostica a instalação, o ambiente e as configurações sem fazer reparos.',
    '',
    'PROVIDERS / PROVEDORES',
    '  shadow-gateway provider [list]',
    '    EN: Show the provider catalog, activation status and custom providers.',
    '    PT: Mostra o catálogo de provedores, o status de ativação e os provedores personalizados.',
    '  shadow-gateway provider add',
    '    EN: Add a custom provider or API endpoint.',
    '    PT: Adiciona um provedor personalizado ou endpoint de API.',
    '  shadow-gateway provider refresh',
    '    EN: Regenerate the local gateway configuration from current provider settings.',
    '    PT: Regenera a configuração local do gateway com as definições atuais dos provedores.',
    '',
    'CLIENTS / CLIENTES',
    '  shadow-gateway clients',
    '    EN: Show the locations of setup guides for supported AI clients.',
    '    PT: Mostra onde encontrar os guias de integração dos clientes de IA compatíveis.',
    '',
    'MAINTENANCE / MANUTENÇÃO',
    '  shadow-gateway update',
    '    EN: Update the Shadow CLI and managed runtime using the published npm package.',
    '    PT: Atualiza o CLI da Shadow e o ambiente gerenciado usando o pacote publicado no npm.',
    '  shadow-gateway reinstall',
    '    EN: Clean-rebuild Shadow-managed dependencies; preserve credentials, API keys, user data and custom configuration.',
    '    PT: Reconstrói do zero as dependências gerenciadas pela Shadow; preserva chaves de API, dados e configurações personalizadas.',
    '',
    'COMMUNITY / COMUNIDADE',
    '  shadow-repository',
    '    EN: Open the official GitHub repository. Star the project to support its growth.',
    '    PT: Abre o repositório oficial no GitHub. Deixe sua estrela para apoiar o crescimento do projeto.',
    '  shadow-feedback',
    '    EN: Open GitHub to send feedback, report bugs or suggest improvements.',
    '    PT: Abre o GitHub para enviar feedback, relatar bugs ou sugerir melhorias.',
    '  shadow-gateway repository',
    '    EN: Alias for shadow-repository.',
    '    PT: Atalho equivalente ao comando shadow-repository.',
    '  shadow-gateway feedback',
    '    EN: Alias for shadow-feedback.',
    '    PT: Atalho equivalente ao comando shadow-feedback.',
    '',
    'INSTALLATION / INSTALAÇÃO',
    '  npx shadow-gateway',
    '    EN: Run the interactive installer without a global installation.',
    '    PT: Executa o instalador interativo sem instalação global.',
    '  npm install --global shadow-gateway',
    '    EN: Install the Shadow CLI globally.',
    '    PT: Instala o CLI da Shadow globalmente.',
    '',
    'EXAMPLES / EXEMPLOS',
    '  shadow-gateway provider list',
    '  shadow-gateway start --port 4000',
    '  shadow-gateway doctor',
    '  shadow-repository',
    '  shadow-feedback',
  ].join('\n'));
}


export function compareVersions(current, latest) {
  const parse = (value) => String(value).replace(/^v/u, '').split(/[+-]/u, 1)[0].split('.').map((part) => Number(part));
  const a = parse(current); const b = parse(latest);
  if (a.length !== 3 || b.length !== 3 || [...a, ...b].some((part) => !Number.isInteger(part) || part < 0)) return 0;
  for (let i = 0; i < 3; i += 1) { if (b[i] > a[i]) return 1; if (b[i] < a[i]) return -1; }
  return 0;
}

export async function checkForCliUpdate(currentVersion, {
  installDir = getInstallDir(), fetchImpl = globalThis.fetch, now = Date.now(),
} = {}) {
  if (!currentVersion) return null;
  const cachePath = path.join(installDir, '.cache', 'npm-update-check.json');
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const ttl = cached.latestVersion ? UPDATE_CHECK_TTL_MS : UPDATE_CHECK_FAILURE_TTL_MS;
    if (cached.checkedAt && now - cached.checkedAt < ttl) {
      return cached.latestVersion && compareVersions(currentVersion, cached.latestVersion) > 0 ? cached.latestVersion : null;
    }
  } catch { /* No valid cache: check the registry. */ }
  const writeCache = (latestVersion) => {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true, mode: 0o700 });
    const tempPath = cachePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify({ checkedAt: now, latestVersion }) + '\n', { mode: 0o600 });
    fs.renameSync(tempPath, cachePath);
  };
  try {
    const response = await fetchImpl(REGISTRY_LATEST_URL, { signal: AbortSignal.timeout(1800), headers: { Accept: 'application/json' } });
    if (!response.ok) { writeCache(null); return null; }
    const metadata = await response.json();
    const latestVersion = typeof metadata.version === 'string' ? metadata.version : '';
    if (!latestVersion) { writeCache(null); return null; }
    writeCache(latestVersion);
    return compareVersions(currentVersion, latestVersion) > 0 ? latestVersion : null;
  } catch { try { writeCache(null); } catch { /* Cache is optional. */ } return null; }
}

async function announceCliUpdate(currentVersion) {
  const latest = await checkForCliUpdate(currentVersion);
  if (latest) {
    log.warn('A new Shadow CLI version is available: ' + latest + ' (you have ' + currentVersion + ').');
    log.info('Update with: npm install --global ' + PACKAGE_NAME + '@latest');
    log.info('Or run: npx ' + PACKAGE_NAME + '@latest');
  }
}

export async function runCli(argv, { packageVersion, packageRoot = PACKAGE_ROOT } = {}) {
  const args = [...argv];
  const command = args.shift() || 'setup';
  if (['--version', '-v', 'version'].includes(command)) {
    console.log(packageVersion);
    return 0;
  }
  if (['--help', '-h', 'help'].includes(command)) {
    printHelp();
    return 0;
  }

  if (command === 'doctor') return runDoctor(getInstallDir());
  await announceCliUpdate(packageVersion);
  if (command === 'repository' || command === 'shadow-repository') { openExternal(GITHUB_REPO); return 0; }
  if (command === 'feedback' || command === 'shadow-feedback') { openExternal(ISSUES_URL); return 0; }

  const installDir = getInstallDir();
  if (command === 'update') return updateCliAndRuntime(installDir);
  if (command === 'reinstall') {
    const approved = await confirm({ message: 'Remove and recreate only Shadow-managed dependencies? Credentials and local configuration will be preserved.', initialValue: false });
    if (isCancel(approved) || !approved) { log.info('Reinstallation cancelled.'); return 0; }
    await installCoreDependencies(installDir, packageRoot, packageVersion, { forceClean: true });
    log.success('Clean Shadow runtime installed. Your credentials and configuration were preserved.');
    return 0;
  }
  if (command === 'clients') {
    note([
      path.join(installDir, 'docs', 'client-integrations.md'),
      path.join(installDir, 'docs', 'pt-BR', 'integracao-clientes.md'),
    ].join('\n'), 'Client setup guides');
    return 0;
  }

  if (command === 'setup' || command === 'onboard') return interactiveInstall(packageVersion, packageRoot);
  const installed = await installCoreDependencies(installDir, packageRoot, packageVersion, { quiet: true });
  if (command === 'start') {
    const portIndex = args.indexOf('--port');
    if (portIndex >= 0 && args[portIndex + 1]) {
      return runCore(installed.installDir, ['start', '--port', args[portIndex + 1]]);
    }
    return runCore(installed.installDir, ['start']);
  }
  if (command === 'status') return showStatus(installDir);
  if (command === 'provider') {
    const subcommand = args.shift() || 'list';
    if (subcommand === 'add') return runCore(installDir, ['add-provider']);
    if (subcommand === 'refresh') return runCore(installDir, ['refresh']);
    if (subcommand === 'list') return runCore(installDir, ['configure']);
    throw new Error('Unknown provider command: ' + subcommand);
  }
  throw new Error('Unknown command: ' + command + '. Run shadow --help.');
}

export const __test__ = { getUvPath, mergePath, withoutInheritedPythonEnv, PRIVATE_RUNTIME_FILES, ensurePython, INSTALL_STATE_FILE };
