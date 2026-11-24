#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '../src/installer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));

try {
  const code = await runCli(process.argv.slice(2), { packageVersion: packageJson.version });
  process.exitCode = Number.isInteger(code) ? code : 0;
} catch (error) {
  console.error('\nShadow could not complete this command.');
  console.error(error?.message || String(error));
  console.error('\nFor help, run: shadow --help');
  process.exitCode = 1;
}
