# Operating Capella Housekeeper

Reference for running this in place over time: where its data lives, how to
keep it running, how to upgrade it, and what to check when something is wrong.

## Running it as a persistent service

`npx` runs in the foreground, so closing the terminal stops the process. Since
the whole point of this application is an always-on sync loop and a Slack
connection, you will usually want it supervised.

Both examples below pin an explicit release rather than tracking "latest", so
a restart cannot silently change versions underneath you. Replace `TAG` and
`VERSION` with the release you intend to run, from
[the releases page](https://github.com/alexander-krasilnikov/capella-housekeeper/releases):

**systemd** (Linux) - `/etc/systemd/system/capella-housekeeper.service`:

```ini
[Unit]
Description=Capella Housekeeper
After=network.target

[Service]
ExecStart=/usr/bin/npx https://github.com/alexander-krasilnikov/capella-housekeeper/releases/download/TAG/capella-housekeeper-VERSION.tgz
Restart=on-failure
User=YOUR_USER

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now capella-housekeeper
journalctl -u capella-housekeeper -f      # follow the logs
```

**launchd** (macOS) - `~/Library/LaunchAgents/com.capella-housekeeper.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.capella-housekeeper</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/npx</string>
    <string>https://github.com/alexander-krasilnikov/capella-housekeeper/releases/download/TAG/capella-housekeeper-VERSION.tgz</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.capella-housekeeper.plist
```

Ctrl-C (or a `SIGTERM` from either supervisor) is safe at any moment. The
database uses SQLite's write-ahead log, so an abrupt exit cannot corrupt it -
at worst it leaves the log unflushed until the next start.

### It must be a single, long-lived process

The sync loop, the reconciliation loop, and the Slack connection all live
inside the web server's own process. That has two consequences:

- **This cannot be deployed to serverless or edge platforms.** There is no
  external cron and no queue; if the process is not running, nothing is
  polled, nothing is notified, and nothing is acted on.
- **Do not run two copies against the same data directory.** Both would sync,
  notify, and act independently against one database.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `CAPELLA_DATA_DIR` | `~/.capella-housekeeper/data` | Where the database lives |
| `PORT` | `3000` | Port to listen on |
| `HOSTNAME` | all interfaces | Address to bind |

Everything else - credentials, thresholds, sync interval, retention, Slack
tokens, notification behaviour - is configured in the dashboard under
**Settings** and stored in the database. There is no configuration file to
edit, and no `.env` to populate.

Changes take effect on next use: the next sync cycle, the next recency
computation. No restart is needed. The one exception is a newly added Slack
app-level token, which needs a restart to open the Socket Mode connection.

## The data directory

Everything the application knows lives in one SQLite database:

```
~/.capella-housekeeper/data/
├── store.sqlite3           clusters, history, and all settings
├── store.sqlite3-wal       write-ahead log     ) transient; both are part of
└── store.sqlite3-shm       shared memory index ) the database, do not delete
```

The default location is per-user and stable, so it does not matter which
directory you launch from - the same install always sees the same clusters and
history. `CAPELLA_DATA_DIR` overrides it.

To copy or move an installation, copy all three files together while the
process is stopped.

## Upgrading

Point `npx` at a newer release and start it against the same data directory:

```bash
npx https://github.com/alexander-krasilnikov/capella-housekeeper/releases/download/TAG/capella-housekeeper-VERSION.tgz
```

Any schema changes needed are applied automatically when the database is
opened. They run inside a single transaction that rolls back if any step
fails, so **an upgrade that fails leaves your database exactly as it was**.
The upgrade path is covered by tests that assert an upgraded database is
structurally identical to a freshly created one.

### That is not a backup - take one first

A rollback protects you from an upgrade that fails. It does not protect you
from an upgrade that succeeds and then behaves in a way you want to undo:
schema changes are not reversed on downgrade, so an older build may not read a
newer database.

**The application never writes a backup.** Take one yourself before
upgrading, with the process stopped:

```bash
mkdir -p ~/.capella-housekeeper/data/backups
cp ~/.capella-housekeeper/data/store.sqlite3 \
   ~/.capella-housekeeper/data/backups/store-$(date +%Y-%m-%d).sqlite3
```

To restore, stop the process, delete `store.sqlite3` along with its `-wal` and
`-shm` companions, and copy the backup back into place under the original
name.

## Retention has a floor of 30 days

`retentionDays` (**Settings** → **Sync & retention**, default 30) governs how
<!-- default: retentionDays = 30 -->
long history entries are kept and how long a deleted cluster stays visible as
a tombstone.

**Do not lower it below 30.** The consent-and-action health statistics
reconstruct each cluster's consent cycle by tracing an action back to the
approval that authorised it, looking back up to 30 days. Purging history
sooner cuts that lineage, and the failure is silent: no error, just actions
that stop being attributable to the decisions that caused them.

Raising it is safe, and costs disk in proportion to cluster count and change
rate.

## Rotating the session secret

Sessions are authenticated with a signed cookie. The signing secret is
generated on first run, is never displayed, and cannot be set by hand - the
Settings page offers only a **Rotate** action.

Rotating it invalidates every signed cookie in existence, so **every active
session is logged out immediately**, including yours. This is the tool for
responding to a suspected leak, or for evicting a session you cannot otherwise
reach.

## Troubleshooting

**It refuses to start, naming a Node version.** The storage layer uses
`node:sqlite`, which needs Node 22.13.0 or newer to work without an
experimental flag. Check with `node --version` and upgrade. The launcher checks
this before anything else and exits with a clear message rather than failing
obscurely later.

**The dashboard is empty and stays empty.** In order: is at least one
organization configured under **Settings** → **Capella organizations**? Has a
sync cycle completed - the first runs immediately at startup, then on the
configured interval? Does the API key actually have visibility of the projects
you expect (the Settings row reports the project count it can see)? Check the
process output for sync errors.

**Every cluster action fails against Capella.** Almost always an
under-permissioned API key. Turning a cluster off, turning it on, and deleting
it are writes; a read-only key lists clusters perfectly and then fails every
action. See [the credential requirements](../README.md#the-capella-api-key).

**Actions fail for one organization only.** If several configured entries
share the same `orgId` with different project-scoped keys, each cluster is
acted on through the exact key that discovered it. A cluster synced before
that association was tracked self-heals on its next sync. If the organization
was removed from Settings entirely, its clusters can no longer be acted on at
all.

**Slack says `missing_scope`.** A scope is absent from the bot token. Add it,
then reinstall the app - new scopes do not apply to an existing installation.
See [Slack setup](slack-setup.md).

**No Slack messages at all.** Both tokens must be present; an empty
app-level token suppresses sending as well as receiving. See
[the failure modes](slack-setup.md#failure-modes-worth-knowing-about).

**Slack messages arrive but buttons do nothing.** Socket Mode is not
connected. Confirm the app-level token is saved and restart the process.

**Port already in use.** Set `PORT` to something else.

**Costs show as unavailable.** The Capella billing API lags by up to about
five days, and a credits-based organization reports no per-cluster spend at
all. The dashboard distinguishes "no access", "credits-based", and "error" for
this reason - it is a property of the account, not a bug.
