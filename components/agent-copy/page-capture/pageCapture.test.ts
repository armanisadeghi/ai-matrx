/**
 * The page capture — what the Alchemy menu and the admin debug context hand an
 * agent from any surface (lane ALCHEMY-BUTTON, Arman 2026-09-25: "it would show
 * you what page I'm on and it would capture the exact values I've set … and
 * then it would include the data I want so there is no question").
 *
 * Red on a tree with no page capture: the module does not exist, and the
 * context inspector's page handed an agent nothing but the URL.
 */
import {
  pageCaptureGroomer,
  pageCaptureMarkdown,
  pageCapturePayload,
  pageCaptureDebugEntries,
  mergePageCapture,
  tablePageCapture,
  recordPageCapture,
  dialogCapture,
  adminPageCapture,
  type PageCapture,
} from "./pageCapture";

const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const TYPE = "5155b79c-4c54-4694-b644-2e21ea6833b7";

function inspector(): PageCapture {
  return adminPageCapture({
    title: "Context inspector",
    route: "/administration/scopes-context/context-inspector",
    url: `https://app.example/administration/scopes-context/context-inspector?org=${ORG}`,
    selection: {
      Organization: { id: ORG, name: "AI Matrx" },
      "Scope type": { id: TYPE, name: "Apps" },
      Scope: { id: null, name: null },
    },
    sections: [
      { id: "compare", title: "Old vs new", role: "data", value: { defects: 1, rows: [1, 2, 3] }, brief: "1 defect" },
    ],
    errors: ["The context items could not load: timeout"],
    requests: [
      { method: "POST", path: "/ai/context/preview", status: "error", httpStatus: 504, durationMs: 15012, requestId: "req-1", timestamp: 1 },
    ],
  });
}

describe("pageCapture", () => {
  it("names the page, the kind and every pick with its name AND id", () => {
    const md = pageCaptureMarkdown(inspector());
    expect(md).toContain("# Context inspector");
    expect(md).toContain("/administration/scopes-context/context-inspector");
    expect(md).toContain("admin-page");
    expect(md).toContain(`Organization: AI Matrx (${ORG})`);
    expect(md).toContain(`Scope type: Apps (${TYPE})`);
    expect(md).toContain("Scope: not chosen");
    // Errors first, verbatim.
    expect(md.indexOf("The context items could not load")).toBeLessThan(md.indexOf("Old vs new"));
    expect(md).toContain("POST /ai/context/preview");
    expect(md).toContain("504");
    expect(md).toContain("15012 ms");
  });

  it("the groomer keeps the page and the selection, and lets the data be filtered", () => {
    const g = pageCaptureGroomer(inspector());
    expect(g.kind).toBe("page-capture.admin-page");
    const ids = g.sections.map((s) => s.id);
    expect(ids).toEqual(["page", "selection", "errors", "compare", "requests"]);
    const page = g.sections.find((s) => s.id === "page")!;
    expect(page.cuttable).toBe(false);
    expect(page.build("brief")).toMatchObject({ title: "Context inspector" });
    const data = g.sections.find((s) => s.id === "compare")!;
    expect(data.build("full")).toEqual({ defects: 1, rows: [1, 2, 3] });
    expect(data.build("brief")).toBe("1 defect");
    // The envelope names the page and the picks on every variant.
    expect(g.context).toMatchObject({ page: "Context inspector", organization: `AI Matrx (${ORG})`, "scope-type": `Apps (${TYPE})` });
  });

  it("'everything' carries every section; 'data only' keeps the page identity and drops requests", () => {
    const all = pageCapturePayload(inspector(), "everything");
    const allData = all.data as Record<string, unknown>;
    expect(Object.keys(allData)).toEqual(["page", "selection", "errors", "compare", "requests"]);
    const only = pageCapturePayload(inspector(), "data");
    const onlyData = only.data as Record<string, unknown>;
    expect(Object.keys(onlyData)).toEqual(["page", "selection", "errors", "compare"]);
    expect(only.context).toMatchObject({ page: "Context inspector" });
  });

  it("a big section is cut honestly at compact, saying what was left out", () => {
    const big = mergePageCapture(inspector(), [
      { owner: "grid", sections: [{ id: "rows", title: "Rows", role: "data", value: Array.from({ length: 5000 }, (_, i) => ({ i, name: `Row ${i}` })) }] },
    ]);
    const rows = pageCaptureGroomer(big).sections.find((s) => s.id === "rows")!;
    const compact = rows.build("compact") as { omitted: string; preview: string };
    expect(compact.omitted).toMatch(/characters left out/);
    expect(compact.preview.length).toBeLessThanOrEqual(6000);
  });

  it("descendant contributions merge, and two owners claiming one section is a loud error", () => {
    const merged = mergePageCapture(inspector(), [
      { owner: "compare-view", sections: [{ id: "answers", title: "Answers", role: "data", value: [] }] },
    ]);
    expect(merged.sections.map((s) => s.id)).toEqual(["compare", "answers"]);
    expect(() =>
      mergePageCapture(inspector(), [
        { owner: "a", sections: [{ id: "compare", title: "x", role: "data", value: 1 }] },
      ]),
    ).toThrow(/compare.*page.*a/);
  });

  it("debug entries carry the same page, picks and data", () => {
    const d = pageCaptureDebugEntries(inspector());
    expect(d["Page"]).toBe("Context inspector");
    expect(d["Route"]).toBe("/administration/scopes-context/context-inspector");
    expect(d["Organization"]).toBe(`AI Matrx (${ORG})`);
    expect(d["Old vs new"]).toEqual({ defects: 1, rows: [1, 2, 3] });
    expect(d["Errors"]).toEqual(["The context items could not load: timeout"]);
  });

  it("each surface kind states its own identity", () => {
    const t = tablePageCapture({ title: "Clients", route: "/data-v2/t/x", table: { id: "t1", name: "Clients" }, view: "Grid", sections: [] });
    expect(t.kind).toBe("table-page");
    expect(pageCaptureMarkdown(t)).toContain("Table: Clients (t1)");
    expect(pageCaptureMarkdown(t)).toContain("View: Grid");
    const r = recordPageCapture({ title: "Acme", route: "/o/r1", record: { id: "r1", name: "Acme" }, table: { id: "t1", name: "Clients" }, sections: [] });
    expect(r.kind).toBe("record");
    expect(pageCaptureMarkdown(r)).toContain("Record: Acme (r1)");
    const d = dialogCapture({ title: "Share", route: "/o/r1", dialog: "Share", subject: { id: "r1", name: "Acme" }, sections: [] });
    expect(d.kind).toBe("dialog");
    expect(pageCaptureMarkdown(d)).toContain("Dialog: Share");
    expect(pageCaptureMarkdown(d)).toContain("Subject: Acme (r1)");
  });
});

