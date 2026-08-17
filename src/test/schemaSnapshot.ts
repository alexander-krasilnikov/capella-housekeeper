/**
 * Introspects a SQLite database's structure into a comparable snapshot.
 *
 * Deliberately built from `PRAGMA table_info` / `index_list` / `index_info`
 * rather than the DDL text in `sqlite_master.sql`. SQLite implements
 * `ALTER TABLE ... ADD COLUMN` by appending the new column's definition to the
 * *stored* CREATE TABLE text, so a table that reached its shape by migration
 * carries different DDL than an identically-shaped table created fresh -
 * different whitespace, and the appended columns land after the inline ones
 * relative to the PRIMARY KEY clause. The schemas are equivalent; the text is
 * not. Comparing text would fail a migration that is perfectly correct.
 *
 * See design.md Decision 2 in the harden-test-suite change.
 */
import type { DatabaseSync } from "node:sqlite";

export interface ColumnSnapshot {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | null;
  primaryKeyPosition: number;
}

export interface IndexSnapshot {
  name: string;
  unique: boolean;
  columns: string[];
}

export interface TableSnapshot {
  name: string;
  /**
   * Keyed by column name, not an ordered list. Ordinal position is
   * deliberately not compared: every read and write in store.ts addresses
   * columns by name (`SELECT *` into name-keyed row objects, and named
   * `@parameter` binds built from CLUSTER_RECORD_COLUMNS), so position is not
   * load-bearing and requiring it to match would fail a functionally correct
   * migration. See design.md Decision 2.
   */
  columns: Record<string, ColumnSnapshot>;
  indexes: Record<string, IndexSnapshot>;
}

export interface SchemaSnapshot {
  userVersion: number;
  tables: Record<string, TableSnapshot>;
}

interface TableInfoRow {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface IndexListRow {
  name: string;
  unique: number;
}

/** `sqlite_sequence` and friends are SQLite's own bookkeeping, not part of the schema this project defines. */
function isInternal(name: string): boolean {
  return name.startsWith("sqlite_");
}

export function schemaSnapshot(db: DatabaseSync): SchemaSnapshot {
  const { user_version: userVersion } = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };

  const tableNames = (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string;
    }[]
  )
    .map((r) => r.name)
    .filter((name) => !isInternal(name));

  const tables: Record<string, TableSnapshot> = {};
  for (const name of tableNames) {
    const columns: Record<string, ColumnSnapshot> = {};
    for (const col of db.prepare(`PRAGMA table_info(${name})`).all() as unknown as TableInfoRow[]) {
      columns[col.name] = {
        name: col.name,
        // Normalized because SQLite preserves the declared spelling verbatim,
        // and a migration's ALTER statement may spell a type differently than
        // the original CREATE did without any semantic difference.
        type: col.type.toUpperCase(),
        notNull: col.notnull !== 0,
        defaultValue: col.dflt_value,
        primaryKeyPosition: col.pk,
      };
    }

    const indexes: Record<string, IndexSnapshot> = {};
    for (const idx of db.prepare(`PRAGMA index_list(${name})`).all() as unknown as IndexListRow[]) {
      if (isInternal(idx.name)) continue;
      const indexColumns = (
        db.prepare(`PRAGMA index_info(${idx.name})`).all() as unknown as { name: string | null }[]
      )
        .map((r) => r.name)
        .filter((n): n is string => n !== null);
      indexes[idx.name] = { name: idx.name, unique: idx.unique !== 0, columns: indexColumns };
    }

    tables[name] = { name, columns, indexes };
  }

  return { userVersion, tables };
}

/** Column names present in a snapshot's table, sorted - for asserting on a specific table's shape without diffing the whole schema. */
export function columnNames(snapshot: SchemaSnapshot, table: string): string[] {
  return Object.keys(snapshot.tables[table]?.columns ?? {}).sort();
}
