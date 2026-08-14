#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Keep in sync with `engines.node` in package.json - node:sqlite (this app's
// storage layer, see src/lib/db.ts) needs >=22.13.0 to work without the
// --experimental-sqlite flag.
const MIN_NODE_VERSION = [22, 13, 0];

function parseVersion(version) {
  return version.replace(/^v/, "").split(".").map(Number);
}

function meetsMinimum(current, minimum) {
  for (let i = 0; i < minimum.length; i++) {
    if ((current[i] || 0) !== minimum[i]) return (current[i] || 0) > minimum[i];
  }
  return true;
}

if (!meetsMinimum(parseVersion(process.version), MIN_NODE_VERSION)) {
  console.error(
    `Capella Housekeeper requires Node.js >= ${MIN_NODE_VERSION.join(".")} (this app's storage ` +
      `layer depends on node:sqlite). You're running ${process.version} - please upgrade Node and try again.`,
  );
  process.exit(1);
}

if (!process.env.CAPELLA_DATA_DIR) {
  // Stable per-user default so the same install always sees the same data,
  // regardless of which directory this command happens to be run from - see
  // design.md Decision 4 in the distribute-via-npx-tarball change.
  process.env.CAPELLA_DATA_DIR = path.join(os.homedir(), ".capella-housekeeper", "data");
}
fs.mkdirSync(process.env.CAPELLA_DATA_DIR, { recursive: true });

const port = Number.parseInt(process.env.PORT, 10) || 3000;
const displayHost = process.env.HOSTNAME && process.env.HOSTNAME !== "0.0.0.0" ? process.env.HOSTNAME : "localhost";

console.log("Capella Housekeeper starting...");
console.log(`  Dashboard: http://${displayHost}:${port}`);
console.log("  Login:     admin / change-me - change this in Settings");
console.log(`  Data:      ${process.env.CAPELLA_DATA_DIR}`);
console.log("");

// SQLite's WAL mode (see src/lib/db.ts) is crash-safe by design - an abrupt
// exit here can't corrupt the database, only leave the WAL file unflushed
// until next open. So there's no drain/checkpoint sequence to wait on; this
// handler exists purely so Ctrl-C prints a clear message instead of the
// silent default termination.
function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down.`);
  process.exit(0);
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

require(path.join(__dirname, "..", ".next", "standalone", "server.js"));
