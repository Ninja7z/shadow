#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

export const LEGACY_VERSION_RANGE = '<0.1.7';
export const LEGACY_PACKAGE_SPEC = packageJson.name + '@' + LEGACY_VERSION_RANGE;

export function buildLegacyDeprecationMessage() {
  return [
    'UPDATE AVAILABLE: This Shadow Gateway release is outdated and predates the built-in update checker.',
    'Install the latest release with: npm install --global ' + packageJson.name + '@latest.',
    'Release notes: https://github.com/Ninja7z/shadow/releases.',
  ].join(' ');
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

function runNpm(args, { env = process.env } = {}) {
  const invocation = npmInvocation(args, env);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
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

export function main({ argv = process.argv.slice(2), run = runNpm, env = process.env } = {}) {
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

  const authStatus = run(['whoami'], { env });
  if (authStatus !== 0) {
    console.error('npm authentication is missing or expired. Run npm login as an owner of ' + plan.package + ', then retry npm run deprecate:legacy.');
    return authStatus || 1;
  }

  const latestStatus = run(['view', plan.package + '@latest', 'version'], { env });
  if (latestStatus !== 0) {
    console.error('Could not verify the current npm latest version. No deprecation change was made.');
    return latestStatus || 1;
  }

  console.log('Applying the update notice to every version matching ' + plan.packageSpec + '.');
  const deprecateStatus = run(['deprecate', plan.packageSpec, plan.message], { env });
  if (deprecateStatus !== 0) {
    console.error('npm did not accept the deprecation update. No claim of completion should be made.');
    return deprecateStatus || 1;
  }

  console.log('Legacy release update notice applied. Verify with npm view ' + plan.package + '@0.1.6 deprecated.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}
