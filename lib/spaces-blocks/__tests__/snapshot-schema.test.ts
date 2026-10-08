// The generated JSON Schema (jsonSchema.ts, stored as content.space_snapshot_schema()) must agree with
// validateSnapshot: everything it accepts passes, planted bad snapshots fail. Also a differential run over
// many single-field mutations of a snapshot covering every block type (ids excluded: uniqueness is not
// expressible in JSON Schema and is checked by validateSnapshot only).

import Ajv2020 from "ajv/dist/2020";
import { buildSpaceSnapshotSchema } from "../jsonSchema";
import { BLOCK_SPECS, validateSnapshot } from "../schema";
import { DEFAULT_PAGE_SETTINGS } from "../types";

const ajv = new Ajv2020({ strict: false, allErrors: false });
const validate = ajv.compile(buildSpaceSnapshotSchema());
const schemaOk = (s: unknown) => validate(s) as boolean;
const codeOk = (s: unknown) => validateSnapshot(s).length === 0;

const span = (text: string, extra: Record<string, unknown> = {}) => ({ text, ...extra });
let n = 0;
const id = () => `b${++n}`;
const media = { fileId: "f1", width: 300, name: "a.png", caption: [span("cap")] };

function everyType() {
  return [
    { id: id(), type: "text", text: [span("hi", { bold: true, color: "red", link: "https://x.y", mention: { kind: "date", iso: "2026-10-05" } }), span("Pricing", { mention: { kind: "link", url: "https://example.com/pricing", title: "Pricing", icon: "Globe" } })], props: { textAlignment: "center" } },
    { id: id(), type: "text", text: [span("Could not map")], props: { unsupported: { from: "notion", kind: "synced_block", source: "<synced_block/>" } } },
    { id: id(), type: "heading", text: [span("H")], props: { level: 2, toggleable: true }, children: [{ id: id(), type: "text", text: [span("in")] }] },
    { id: id(), type: "bulleted", text: [span("b")], background: "gray" },
    { id: id(), type: "numbered", text: [span("n")] },
    { id: id(), type: "todo", text: [span("t")], props: { checked: false } },
    { id: id(), type: "toggle", text: [span("tg")] },
    { id: id(), type: "quote", text: [span("q")] },
    { id: id(), type: "callout", text: [span("c")], props: { icon: "Info" } },
    { id: id(), type: "divider" },
    { id: id(), type: "code", text: [span("x=1")], props: { language: "ts", caption: [span("c")] } },
    { id: id(), type: "equation", props: { expression: "e=mc^2" } },
    { id: id(), type: "page", props: { spaceId: "s1" } },
    { id: id(), type: "linkToPage", props: { spaceId: "s2" } },
    { id: id(), type: "table", props: { headerRow: true, headerColumn: false, columnWidths: [120, null], rows: [{ cells: [[span("a")], [span("b")]] }] } },
    { id: id(), type: "tableOfContents" },
    { id: id(), type: "breadcrumb" },
    {
      id: id(),
      type: "columnList",
      children: [
        { id: id(), type: "column", props: { width: 0.5 }, children: [{ id: id(), type: "text", text: [span("l")] }] },
        { id: id(), type: "column", props: { width: 0.5 }, children: [{ id: id(), type: "text", text: [span("r")] }] },
      ],
    },
    ...["image", "video", "audio", "file", "pdf"].map((type) => ({ id: id(), type, props: { ...media } })),
    { id: id(), type: "image", props: { url: "https://x.y/a.png" } },
    { id: id(), type: "bookmark", props: { url: "https://x.y", caption: [span("c")] } },
    { id: id(), type: "embed", props: { url: "https://x.y" } },
    { id: id(), type: "database", props: { inline: true, source: { kind: "table", tableId: "t1", viewId: "v1" } } },
    { id: id(), type: "database", props: { inline: false, source: { kind: "entity", token: "client" } } },
    {
      id: id(),
      type: "database",
      props: {
        inline: true,
        title: "Clients",
        sample: "agency",
        linked: true,
        showTitle: false,
        openAs: "page",
        activeViewId: "v-ring",
        source: { kind: "table", tableId: "t1" },
        views: [
          { id: "v-all", name: "All", layout: "grid", icon: "Users", groupField: null, dateField: "due", sorts: [{ field: "name", direction: "asc" }], filters: { status: "active", n: 1, ok: true, none: null }, hiddenFields: ["linked:task__client"] },
          { id: "v-ring", name: "Ring", layout: "chart", chart: { type: "donut", groupBy: "status", op: "avg", field: "score", sort: "desc", legend: true, dataLabels: true, centerValue: true } },
          { id: "v-dash", name: "Dash", layout: "dashboard" },
        ],
      },
    },
    { id: id(), type: "slot", props: { label: "Hero" } },
    {
      id: id(),
      type: "tabs",
      props: { activeTab: "tab-b" },
      children: [
        { id: "tab-a", type: "tab", text: [span("Overview")], children: [{ id: id(), type: "text", text: [span("a")] }] },
        { id: "tab-b", type: "tab", text: [span("Notes")], children: [{ id: id(), type: "todo", text: [span("b")], props: { checked: true } }] },
      ],
    },
  ];
}

