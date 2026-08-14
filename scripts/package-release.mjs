#!/usr/bin/env node
// Assembles the npx-installable release tarball for a distribute-via-npx-tarball
// GitHub Release. Run after `npm run build` (with `output: 'standalone'` in
// next.config.js).
//
// Packs from a *separate staging directory*, not the repo root, on purpose:
// `npx <tarball>` runs an install of whatever `dependencies` the packed
// package.json declares - verified empirically (see design.md Decision 6) -
// so shipping the repo's real package.json would make npx redundantly
// re-fetch next/react/@slack/bolt/etc. from the registry instead of using
// the already-bundled `.next/standalone/node_modules`. The staging
// package.json below has no dependencies at all.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = path.join(repoRoot, ".next", "standalone");
const stagingDir = path.join(repoRoot, ".release-staging");
const distDir = path.join(repoRoot, "dist");

function fail(message) {
  console.error(`[package-release] ${message}`);
  process.exit(1);
}

/**
 * Replaces every symlink under `dir` (recursively) with a real copy of what it
 * points to. `fs.cpSync`'s `dereference` option only dereferences a symlink
 * passed as the top-level `src` - it does NOT follow symlinks encountered
 * while recursively copying a directory's contents (verified empirically),
 * so Turbopack's build-machine-absolute-path symlinks (see below) survive a
 * plain recursive copy and need this explicit post-pass instead.
 */
function dereferenceSymlinks(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      const real = fs.realpathSync(entryPath);
      fs.rmSync(entryPath, { recursive: true, force: true });
      fs.cpSync(real, entryPath, { recursive: true });
      dereferenceSymlinks(entryPath);
    } else if (entry.isDirectory()) {
      dereferenceSymlinks(entryPath);
    }
  }
}

if (!fs.existsSync(path.join(standaloneDir, "server.js"))) {
  fail("`.next/standalone/server.js` not found - run `npm run build` first (with output: 'standalone' set).");
}

// Next docs: public/ and .next/static/ aren't copied into .next/standalone automatically.
const publicDir = path.join(repoRoot, "public");
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(standaloneDir, "public"), { recursive: true });
}
const staticDir = path.join(repoRoot, ".next", "static");
if (fs.existsSync(staticDir)) {
  fs.cpSync(staticDir, path.join(standaloneDir, ".next", "static"), { recursive: true });
}

fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });

fs.cpSync(standaloneDir, path.join(stagingDir, ".next", "standalone"), { recursive: true });

// Turbopack's standalone output creates symlinks for certain "externalized"
// packages (e.g. express, pulled in transitively via @slack/bolt) under
// .next/standalone/.next/node_modules, pointing at an ABSOLUTE,
// build-machine-specific path. npm pack drops symlinks entirely (documented
// npm behavior), and even if it didn't, the absolute target wouldn't exist on
// a different machine anyway. This replaces each such symlink with a real
// copy of what it points to, so the packaged artifact has no dependency on
// the machine it was built on. See design.md Decision 8 in the
// distribute-via-npx-tarball change.
dereferenceSymlinks(path.join(stagingDir, ".next", "standalone"));
fs.mkdirSync(path.join(stagingDir, "bin"), { recursive: true });
fs.cpSync(
  path.join(repoRoot, "bin", "capella-housekeeper.js"),
  path.join(stagingDir, "bin", "capella-housekeeper.js"),
);

const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));

// Minimal on purpose - no `dependencies`/`devDependencies`/`scripts`. See file header.
const releasePkg = {
  name: rootPkg.name,
  version: rootPkg.version,
  private: true,
  bin: { "capella-housekeeper": "bin/capella-housekeeper.js" },
  engines: rootPkg.engines,
};
fs.writeFileSync(path.join(stagingDir, "package.json"), `${JSON.stringify(releasePkg, null, 2)}\n`);

fs.mkdirSync(distDir, { recursive: true });
execFileSync("npm", ["pack", "--pack-destination", distDir], { cwd: stagingDir, stdio: "inherit" });

console.log(`[package-release] wrote ${rootPkg.name}-${rootPkg.version}.tgz to ${path.relative(repoRoot, distDir)}/`);
