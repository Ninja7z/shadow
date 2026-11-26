#!/usr/bin/env node
import { runCli } from '../src/installer.js';
try { process.exitCode = await runCli(['feedback']); }
catch (error) { console.error('Could not open Shadow feedback:', error?.message || String(error)); process.exitCode = 1; }
