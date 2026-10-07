/**
 * A TABLE IS A KIND — the web registry and the one record card (KINDS-GLUE wave 3 slices 4–5,
 * guard 5 (b)).
 *
 * Cedar Ridge Physical Therapy's "Home Exercise Programs" table, sighted as `table:<uuid>` in a
 * chat answer, a note and the in-app canvas:
 *  - the registry answers it from the Table's Fields (never a registry kind: `isKnownKind` stays
 *    false, so save-from-chat never files it into the kind store), and it counts as RENDERABLE,
 *    so the escaped-kind notice neither shows nor files an incident;
 *  - a Field rename (this page's structure announcement) re-reads the facts and bumps the kind,
 *    so every mounted card repaints;
 *  - the kind route sends it to `platform_record` (the component registry's `table:` prefix
 *    rule), the canvas planner sends it to `kind_value`, and PlatformRecordBlock draws it with
 *    the Table's columns;
 *  - a refusal is a short label; the store's sentence (minus its function name) is the tooltip.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import userAuthReducer from "@/lib/redux/slices/userAuthSlice";
import { envelopeFromCompleteValue, IR_ENVELOPE_KEY, type KindSchema } from "@ai-matrx/content-ir";

const TABLE = "7c1e4a52-3b9d-4f60-8a21-5e0d9c3b7f14";
const KIND = `table:${TABLE}`;
const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";

const FIELDS = [
  { id: "f0000000-0000-4000-8000-000000000001", key: "exercise", label: "Exercise", type: "text", sort: 1 },
  { id: "f0000000-0000-4000-8000-000000000002", key: "sets", label: "Sets", type: "number", sort: 2 },
];

function facts(stamp: string, sets = "Sets") {
  return {
    organization_id: ORG,
    table_id: TABLE,
    name: "Home Exercise Programs",
    title_field: "exercise",
    agent_writable: true,
    purpose: null,
    version: 1,
    type_field: null,
    stamp,
    fields: FIELDS.map((f) => (f.key === "sets" ? { ...f, label: sets } : f)),
    choices: {},
  };
}

function schemaOf(): KindSchema {
  return {
    kind: KIND,
    fields: {
      exercise: { type: "string", nullable: true },
      sets: { type: "number", nullable: true },
      _record_id: { type: "string", nullable: true },
    },
  } as unknown as KindSchema;
}

let answer: "ready" | "refused" = "ready";
let stamp = "s1";
let setsLabel = "Sets";
const structureListeners: Array<(tableId: string | null) => void> = [];

jest.mock("../registry/table-kind-source", () => ({
  readTableKind: jest.fn(async (_kind: string, tableId: string) =>
    answer === "ready"
      ? {
          ok: true,
          facts: facts(stamp, setsLabel),
          schema: schemaOf(),
          facet: { tableId, organizationId: ORG, name: "Home Exercise Programs", titleField: "exercise", stamp, fieldIds: [], optionsTableIds: [], refusal: null },
        }
      : {
          ok: false,
          facet: { tableId, organizationId: null, name: null, titleField: null, stamp: null, fieldIds: [], optionsTableIds: [], refusal: "You do not have access to this table." },
        },
  ),
  joinTableLive: jest.fn(() => () => undefined),
  hearTableStructure: jest.fn((listener: (tableId: string | null) => void) => {
    structureListeners.push(listener);
    return () => undefined;
  }),
}));

const reportIncident = jest.fn();
jest.mock("../react/db-component/kindComponentIncident", () => ({
  reportKindComponentIncident: (...args: unknown[]) => reportIncident(...args),
}));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

import { kindRegistry } from "../registry/kind-registry";
import { componentRegistry } from "../registry/component-registry";
import { applyIrKindRoute } from "@ai-matrx/rich-content/kinds/react/kind-route";
import { KindEscapedNotice } from "@ai-matrx/rich-content/kinds/react/KindEscapedNotice";
import { resolveKindRecordDisposition } from "../records/kind-record-registry";
import { kindHasRecordChrome } from "../records/KindRecordChrome";
import { resolveArtifactDefByKind } from "@/features/canvas/artifact-types/artifact-type-registry";
import { hasArtifactRenderer } from "@/features/canvas/artifact-types/artifact-renderer-keys";
import { resolveBlockDispatch } from "@/components/mardown-display/chat-markdown/block-registry/block-dispatch";
import PlatformRecordBlock from "@/components/mardown-display/blocks/result-kinds/PlatformRecordBlock";

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};

function mount(node: React.ReactNode): string {
  const store = configureStore({ reducer: { userAuth: userAuthReducer } });
  return renderToStaticMarkup(<Provider store={store}>{node}</Provider>);
}

function blockFor(value: Record<string, unknown>) {
  const envelope = envelopeFromCompleteValue(value, KIND);
  return { type: "code", content: JSON.stringify(value), serverData: { language: "json" }, metadata: { [IR_ENVELOPE_KEY]: envelope } };
}

describe("the web registry answers a table kind from its Table", () => {
  beforeAll(async () => {
    kindRegistry.requestSchema(KIND);
    await flush();
  });

  it("upserts a table definition that draws as the one record card", () => {
    const def = kindRegistry.getDefinition(KIND);
    expect(def?.schemaSource).toBe("table");
    expect(def?.legacyBlockType).toBe("platform_record");
    expect(def?.artifact?.canvasType).toBe("kind_value");
    expect(def?.table?.organizationId).toBe(ORG);
  });

  it("is renderable but never a registry kind (save-from-chat never takes it)", () => {
    expect(kindRegistry.isKnownKind(KIND)).toBe(false);
    expect(kindRegistry.isRenderableKind(KIND)).toBe(true);
  });

  it("a Field rename re-reads the facts and bumps the kind (every card repaints)", async () => {
    const before = kindRegistry.getKindVersion(KIND);
    stamp = "s2";
    setsLabel = "Sets per day";
    for (const listener of structureListeners) listener(TABLE);
    await flush();
    expect(kindRegistry.getKindVersion(KIND)).toBeGreaterThan(before);
    expect(kindRegistry.getTableFacts(KIND)?.fields.find((f) => f.key === "sets")?.label).toBe("Sets per day");
  });

  it("a fresh definition is not re-read inside its lease", async () => {
    const source = jest.requireMock("../registry/table-kind-source") as { readTableKind: jest.Mock };
    const calls = source.readTableKind.mock.calls.length;
    kindRegistry.requestSchema(KIND);
    await flush();
    expect(source.readTableKind.mock.calls.length).toBe(calls);
  });
});

describe("guard 5 (b) — a table value reaches the one card on every path", () => {
  beforeAll(() => {
    // The live bundled row (content_ir.kind_component, platform_record web/output, seeded 0889).
    componentRegistry.ingestDbRows([
      {
        kind: "platform_record",
        platform: "web",
        role: "output",
        componentKey: "platform_record",
        source: "bundled",
        isActive: true,
        config: {},
        componentSource: null,
        propsTransform: null,
        pinnedKindVersion: null,
        updatedAt: "2026-09-18T06:53:37Z",
        createdAt: "2026-09-18T06:53:37Z",
        createdBy: null,
        id: "4aa576fd-b81d-4a92-ab03-3e038d7a4d15",
      } as never,
    ]);
  });

  it("the component registry routes the table: prefix to platform_record", () => {
    expect(componentRegistry.resolve(KIND, "web", "output")?.componentKey).toBe("platform_record");
  });

  it("the chat route sends a table record to platform_record, which dispatch draws", () => {
    const value = { __kind: KIND, exercise: "Clamshell", sets: 3 };
    const routed = applyIrKindRoute(blockFor(value) as never) as { type: string };
    expect(routed.type).toBe("platform_record");
    expect(resolveBlockDispatch("platform_record")).toBeTruthy();
  });

  it("the canvas planner sends a table value to the kind_value def, which has a renderer", () => {
    const def = resolveArtifactDefByKind(KIND);
    expect(def?.canvasType).toBe("kind_value");
    expect(hasArtifactRenderer(def?.canvasType)).toBe(true);
  });

  it("a fenced table record drawn by the card shows no escaped notice and files no incident", async () => {
    const html = mount(<KindEscapedNotice markers={[{ slug: KIND, path: "" } as never]} rendered />);
    await flush();
    expect(html).toBe("");
    expect(reportIncident).not.toHaveBeenCalled();
  });

  it("the record chrome rule says record/table and the strip stays absent until wave 2's read", () => {
    expect(resolveKindRecordDisposition(KIND)).toEqual(expect.objectContaining({ disposition: "record", storage: "table" }));
    expect(kindHasRecordChrome(KIND)).toBe(false);
  });

  it("PlatformRecordBlock draws the record with the Table's columns", () => {
    const value = { __kind: KIND, exercise: "Clamshell", sets: 3 };
    const html = mount(<PlatformRecordBlock content={JSON.stringify(value)} metadata={undefined} />);
    expect(html).toContain('data-table-record-card="ready"');
    expect(html).toContain("Home Exercise Programs");
    expect(html).toContain("Clamshell");
    expect(html).toContain("Sets per day");
    expect(html).toContain('data-field-key="sets"');
  });
});

describe("a refusal is a short label with the store's sentence on hover", () => {
  const OTHER = "9d2b6e10-4c3a-4f8e-b1a7-2e5c8d0f9a36";
  it("never prints a function name and never loads forever", async () => {
    answer = "refused";
    kindRegistry.requestSchema(`table:${OTHER}`);
    await flush();
    const html = mount(<PlatformRecordBlock content={JSON.stringify({ __kind: `table:${OTHER}`, _record_id: TABLE })} metadata={undefined} />);
    expect(html).toContain('data-table-record-card="refused"');
    expect(html).toContain("No access to this table");
    expect(html).not.toMatch(/custom\.|table_kind_facts/);
    answer = "ready";
  });
});
