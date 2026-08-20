# Capella Housekeeper

Finds the Couchbase Capella clusters nobody is using any more, and helps you
do something about them.

It polls the Capella Management API across every organization and project you
configure, keeps a local history of what it finds, and shows everything in one
filterable, sortable table. From there it can ask a cluster's owner - by Slack
DM - whether an idle cluster can be turned off or deleted, and carry out their
answer. An operator can also act directly, without asking anyone.

**Out of the box it does none of that acting.** A fresh installation is a
read-only dashboard, and stays one until you turn something on. See
[running it read-only](#running-it-read-only).

## What it shows

For every cluster, across every configured organization: organization,
project, name, creation date, age, last activity, owner, a compact
configuration summary (`3× 4vCPU/16GB, aws/us-east-1`), operational status,
recency tier, and actual billed cost - which lags the Capella Billing API by
up to about five days.

Clusters that disappear from Capella are kept as a visibly deleted tombstone
for the retention period (30 days by default) rather than vanishing
<!-- default: retentionDays = 30 -->, so a
short-lived cluster still leaves a trace. A second tab holds the lifecycle
history: what changed, when, who or what decided it, and what came of it.

## Requirements

- **Node.js 22.13.0 or newer.** The storage layer uses `node:sqlite`, which
  needs that version to work without an experimental flag.
- **A Capella API key** per organization you want to watch - see
  [below](#the-capella-api-key).
- Nothing else. No database server, no git clone, no build step, no
  environment variables.

## Install

Each GitHub Release has a prebuilt tarball attached. Run it directly:

Pick the release you want from
[the releases page](https://github.com/alexander-krasilnikov/capella-housekeeper/releases), then substitute its tag and
version below - `TAG` is the tag name (for example `v0.2.0`) and `VERSION` is
the same number without the leading `v`:

```bash
npx https://github.com/alexander-krasilnikov/capella-housekeeper/releases/download/TAG/capella-housekeeper-VERSION.tgz
```

The releases page is the authority on what exists; this documentation
deliberately does not name a version, so it cannot go stale or point at a
release that was never published. Nothing is published to the public npm
registry, so the full URL is required rather than a bare package name.

On startup it prints where it is and where its data lives:

```
Capella Housekeeper starting...
  Dashboard: http://localhost:3000
  Login:     admin / change-me
  Data:      /home/you/.capella-housekeeper/data
```

Data lives in a stable per-user directory, so it does not matter which
directory you launch from - running it again later, from anywhere, sees the
same clusters and history. `CAPELLA_DATA_DIR`, `PORT`, and `HOSTNAME` all
work as you would expect.

`npx` runs in the foreground, so closing the terminal stops it. For anything
beyond a first look, run it under systemd or launchd - see
[operations](docs/operations.md#running-it-as-a-persistent-service).

## First run

1. **Open the dashboard** and log in as `admin` / `change-me`.
2. **Set a real password.** You will be redirected straight to a
   password-change page and cannot reach anything else until you have
   replaced the default. This is enforced, not advisory.
3. **Add an organization** under **Settings** → **Capella organizations**:
   its organization ID and an API key. The organization's name and the number
   of projects the key can see are resolved live from Capella, so a wrong ID
   or an insufficient key is visible immediately, before you save.
4. **Wait for the first sync.** It runs at once on startup and then on the
   configured interval (hourly by default) <!-- default: syncIntervalHours = 1 -->. Until a cycle completes with at
   least one organization configured, the dashboard is empty.

That is the whole setup. Settings are stored in the database, take effect on
next use without a restart, and there is no configuration file to edit.

## The Capella API key

**A read-only key is not enough** if you intend to use any of the action
features. Listing clusters works perfectly with read access, and then every
turn-off and delete fails.

The key needs to permit the operations the application actually performs:

| Operation | Needed for |
|---|---|
| Read organization, projects, clusters | The dashboard itself |
| Read the organization's event log | Deriving last activity and owner |
| Read per-cluster billing usage | The cost column |
| Change a cluster's activation state | Turning clusters off (and on) |
| Delete a cluster | Deleting clusters |

If you want visibility only, a read-only key is the right choice - it makes
the read-only posture below true at the credential level as well as in
configuration, which is a stronger guarantee than a setting.

Keys may be scoped to a whole organization or to a single project. Several
entries may share one organization ID with different project-scoped keys; each
cluster is then acted on through the exact key that discovered it.

## Running it read-only

The defaults take no action against any cluster, and this is a supported way
to run the application indefinitely - not an earlier phase of the project.

Specifically, with a fresh installation:

- No Slack credentials are set, so nobody is ever contacted.
- Every notification setting for both notifiable tiers is off, so no consent
  is ever requested.
- Nothing is turned off or deleted without a person pressing a button.

To keep it that way, leave **Settings** → **Slack notifications** alone. To
guarantee it regardless of settings, give it a read-only API key: the manual
action buttons will then fail against Capella rather than depending on nobody
clicking them.

When you are ready for more, the
[consent workflow](docs/consent-workflow.md) covers what each setting does,
and in particular which ones can stop a cluster without anyone approving it.

## Documentation

| | |
|---|---|
| [Slack setup](docs/slack-setup.md) | Creating the Slack app, both tokens, the four scopes, and why nothing needs to be exposed to the internet |
| [The consent workflow](docs/consent-workflow.md) | Recency tiers, what owners are asked, snoozes and expiry, what acts without an answer, and manual actions |
| [Operations](docs/operations.md) | Running as a service, the data directory, upgrading and backups, retention, troubleshooting |
| [Development](docs/development.md) | Local setup, tests and CI, schema changes, cutting a release, code layout |

## How it runs

Two facts about the architecture matter to whoever operates it:

- **It is one long-lived process.** The sync loop, the reconciliation loop,
  and the Slack connection all live inside the web server. It cannot be
  deployed to serverless or edge platforms, and two copies must not share a
  data directory.
- **All state is one local SQLite file.** Backing it up is copying a file;
  the application never does that for you. See
  [upgrading](docs/operations.md#upgrading).

## Background

This was built from an OpenSpec proposal, and the specs under
`openspec/specs/` remain the contract for how it behaves. The original
proposal and design decisions are archived at
[openspec/changes/archive/2026-08-06-cluster-monitoring-dashboard](openspec/changes/archive/2026-08-06-cluster-monitoring-dashboard).
Its framing is now historical: that change scoped the project to read-only
visibility, and the governance features it deferred have since been built.

## License

Apache 2.0 - see [LICENSE](LICENSE).
