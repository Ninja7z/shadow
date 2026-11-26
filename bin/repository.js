#!/usr/bin/env node
import { runCli } from '../src/installer.js';
try { process.exitCode = await runCli(['repository']); }
catch (error) { console.error('Could not open the Shadow repository:', error?.message || String(error)); process.exitCode = 1; }
