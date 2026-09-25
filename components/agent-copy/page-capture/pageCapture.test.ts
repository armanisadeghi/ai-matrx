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
    expect(g.kind).toBe("page-capture:admin-page");
    const ids = g.sections.map((s) => s.id);
    expect(ids).toEqual(["page", "selection", "errors", "compare", "requests"]);
    const page = g.sections.find((s) => s.id === "page")!;
    expect(page.cuttable).toBe(false);
    expect(page.build("brief")).toMatchObject({ title: "Context inspector" });
    const data = g.sections.find((s) => s.id === "compare")!;
    expect(data.build("full")).toEqual({ defects: 1, rows: [1, 2, 3] });
    expect(data.build("brief")).toBe("1 defect");
    // The envelope names the page and the picks on every variant.
    expect(g.context).toMatchObject({ page: "Context inspector", Organization: `AI Matrx (${ORG})` });
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
