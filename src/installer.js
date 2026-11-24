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

export const RUNTIME_FILES = [
  '.env.example', 'requirements.txt', 'LICENSE',
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
      const shell = findExecutable('powershell.exe', installEnv) || 'powershell.exe';
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
  let found = await capture(uvPath, ['python', 'find', PYTHON_VERSION], { env, timeoutMs: 30000 });
  if (found.code !== 0 || !found.stdout) {
    await run(uvPath, ['python', 'install', PYTHON_VERSION], { env, timeoutMs: 300000 });
    found = await capture(uvPath, ['python', 'find', PYTHON_VERSION], { env, timeoutMs: 30000 });
  }
  if (found.code !== 0 || !found.stdout) {
    throw new Error('uv could not provision Python ' + PYTHON_VERSION + '. ' + found.stderr);
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
    env: options.env || mergePath(process.env, path.join(installDir, 'bin')),
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

async function checkOllama() {
  const executable = findExecutable('ollama');
  if (!executable) return { installed: false, running: false, models: [] };
  const result = await capture(executable, ['list'], { timeoutMs: 12000 });
  if (result.code !== 0) return { installed: true, running: false, models: [] };
  const models = result.stdout.split(/\r?\n/u).slice(1).map((line) => line.trim().split(/\s+/u)[0]).filter(Boolean);
  return { installed: true, running: true, models };
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
  const spin = spinner();
  spin.start('Updating Shadow CLI from the npm registry');
  await runNpm(['install', '--global', PACKAGE_NAME + '@latest'], { cwd: installDir, timeoutMs: 300000 });
  const rootSpec = npmCommandSpec(['root', '--global']);
  const globalRoot = await capture(rootSpec.command, rootSpec.args, { timeoutMs: 30000 });
  if (globalRoot.code !== 0 || !globalRoot.stdout) throw new Error('npm updated the CLI but its global package directory could not be found.');
  const packageRoot = path.join(globalRoot.stdout.split(/\r?\n/u).at(-1).trim(), PACKAGE_NAME);
  const packageJsonPath = path.join(packageRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) throw new Error('The updated Shadow package was not found in npm global modules.');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  await installCoreDependencies(installDir, packageRoot, packageJson.version, { quiet: true });
  spin.stop('Shadow CLI and local runtime updated to ' + packageJson.version);
  return 0;
}

async function installCoreDependencies(installDir, packageRoot, packageVersion, { quiet = false } = {}) {
  const update = copyRuntime(packageRoot, installDir, packageVersion);
  const binDir = path.join(installDir, 'bin');
  const currentEnv = mergePath(process.env, binDir);
  const uvResult = await ensureUv(installDir, { env: currentEnv });
  const env = mergePath(currentEnv, path.dirname(uvResult.path));
  const pythonExe = await ensurePython(uvResult.path, { env });
  const venvPython = getPythonVenvPath(installDir);

  if (!fs.existsSync(venvPython)) {
    await run(pythonExe, [path.join(installDir, 'scripts', 'shadow.py'), 'setup'], {
      cwd: installDir, env,
    });
  } else if (update.changed) {
    await run(uvResult.path, [
      'pip', 'install', '--python', venvPython, '-r', path.join(installDir, 'requirements.txt'),
    ], { cwd: installDir, env });
  }

  const envFile = path.join(installDir, '.env');
  const localConfig = path.join(installDir, 'config', 'shadow.yaml');
  if (!fs.existsSync(venvPython) || !fs.existsSync(envFile) || !fs.existsSync(localConfig)) {
    await run(pythonExe, [path.join(installDir, 'scripts', 'shadow.py'), 'setup'], { cwd: installDir, env });
  }
  if (!quiet && update.changed && update.previousVersion) {
    log.success('Shadow runtime updated from ' + update.previousVersion + ' to ' + packageVersion + '.');
  }
  return { installDir, env, uvPath: uvResult.path, pythonExe, venvPython, update };
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
    } else if (ollama.models.length === 0) {
      log.info('Ollama is ready, but no models are installed yet.');
      const pull = await confirm({
        message: 'Download the starter model llama3.2:3b now? This may download several GB.',
        initialValue: false,
      });
      if (isCancel(pull)) {
        cancel('Setup paused. Download a model later with: ollama pull llama3.2:3b');
        return 0;
      }
      if (pull) {
        spin.start('Downloading llama3.2:3b through Ollama');
        await run('ollama', ['pull', 'llama3.2:3b'], { cwd: installed.installDir });
        spin.stop('Starter model downloaded');
      }
    } else {
      log.success('Ollama detected · ' + ollama.models.slice(0, 5).join(', '));
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
    'Install folder: ' + installed.installDir,
    'OpenAI-compatible: http://127.0.0.1:4000/v1',
    'Anthropic Messages: http://127.0.0.1:4000',
  ].join('\n'), 'You are ready');
  log.message('⭐ Like Shadow? Leave a star: ' + STAR_URL);
  log.message('💬 Missing something or hit a problem? Feedback: ' + ISSUES_URL);
  outro('Shadow is ready. Your gateway, your rules.');

  const feedback = await confirm({
    message: 'Would you like to open the GitHub feedback page now?',
    initialValue: false,
  });
  if (feedback === true) openExternal(ISSUES_URL);
  return 0;
}

