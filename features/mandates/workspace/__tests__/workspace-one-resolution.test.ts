/**
 * THE WORKSPACE ASKS; IT DOES NOT RESOLVE.
 *
 * The screen that says *"this is what runs for you"* used to compute that answer
 * itself, in `resolveForPrincipal`: it took `orgBindings[0]` from every binding
 * whose `organization_id` was in `orgIds` — ANY org the caller belonged to,
 * ranked by `updated_at` — and then told the reader, in a fold underneath,
 * *"N of your organizations override this job"* and *"what applies to you: the
 * first matching organization above"*.
 *
 * Under D-R1 (Arman, 2026-09-01) only the ACTIVE org has a rung, so both
 * sentences were lies about other people's organizations, and the pick could
 * name an agent no run would ever use. This guard pins the two halves of the
 * fix that a future edit could quietly undo:
 *
 *   1. the personal answer comes from the server verdict (`useMandate`), and
 *   2. the ladder view comes from the database door (`useMandateLadder`),
 *
 * with the banned cross-org shapes kept executable so the predicate is proven
 * against the code AS IT SHIPPED, not only against the code as it stands.
 *
 * The rung vocabulary itself is checked below on the pure row writers, which
 * need no database: a `global` rung is never spoken of as `system`, a rung
 * pointing at something unreadable reads BROKEN, and a rung that changes only
 * settings is not described as a holder swap.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ladderRowIsBroken,
  ladderRowWords,
  ladderRowChangesHolder,
  type MandateLadderRow,
} from "../useMandateLadder";

const WORKSPACE = join(__dirname, "..", "MandateWorkspace.tsx");

/**
 * The shapes that mean "this screen decided for itself which org answers".
 * Each is the code as it shipped, not a paraphrase.
 */
const CROSS_ORG_LADDER = [
  // The membership set used as a resolution filter.
  /orgIds\s*\.\s*has\s*\(/,
  // The fold's headline and its explanatory line.
  /of your organizations override/i,
  /the first matching organization/i,
];

/**
 * Comments out first. The file DELIBERATELY quotes the deleted sentences in the
 * block that replaced them — a note to the next agent about what must never come
 * back is the opposite of the defect, and a guard that failed on it would be
 * turned off within a week (the same ruling `mandate-screen-vocabulary` made).
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*/gm, "");
}

function crossOrgFindings(source: string): string[] {
  const code = stripComments(source);
  return CROSS_ORG_LADDER.filter((re) => re.test(code)).map(String);
}

describe("the mandate workspace never walks its own ladder", () => {
  const source = readFileSync(WORKSPACE, "utf8");

  it("asks the one resolver for the personal answer", () => {
    expect(source).toContain('from "../useMandate"');
    expect(source).toContain("useMandate(personalKey)");
  });

  it("reads the rungs from the database door, not from binding rows", () => {
    expect(source).toContain("useMandateLadder");
  });

  it("names the ACTIVE org in the sentence, and never an org id", () => {
    expect(source).toContain("(your active org)");
  });

  it("carries none of the cross-org shapes", () => {
    expect(crossOrgFindings(source)).toEqual([]);
  });

  it("would still catch the code as it shipped — red before it was green", () => {
    const shipped = `
      const orgBindings = data.bindings.filter(
        (b) => b.principal_type === "org" && swapping(b) && orgIds.has(b.organization_id),
      );
      \`\${orgBindings.length} of your organizations override this job\`
      "What applies to you: the first matching organization above"
    `;
    expect(crossOrgFindings(shipped)).toHaveLength(CROSS_ORG_LADDER.length);
  });
});

/* -------------------------------------------------------------------------- */

function row(overrides: Partial<MandateLadderRow> = {}): MandateLadderRow {
  return {
    rung: "org",
    binding_id: "b1",
    organization_id: "o1",
    subject_user_id: null,
    is_enabled: true,
    holder_type: "agent",
    holder_id: "a1",
    holder_version_id: null,
    holder_live: true,
    version_live: null,
    chose_holder: true,
    config_overrides: null,
    consumption_map: null,
    auto_run: null,
    definition_id: "d1",
    definition_enabled: true,
    fallback_mandate_key: null,
    ...overrides,
  };
}

describe("a rung says what it is", () => {
  it("calls the global rung global — never system", () => {
    const words = ladderRowWords(row({ rung: "global" }), null);
    expect(words.title).toBe("Global binding");
    expect(words.title.toLowerCase()).not.toContain("system");
  });

  it("names the organization by name, never by id", () => {
    const words = ladderRowWords(row({ rung: "org" }), "Titanium");
    expect(words.title).toBe("Titanium");
    // An org the caller cannot name still gets words, never a uuid.
    expect(ladderRowWords(row({ rung: "org" }), null).title).not.toContain("o1");
  });

  it("shows a rung whose agent cannot be read as BROKEN", () => {
    const dead = row({ holder_live: false });
    expect(ladderRowIsBroken(dead)).toBe(true);
    expect(ladderRowWords(dead, "Titanium").detail).toContain("Broken");
  });

  it("shows a rung whose pinned version cannot be read as BROKEN", () => {
    const dead = row({
      chose_holder: false,
      holder_id: null,
      holder_live: null,
      holder_version_id: "v1",
      version_live: false,
    });
    expect(ladderRowIsBroken(dead)).toBe(true);
    expect(ladderRowWords(dead, null).detail).toContain("pinned version");
  });

  it("renders a settings-only rung as settings, not as a holder swap", () => {
    const settings = row({
      chose_holder: false,
      holder_id: null,
      holder_type: null,
      holder_live: null,
      config_overrides: { temperature: 0.2 },
    });
    expect(ladderRowChangesHolder(settings)).toBe(false);
    expect(ladderRowWords(settings, "Titanium").detail).toContain("Settings only");
  });

  it("does not call a version pin 'settings' just because chose_holder is false", () => {
    // `chose_holder` is `holder_id IS NOT NULL`, so a rung that pins a VERSION
    // and names no master reads false — and it is still a holder decision.
    const pinned = row({
      chose_holder: false,
      holder_id: null,
      holder_live: null,
      holder_version_id: "v1",
      version_live: true,
    });
    expect(ladderRowChangesHolder(pinned)).toBe(true);
    expect(ladderRowWords(pinned, null).detail).not.toContain("Settings only");
  });

  it("says a disabled rung is not applied", () => {
    expect(ladderRowWords(row({ is_enabled: false }), "Titanium").detail).toContain(
      "Turned off",
    );
  });
});
