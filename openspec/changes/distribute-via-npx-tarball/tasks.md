## 1. Standalone build output

- [x] 1.1 Add `output: 'standalone'` to `next.config.js`.
- [x] 1.2 Run a real `next build` and inspect `.next/standalone` to confirm `instrumentation.ts` (and therefore the sync scheduler, reconciliation loop, and Slack bot bootstrap) is present and wired into the generated `server.js`. Verified: `instrumentation.js` is present under `.next/standalone/.next/server/`, and a real run of `node .next/standalone/server.js` printed the scheduler's and Slack bot's own startup log lines.
- [x] 1.3 Confirm `proxy.ts` (the login/session gate) is correctly included and enforced when running `node .next/standalone/server.js` directly, not just under `next start`. Verified: `curl http://localhost:<port>/` returned `307` to `/login?from=%2F`.
- [x] 1.4 Confirm `@slack/bolt` and its transitive dependencies are correctly traced/bundled correctly for the standalone server to actually run without crashing. Verified via a real run (Slack bot logged its "not configured" status rather than throwing on import) - `@slack/bolt`'s own dependencies are mostly inlined directly into Turbopack's compiled chunks rather than left as separate `node_modules` folders, which is fine; see task 4.4/design.md Decision 8 for a real (unrelated) portability bug this surfaced with one specific externalized dependency (`express`).

## 2. Stable data directory

- [x] 2.1 In `src/lib/db.ts`, change `const DATA_DIR = "./data"` to `const DATA_DIR = process.env.CAPELLA_DATA_DIR || "./data"`.
- [x] 2.2 Add/update a test confirming `DATA_DIR` still resolves to `./data` when `CAPELLA_DATA_DIR` is unset (source-based behavior unchanged). Added `src/lib/db.test.ts`.
- [x] 2.3 Confirm the existing `data/` backups mechanism and WAL files behave correctly when `DATA_DIR` points somewhere other than `./data`. Verified directly: pointing `CAPELLA_DATA_DIR` at a scratch directory and opening a real connection produced `store.sqlite3`, `store.sqlite3-wal`, and `store.sqlite3-shm` all correctly colocated there (SQLite manages WAL/SHM sidecars itself, relative to wherever the main db file lives - no separate config needed). Note: there is no automated "backups mechanism" in the codebase to re-verify - `data/backups/` is a manually-created snapshot directory, not a code feature.

## 3. Launcher script

