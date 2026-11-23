#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const runtimeRoot = path.join(os.homedir(), ".local", "share", "shadow-mcp-hub");
const packageDir = process.env.SHADOW_MCP_HUB_PACKAGE_DIR
  || path.join(runtimeRoot, "node_modules", "@ni-c", "mcp-hub");
const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
if (pkg.version !== "0.13.1") {
  throw new Error("Expected pinned @ni-c/mcp-hub@0.13.1; found " + pkg.version);
}

const tick = String.fromCharCode(96);
const patches = [
  {
    file: "dist/index.js",
    before: "const httpServer = app.listen(port, () => console.log(" + tick
      + "mcp-hub listening on :" + "${port}" + tick + "));",
    after: "const host = process.env.HOST || '127.0.0.1';\n"
      + "    const httpServer = app.listen(port, host, () => console.log('mcp-hub listening on ' + host + ':' + port));",
    reason: "Bind HTTP admin/OAuth listener to loopback by default"
  },
  {
    file: "dist/stdio.js",
    before: "        configPath: process.env.CONFIG_PATH ?? path.resolve('mcp.json'),\n"
      + "        idleTimeoutMinutes: idle,\n"
      + "        toolCachePath: process.env.TOOL_CACHE_PATH || undefined",
    after: "        configPath: process.env.CONFIG_PATH ?? path.resolve('mcp.json'),\n"
      + "        dataPath: process.env.DATA_PATH || undefined,\n"
      + "        idleTimeoutMinutes: idle,\n"
      + "        toolCachePath: process.env.TOOL_CACHE_PATH || undefined",
    reason: "Pass OAuth state directory to stdio upstream auth"
  },
  {
    file: "dist/supervisor.js",
    before: "if (!eraHasPing(client))",
    after: "if (this.name === 'runcrate' || !eraHasPing(client))",
    reason: "Runcrate 1.5.1 accepts MCP but does not implement the ping method"
  }
];

const backupDir = path.join(runtimeRoot, "patch-originals");
fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
for (const patch of patches) {
  const file = path.join(packageDir, patch.file);
  let source = fs.readFileSync(file, "utf8");
  if (source.includes(patch.after)) {
    console.log("OK already patched:", patch.file);
    continue;
  }
  const count = source.split(patch.before).length - 1;
  if (count !== 1) {
    throw new Error("Expected one patch target in " + patch.file + "; found " + count);
  }
  const backup = path.join(backupDir, patch.file.replaceAll("/", "__") + ".original");
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
  source = source.replace(patch.before, patch.after);
  const temp = file + ".shadow-patch-tmp";
  fs.writeFileSync(temp, source);
  fs.chmodSync(temp, fs.statSync(file).mode & 0o777);
  fs.renameSync(temp, file);
  console.log("PATCHED:", patch.file, "-", patch.reason);
}
console.log("MCP_HUB_COMPAT_READY", pkg.version);
