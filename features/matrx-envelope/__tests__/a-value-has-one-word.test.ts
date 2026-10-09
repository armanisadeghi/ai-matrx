/**
 * @jest-environment jsdom
 */
/**
 * ONE VALUE, ONE WORD (G8A review, nightly clone, 2026-10-02). The action card
 * and its confirm said "Status incomplete → completed", "active → paused",
 * "Priority empty → high" — stored values — while the write forms said "Inbox",
 * "Completed", "High" through `valueWord`. The directive host's `valueLabel`
 * now answers with the forms' word for EVERY pick-list field the server catalog
 * declares, and nothing for a field that is not one.
 *
 * Walks the mirrored catalog snapshot itself (every noun, create + update
 * schema, every `enum` field and value), so a field the server adds tomorrow is
 * covered the day the snapshot mirrors it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

jest.mock("@/features/directive-catalog/service", () => ({ confirmDirective: jest.fn() }));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn() }));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState: () => ({}), dispatch: jest.fn() }),
}));
jest.mock("@/components/agent-copy/CopyButtons", () => ({ CopyButtons: () => null }));
jest.mock("@/features/item-presentation/useOpenItemPresentation", () => ({
  useOpenItemPresentation: () => jest.fn(),
}));

import { directiveValueWord, itemChanges } from "@ai-matrx/content-ir-react";
import { CATALOG_ENUM_FIELDS } from "@/features/matrx-envelope/catalog-enum-fields.generated";
import { matrxDirectiveHost, matrxDirectiveValueLabel } from "@/features/matrx-envelope/directiveHost";
import { valueWord } from "@/features/directive-catalog/valueVocabulary";

interface SchemaNode {
  enum?: unknown[];
  anyOf?: SchemaNode[];
  oneOf?: SchemaNode[];
  allOf?: SchemaNode[];
  properties?: Record<string, SchemaNode>;
}
interface CatalogNoun {
  noun: string;
  schemas: Record<string, SchemaNode> | null;
}

function enumOf(node: SchemaNode | undefined): string[] | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node.enum) && node.enum.length > 0 && node.enum.every((v) => typeof v === "string")) {
    return node.enum as string[];
  }
  for (const sub of [...(node.anyOf ?? []), ...(node.oneOf ?? []), ...(node.allOf ?? [])]) {
    const found = enumOf(sub);
    if (found) return found;
  }
  return null;
}

const manifest = JSON.parse(
  readFileSync(resolve(__dirname, "../../../docs/protocol/kind_directives_catalog.generated.json"), "utf-8"),
) as { nouns: CatalogNoun[]; noun_schemas: Record<string, CatalogNoun["schemas"]> };
// Each noun with its schemas from `noun_schemas` (what `GET /directives/catalog/{noun}` serves).
const catalog = {
  nouns: manifest.nouns.map((n) => ({ ...n, schemas: manifest.noun_schemas[n.noun] })),
};

const ENUMS: Array<{ noun: string; field: string; values: string[] }> = [];
const PLAIN: Array<{ noun: string; field: string }> = [];
for (const n of catalog.nouns) {
  const byField = new Map<string, string[]>();
  for (const cls of ["create", "update"]) {
    for (const [field, node] of Object.entries(n.schemas?.[cls]?.properties ?? {})) {
      const values = enumOf(node);
      if (values) byField.set(field, [...new Set([...(byField.get(field) ?? []), ...values])]);
      else if (!byField.has(field)) PLAIN.push({ noun: n.noun, field });
    }
  }
  for (const [field, values] of byField) ENUMS.push({ noun: n.noun, field, values });
}

describe("a pick-list value has one word — card, confirm and form", () => {
  it("the snapshot carries pick-list fields (the walk is not vacuous)", () => {
    expect(ENUMS.length).toBeGreaterThan(400);
    expect(ENUMS.find((e) => e.noun === "task" && e.field === "status")).toBeTruthy();
  });

  it("the generated pick-list table matches the snapshot exactly", () => {
    const fromSnapshot: Record<string, string[]> = {};
    for (const e of ENUMS) (fromSnapshot[e.noun] ??= []).push(e.field);
    for (const fields of Object.values(fromSnapshot)) fields.sort();
    expect(Object.fromEntries(Object.entries(CATALOG_ENUM_FIELDS).map(([k, v]) => [k, [...v]]))).toEqual(
      fromSnapshot,
    );
  });

  it("every value of every pick-list field reads the forms' word through the host", () => {
    const wrong: string[] = [];
    for (const { noun, field, values } of ENUMS) {
      for (const value of values) {
        const word = matrxDirectiveHost.valueLabel?.({ noun, field, value });
        if (word !== valueWord(noun, field, value)) wrong.push(`${noun}.${field}=${value} → ${String(word)}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("a field that is not a pick-list keeps its value as written", () => {
    const sample = PLAIN.filter((p) => !CATALOG_ENUM_FIELDS[p.noun]?.includes(p.field)).slice(0, 200);
    expect(sample.length).toBeGreaterThan(0);
    for (const { noun, field } of sample) {
      expect(matrxDirectiveValueLabel({ noun, field, value: "in_review" })).toBeNull();
    }
  });

  it("the reviewer's rows read in the app's words", () => {
    const task = itemChanges(
      { id: "x", status: "completed", priority: "high" },
      { status: "incomplete", priority: null },
      { titleColumn: "title", valueWord: directiveValueWord(matrxDirectiveHost, "task") },
    );
    expect(task.map((c) => [c.label, c.before?.value, c.value])).toEqual([
      ["Status", "Inbox", "Completed"],
      ["Priority", "None", "High"],
    ]);
    const project = itemChanges(
      { id: "y", status: "paused" },
      { status: "active" },
      { valueWord: directiveValueWord(matrxDirectiveHost, "project") },
    );
    expect(project.map((c) => [c.before?.value, c.value])).toEqual([["Active", "Paused"]]);
  });
});
