import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE LOSSLESS LAW, mobile edge.
 *
 * `MobileMenuContent` hand-builds its item list instead of arranging
 * `buildMenuModel`'s nodes, so it sits OUTSIDE the classic/tiered/command
 * parity suite — and on 2026-09-11 that gap shipped a core verb
 * ("Insert reference…") that existed on every desktop layout and was simply
 * absent from the phone drawer. Until the mobile renderer consumes the model,
 * this test pins the contract the cheap way: every core-verb node id the
 * model's clipboard/tools/history sections mint MUST appear as an id in the
 * mobile renderer's source. Add a verb to menu-model.ts and this fails until
 * the drawer carries it too.
 */

const mobileSource = readFileSync(
  join(__dirname, "MobileMenuContent.tsx"),
  "utf8",
);
const modelSource = readFileSync(
  join(__dirname, "..", "model", "menu-model.ts"),
  "utf8",
);

// Core-verb node ids minted by the model's clipboard/tools/history builders.
// (Sections built from engine data — placements, copy-as, json, extras — are
// data-driven on both renderers and covered elsewhere.)
const CORE_VERB_IDS = [
  "copy",
  "speak",
  "cut",
  "paste",
  "select-all",
  "find",
  "insert-reference",
  "chat",
  "undo",
  "redo",
  "view-history",
  "attach",
  "share",
  "save",
  "delete",
] as const;

describe("MobileMenuContent carries every core verb the model mints", () => {
  it.each(CORE_VERB_IDS)("model id %s exists in the model source (self-check)", (id) => {
    expect(modelSource).toContain(`id: "${id}"`);
  });

  it.each(CORE_VERB_IDS)("mobile drawer carries %s", (id) => {
    expect(mobileSource).toContain(`id: "${id}"`);
  });
});
