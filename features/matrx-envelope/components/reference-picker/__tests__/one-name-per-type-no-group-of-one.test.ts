/**
 * "All types" reads like a person's list: one name per type, no two types
 * sharing a name, no group of one, and no machinery.
 *
 * THE DEFECT (G11A review, 2026-10-07): "Document" appeared twice — under
 * Content (`content.document`, the Markdown document) and under Workspace
 * (`udt_document`, the Univer Document) — two types, one name. A "Custom" group
 * held only Public Form, and Chat, Content, Apps, SEO, Skills… each stood alone.
 * Mandate, Tool Bundle, Data Store, Code Repository and Canvas Item were
 * offered to a non-technical expert.
 *
 * The hidden list is the knob's CURRENT starting value: the newest seed of
 * `platform.reference_picker.hidden_types`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ENTITY_TYPE_METADATA } from "@ai-matrx/associations";
import { referenceTypeGroup } from "@/features/scopes/utils/referenceTypeGroups";
import {
  referenceTypeDisplayLabel,
  visibleReferenceTypeTokens,
} from "../referencePickerTypes";

const NEWEST_HIDDEN_TYPES_SEED =
  "migrations/reference_picker_hidden_types_machinery_g11a.sql";

const pickable = Object.values(ENTITY_TYPE_METADATA)
  .filter((m) => m.referencePickable)
  .map((m) => m.token as string);
const tokens = [...new Set(["file", "url", ...pickable])];
const seed = readFileSync(join(process.cwd(), NEWEST_HIDDEN_TYPES_SEED), "utf8");
const hidden = JSON.parse(/'(\[[^']*\])'::jsonb/.exec(seed)![1]!) as string[];
const isComponent = (t: string) =>
  t in ENTITY_TYPE_METADATA &&
  ENTITY_TYPE_METADATA[t as keyof typeof ENTITY_TYPE_METADATA].isComponent;
const visible = visibleReferenceTypeTokens(tokens, hidden, isComponent);

describe("All types, as a person reads it", () => {
  it("no two visible types share a display name", () => {
    const byName = new Map<string, string[]>();
    for (const t of visible) {
      const name = referenceTypeDisplayLabel(t).toLowerCase();
      byName.set(name, [...(byName.get(name) ?? []), t]);
    }
    const shared = [...byName.entries()].filter(([, ts]) => ts.length > 1);
    expect(shared).toEqual([]);
  });

  it("the two documents carry their own names", () => {
    expect(referenceTypeDisplayLabel("udt_document")).toBe("Document");
    expect(referenceTypeDisplayLabel("document")).toBe("Markdown Document");
  });

  it("no group holds a single type", () => {
    const sizes = new Map<string, string[]>();
    for (const t of visible) {
      const g = referenceTypeGroup(t);
      sizes.set(g, [...(sizes.get(g) ?? []), t]);
    }
    const lonely = [...sizes.entries()].filter(([, ts]) => ts.length === 1);
    expect(lonely).toEqual([]);
  });

  it("machinery is hidden; Scope and Public Form stay under a real group", () => {
    for (const machinery of [
      "mandate",
      "tool_bundle",
      "data_store",
      "code_repository",
      "canvas_item",
    ]) {
      expect(visible).not.toContain(machinery);
    }
    expect(visible).toContain("scope");
    expect(visible).toContain("anon_form");
    expect(referenceTypeGroup("anon_form")).toBe(referenceTypeGroup("meet_meeting"));
    expect(referenceTypeGroup("scope")).toBe(referenceTypeGroup("task"));
  });
});