- [x] 3.1 Create `bin/capella-housekeeper.js` with a `#!/usr/bin/env node` shebang.
- [x] 3.2 Launcher: if `CAPELLA_DATA_DIR` is not already set in the environment, default it to a stable per-user location (`~/.capella-housekeeper/data`), creating the directory if needed, before starting the server. Verified: same default dir resolved when launched from two different working directories; explicit override respected.
- [x] 3.3 Launcher: assert `process.version` meets the declared minimum (`>=22.13.0`, see task 4.2) and exit with a clear error message if not, before attempting to start the server.
- [x] 3.4 Launcher: start `.next/standalone/server.js` via an in-process `require()` (simplest option - server.js has no `require.main` guard, so requiring it runs it identically to `node server.js`), respecting `PORT`/`HOSTNAME` env vars per Next's documented standalone behavior (unchanged, handled by server.js itself).
- [x] 3.5 Launcher: on successful startup, print the dashboard URL, the default-login reminder, and the resolved data-directory path.
- [x] 3.6 Launcher: handle `SIGINT`/`SIGTERM` with a clear shutdown message. Scoped deliberately narrow: SQLite's WAL mode (see `src/lib/db.ts`) is crash-safe by design, so there's no drain/checkpoint sequence to build - this handler is a UX nicety (clear message instead of Node's silent default termination), not a data-safety mechanism. No existing signal handling exists anywhere else in the codebase today to preserve/interoperate with.

## 4. Package metadata

- [x] 4.1 Add a `bin` field to `package.json` pointing at `bin/capella-housekeeper.js`.
- [x] 4.2 Add the `engines.node` field (`>=22.13.0`) to `package.json`. `node:sqlite` drops the `--experimental-sqlite` flag requirement as of Node v22.13.0 (and v23.4.0); confirmed no warning on the locally available Node v26.7.0.
- [x] 4.4 Write a release-packaging script (`scripts/package-release.mjs`) that assembles a staging directory containing only: a minimal `package.json` (name, version, `bin`, `engines` - no `dependencies`/`devDependencies`/`scripts`), `bin/capella-housekeeper.js`, and `.next/standalone/` (with `public/`+`.next/static/` merged in). Required, not optional: verified empirically that `npx <tarball>` runs an install of whatever `dependencies` the packed `package.json` declares, so packing the repo's real `package.json` directly would make `npx` redundantly re-fetch `next`/`react`/`@slack/bolt`/etc. from the registry instead of using the already-bundled `node_modules`. See design.md Decision 6.
- [x] 4.5 (found during 4.4, not originally planned) Dereference symlinks in the copied `.next/standalone` tree before packing. Turbopack's standalone output symlinks certain externalized dependencies (`express`, here) using an absolute, build-machine-specific path; `npm pack` drops symlinks entirely, and even preserved, the absolute target wouldn't exist on another machine. Verified end-to-end afterward: extracted the packed `.tgz` fresh (and separately ran it through real `npx`) on a from-scratch `HOME`, confirmed the dashboard starts, the login redirect works, and the Slack bot/sync scheduler start correctly. See design.md Decision 8.

## 5. GitHub Actions release pipeline

- [x] 5.1 Add `.github/workflows/release.yml`, triggered on push of tags matching `v*`.
- [x] 5.2 Workflow: checkout, set up Node via `node-version-file: package.json` (reads `engines.node`), `npm ci`.
- [x] 5.3 Workflow: `npm run build`.
- [x] 5.4 Workflow: run the release-packaging script (`node scripts/package-release.mjs`) to build `dist/capella-housekeeper-<version>.tgz` (handles the public/static merge and symlink dereferencing itself).
- [x] 5.5 Workflow: attach `dist/*.tgz` to the GitHub Release for the pushed tag via `softprops/action-gh-release`.
- [x] 5.6 Confirmed: no `npm publish` (or any other registry-touching command) anywhere in the workflow - grepped the file to check.

## 6. Documentation

- [x] 6.1 Add an "Install via npx" section to `README.md` with the exact command form.
- [x] 6.2 Document the default data-directory location and the `CAPELLA_DATA_DIR` override.
- [x] 6.3 Add a background-persistence appendix (systemd unit + launchd agent examples).
- [x] 6.4 Note the declared minimum Node version (>=22.13.0) in both the npx section and the development-setup section.

## 7. End-to-end verification

- [x] 7.2 (verified locally, not yet via a real Release) Built the actual `dist/capella-housekeeper-<version>.tgz` via `node scripts/package-release.mjs`, extracted it fresh to an unrelated path with an isolated `$HOME`, and ran it both directly (`node bin/capella-housekeeper.js`) and through real `npx` (`npx ./dist/....tgz`). Confirmed: the dashboard loads, the login proxy redirect works (`307` to `/login`), the sync scheduler and Slack bot start (Slack correctly reports "not configured" rather than crashing), and no registry network calls happen for `next`/`react`/`@slack/bolt` (no `dependencies` in the shipped package.json).
- [x] 7.3 Verified locally: running the launcher from two different working directories (same `$HOME`, no override) resolved to the identical default data directory; an explicit `CAPELLA_DATA_DIR` override was respected in a separate run.
- [ ] 7.1 Cut a real version tag, let `.github/workflows/release.yml` run on GitHub, and confirm a Release with the `.tgz` asset is created - **not done**. Pushing a tag creates a public GitHub Release and triggers billed Actions usage on the real `origin` remote; this needs the user's explicit go-ahead rather than being done automatically. Local verification (7.2/7.3) exercised the exact artifact this workflow produces (same `package-release.mjs` script, same build), so the only untested part is GitHub Actions/Release mechanics themselves, not the packaging or the app.
