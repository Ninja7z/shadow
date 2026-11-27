#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

export const LEGACY_VERSION_RANGE = '<0.1.7';
export const LEGACY_PACKAGE_SPEC = packageJson.name + '@' + LEGACY_VERSION_RANGE;
export const WEBAUTH_TIMEOUT_MS = 180_000;

export function buildLegacyDeprecationMessage() {
  return [
    'UPDATE AVAILABLE: This Shadow Gateway release is outdated and predates the built-in update checker.',
    'Install the latest release with: npm install --global ' + packageJson.name + '@latest.',
    'Release notes: https://github.com/Ninja7z/shadow/releases.',
  ].join(' ');
}

export function sanitizeNpmEnvironment(env = process.env, otp = null) {
  const clean = { ...env };
  for (const key of Object.keys(clean)) {
    if (/^npm_config_otp$/i.test(key)) delete clean[key];
  }
  if (otp !== null && otp !== undefined) {
    if (typeof otp !== 'string' || !otp.trim()) throw new Error('The npm WebAuthn token is empty.');
    clean.npm_config_otp = otp.trim();
  }
  return clean;
}

function npmInvocation(args, env = process.env) {
  const npmCli = env.npm_execpath;
  if (!npmCli) {
    throw new Error('Run this command through npm run deprecate:legacy so npm arguments are passed safely on every platform.');
  }
  return {
    command: process.execPath,
    args: [npmCli, ...args],
  };
}

export function runNpm(args, {
  env = process.env,
  capture = false,
  otp = null,
} = {}) {
  const invocation = npmInvocation(args, env);
  const childEnv = sanitizeNpmEnvironment(env, otp);
  const finalArgs = capture ? [...invocation.args, '--json'] : invocation.args;
  const result = spawnSync(invocation.command, finalArgs, {
    cwd: ROOT,
    env: childEnv,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (capture) {
    return {
      status: result.status ?? 1,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    };
  }
  return result.status ?? 1;
}

export function getDeprecationPlan() {
  return {
    package: packageJson.name,
    range: LEGACY_VERSION_RANGE,
    packageSpec: LEGACY_PACKAGE_SPEC,
    message: buildLegacyDeprecationMessage(),
  };
}

function resultStatus(result) {
  if (Number.isInteger(result)) return result;
  return Number.isInteger(result?.status) ? result.status : 1;
}

function parseJsonObject(text) {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text.trim());
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
}

export function parseWebAuthChallenge(output) {
  const parsed = parseJsonObject(output);
  const error = parsed?.error || parsed;
  if (error?.code !== 'EOTP') return null;
  const authUrl = error.authUrl;
  const doneUrl = error.doneUrl;
  if (typeof authUrl !== 'string' || typeof doneUrl !== 'string') return null;

  const auth = new URL(authUrl);
  const done = new URL(doneUrl);
  if (
    auth.protocol !== 'https:' ||
    auth.hostname !== 'www.npmjs.com' ||
    !auth.pathname.startsWith('/auth/cli/') ||
    done.protocol !== 'https:' ||
    done.hostname !== 'registry.npmjs.org' ||
    done.pathname !== '/-/v1/done' ||
    !done.searchParams.has('authId')
  ) {
    throw new Error('npm returned an unexpected WebAuthn URL. Refusing to open or poll an untrusted URL.');
  }
  return { authUrl: auth.toString(), doneUrl: done.toString() };
}

export function openWebAuthUrl(url, { platform = process.platform } = {}) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'www.npmjs.com' ||
    !parsed.pathname.startsWith('/auth/cli/')
  ) {
    throw new Error('Refusing to open an untrusted npm WebAuthn URL.');
  }

  let command;
  let args;
  if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (platform === 'win32') {
    command = 'cmd.exe';
    args = ['/c', 'start', '', url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch (error) {
      reject(error);
      return;
    }
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pollWebAuthToken(doneUrl, {
  fetchImpl = fetch,
  timeoutMs = WEBAUTH_TIMEOUT_MS,
  sleep = delay,
  now = Date.now,
} = {}) {
  const parsed = new URL(doneUrl);
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'registry.npmjs.org' ||
    parsed.pathname !== '/-/v1/done' ||
    !parsed.searchParams.has('authId')
  ) {
    throw new Error('Refusing to poll an untrusted npm WebAuthn completion URL.');
  }

  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const response = await fetchImpl(parsed.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });

    if (response.status === 202) {
      const retryAfter = Number(response.headers?.get?.('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(Math.max(retryAfter * 1000, 500), 5000)
        : 1500;
      await sleep(waitMs);
      continue;
    }

    if (response.status === 404 || response.status === 410) {
      throw new Error('The npm security-key approval link expired or was already used. Run the command again to create a fresh request.');
    }
    if (!response.ok) {
      throw new Error('npm WebAuthn polling failed with HTTP ' + response.status + '.');
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error('npm returned an unreadable WebAuthn token response.');
    }
    const token = body && typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) {
      throw new Error('npm approved the WebAuthn request but did not return a usable one-time token.');
    }
    return token;
  }

  throw new Error('Timed out waiting for npm security-key approval. Run the command again to create a fresh request.');
}

