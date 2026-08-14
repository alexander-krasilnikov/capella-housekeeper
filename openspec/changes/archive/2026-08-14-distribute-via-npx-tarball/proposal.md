## Why

Today the only way to run Capella Housekeeper is to clone the repo and run `npm install && npm run build` locally, which pulls in the full development toolchain (TypeScript, Tailwind, Vitest, etc.) just to produce a running server. That's fine for its primary developer but is real friction for any other engineer who just wants to run the dashboard. We want a one-command install/run path - `npx <tarball-url>` - backed by a prebuilt artifact attached to GitHub Releases, so no one needs a local build step, devDependencies, or a git clone to get the tool running.

## What Changes

- Enable `output: 'standalone'` in `next.config.js` so `next build` produces a minimal, dependency-traced server (`.next/standalone/server.js`) instead of relying on a full `node_modules` install at runtime.
- Add a `bin/` launcher script (`#!/usr/bin/env node`) that starts the standalone server, resolves `PORT`/`HOSTNAME`, prints the dashboard URL and default-login reminder on startup, and establishes a stable default data directory instead of an ambient `./data` relative to whatever directory the user happened to launch from.
- Add a GitHub Actions release workflow, triggered on version-tag push, that runs `next build`, copies `public/` and `.next/static/` into the standalone output (Next does not do this automatically), assembles the publishable package (standalone server + launcher + package metadata), packs it with `npm pack`, and attaches the resulting `.tgz` to the GitHub Release for that tag.
- Add an `engines.node` field to `package.json` pinning the minimum Node version, driven by whichever version stabilizes `node:sqlite`'s `DatabaseSync` without an experimental flag (this app's storage layer already depends on it).
- Document the install/run command (`npx https://github.com/<org>/<repo>/releases/download/<tag>/capella-housekeeper-<version>.tgz`) and a background-persistence pattern (sample systemd unit / launchd agent) in the README, since an `npx`-launched process runs in the foreground and has no built-in equivalent of `docker --restart`.
- Not publishing to the public npm registry - this stays a GitHub-hosted internal tool. `npm run dev` / `npm run build` / `npm start` for local development are unaffected.

## Capabilities

### New Capabilities
- `release-distribution`: building a prebuilt, standalone release artifact; the launcher's runtime behavior (data directory resolution, startup messaging, port/host handling); and the GitHub Actions pipeline that builds and publishes that artifact to GitHub Releases on a version tag.

### Modified Capabilities
- None. No existing capability's documented requirements change - the current dev workflow (`npm run dev`/`build`/`start`) and all existing dashboard behavior are untouched. The data-directory default is new behavior owned entirely by the new capability (no existing spec currently documents where data is stored).

## Impact

- **Code**: `next.config.js` (add `output: 'standalone'`), `src/lib/db.ts` (data directory becomes overridable via an environment variable rather than a hardcoded relative path, default unchanged for existing dev/self-host use), new `bin/capella-housekeeper.js` launcher, `package.json` (`bin` field, `engines.node`, `files`/packaging config).
- **CI/CD**: new `.github/workflows/release.yml` (or similar), first GitHub Actions workflow in this repo.
- **Docs**: README gets a new "Install via npx" section alongside the existing "Setup" (source) instructions, plus a background-service appendix.
- **Dependencies**: none added at runtime; no change to `@slack/bolt`, `next`, `node:sqlite` usage.
- **No breaking changes**: additive only. Existing git-clone-and-build workflow keeps working exactly as documented today.
