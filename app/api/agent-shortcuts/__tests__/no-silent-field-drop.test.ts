/**
 * ── A SAVE NEVER REPORTS SUCCESS FOR A FIELD IT THREW AWAY (FIX-11c, W11-1) ──
 *
 * THE DEFECT, reproduced twice by a walker on production: editing a shortcut's
 * variable mappings answered `PATCH /api/agent-shortcuts/{id}` **200 OK** with
 * `"value_mappings":{}`, the client wrote that unchanged value back into Redux,
 * and on reload the Prompt-User mapping had reverted to "Agent Default". The
 * person's work was gone and every layer had said it was fine.
 *
 * THE CAUSE was a hand-kept server-side allow-list that DROPPED anything not on
 * it, in silence. Four fields the client sends were never on it, and `git log
 * -S '"value_mappings",'` finds they never had been:
 *
 *     value_mappings · write_policies · surface_name · json_extraction
 *
 * THE CLASS is the allow-list, not the four names. Adding them fixes today and
 * guarantees the repeat, because nothing connects the two sides: the next
 * `out.<column> =` added to the client's body builder vanishes the same way.
 *
 * So this guard is a CENSUS, driven off the real source of the real builder:
 * every column the client can put on the wire must be a column the route will
 * write. It fails the moment either side moves without the other — which is the
 * only thing that would have caught W11-1 before a walker did.
 *
 * 🚨 RED-THEN-GREEN: remove `"value_mappings"` (or any of the four) from
 * `writable-fields.ts` and the census case fails, naming it.
 */
import { readFileSync } from "fs";
import { join } from "path";

import {
  acceptedShortcutFields,
  pickWritableShortcutFields,
  rejectedFieldsMessage,
} from "../writable-fields";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

/**
 * Every column `shortcutToApiBody` can emit, read out of its own source.
 *
 * Source, not import: pulling the thunks module into jest drags the supabase
 * client and half the store with it, and the thing under test here is the
 * AGREEMENT between two files — which is a fact about what they say.
 */
function columnsTheClientCanSend(): string[] {
  const src = readFileSync(
    join(REPO_ROOT, "features/agents/redux/agent-shortcuts/thunks.ts"),
    "utf8",
  );
  const start = src.indexOf("function shortcutToApiBody(");
  expect(start).toBeGreaterThan(-1);
  // The builder ends at the next top-level declaration.
  const after = src.slice(start);
  const end = after.indexOf("\nexport const ");
  const body = end === -1 ? after : after.slice(0, end);
  const found = new Set<string>();
  for (const m of body.matchAll(/\bout\.([a-z0-9_]+)\s*=/g)) found.add(m[1]);
  for (const m of body.matchAll(/\bout\.([a-z0-9_]+)\s*=\s*columns\./g))
    found.add(m[1]);
  return [...found].sort();
}

describe("the client and the route agree on what a shortcut can store", () => {
  it("accepts every column the client body builder can send", () => {
    const emitted = columnsTheClientCanSend();
    // Anti-vacuity: a builder that emitted nothing would pass trivially, and a
    // broken regex is the likeliest way that happens.
    expect(emitted.length).toBeGreaterThan(20);
    expect(emitted).toContain("value_mappings");
    expect(emitted).toContain("label");

    const accepted = acceptedShortcutFields();
    const dropped = emitted.filter((key) => !accepted.has(key));
    expect(dropped).toEqual([]);
  });

  it("accepts the four fields W11-1 found being thrown away", () => {
    const accepted = acceptedShortcutFields();
    for (const field of [
      "value_mappings",
      "write_policies",
      "surface_name",
      "json_extraction",
    ]) {
      expect(accepted.has(field)).toBe(true);
    }
  });
});

describe("an unwritable field is refused, never dropped", () => {
  it("names what it will not write instead of ignoring it", () => {
    const { payload, rejected } = pickWritableShortcutFields({
      label: "ZZZ",
      value_mappings: { city: { mapType: "prompt_user", prompt: "Which city?" } },
      totally_not_a_column: 1,
    });
    expect(payload).toHaveProperty("label");
    expect(payload).toHaveProperty("value_mappings");
    expect(rejected).toEqual(["totally_not_a_column"]);
  });

  it("says nothing was saved, and where the list lives", () => {
    const said = rejectedFieldsMessage(["totally_not_a_column"]);
    expect(said).toContain("nothing was saved");
    expect(said).toContain("totally_not_a_column");
    expect(said).toContain("writable-fields.ts");
  });

  it("passes a clean body through untouched", () => {
    // Anti-vacuity for the refusal: a picker that rejected everything would
    // satisfy the two cases above.
    const body = { label: "ZZZ", value_mappings: {}, auto_run: true };
    const { payload, rejected } = pickWritableShortcutFields(body);
    expect(rejected).toEqual([]);
    expect(payload).toEqual(body);
  });

  it("admits `id` only where a create says so", () => {
    expect(pickWritableShortcutFields({ id: "x" }).rejected).toEqual(["id"]);
    expect(
      pickWritableShortcutFields({ id: "x" }, { allowId: true }).rejected,
    ).toEqual([]);
  });
});
