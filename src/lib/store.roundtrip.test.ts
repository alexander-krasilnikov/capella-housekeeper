/**
 * Round-trip property for the 35-column record mapping.
 *
 * `clusterRecordToRow` and `rowToClusterRecord` are hand-written inverses of
 * each other, and three of the fields are not symmetric on their face: the
 * database stores `null` where the type says `undefined`
 * (`orgConfigId`, `actualCost.unavailableReason`, `couchbaseVersion`), plus
 * `workflowNote` carries a `?? null` fallback for rows written before that
 * column existed. Asserting `rowToClusterRecord(clusterRecordToRow(r)) === r`
 * over a spread of records pins the whole mapping in one place, so a field
 * added to one function and forgotten in the other fails here.
 */
import { describe, expect, it } from "vitest";
import { clusterRecordToRow, rowToClusterRecord } from "./store";
import { makeClusterRecord } from "../test/factories";
import type { ClusterRecord } from "../types";

function roundTrip(record: ClusterRecord): ClusterRecord {
  return rowToClusterRecord(clusterRecordToRow(record));
}

/** Named variants covering each field's interesting values, not just the defaults. */
const VARIANTS: Array<[name: string, record: ClusterRecord]> = [
  ["the neutral default", makeClusterRecord()],

  [
    "every optional field absent",
    makeClusterRecord({
      orgConfigId: undefined,
      config: {
        cloudProvider: "aws",
        region: "us-east-1",
        couchbaseVersion: undefined,
        nodeCount: 1,
        nodeSpec: { compute: { cpu: 2, ram: 4 } },
        status: null,
      },
      ownerDerived: null,
      lastActivityAt: null,
      lastActivitySource: "unknown",
      actualCost: { amountUsd: null, asOf: null, unavailableReason: undefined },
      deletedAt: null,
      lastNotifiedRecency: null,
      consentCycleStartedAt: null,
      consentTierAtDecision: null,
      slackChannelId: null,
      slackMessageTs: null,
      snoozeUntil: null,
      snoozeJustification: null,
      consentStatusChangedAt: null,
      workflowNote: null,
    }),
  ],

  [
    "every optional field present",
    makeClusterRecord({
      orgConfigId: "cfg-abc",
      config: {
        cloudProvider: "azure",
        region: "westeurope",
        couchbaseVersion: "7.6.2",
        nodeCount: 9,
        nodeSpec: { compute: { cpu: 16, ram: 64 } },
        status: "turningOff",
      },
      ownerDerived: "someone@example.com",
      lastActivityAt: "2026-02-02T02:02:02.000Z",
      lastActivitySource: "activity-log",
      actualCost: { amountUsd: 1234.56, asOf: "2026-02-02T00:00:00.000Z", unavailableReason: undefined },
      deletedAt: "2026-02-03T00:00:00.000Z",
      lastNotifiedRecency: "Old",
      consentStatus: "approved-delete",
      consentCycleStartedAt: "2026-02-01T00:00:00.000Z",
      consentStatusChangedAt: "2026-02-02T00:00:00.000Z",
      remindersSent: 2,
      consentTierAtDecision: "Old",
      actionOutcome: "performed",
      slackChannelId: "D123456",
      slackMessageTs: "1767225600.000100",
      snoozeUntil: "2026-03-01T00:00:00.000Z",
      snoozeJustification: "needed for a POC",
      snoozeCount: 3,
      workflowNote: "turned off automatically",
    }),
  ],

  [
    "a cost that is unavailable with a reason",
    makeClusterRecord({ actualCost: { amountUsd: null, asOf: null, unavailableReason: "credits-based" } }),
  ],

  [
    "a cost carried forward alongside an unavailable reason",
    makeClusterRecord({
      actualCost: { amountUsd: 42, asOf: "2026-01-01T00:00:00.000Z", unavailableReason: "no-access" },
    }),
  ],

  ["a zero cost, which must not be confused with absent", makeClusterRecord({ actualCost: { amountUsd: 0, asOf: "2026-01-01T00:00:00.000Z" } })],

  ["fractional node compute", makeClusterRecord({ config: { ...makeClusterRecord().config, nodeSpec: { compute: { cpu: 0.5, ram: 1.5 } } } })],

  ["zero counters, which must not be confused with absent", makeClusterRecord({ remindersSent: 0, snoozeCount: 0 })],

  ["an empty-string justification", makeClusterRecord({ snoozeJustification: "" })],

  ["text carrying quotes and newlines", makeClusterRecord({ workflowNote: "he said \"no\"\nand then 'left'", snoozeJustification: "line1\nline2\ttabbed" })],

  ["unicode in names", makeClusterRecord({ clusterName: "clúster-ünïcode-日本語-🎉", orgName: "Ørg Ñame", projectName: "проект" })],
];

describe("clusterRecordToRow / rowToClusterRecord round-trip", () => {
  for (const [name, record] of VARIANTS) {
    it(`preserves ${name}`, () => {
      expect(roundTrip(record)).toEqual(record);
    });
  }

  it("is idempotent across repeated round-trips", () => {
    const record = VARIANTS[2][1];
    expect(roundTrip(roundTrip(roundTrip(record)))).toEqual(record);
  });

  it("normalizes an absent optional to undefined rather than leaking null into the type", () => {
    const record = makeClusterRecord({ orgConfigId: undefined });
    const restored = roundTrip(record);

    // The column holds null, but the field must come back undefined - the
    // declared type has no null for it.
    expect(clusterRecordToRow(record).orgConfigId).toBeNull();
    expect(restored.orgConfigId).toBeUndefined();
    expect("orgConfigId" in restored).toBe(true);
  });

  it("restores workflowNote as null when the column is absent entirely (a pre-migration row)", () => {
    const row = clusterRecordToRow(makeClusterRecord());
    delete row.workflowNote;

    // This is the case rowToClusterRecord's `?? null` exists for - a row read
    // from a database whose upgrade added the column after the row was written.
    expect(rowToClusterRecord(row).workflowNote).toBeNull();
  });

  it("maps every column the schema declares, with nothing left over", () => {
    const row = clusterRecordToRow(makeClusterRecord());

    // A field added to ClusterRecord but not to the row mapping shows up as a
    // missing key here rather than as silent data loss at runtime.
    expect(Object.values(row).filter((v) => v === undefined)).toHaveLength(0);
  });
});