describe("loadable sections", () => {
  it("hold a stub on the page and are read only at copy time; a failed read says so", async () => {
    const { resolvePageCapture, loadableSections } = await import("./pageCapture");
    const load = jest.fn(async () => [{ id: "r1", name: "Acme" }]);
    const c = tablePageCapture({
      title: "Clients",
      route: "/data-v2/t1",
      table: { id: "t1", name: "Clients" },
      sections: [
        { id: "records", title: "Records", role: "data", value: "Not in the quick copy.", load },
        { id: "broken", title: "Broken", role: "data", value: "stub", load: async () => { throw new Error("timeout"); } },
      ],
    });
    expect(loadableSections(c).map((s) => s.id)).toEqual(["records", "broken"]);
    expect(load).not.toHaveBeenCalled();
    const r = await resolvePageCapture(c);
    expect(r.sections[0].value).toEqual([{ id: "r1", name: "Acme" }]);
    expect(r.sections[1].value).toBe("Broken could not be read: timeout");
    expect(loadableSections(r)).toHaveLength(0);
  });
});

it("a descendant names what the page left unnamed, never overriding a name the page gave", () => {
  const base = tablePageCapture({ title: "Data table", route: "/data-v2/t1", table: { id: "t1", name: null }, view: "grid", sections: [] });
  const merged = mergePageCapture(base, [
    { owner: "mount", sections: [], identity: { Table: { id: "t1", name: "Clients" }, View: "kanban" } },
  ]);
  expect(merged.identity.Table).toEqual({ id: "t1", name: "Clients" });
  expect(merged.identity.View).toBe("grid");
});

it("every variant builds through the kit's real envelope (xml-safe kind and context keys)", async () => {
  const { buildAgentPayload } = await import("@ai-matrx/kit/content-transfer");
  for (const variant of ["everything", "data"] as const) {
    const text = buildAgentPayload(pageCapturePayload(inspector(), variant));
    expect(text).toContain("Context inspector");
    expect(text).toContain(`AI Matrx (${ORG})`);
    expect(text).toContain(`Apps (${TYPE})`);
  }
  const t = tablePageCapture({ title: "Clients", route: "/data-v2/t1", table: { id: "t1", name: "Clients" }, sections: [] });
  expect(() => buildAgentPayload(pageCapturePayload(t, "everything"))).not.toThrow();
});

