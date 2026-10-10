// features/spaces/editor/__tests__/round-trip.editor-proof.mts — the real-editor leg of round-trip.test.tsx.
// Jest cannot load BlockNote (ESM-only dependencies), so this runs bundled in Node with a DOM:
//   bash features/spaces/editor/__tests__/run-editor-proof.sh
// Every construct a Notion import produces goes into a real BlockNote editor built on the Spaces schema,
// is read back as the editor holds it, and must come out identical (twice) and valid.
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, DOMParser: dom.window.DOMParser, getComputedStyle: dom.window.getComputedStyle });
async function main() {
    const { BlockNoteEditor } = await import("@blocknote/core");
    const { notionMarkdownToBlocks } = await import("@/lib/spaces-blocks/notion-markdown");
    const { validateSnapshot } = await import("@/lib/spaces-blocks/schema");
    const { DEFAULT_PAGE_SETTINGS } = await import("@/lib/spaces-blocks/types");
    const { fromEngine, toEngine } = await import("../convert");
    const { spacesSchema } = await import("../schema");
    const ctx = {
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
    const through = (blocks) => {
        const editor = BlockNoteEditor.create({ schema: spacesSchema, initialContent: toEngine(blocks) });
        return fromEngine(editor.document);
    };
    const { blocks } = notionMarkdownToBlocks(EVERY_CONSTRUCT, ctx);
    const once = through(blocks);
    const twice = through(once);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const problems = validateSnapshot({ v: 1, settings: DEFAULT_PAGE_SETTINGS, icon: null, cover: null, blocks: once });
    const odd = [{ id: "b-x", type: "syncedBlock", props: { from: "x" }, children: [{ id: "b-y", type: "text", text: [{ text: "kept" }] }] }];
    // C10 code caption + wrap, C14 header toggles + cell colors: through the real editor's attributes.
    const extras = [
        { id: "b-c", type: "code", text: [{ text: "SELECT 1;" }], props: { language: "sql", caption: [{ text: "The ", bold: true }, { text: "check" }], wrap: true } },
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
    const extrasBack = through(extras);
    const sorted = (v) => Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sorted(x)])) : v;
    const results = {
        codeAndTableKept: same(sorted(extrasBack), sorted(extras)),
        blocks: blocks.length,
        types: [...new Set(blocks.map((b) => b.type))].join(","),
        roundTripIdentical: same(once, blocks),
        secondSaveIdentical: same(twice, blocks),
        unknownTypeKept: same(through(odd), odd),
        validateSnapshot: problems,
    };
    console.log(JSON.stringify(results, null, 1));
    if (!results.roundTripIdentical) {
        blocks.forEach((b, i) => {
            if (!same(b, once[i]))
                console.log("DIFF", JSON.stringify(b), "\n  =>", JSON.stringify(once[i]));
        });
    }
    if (!results.codeAndTableKept)
        console.log("EXTRAS", JSON.stringify(extrasBack));
    if (!results.codeAndTableKept || !results.roundTripIdentical || !results.secondSaveIdentical || !results.unknownTypeKept || problems.length)
        process.exit(1);
    // The editor leaves handles open (jsdom timers): end the proof once it has answered.
    process.exit(0);
}
void main();
