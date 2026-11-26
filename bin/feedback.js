#!/usr/bin/env node
import { createRequire } from 'node:module';
import { runCli } from '../src/installer.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');
try { process.exitCode = await runCli(['feedback'], { packageVersion: version }); }
catch (error) { console.error('Could not open Shadow feedback:', error?.message || String(error)); process.exitCode = 1; }