// ── V24-TAILS (VERIFIER-24 item 6): "Prepare for AI" on a table page said only "Unsupported value".
// The Alchemy workspace clones the JSON source through the kit's strict clone; a table page's
// capture carried its records section's `load` function and a store declaration. Red before the
// capture was made plain at registration: the kit's clone refuses the capture below.
import { normalizeTransferJson, buildAgentPayload } from "@ai-matrx/kit/content-transfer";
import {
  checkedTransferJson,
  normalizePageCapture,
  pageCaptureJson,
  resolvePageCapture,
  toPlainJson,
  CIRCULAR_MARKER_PREFIX,
} from "./pageCapture";

class FieldDeclaration {
  constructor(
    public key: string,
    public label: string,
  ) {}
  describe() {
    return `${this.label} (${this.key})`;
  }
}

function awkwardTableCapture(): PageCapture {
  const declaration: Record<string, unknown> = {
    name: "Linden Row fourplex — turnover tasks",
    created_at: new Date("2026-09-25T15:04:05.000Z"),
    description: undefined,
    fields: new Map([["move_out", new FieldDeclaration("move_out", "Move-out date")]]),
    trades: new Set(["Plumbing", "Paint"]),
    formatter: () => "a function the store client left on the object",
    rows_estimate: Number.NaN,
  };
  declaration["self"] = declaration; // a cycle
  return tablePageCapture({
    title: "Data table",
    route: "/data-v2/2db204d9-0000-4000-8000-000000000001",
    table: { id: "2db204d9-0000-4000-8000-000000000001", name: "Linden Row fourplex — turnover tasks" },
    view: "kanban",
    selection: { "Board grouped by": "trade" },
    sections: [
      { id: "table", title: "Table declaration", role: "data", value: declaration },
      {
        id: "records",
        title: "Records",
        role: "data",
        value: "Not in the quick copy.",
        load: async () => ({ rows: [{ unit: "2B", move_out: new Date("2026-10-01T00:00:00.000Z") }] }),
      },
    ],
  });
}

describe("the capture is plain JSON (V24-TAILS)", () => {
  it("the kit's strict clone refuses the raw capture — the defect this guards", () => {
    expect(() => normalizeTransferJson(awkwardTableCapture() as unknown as Record<string, unknown>)).toThrow();
  });

  it("the Alchemy JSON source of a capture holding a Date, Map, Set, class, function and cycle clones", () => {
    const json = pageCaptureJson(normalizePageCapture(awkwardTableCapture()));
    const cloned = normalizeTransferJson(json) as {
      sections: Array<{ id: string; value: Record<string, unknown>; read_at_copy_time?: string }>;
    };
    const table = cloned.sections.find((s) => s.id === "table")!.value;
    expect(table["created_at"]).toBe("2026-09-25T15:04:05.000Z");
    expect(table["fields"]).toEqual([{ key: "move_out", value: { key: "move_out", label: "Move-out date" } }]);
    expect(table["trades"]).toEqual(["Plumbing", "Paint"]);
    expect("formatter" in table).toBe(false);
    expect("description" in table).toBe(false);
    expect(table["rows_estimate"]).toBe("NaN");
    expect(String(table["self"])).toContain(CIRCULAR_MARKER_PREFIX);
    const records = cloned.sections.find((s) => s.id === "records")!;
    expect("load" in records).toBe(false);
    expect(records.read_at_copy_time).toContain("with records");
  });

  it("every Groomer section grooms at every level into an agent payload", () => {
    const g = pageCaptureGroomer(normalizePageCapture(awkwardTableCapture()));
    for (const level of ["full", "compact", "brief"] as const) {
      const data: Record<string, unknown> = {};
      for (const s of g.sections) data[s.id] = s.build(level);
      const text = buildAgentPayload({ kind: g.kind, location: g.location, description: g.description, data, attributes: g.attributes, context: g.context });
      expect(text).toContain("Linden Row fourplex");
    }
  });

  it("a loaded section comes back plain", async () => {
    const resolved = await resolvePageCapture(normalizePageCapture(awkwardTableCapture()));
    const records = resolved.sections.find((s) => s.id === "records")!;
    expect(records.load).toBeUndefined();
    expect(records.value).toEqual({ rows: [{ unit: "2B", move_out: "2026-10-01T00:00:00.000Z" }] });
    expect(() => normalizeTransferJson(pageCaptureJson(resolved))).not.toThrow();
  });

  it("a value that still cannot be represented is refused with its path in words", () => {
    expect(() => checkedTransferJson({ sections: [{ id: "table", value: { at: new Date(0) } }] }, "The Data table page")).toThrow(
      "The Data table page could not be prepared: sections › 0 › value › at is a Date, not a plain object.",
    );
    expect(() => checkedTransferJson({ a: { b: () => 1 } }, "The page")).toThrow("a › b is a function, which is not plain data");
    expect(toPlainJson(undefined)).toBeNull();
  });
});
