/**
 * THE MENU'S "Content: …" HEADER NEVER SHOWS STORAGE PLUMBING (2026-09-26).
 * Live on /chat: right-clicking a tutor answer headed the menu with
 * `<!--MATRX_TRUST_V1 {"confidence":…}-->` — the tutor's trust comment, which
 * the chat renderer drops. The header reads the same text through the SAME
 * strip copies and files use (`stripTurnTrust`), never a second copy.
 *
 * Break it names: the header built from the raw text again → red.
 */
jest.mock("@/components/agent-copy/alchemy-icon-keys", () => ({ registerAlchemyIcon: () => "app:Icon" }));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildMenuModel } from "@ai-matrx/alchemy/menu";
import { createClickTarget } from "@ai-matrx/alchemy/actions";
import { menuHeaderContent } from "../alchemy-provider";

const ANSWER =
  'Stop 1 is Oakwood HOA; the chlorine check is at 11:30.\n\n<!--MATRX_TRUST_V1 {"confidence":"inferred","groundedIn":"none","citations":[]}-->';

it("a tutor answer's header is the answer, not its trust comment", () => {
  const content = menuHeaderContent({ source: "message", text: ANSWER });
  const model = buildMenuModel(createClickTarget({}), [], { content });
  expect(model.header).toEqual({ label: "Content", text: "Stop 1 is Oakwood HOA; the chlorine check is at 11:30." });
});

it("nothing to act on → no header", () => {
  expect(menuHeaderContent({ source: "none", text: "" })).toBeNull();
});

it("the header uses the ONE strip (stripTurnTrust), never its own regex", () => {
  const src = readFileSync(join(__dirname, "..", "alchemy-provider.ts"), "utf8");
  expect(src).toContain('from "@/features/education/tutor/turnTrust"');
  // No local copy of the trust-comment pattern (a regex literal or RegExp naming it).
  expect(src).not.toMatch(/\/<!--\\s*MATRX|new RegExp\([^)]*MATRX_TRUST/);
});

// Live on /notes/<id> (page-pass 2026-09-27): "Content: # Clinic intake…". The
// header is a preview — words, not markdown syntax. Break: the raw text again → red.
it("a document's header shows its words, not its markdown", () => {
  const note = "# Clinic intake\n\n- **Name:** _required_\n- [ ] Insurance card\n> Ask about [allergies](https://x.test)\n1. `DOB`";
  expect(menuHeaderContent({ source: "content", text: note })).toBe(
    "Clinic intake Name: required Insurance card Ask about allergies DOB",
  );
});
