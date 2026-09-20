/**
 * `toast-names-record`, run over its own fixtures — the same table the CLI's
 * `--self-test` reads (`self-test/cases.ts`), so neither runner can drift.
 *
 * A fixture is scanned through a temp `.tsx` twin because `shouldScanFile()`
 * refuses the `.fixture` extension by design: the scanner must be entered the
 * same way a real run enters it.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { scanFile } from "../scan";
import { inferTokenDetailed, loadEntityTokens } from "../entity-tokens";
import { describeFinding, entityNoun } from "../describe";
import { TOAST_FIXTURE_CASES } from "../self-test/cases";
import type { DeadEndFinding } from "../types";

const ROOT = join(__dirname, "..", "..", "..");
const tokens = loadEntityTokens(ROOT);

function scanAsTwin(relPath: string): DeadEndFinding[] {
  const dir = mkdtempSync(join(tmpdir(), "dead-ends-fixture-"));
  try {
    const twin = join(dir, "FixtureSubject.tsx");
    writeFileSync(twin, readFileSync(join(ROOT, relPath), "utf8"));
    return scanFile(twin, { repoRoot: dir, tokens }).filter(
      (f) => f.rule === "toast-names-record",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("toast-names-record over its own fixtures", () => {
  it.each(TOAST_FIXTURE_CASES.map((c) => [c.file, c] as const))(
    "%s",
    (_file, testCase) => {
      const findings = scanAsTwin(testCase.file);
      expect(findings).toHaveLength(testCase.findings);
      for (const finding of findings) {
        if (testCase.entity) expect(finding.entity).toBe(testCase.entity);
        if (testCase.severity) expect(finding.severity).toBe(testCase.severity);
        if (testCase.neverEntity) expect(finding.entity).not.toBe(testCase.neverEntity);
      }
    },
  );

  it("names the entity's OWN noun in the remedy, never another entity's", () => {
    const [calendar] = scanAsTwin(
      "scripts/dead-ends/self-test/v21-calendar-event-toast.tsx.fixture",
    );
    expect(describeFinding(calendar)).toContain('label: "Open the calendar event"');
    expect(describeFinding(calendar)).not.toContain("Open the note");

    // The same sentence for a few other registered entities, because the defect
    // was one hard-coded noun for all of them.
    expect(entityNoun({ ...calendar, entity: "project", entityLabel: "Project" })).toBe(
      "project",
    );
    expect(
      entityNoun({ ...calendar, entity: "seo_keyword", entityLabel: "SEO Keyword" }),
    ).toBe("SEO keyword");
    // No label reached the finding (an older report row): the token's own words,
    // never a borrowed noun.
    expect(entityNoun({ ...calendar, entity: "task", entityLabel: undefined })).toBe(
      "task",
    );
  });

  it("refuses to name a record for a bare noun several entities answer to", () => {
    // `document` heads four registered entities, so it resolves to NO token and
    // says why — the alternative shipped as a confident wrong record name.
    const inferred = inferTokenDetailed(["imported", "Document"], tokens);
    expect(inferred.info).toBeNull();
    expect(inferred.ambiguousNoun).toBe("document");
  });

  it("still resolves the qualified phrase inside that same word", () => {
    expect(
      inferTokenDetailed(["import", "Google", "Document"], tokens).info?.token,
    ).toBe("google_document");
    expect(
      inferTokenDetailed(["create", "Calendar", "Event"], tokens).info?.token,
    ).toBe("calendar_event");
  });
});
