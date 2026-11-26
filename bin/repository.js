#!/usr/bin/env node
import { createRequire } from 'node:module';
import { runCli } from '../src/installer.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');
try { process.exitCode = await runCli(['repository'], { packageVersion: version }); }
catch (error) { console.error('Could not open the Shadow repository:', error?.message || String(error)); process.exitCode = 1; }