async function showStatus(installDir) {
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
        log.success((Array.isArray(data.data) ? data.data.length : 0) + ' model aliases available.');
      } else {
        log.warn('Model catalog responded with HTTP ' + models.status + '.');
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

async function runDoctor(installDir) {
  const checks = [
    ['Runtime directory', fs.existsSync(installDir)],
    ['Private environment', fs.existsSync(path.join(installDir, '.env'))],
    ['Gateway configuration', fs.existsSync(path.join(installDir, 'config', 'shadow.yaml'))],
    ['Python environment', fs.existsSync(getPythonVenvPath(installDir))],
    ['LiteLLM executable', fs.existsSync(path.join(installDir, '.venv', process.platform === 'win32' ? 'Scripts/litellm.exe' : 'bin/litellm'))],
  ];
  for (const [label, ok] of checks) (ok ? log.success : log.error)(label + ': ' + (ok ? 'OK' : 'missing'));
  const ollama = await checkOllama();
  if (ollama.installed && ollama.running) log.success('Ollama: ' + ollama.models.length + ' model(s)');
  else log.info('Ollama: ' + (ollama.installed ? 'installed, not responding' : 'optional and not installed'));
  if (checks.some((entry) => !entry[1])) {
    log.info('Run shadow-gateway setup to repair the local installation.');
    return 1;
  }
  return showStatus(installDir);
}

function printHelp() {
  console.log([
    'Shadow · Self-hosted AI Gateway',
    '',
    'Usage:',
    '  shadow-gateway                         Open the interactive terminal setup',
    '  shadow-gateway setup                   Install, repair or configure Shadow',
    '  shadow-gateway start [--port 4000]     Start the local API gateway',
    '  shadow-gateway status                  Check the gateway and model aliases',
    '  shadow-gateway doctor                  Diagnose the local installation',
    '  shadow-gateway provider add            Register a custom API endpoint',
    '  shadow-gateway provider list           Show configured/catalog providers',
    '  shadow-gateway provider refresh        Regenerate the local gateway config',
    '  shadow-gateway clients                 Show client integration guide locations',
    '  shadow-gateway update                  Update the CLI and local runtime from npm',
    '',
    'First install:',
    '  npx ' + PACKAGE_NAME,
    '',
    'Global install:',
    '  npm install --global ' + PACKAGE_NAME,
    '  shadow-gateway start',
  ].join('\n'));
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

  const installDir = getInstallDir();
  if (command === 'update') return updateCliAndRuntime(installDir);
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
  if (command === 'doctor') return runDoctor(installDir);
  if (command === 'provider') {
    const subcommand = args.shift() || 'list';
    if (subcommand === 'add') return runCore(installDir, ['add-provider']);
    if (subcommand === 'refresh') return runCore(installDir, ['refresh']);
    if (subcommand === 'list') return runCore(installDir, ['configure']);
    throw new Error('Unknown provider command: ' + subcommand);
  }
  throw new Error('Unknown command: ' + command + '. Run shadow --help.');
}

export const __test__ = { getUvPath, mergePath, PRIVATE_RUNTIME_FILES };
