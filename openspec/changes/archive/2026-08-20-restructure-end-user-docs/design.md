## Context

See proposal.md - Why. Two facts about the current state shape the approach.

First, the drift is not uniform: it is concentrated in claims the README made about implementation internals (the store, the settings file, the tunable API base URL) and in scope claims made in the present tense about a moving product. Claims about *what an operator does* have held up better. That pattern is worth designing against rather than merely patching.

Second, the material that is missing is not missing uniformly either. Slack setup is a walkthrough of an external dashboard with an unavoidable back-and-forth; the consent lifecycle is a state machine with destructive terminal states; operations is reference material consulted once something is already wrong; development is for a different reader entirely. These have different shapes, different readers, and different revision rates - which is the substantive argument for splitting them rather than a stylistic one.

## Goals / Non-Goals

Goals:
- A reader can go from the repository's front page to a running, configured, correctly-permissioned installation without reading anything beyond the entry document.
- The two credential setups that currently fail silently or confusingly - a Capella key with insufficient permissions, and a Slack app missing one of four scopes - are documented well enough to succeed on the first attempt.
- An operator can understand what the consent workflow will do to their clusters before enabling any part of it.
- The classes of error found in this audit become mechanically detectable, so the next thirty changes do not reproduce them.

Non-Goals:
- Not a reference manual for every setting. The Settings UI already carries per-field help text, and duplicating it into prose creates a second thing to drift. Documentation covers what the UI cannot: multi-step external setup, cross-setting consequences, and anything destructive.
- Not documenting internal architecture for its own sake. The current README's most wrong statements are precisely its architectural ones, and no reader needed them. Internal structure is described only where an operator acts on it (where data lives, where backups land).
- No screenshots. They are the fastest-drifting documentation artifact in a project revising its UI this often, and every place one would go is a place a sentence works.

## Decisions

### Decision 1: Four documents, split by reader and revision rate - not by topic size

```
  README.md ─────────── what it is · install · log in · point at the rest
      │                 reader: everyone, once
      │
      ├──▶ docs/slack-setup.md ────── external walkthrough, ordered, one-time
      │                               reader: operator enabling notifications
      │                               revises: when Slack's UI or scopes change
      │
      ├──▶ docs/consent-workflow.md ─ state machine + destructive semantics
      │                               reader: operator deciding what to enable
      │                               revises: with every consent-behavior change
      │
      ├──▶ docs/operations.md ─────── reference, consulted under duress
      │                               reader: whoever is on the hook right now
      │                               revises: with storage/release/failure modes
      │
      └──▶ docs/development.md ────── contributor onboarding
                                      reader: someone changing the code
                                      revises: with tooling and CI
```

Alternative considered: one restructured README (Option A from exploration). Rejected because the Slack walkthrough alone is long enough to push the install instructions below the fold, and because a single file gives every reader the same document regardless of which of four unrelated questions they arrived with. The counter-argument - more files drift more - is answered by Decision 4 rather than by consolidation.

Alternative considered: a finer split, one document per capability, mirroring `openspec/specs/`. Rejected: spec organization tracks how the system is built, and there is no reason a reader's question maps onto a capability boundary. `cluster-history-ui`, `dashboard-shell`, and `theme-preference` do not each want a page; they want a sentence each in the right place.

### Decision 2: Describe the product by what an operator does with it, not by how it is built

The rewritten README leads with the operator's two modes - see what is out there, and do something about what is out there - and mentions implementation only where it constrains the operator: the single long-lived process (so, not serverless), the local data directory (so, back it up), and the Node floor (so, upgrade Node). The tech-stack inventory goes away.

This is the direct fix for the drift pattern in Context. Every one of the README's flatly-false statements was an implementation claim volunteered where no reader needed it; the JSON-store paragraph survived a full migration to SQLite because nothing an operator did ever contradicted it. Claims not made cannot rot.

### Decision 3: The read-only posture is documented as a supported configuration, not a project phase

The current README frames read-only as *where the project is*. The rewrite frames it as *a way to run the project*: notifications off, no per-tier consent asks, no destructive settings - a configuration the defaults already produce, since `notificationsByTier` ships with every flag false and no organizations configured.

This is deliberately more than a wording fix. An operator's realistic first question about a tool that can delete their clusters is whether they can run it without that risk, and the honest answer is yes, by default, indefinitely. Saying so converts the README's most misleading sentence into its most reassuring one, and it means the shipped defaults are a documented posture rather than an accident.

### Decision 4: Make the two mechanically-checkable classes of drift mechanically checked

Requirements in this change's spec - commands runnable as written, documented locations matching real ones - are testable for exactly the classes of error this audit found in bulk. Two cheap assertions in the existing Vitest suite:

1. No file under `docs/` or the README contains an unresolved own-project placeholder (`<org>`, `<repo>`).
2. Default values quoted in documentation match `DEFAULT_SETTINGS`. Rather than parsing prose, documentation quotes each default once in a marked, machine-readable form, and the test compares those markers against the imported constants.

