# Slack setup

Capella Housekeeper asks a cluster's owner - by direct message - whether an
idle cluster can be turned off or deleted, and acts on their answer. This page
covers creating the Slack app that makes that possible.

Everything here is optional. With no Slack credentials configured, the
dashboard still syncs and displays every cluster; it just never contacts
anyone and never acts on anything. See
[the read-only posture](../README.md#running-it-read-only).

**Before you enable notifications**, read
[the consent workflow](consent-workflow.md) - it covers what owners actually
receive and which settings can stop a cluster without anyone approving it.

## What you need

- Permission to create and install a Slack app in your workspace. In many
  workspaces this needs a workspace admin's approval at the install step.
- The dashboard already running, and yourself logged into it.

You will end up with two tokens. They do different jobs and are not
interchangeable:

| Token | Looks like | Job |
|---|---|---|
| Bot token | `xoxb-…` | Sending the DM to a cluster's owner |
| App-level token | `xapp-…` | Receiving the owner's button click |

## 1. Create the app

Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** →
**From scratch**. Name it whatever you like (the name appears as the sender of
the DM, so something like `Capella Housekeeper` is worth the ten seconds) and
pick your workspace.

## 2. Add the bot token scopes

In the new app, go to **OAuth & Permissions** → **Scopes** → **Bot Token
Scopes** and add exactly these three:

| Scope | Why it is needed |
|---|---|
| `users:read.email` | Finds the owner's Slack account from the email address Capella records against the cluster |
| `im:write` | Opens a direct-message conversation with that person |
| `chat:write` | Sends the message, and later edits it in place to show the outcome |

All three are required. The app derives the recipient per cluster from the
owner's email address, which is why it needs to look users up by email rather
than posting to one fixed channel.

Then, at the top of the same page, **Install to Workspace** and approve the
prompt. Once installed, that page shows a **Bot User OAuth Token** starting
`xoxb-`. Copy it.

## 3. Enable Socket Mode and get the app-level token

Go to **Socket Mode** and turn it on. Slack will prompt you to generate an
app-level token with the `connections:write` scope as part of enabling it - do
that, and copy the resulting token, which starts `xapp-`. (If you enabled
Socket Mode without generating one, you can create it under **Basic
Information** → **App-Level Tokens**.)

Socket Mode is what makes the buttons work without exposing anything:

```
   Capella Housekeeper                       Slack
   ───────────────────                       ─────
        │                                      │
        │ ──── opens outbound websocket ─────▶ │   (authenticated with xapp-)
        │                                      │
        │ ◀──── owner clicked "Turn off" ───── │   pushed down that connection
        │                                      │
        │ ──── DM / edit message ────────────▶ │   (authenticated with xoxb-)
```

The application dials out; Slack never dials in. There is no Request URL to
register, no inbound HTTP endpoint, and no request signature to verify,
because the click never arrives as an inbound request - it arrives on a
connection this process already opened. Nothing needs to be reachable from the
internet, which means this works unchanged behind NAT, on a laptop, or on a
host with no inbound ports open at all.

You do **not** need to add an Interactivity Request URL. Leave it off.

## 4. Enter both tokens in the dashboard

In the dashboard, go to **Settings** → **Slack credentials**, paste the bot
token and the app-level token, and save.

Two things to know about these fields:

- They are masked. Once saved, the values are not displayed again.
- **Saving a blank field keeps the existing token** rather than clearing it.
  This is deliberate, so that editing one token does not require re-entering
  the other. It also means you cannot clear a token by emptying the field.

Restart the application after saving the app-level token for the first time,
so the Socket Mode connection is established.

## Failure modes worth knowing about

These are silent by design - nothing crashes, you simply never see a message.

**An empty bot token switches notifications off entirely.** Every per-tier
setting is ignored. Nothing is sent, and nothing is logged as wrong, because
"no Slack configured" is a perfectly normal way to run this application.

**An empty app-level token also stops messages being sent** - not just
received. This is the non-obvious one. The reasoning is that a consent
question whose buttons have nowhere to land is worse than no question at all,
so if clicks cannot be received, asks are not sent either. If notifications
are configured and nothing arrives, check that *both* tokens are present.

**A cluster whose owner cannot be resolved is skipped.** If Capella records no
owner for a cluster, or records something that is not email-shaped, that
cluster is passed over - there is no fallback recipient and no message to a
default channel. The cluster stays visible in the dashboard, and an operator
can still act on it manually or send a consent request by hand from the
cluster's row.

**A scope you forgot shows up as `missing_scope`.** Slack rejects the call
naming the scope it wanted. Add it under **OAuth & Permissions**, then
**reinstall the app** - newly added scopes do not take effect on an existing
installation until you do.

## Checking that it works

The most direct test is to send one deliberately, rather than waiting for a
cluster to age into a tier:

1. Find a cluster in the dashboard whose owner is yourself.
2. Use the row's action to send a consent request.
3. You should receive a DM within a few seconds. Click **Snooze**, which is
   the non-destructive option - it opens a modal asking for a duration and a
   reason.
4. Submitting it should update the original message in place, and the
   cluster's row in the dashboard should show the snooze and your reason.

A DM that arrives but whose buttons do nothing means the bot token is fine and
the app-level token or Socket Mode is not.
