## Context

See `proposal.md` - Why/What Changes for motivation. Relevant current state:

- The app is one always-on Node process: a Next.js 16 (App Router) server plus a background sync scheduler, a reconciliation loop, and a Slack bot (Socket Mode), all started from `instrumentation.ts`.
- Storage is `node:sqlite` (`src/lib/db.ts`), a Node builtin - no native addon, no prebuilt-binary-per-platform problem.
- `DATA_DIR` is currently hardcoded to `"./data"` in `src/lib/db.ts`, resolved relative to `process.cwd()`.
- There is no `.github/workflows/` directory, no `Dockerfile`, no `engines` field, and no `bin` field today - this is greenfield packaging work.
- `next.config.js` does not set `output: 'standalone'` yet.

## Goals / Non-Goals

**Goals:**
- A user with a compatible Node version can run the full application with one `npx <url>` command and nothing else installed.
- The artifact is prebuilt in CI - no compilation, no devDependencies, on the end user's machine.
- The existing git-clone-and-build workflow keeps working exactly as-is.
- Data persists reliably across runs regardless of the directory the command is invoked from.

**Non-Goals:**
- A true single-file compiled executable (Bun `--compile`, Node SEA, `pkg`/`caxa`-style stub) - rejected for this change; see Decisions.
- A Docker image - rejected for this change, not because it's a bad approach in general (it's the most common way to distribute self-hosted Node/Next apps) but because the goal here is specifically an install path that doesn't require Docker on the target machine.
- Publishing to the public npm registry.
- Auto-update / self-update mechanics for an already-running instance.
- Turning the launcher into a full OS-native service manager (installing systemd units automatically, etc.) - we document the pattern, we don't automate its installation.

## Decisions

### 1. `output: 'standalone'` as the build substrate
Next's built-in dependency-traced output (`@vercel/nft`) produces a minimal `server.js` plus only the `node_modules` actually reachable from server code. This is the officially documented mechanism for self-hosting Next outside of `next start` against a full install, and every packaging path we considered builds on top of it (it's also what Next's own Docker recipe uses) - so it's a no-regret first step regardless of how the "make it one command" problem gets solved downstream.

Caveat (from Next's own docs): `public/` and `.next/static/` are **not** copied into `.next/standalone` automatically. The release build step must do this explicitly before packing:
```
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
```

### 2. Ship a prebuilt tarball via `npx <GitHub Release URL>`, not `npx github:org/repo#tag`
`npx github:org/repo#tag` would clone the repo and run `npm install` + a full `next build` on the *user's* machine on every invocation (or rely on npx's own cache, which is not something to depend on for a good first-run experience) - that means every user needs the full devDependency set (TypeScript, Tailwind, Vitest) installable, and a 30-60s+ wait before the app even starts. Prebuilding in CI and attaching a `.tgz` to the GitHub Release means the artifact `npx` fetches is already-built; `npx` just extracts it and runs the declared `bin` script. This mirrors the "build once, run anywhere" idea Docker is popular for, just packaged as an npm tarball instead of an OCI image.

### 3. Not publishing to the public npm registry
This is an internal Couchbase tool. A GitHub Release asset is sufficient as a distribution point and avoids taking on public-registry concerns (name squatting/uniqueness, publish credentials in CI, permanence of published versions). `npx` supports running directly against a tarball URL or a `.tgz` file path, so a registry isn't required for the `npx` workflow to work.

### 4. Stable default data directory, override-able, without changing source-based behavior
`src/lib/db.ts` changes from a hardcoded `const DATA_DIR = "./data"` to reading an environment variable with that as the fallback default:
```
const DATA_DIR = process.env.CAPELLA_DATA_DIR || "./data";
```
This one-line change is sufficient at the storage layer and is invisible to `npm run dev` / `npm start` from source (`CAPELLA_DATA_DIR` is unset, so behavior is identical to today). The new `bin/` launcher is what actually changes the *default* for packaged runs: before starting the standalone server, it sets `CAPELLA_DATA_DIR` (if not already set by the user) to a stable per-user location - e.g. `~/.capella-housekeeper/data` - so the same command run from any working directory resolves to the same data. A user who wants the old CWD-relative behavior back, or a different location entirely, can still set `CAPELLA_DATA_DIR` themselves before invoking `npx`.

