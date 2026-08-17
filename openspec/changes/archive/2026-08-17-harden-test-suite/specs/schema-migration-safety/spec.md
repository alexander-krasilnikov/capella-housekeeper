## Purpose
Guarantees that a local database created by an earlier build of the application keeps working, with its data intact, when a later build opens it — and that a schema change shipped without its corresponding upgrade path is caught before it ever reaches a user's disk.

## ADDED Requirements

### Requirement: An upgraded database is structurally identical to a fresh one
When a build opens a local database created by any earlier supported build, the resulting schema SHALL be structurally indistinguishable from the schema that same build creates from scratch — the same tables, the same columns with the same declared types and nullability, and the same indexes.

This exists because a database's schema can be reached two ways: created wholesale by the current build, or created by an older build and then upgraded. Those two paths are written independently, so nothing but an explicit equivalence check keeps them from diverging while both report the same schema version.

#### Scenario: Upgraded and freshly created schemas match
- **WHEN** one database is created from scratch by the current build, and another is created at an earlier supported schema version and then opened by the current build
- **THEN** both databases report the same schema version, and enumerating their tables, columns (with declared types and nullability), and indexes yields identical results

#### Scenario: Upgrade is applied on first open, without user action
- **WHEN** a database recorded at an earlier schema version is opened by the current build
- **THEN** the upgrade is applied during that open, and the database records the current schema version afterwards, with no separate command or manual step required of the user

#### Scenario: An already-current database is left alone
- **WHEN** a database already recording the current schema version is opened
- **THEN** no upgrade statements are applied and the schema is unchanged

### Requirement: Existing data survives an upgrade
Rows persisted before an upgrade SHALL remain readable afterwards with their values unchanged, and any field introduced by that upgrade SHALL read as empty rather than producing an error or a malformed record.

#### Scenario: Stored clusters and history survive
- **WHEN** a database holding cluster records and history entries at an earlier schema version is opened by the current build
- **THEN** every one of those records and entries is still readable, and every field that existed before the upgrade holds the value it held before

#### Scenario: Fields introduced by the upgrade read as empty
- **WHEN** a record written before an upgrade is read back after it, and that upgrade introduced new fields
- **THEN** those new fields read as empty (not as a missing key, an undefined value, or an error), and the record is otherwise complete

#### Scenario: Writing to an upgraded database succeeds
- **WHEN** a record is written to a database that reached the current schema version by upgrade rather than by fresh creation
- **THEN** the write succeeds and reads back complete, including the fields the upgrade introduced

### Requirement: Every supported upgrade path is exercised automatically
The project SHALL retain, as committed test fixtures, a database schema for every earlier schema version it claims to support, and its automated checks SHALL exercise the full upgrade path from the earliest such version through to the current one.

Because upgrade paths are applied in sequence, exercising the chain from the earliest retained version forward runs every intermediate upgrade step. This is what makes the equivalence requirement above enforceable rather than aspirational: a schema change shipped without its upgrade step causes the earliest fixture to end up missing that change, which the equivalence check detects.

#### Scenario: A schema change without its upgrade step is rejected
- **WHEN** the current build's schema gains, loses, or alters a column, table, or index without a corresponding upgrade step being defined for it
- **THEN** the project's automated checks fail, identifying the divergence between the upgraded and freshly created schemas

#### Scenario: Fresh-creation path does not mask a missing upgrade step
- **WHEN** a schema change is made and the automated checks run
- **THEN** the checks exercise the upgrade path and not only the fresh-creation path, so a change that works for a new install but not an existing one is still caught

### Requirement: A failed upgrade leaves the recorded version unchanged
If any statement in an upgrade fails, the database SHALL be left at the schema version it held before the attempt, with no partially applied schema change, so that a subsequent open retries the same upgrade rather than treating it as done.

#### Scenario: A failing upgrade statement rolls back
- **WHEN** an upgrade statement fails partway through upgrading a database
- **THEN** no schema change from that upgrade remains applied, and the database still records its previous schema version

#### Scenario: A retried upgrade is not skipped
- **WHEN** a database is opened again after a failed upgrade attempt
- **THEN** the same upgrade is attempted again rather than being skipped as already applied