Alternatives considered: a link checker (catches broken cross-references but none of the errors actually found - the one broken link here was a real but minor finding among a dozen factual ones); a documentation review item added to the OpenSpec change workflow (relies on the same discipline that produced thirty changes of drift); and nothing at all (the status quo, whose cost this change is currently paying down).

This adds test files but no application code, which keeps the proposal's docs-only boundary intact in the sense that matters: no runtime behavior changes. The `retentionDays` floor of 30 is a good early check of whether the marker approach carries its weight, since that value is both documented and load-bearing.

### Decision 5: The consent workflow is documented as a state machine, with destructive transitions marked

The lifecycle has enough states (pending, reminded, snoozed, expired, approved, declined, acted, failed) and enough paths into destructive outcomes that prose alone forces the reader to hold too much at once. It gets a diagram, with the transitions that stop or destroy a cluster visually distinguished - and specifically the paths that reach a destructive outcome *without* an owner's yes, via `autoTurnOffOnInaction` on expiry or on snooze exhaustion. An operator who reads only the diagram should still come away knowing that turning one setting on means clusters can be stopped by silence.

### Decision 6: Documented as a primary audience: an operator running this against real Capella organizations

Where the two audiences pull in different directions, the operator wins: real credentials, real clusters, real destructive capability. The evaluating reader is served by the README's first screen alone - what this is, what it can do, what it does by default - which is what an evaluation needs and no more. This is an assumption on the exploration's open question, recorded here rather than left implicit; if the intended audience is primarily external, the README's opening reframes but nothing else in this design changes.

### Decision 7: Document the upgrade's real safety property, and supply the backup step the application does not

Verifying the data directory against the code (task 1.3) showed that the schema migration runs inside one transaction and rolls back on failure, but that nothing copies the database beforehand - the `backups/` directory found on a real installation is a hand-made convention, not something the application maintains. An earlier draft of this change asserted an automatic pre-migration backup.

Documentation therefore states the property that actually holds (a failed upgrade leaves the database as it was) separately from the one that does not (a copy exists if the upgrade succeeds but the new version misbehaves), and supplies the manual copy step with its command. The two are easy to conflate, and conflating them is the error mode with real data loss behind it, so they are stated as two distinct sentences rather than one reassuring one.

Alternative considered: adding automatic pre-migration backups to the application as part of this change. Rejected as scope - it is application code in a documentation change, and it is a product decision (retention of old backups, disk growth, where they live) that deserves its own proposal rather than being smuggled in to make a documentation sentence true. Recorded here so the follow-up is not lost.

### Decision 8: Documentation names no release version at all

Resolving the placeholder question (see Open Questions) to the repository's real coordinates exposed a second, worse instance of the same defect: the repository has no published release. The only one is a draft, and there are no tags, so an install command naming a concrete version 404s - and the first draft of the rewritten README named `v0.1.0` in all three snippets.

Documentation therefore names the organization and repository (facts the project knows and that do not change) but never a version (a fact the releases page owns and that changes with every release). The reader is sent to the releases page and fills in `TAG`/`VERSION`, which is a genuine reader-supplied value in the sense the spec's "runnable as written" requirement allows - which release to run really is their choice.

A test enforces this, because it is the one class of documentation error a reader hits before anything else can go right, and because no assertion available here can ask GitHub what exists.

## Risks / Trade-offs

- [Four documents drift independently, and a reader can now be looking at exactly one stale page instead of one stale README] → Decision 4 covers the mechanical classes. Beyond that, the split is by revision rate on purpose: `docs/slack-setup.md` changes when Slack changes, not when this project does, so most changes to this project touch at most one or two documents and the blast radius of a stale one is narrower than a stale README's.
- [Documenting the consent workflow thoroughly makes the tool look more dangerous than the defaults make it] → Correct, and preferable to the inverse. Decision 3 exists partly to keep that honest: the same document that explains what can be destroyed states plainly that nothing is, unless someone turns it on.
- [The marked-default mechanism in Decision 4 is machinery in prose, and machinery in prose tends to be quietly abandoned] → Kept to a single marker form, applied only to numeric defaults, and only where a wrong number misleads. If it is not carrying its weight after a few changes, the assertions are deletable without touching the documentation's readability.
- [Scope creep: an audit found a wrong startup message in the launcher, which this change deliberately does not fix] → Left out on purpose, noted in the proposal's Impact so it is not lost. A docs change that quietly edits application code is harder to review and sets the wrong precedent, and the message is wrong in a way no reader is harmed by for one more change.

## Migration Plan

No deployment, no rollback. One sequencing note: the README rewrite depends on the four `docs/` pages existing, since its job becomes pointing at them - so those land first and the README last, rather than leaving an interval where the entry document promises pages that are not there.

## Open Questions

- ~~Whether the release-distribution placeholders should be filled with the repository's real coordinates or with an explicitly-marked substitution.~~ Resolved during implementation: the repository's own remote is `alexander-krasilnikov/capella-housekeeper`, so every install and service snippet is written with real coordinates and only the release tag/version is left as a marked substitution - the reader genuinely does choose which release to run.