This was chosen over two alternatives:
- **Leave `./data` as-is and just document "always launch from the same directory"** - cheapest, but silent data loss on the first time someone forgets is a bad failure mode for a tool whose entire value is historical tracking.
- **Change the default for all deployment modes (including source-based)** - rejected because it's a bigger, unrelated behavior change for existing self-hosters who already depend on `./data` relative to wherever they run the process (e.g. under a process manager with a fixed working directory), and it's out of scope for a change whose purpose is specifically the packaged/npx path.

### 5. `engines.node` minimum version
The app's storage layer depends on `node:sqlite`'s `DatabaseSync`, which was experimental-flagged in early Node 22.x releases before stabilizing. The exact minimum version to declare needs to be confirmed against real behavior (see Open Questions) rather than guessed, but the mechanism is settled: add an `engines.node` field to `package.json` so an incompatible runtime fails fast and legibly (`npm`/`npx` warns, and the launcher can also assert `process.version` at startup and exit with a clear message) rather than crashing deep inside `db.ts` with an opaque error.

### 6. CI job shape: single build-and-package job, triggered on tag push
```
on: push, tags: 'v*'
  job: build-and-release
    - checkout
    - setup-node (pinned to the same minimum version declared in engines.node)
    - npm ci
    - npm run build            # next build, output: standalone now enabled
    - copy public/ and .next/static/ into .next/standalone
    - assemble a release staging directory (see below)
    - npm pack (run from inside the staging directory) -> capella-housekeeper-<version>.tgz
    - create/update GitHub Release for the tag, attach the .tgz
```
A single job is enough here - there's one artifact type (no OS/arch matrix needed, since the tarball just contains JS and the Node runtime is supplied by whatever `npx` is running on the user's machine, not bundled). This is notably simpler than the GitHub Actions matrix a true single-executable approach would have needed.

**Correction found during implementation - the packed `package.json` cannot be the repo's own `package.json`.** Verified empirically: `npx <tarball>` does not just extract and run the tarball's `bin` script - it runs an install step for whatever that package.json's `dependencies` declare, fetching them from the public npm registry, even when `node_modules` are already physically present alongside the bin script. A quick reproduction (packing a throwaway package with `"dependencies": { "left-pad": "1.3.0" }` and running `npx ./that.tgz`) showed npm fetching `left-pad` from the registry before running the bin. Repeating it with `dependencies` removed skipped the fetch entirely and ran instantly.

This means packing straight from the repo root would ship the real `package.json` - with `next`, `react`, `react-dom`, `@tanstack/react-table`, and `@slack/bolt` all listed as `dependencies` - and `npx` would redundantly re-fetch every one of them from the registry on the user's machine, on every install, network permitting. That defeats the entire point of bundling `.next/standalone/node_modules` (which already contains all of these, correctly traced by the build). It would also be a subtly different copy of these packages, resolved by whatever `npm install` picks at install time rather than the exact versions the release was built and tested against.

The fix: the release step assembles a **separate staging directory** (not the repo root) containing exactly:
```
<staging>/
├── package.json        # minimal - name, version, bin, engines only. NO dependencies/devDependencies/scripts.
├── bin/capella-housekeeper.js
└── .next/standalone/... # the built server + its own bundled node_modules
```
`npm pack` runs from inside `<staging>`, so the tarball's `package.json` has nothing for `npx`/`npm` to try to install - the bin script's own `require`/`import` calls resolve against `.next/standalone/node_modules`, which is already complete. This supersedes the earlier idea of controlling packed contents via a `files` field on the repo's own `package.json` - a `files` allowlist does correctly override `.gitignore` (also verified empirically, since `.next/` is gitignored here), but it doesn't address the deeper problem, which is the *content* of the packed `package.json` itself, not which paths get included.

### 7. Verify `instrumentation.ts` survives standalone output before relying on it
Next's docs don't call out any standalone-specific caveat for the instrumentation hook, but given the entire application (sync loop, reconciliation, Slack bot) hangs off that one file, this gets an explicit verification task (inspect `.next/standalone` after a real build, confirm the hook fires) rather than being assumed to work.

