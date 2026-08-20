/**
 * Guards the two classes of documentation drift that the restructure-end-user-docs
 * audit found in bulk - see that change's design.md Decision 4.
 *
 * These assert properties of the prose in README.md and docs/, not of any
 * module, which is unusual for a test suite but deliberate: both failures are
 * invisible to `tsc` and to every other test, and both mislead an operator
 * into a wrong action rather than merely reading oddly. The alternative was
 * relying on whoever changes a default to remember the documentation, which
 * is exactly the discipline that produced thirty changes of drift.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../types";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Every Markdown file this project publishes to its own readers. */
function documentationFiles(): { rel: string; text: string }[] {
  const docsDir = path.join(repoRoot, "docs");
  const rels = [
    "README.md",
    ...fs
      .readdirSync(docsDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => path.join("docs", name)),
  ];
  return rels.map((rel) => ({ rel, text: fs.readFileSync(path.join(repoRoot, rel), "utf8") }));
}

describe("documentation", () => {
  it("publishes at least the README and the four guides", () => {
    // Guards against the loop below silently passing because it found nothing
    // to check - a renamed docs directory would otherwise make every
    // assertion in this file vacuous.
    expect(documentationFiles().map((f) => f.rel).sort()).toEqual([
      "README.md",
      "docs/consent-workflow.md",
      "docs/development.md",
      "docs/operations.md",
      "docs/slack-setup.md",
    ]);
  });

  /**
   * The README shipped `<org>/<repo>` in all three of its install/service
   * snippets for the entire life of the npx distribution, so every reader had
   * to guess coordinates the project itself knew. A value the reader must
   * supply (a release tag) is fine; a value we know is not.
   */
  it("contains no placeholder standing in for a value the project itself knows", () => {
    const forbidden = [/<org>/, /<repo>/, /<owner>/, /YOUR_ORG/, /<your-org>/];
    for (const { rel, text } of documentationFiles()) {
      for (const pattern of forbidden) {
        expect(text, `${rel} contains an unresolved placeholder matching ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  /**
   * An earlier draft of these docs pinned `v0.1.0` in every install snippet at
   * a point when no release had ever been published, so all three commands
   * 404'd - "runnable as written" failing in the one place a first-time reader
   * starts. A concrete version in prose is unverifiable from here (the test
   * cannot ask GitHub what exists) and goes stale on every release, so the
   * documented form is a marked substitution the reader fills from the
   * releases page, and this keeps it that way.
   */
  it("does not pin a concrete release version in a download URL", () => {
    for (const { rel, text } of documentationFiles()) {
      const pinned = [...text.matchAll(/releases\/download\/(\S+?)\//g)]
        .map((match) => match[1])
        .filter((segment) => segment !== "TAG");
      expect(pinned, `${rel} pins release tag(s) instead of a TAG placeholder`).toEqual([]);
    }
  });

  describe("quoted default values", () => {
    /**
     * Documentation marks each default it quotes with an HTML comment -
     * `<!-- default: retentionDays = 30 -->` - which renders as nothing and
     * is compared against the real constant here. Marking beats parsing the
     * surrounding prose: the marker is unambiguous, and a wrong number in
     * prose next to a correct marker is a far less likely mistake than a
     * regex that stops matching after a sentence is reworded.
     */
    const MARKER = /<!--\s*default:\s*(\w+)\s*=\s*([^>]*?)\s*-->/g;

    /** Flattens the one nested shape a marker can legitimately name: a per-tier notification default. */
    function resolveDefault(key: string): string | undefined {
      const top = (DEFAULT_SETTINGS as Record<string, unknown>)[key];
      if (top !== undefined) return Array.isArray(top) ? top.join(",") : String(top);

      const tiers = Object.values(DEFAULT_SETTINGS.notificationsByTier) as unknown as Record<string, unknown>[];
      const perTier = tiers.map((tier) => tier[key]);
      if (perTier.some((value) => value === undefined)) return undefined;
      const distinct = new Set(perTier.map(String));
      // A single documented number cannot describe two tiers that disagree;
      // that needs per-tier documentation, so fail rather than pick one.
      return distinct.size === 1 ? String(perTier[0]) : `<tiers disagree: ${[...distinct].join(" vs ")}>`;
    }

    const marked = documentationFiles().flatMap(({ rel, text }) =>
      [...text.matchAll(MARKER)].map((match) => ({ rel, key: match[1], documented: match[2] })),
    );

    it("are marked somewhere in the documentation", () => {
      // Without this, deleting every marker would make the parameterized
      // cases below disappear and the suite would still pass.
      expect(marked.length).toBeGreaterThan(0);
    });

    it.for(marked)("$key in $rel matches DEFAULT_SETTINGS", ({ key, documented, rel }) => {
      expect(resolveDefault(key), `${rel} documents an unknown setting "${key}"`).toBeDefined();
      expect(resolveDefault(key), `${rel} says ${key} defaults to ${documented}`).toBe(documented);
    });
  });
});
