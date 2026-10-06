// Every stored construct survives the store boundary: a Notion import holding every block type in
// BLOCK-SCHEMA.md goes through convert.ts to the engine shape and back exactly as it went in, and the result is a valid snapshot. A block the editor dropped,
// flattened or rewrote (mention → plain text, caption spans → a string, a table → nothing) fails here.

import { notionMarkdownToBlocks, type NotionMarkdownContext } from "@/lib/spaces-blocks/notion-markdown";
import { validateSnapshot } from "@/lib/spaces-blocks/schema";
import { DEFAULT_PAGE_SETTINGS, type SpaceBlock } from "@/lib/spaces-blocks/types";

import { fromEngine, toEngine, type EngineBlock } from "../convert";

const ctx: NotionMarkdownContext = {
  idSeed: "notion:page/traveling-smm-os",
  resolvePage: (ref) => (ref.includes("Clients-OS") ? { spaceId: "space-clients-os", childOfThisPage: true } : null),
  resolvePerson: (_ref, name) => (name === "Cora Reyes" ? "user-cora" : null),
  resolveFile: (url, kind) => (url.includes("youtube.com") ? { url } : { fileId: `file-${kind}-${url.split("/").pop()}` }),
  resolveDatabase: (ref) => (ref.includes("Client-Database") ? { tableId: "table-clients", viewId: ref.includes("v=") ? "view-active" : undefined } : null),
};

const EVERY_CONSTRUCT = [
  "# Clients",
  "Plain text with **bold**, *italic*, ~~strike~~, `code` and a [link](https://later.com).",
  'Ask <mention-user url="user://cora">Cora Reyes</mention-user> to update <mention-page url="https://www.notion.so/Clients-OS-1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6">Clients OS</mention-page> by <mention-date start="2026-10-15"/>.',
  "Target CPL is $\\frac{spend}{leads}$ under $40.",
  "$$",
  "ROAS = \\frac{Revenue}{Ad\\ Spend}",
  "$$",
  "- [ ] Revise captions for Viva",
  "- [x] Send Meli the voice notes",
  "> Done is better than perfect",
  "---",
  "![Rooftop pool shoot](https://prod-files-secure.s3.us-west-2.amazonaws.com/pool.jpg)",
  '<video source="https://www.youtube.com/watch?v=abc123">Brand film</video>',
  '<audio source="https://prod-files-secure.s3.us-west-2.amazonaws.com/voice-note.mp3"></audio>',
  '<file source="https://prod-files-secure.s3.us-west-2.amazonaws.com/contract.docx"></file>',
  '<pdf source="https://prod-files-secure.s3.us-west-2.amazonaws.com/rate-card.pdf">2026 rate card</pdf>',
  '<bookmark url="https://later.com/blog/instagram-algorithm/"/>',
  '<embed source="https://www.loom.com/share/abc">Onboarding walkthrough</embed>',
  '<table header-row="true">',
  "\t<tr>",
  "\t\t<td>Client name</td>",
  "\t\t<td>Offer bought</td>",
  "\t</tr>",
  "\t<tr>",
  "\t\t<td>Bella Vista Resort</td>",
  "\t\t<td>**Momentum** package</td>",
  "\t</tr>",
  "</table>",
  "<table_of_contents/>",
  "<breadcrumb/>",
  '<database url="https://www.notion.so/Client-Database-9f8e?v=abc" inline="true">Client Database</database>',
  '<database url="https://www.notion.so/Client-Database-9f8e">Client Database</database>',
  '<unknown url="https://www.notion.so/x#blk" alt="button"/>',
].join("\n");

/** The store boundary both ways (the real-editor leg is round-trip.editor-proof.mts — Jest cannot load BlockNote's ESM). */
function throughEditor(blocks: SpaceBlock[]): SpaceBlock[] {
  return fromEngine(JSON.parse(JSON.stringify(toEngine(blocks))) as EngineBlock[]);
}

describe("every stored block type survives the editor", () => {
  const { blocks } = notionMarkdownToBlocks(EVERY_CONSTRUCT, ctx);

  it("the import covers every construct in the schema", () => {
    const types = new Set<string>();
    const walk = (list: SpaceBlock[]) => list.forEach((b) => (types.add(b.type), walk(b.children ?? [])));
    walk(blocks);
    for (const t of ["heading", "text", "todo", "quote", "divider", "equation", "image", "video", "audio", "file", "pdf", "bookmark", "embed", "table", "tableOfContents", "breadcrumb", "database"]) {
      expect(types).toContain(t);
    }
    const spans = blocks.flatMap((b) => b.text ?? []);
    expect(spans.some((s) => s.mention?.kind === "person")).toBe(true);
    expect(spans.some((s) => s.mention?.kind === "space")).toBe(true);
    expect(spans.some((s) => s.mention?.kind === "date")).toBe(true);
    expect(spans.some((s) => s.equation !== undefined)).toBe(true);
    expect(blocks.some((b) => b.props?.unsupported)).toBe(true);
  });

  it("round-trips unchanged through a real editor and stays a valid snapshot", () => {
    const back = throughEditor(blocks);
    expect(back).toEqual(blocks);
    expect(validateSnapshot({ v: 1, settings: DEFAULT_PAGE_SETTINGS, icon: null, cover: null, blocks: back })).toEqual([]);
  });

  it("a second save is identical to the first (no drift)", () => {
    expect(throughEditor(throughEditor(blocks))).toEqual(blocks);
  });

  it("a stored type the editor has never heard of is kept whole", () => {
    const odd: SpaceBlock[] = [{ id: "b-x", type: "syncedBlock", props: { from: "x" }, children: [{ id: "b-y", type: "text", text: [{ text: "kept" }] }] }];
    expect(throughEditor(odd)).toEqual(odd);
  });

  it("a code block keeps its caption spans and wrap (C10)", () => {
    const code: SpaceBlock[] = [
      { id: "b-c", type: "code", text: [{ text: "SELECT 1;" }], props: { language: "sql", caption: [{ text: "The ", bold: true }, { text: "check" }], wrap: true } },
      { id: "b-d", type: "code", text: [{ text: "plain" }], props: { language: "text" } },
    ];
    expect(throughEditor(code)).toEqual(code);
    expect(validateSnapshot({ v: 1, settings: DEFAULT_PAGE_SETTINGS, icon: null, cover: null, blocks: throughEditor(code) })).toEqual([]);
  });

  it("a simple table keeps its header toggles and cell colors (C14)", () => {
    const table: SpaceBlock[] = [
      {
        id: "b-t",
        type: "table",
        props: {
          headerRow: true,
          headerColumn: true,
          rows: [{ cells: [[{ text: "Client" }], [{ text: "Status" }]] }, { cells: [[{ text: "Cora" }], [{ text: "Active" }]] }],
          cellStyles: [[null, { background: "green" }], [{ color: "orange" }, null]],
        },
      },
    ];
    expect(throughEditor(table)).toEqual(table);
    expect(validateSnapshot({ v: 1, settings: DEFAULT_PAGE_SETTINGS, icon: null, cover: null, blocks: throughEditor(table) })).toEqual([]);
  });
});