function combinedOutput(result) {
  return [result?.stdout, result?.stderr].filter(Boolean).join('\n');
}

export async function main({
  argv = process.argv.slice(2),
  run = runNpm,
  env = process.env,
  openBrowser = openWebAuthUrl,
  pollToken = pollWebAuthToken,
} = {}) {
  const plan = getDeprecationPlan();
  if (argv.includes('--plan')) {
    console.log('No registry changes made. Planned npm deprecation:');
    console.log(JSON.stringify(plan, null, 2));
    console.log('npm deprecate "' + plan.packageSpec + '" "' + plan.message + '"');
    return 0;
  }

  console.log('Preparing update notice for ' + plan.package + '@' + plan.range + '.');
  console.log('This changes npm deprecation metadata only. It does not unpublish or modify tarballs.');
  if (!env.npm_execpath) {
    console.error('Run with: npm run deprecate:legacy');
    return 1;
  }

  const authStatus = resultStatus(await run(['whoami'], { env }));
  if (authStatus !== 0) {
    console.error('npm authentication is missing or expired. Run npm login as an owner of ' + plan.package + ', then retry npm run deprecate:legacy.');
    return authStatus || 1;
  }

  const latestStatus = resultStatus(await run(['view', plan.package + '@latest', 'version'], { env }));
  if (latestStatus !== 0) {
    console.error('Could not verify the current npm latest version. No deprecation change was made.');
    return latestStatus || 1;
  }

  const args = ['deprecate', plan.packageSpec, plan.message];
  console.log('Applying the update notice to every version matching ' + plan.packageSpec + '.');
  let writeResult = await run(args, { env, capture: true });
  if (resultStatus(writeResult) === 0) {
    console.log('Legacy release update notice applied.');
    return 0;
  }

  const challenge = parseWebAuthChallenge(combinedOutput(writeResult));
  if (!challenge) {
    console.error('npm did not accept the deprecation update. No claim of completion should be made.');
    const output = combinedOutput(writeResult);
    if (output) console.error(output);
    return resultStatus(writeResult) || 1;
  }

  console.log('npm requires security-key approval. Opening the official npm authentication page.');
  console.log('Complete the Google/phone security-key prompt in the browser. The temporary token will be retrieved automatically; do not copy your passkey or enter an OTP.');
  await openBrowser(challenge.authUrl);
  const token = await pollToken(challenge.doneUrl);
  console.log('Security-key approval received. Retrying the deprecation request with the short-lived npm token.');
  writeResult = await run(args, { env, capture: true, otp: token });
  if (resultStatus(writeResult) !== 0) {
    console.error('npm rejected the deprecation request after security-key approval. No completion is claimed.');
    const output = combinedOutput(writeResult);
    if (output) console.error(output);
    return resultStatus(writeResult) || 1;
  }

  console.log('Legacy release update notice applied successfully.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}