const snap = (blocks: unknown[] = everyType()) => ({ v: 1, settings: { ...DEFAULT_PAGE_SETTINGS }, icon: { icon: "TreePalm" }, cover: { url: "https://x.y/c.png", offsetY: 4 }, blocks });
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe("Space snapshot JSON Schema", () => {
  it("covers exactly the catalog's block types", () => {
    const schema = buildSpaceSnapshotSchema() as any;
    expect([...schema.$defs.block.properties.type.enum].sort()).toEqual([...BLOCK_SPECS.keys()].sort());
  });

  it("accepts what validateSnapshot accepts (every type, unsupported shape, nulls)", () => {
    for (const s of [snap(), { ...snap(), icon: null, cover: null }, snap([]), { ...snap(), icon: { url: "https://x.y/i.png" } }]) {
      expect(validateSnapshot(s)).toEqual([]);
      expect(schemaOk(s)).toBe(true);
    }
  });

  const bad: Record<string, (s: any) => void> = {
    "unknown block type": (s) => (s.blocks[0].type = "paragraph"),
    "block without id": (s) => delete s.blocks[0].id,
    "empty id": (s) => (s.blocks[0].id = ""),
    "heading level 5": (s) => (s.blocks[2].props.level = 5),
    "heading without props": (s) => delete s.blocks[2].props,
    "todo checked not boolean": (s) => (s.blocks[5].props.checked = "no"),
    "wrong props shape (array)": (s) => (s.blocks[0].props = []),
    "span unknown field": (s) => (s.blocks[0].text[0].shiny = true),
    "span without text": (s) => delete s.blocks[0].text[0].text,
    "span bad color": (s) => (s.blocks[0].text[0].color = "teal"),
    "bad mention": (s) => (s.blocks[0].text[0].mention = { kind: "space" }),
    "link mention without url": (s) => (s.blocks[0].text[0].mention = { kind: "link", title: "Docs" }),
    "link mention title not text": (s) => (s.blocks[0].text[0].mention = { kind: "link", url: "https://x.y", title: 3 }),
    "block text not an array": (s) => (s.blocks[0].text = "hi"),
    "divider with text": (s) => (s.blocks[9].text = [span("x")]),
    "divider with children": (s) => (s.blocks[9].children = [{ id: "z", type: "text" }]),
    "column outside columnList": (s) => (s.blocks[0].children = [{ id: "z", type: "column", props: { width: 1 } }]),
    "columnList with one column": (s) => s.blocks[17].children.pop(),
    "columnList with non-column": (s) => (s.blocks[17].children[0] = { id: "z", type: "text" }),
    "media with both fileId and url": (s) => (s.blocks[18].props.url = "https://x.y"),
    "media with neither": (s) => (s.blocks[18].props = { width: 3 }),
    "table without rows": (s) => (s.blocks[14].props.rows = []),
    "bookmark without url": (s) => (s.blocks[24].props = {}),
    "database bad openAs": (s) => (s.blocks[28].props.openAs = "popup"),
    "database bad view layout": (s) => (s.blocks[28].props.views[0].layout = "cards"),
    "database chart without op": (s) => delete s.blocks[28].props.views[1].chart.op,
    "table bad columnWidths": (s) => (s.blocks[14].props.columnWidths = ["wide"]),
    "unsupported without source": (s) => delete s.blocks[1].props.unsupported.source,
    "database bad source": (s) => (s.blocks[26].props.source = { kind: "sheet" }),
    "page without spaceId": (s) => (s.blocks[12].props = {}),
    "version 2": (s) => (s.v = 2),
    "no settings": (s) => delete s.settings,
    "bad font": (s) => (s.settings.font = "comic"),
    "icon with two keys": (s) => (s.icon = { icon: "A", url: "https://x.y" }),
    "blocks not an array": (s) => (s.blocks = {}),
    "nested bad type": (s) => (s.blocks[2].children[0].type = "para"),
    "tabs holding a non-tab": (s) => (s.blocks[30].children[0] = { id: "z", type: "text", text: [span("x")] }),
    "tab outside tabs": (s) => (s.blocks[0].children = [{ id: "z", type: "tab", text: [span("x")] }]),
    "tab at the page root": (s) => s.blocks.push({ id: "z", type: "tab", text: [span("x")] }),
    "tabs with text": (s) => (s.blocks[30].text = [span("x")]),
    "tabs activeTab not text": (s) => (s.blocks[30].props.activeTab = 3),
    "column inside a tab": (s) => (s.blocks[30].children[0].children = [{ id: "z", type: "column", props: { width: 1 } }]),
  };
  for (const [name, mutate] of Object.entries(bad)) {
    it(`refuses: ${name}`, () => {
      const s = snap();
      mutate(s);
      expect(validateSnapshot(s).length).toBeGreaterThan(0);
      expect(schemaOk(s)).toBe(false);
    });
  }

  it("agrees with validateSnapshot over single-field mutations of every block", () => {
    const base = snap();
    const junk: unknown[] = [null, 0, -1, 1.5, "", "x", true, false, [], {}, [{}], { text: 1 }];
    let compared = 0;
    const disagreements: string[] = [];
    const walk = (node: unknown, path: (string | number)[]) => {
      if (node && typeof node === "object") {
        for (const key of Object.keys(node as object)) {
          if (key === "id" && typeof (node as any)[key] === "string" && path.length) {
            // ids: only emptiness / type are mirrored
          }
          for (const j of junk) {
            const s = clone(base) as any;
            let t = s;
            for (const p of path) t = t[p];
            t[key] = clone(j);
            compared += 1;
            if (codeOk(s) !== schemaOk(s)) disagreements.push(`${[...path, key].join(".")} = ${JSON.stringify(j)} code=${codeOk(s)}`);
          }
          const del = clone(base) as any;
          let t = del;
          for (const p of path) t = t[p];
          delete t[key];
          compared += 1;
          if (codeOk(del) !== schemaOk(del)) disagreements.push(`${[...path, key].join(".")} deleted code=${codeOk(del)}`);
          walk((node as any)[key], [...path, key]);
        }
      }
    };
    walk(base, []);
    expect(compared).toBeGreaterThan(1000);
    expect(disagreements.slice(0, 15)).toEqual([]);
  });
});