### 8. Dereference symlinks in the packaging script - found during implementation, not anticipated
Turbopack's `output: 'standalone'` build creates symlinks under `.next/standalone/.next/node_modules/` for certain "externalized" dependencies - in this app's case, `express` (pulled in transitively via `@slack/bolt`, which Next apparently declines to inline into a chunk the way it does most of Bolt's other dependencies). Each symlink's target is an **absolute, build-machine-specific path** (e.g. `/Users/.../capella-housekeeper/.next/standalone/node_modules/express`).

This was invisible in every same-machine test (direct copy, `fs.cpSync`, even a hand-rolled `tar`) because the symlink's absolute target still happened to exist on the same machine regardless of where the copy landed. It only surfaced once the artifact was actually packed with `npm pack` and extracted - `npm pack` drops symlinks entirely (documented npm behavior), so the express reference silently vanished, and the standalone server crashed on startup with `Cannot find module 'express-<hash>'` while loading the instrumentation hook. Critically, even if `npm pack` preserved the symlink, it would still be broken on any machine other than the one that ran the build - so this isn't an npm-specific workaround, it's a real portability gap in the standalone output itself.

Fix: the packaging script (`scripts/package-release.mjs`) walks the copied `.next/standalone` tree and replaces every symlink with a real recursive copy of what it points to, before packing. `fs.cpSync`'s `dereference` option does **not** handle this - it only dereferences a symlink passed as the top-level `src`, not ones encountered while recursively copying a directory (verified empirically) - so this needed a manual recursive walk instead.

This is a targeted fix rather than trying to configure Next/Turbopack to stop externalizing specific packages (e.g. via `serverExternalPackages`), because which packages get this treatment is an internal bundler decision that could change across Next versions or as dependencies change; dereferencing symlinks unconditionally is correct regardless of which packages end up externalized.

## Risks / Trade-offs

- **[Risk] An `npx`-launched process runs in the foreground and dies when the terminal closes** → Mitigation: documented systemd/launchd examples (per the new spec's "Background-persistence guidance" requirement). We are not automating service installation in this change - that's a reasonable follow-up if it turns out to be a common request.
- **[Risk] macOS Gatekeeper / Windows SmartScreen friction on unsigned artifacts** → Out of scope for this change (no code signing/notarization pipeline is being added). Since the artifact is JS run by an already-trusted `node`/`npx` binary rather than an unsigned native executable, this risk is much smaller than it would be for a true compiled single-executable, but a `.tgz` downloaded from the internet can still trigger a browser download warning depending on how the user fetches it - worth a documentation note, not a pipeline change.
- **[Risk] `engines.node` mismatch on the end user's machine** → Mitigated by both `npm`/`npx`'s own engines check and a startup assertion in the launcher with a clear error message pointing at the required version.
- **[Trade-off] Chose npx-over-tarball-URL over Docker despite Docker being the more common pattern for this class of app** → Accepted deliberately (see Goals/Non-Goals) because the explicit ask was an install path that doesn't require Docker on the target machine. Revisit if that constraint changes.
- **[Risk] A future Next/Turbopack version externalizes a different or additional dependency the same way it does `express` today** → Mitigated by Decision 8's fix being unconditional (dereference *any* symlink found under the standalone output), not a hardcoded exception for `express` specifically - a newly-externalized package would be handled the same way without changes to the packaging script.

## Migration Plan

This is purely additive - there is no existing release process to migrate away from. Rollout is: land this change, cut a tag once `tasks.md` is complete, confirm the resulting Release artifact actually runs end-to-end (fresh machine or clean container, no prior clone), then update the README to point people at the new install command. No rollback concerns beyond "don't cut a new tag" if a release turns out broken - source-based installs are entirely unaffected either way.

## Open Questions

- **Exact minimum Node version for `engines.node`**: needs to be confirmed by testing `node:sqlite`'s `DatabaseSync` against candidate Node versions (starting with whatever LTS is current) rather than assumed - this doesn't change the spec, the approach, or the task breakdown, only the specific version string landed on.
