// Notion-flavored Markdown → Space blocks, proved on realistic agency pages (the Traveling SMM™ OS).
// Every output is run through the stored-schema validator: a converter result the editor could not
// store fails here, not in someone's workspace.

import { notionMarkdownToBlocks, notionMediaToSpace, stableBlockId, type NotionMarkdownContext } from "../notion-markdown";
import { validateBlocks, validateSnapshot } from "../schema";
import type { RichSpan, SpaceBlock } from "../types";
import { DEFAULT_PAGE_SETTINGS } from "../types";

const PAGES: Record<string, string> = {
  "https://www.notion.so/Clients-OS-1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6": "space-clients-os",
  "https://www.notion.so/90-Day-Plan-2b3c4d5e6f7a48b9c0d1e2f3a4b5c6d7": "space-90-day-plan",
  "https://www.notion.so/Scripts-3c4d5e6f7a8b49c0d1e2f3a4b5c6d7e8": "space-scripts",
  "Clients OS 1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6.md": "space-clients-os",
};
const LINKED_ELSEWHERE = new Set(["https://www.notion.so/Scripts-3c4d5e6f7a8b49c0d1e2f3a4b5c6d7e8"]);

const ctx: NotionMarkdownContext = {
  idSeed: "notion:page/traveling-smm-os",
  resolvePage: (ref) => (PAGES[ref] ? { spaceId: PAGES[ref], childOfThisPage: !LINKED_ELSEWHERE.has(ref) } : null),
  resolvePerson: (_ref, name) => (name === "Cora Reyes" ? "user-cora" : null),
  resolveFile: (url, kind) => {
    if (url.includes("not-uploaded")) return null;
    if (url.includes("youtube.com")) return { url };
    return { fileId: `file-${kind}-${url.split("/").pop()}` };
  },
  resolveDatabase: (ref) =>
    ref.includes("Client-Database") || ref.endsWith(".csv") ? { tableId: "table-clients", viewId: ref.includes("v=") ? "view-active" : undefined } : null,
};

function convert(md: string, c: NotionMarkdownContext = ctx) {
  const result = notionMarkdownToBlocks(md, c);
  const problems = validateBlocks(result.blocks);
  expect(problems).toEqual([]);
  return result;
}

const text = (b: SpaceBlock | undefined) => (b?.text ?? []).map((s) => s.text).join("");
const only = (md: string) => {
  const { blocks } = convert(md);
  expect(blocks).toHaveLength(1);
  return blocks[0];
};

describe("headings", () => {
  it("maps # / ## / ### / #### (Notion's Heading 4) and caps deeper levels at 4", () => {
    const { blocks } = convert("# Clients\n## Fulfillment\n### Team Boards\n#### Weekly sync\n##### Notes");
    expect(blocks.map((b) => [b.type, b.props?.level, text(b)])).toEqual([
      ["heading", 1, "Clients"],
      ["heading", 2, "Fulfillment"],
      ["heading", 3, "Team Boards"],
      ["heading", 4, "Weekly sync"],
      ["heading", 4, "Notes"],
    ]);
  });

  it("toggle headings hold their tab-indented children ({toggle} and <details><summary>#)", () => {
    const { blocks } = convert(
      [
        '## Other To Dos {toggle="true" color="gray_bg"}',
        "\tRenew the Later.com plan",
        "\t- Send Q3 invoices",
        "<details>",
        "<summary>### AI Process</summary>",
        "\tDraft captions with the brand voice agent",
        "</details>",
      ].join("\n"),
    );
    expect(blocks[0]).toMatchObject({ type: "heading", background: "gray", props: { level: 2, toggleable: true } });
    expect(blocks[0].children?.map((c) => c.type)).toEqual(["text", "bulleted"]);
    expect(blocks[1]).toMatchObject({ type: "heading", props: { level: 3, toggleable: true } });
    expect(text(blocks[1].children?.[0])).toBe("Draft captions with the brand voice agent");
  });
});

describe("lists", () => {
  it("nests bulleted, numbered and to-do items (tabs and 4-space export indents)", () => {
    const { blocks } = convert(
      [
        "- Active clients",
        "\t- Bella Vista Resort",
        "\t\t- Reels 3x per week",
        "    - Casa Mar Boutique Hotel",
        "1. Audit the account",
        "2. Build the content calendar",
        "- [ ] Film the rooftop pool b-roll",
        "\t- [x] Book the drone operator",
        "- [x] Send the onboarding questionnaire",
      ].join("\n"),
    );
    expect(blocks.map((b) => b.type)).toEqual(["bulleted", "numbered", "numbered", "todo", "todo"]);
    expect(blocks[0].children?.map(text)).toEqual(["Bella Vista Resort", "Casa Mar Boutique Hotel"]);
    expect(text(blocks[0].children?.[0].children?.[0])).toBe("Reels 3x per week");
    expect(blocks[3]).toMatchObject({ props: { checked: false } });
    expect(blocks[3].children?.[0]).toMatchObject({ type: "todo", props: { checked: true } });
    expect(blocks[4]).toMatchObject({ props: { checked: true } });
  });

  it("keeps a colored to-do (the orange items of the 90 Day Plan)", () => {
    const b = only('- [ ] Post the client win on LinkedIn {color="orange"}');
    expect(b).toMatchObject({ type: "todo", color: "orange", props: { checked: false } });
    expect(text(b)).toBe("Post the client win on LinkedIn");
  });
});

describe("toggles, quotes, callouts, dividers", () => {
  it("toggle via <details> and via the older ▶ form", () => {
    const { blocks } = convert(
      ["<details>", "<summary>Hiring</summary>", "\tPost the editor role on OnlineJobs.ph", "</details>", "▶ Finances", "\tReconcile Stripe payouts"].join("\n"),
    );
    expect(blocks.map((b) => [b.type, text(b), b.children?.map(text)])).toEqual([
      ["toggle", "Hiring", ["Post the editor role on OnlineJobs.ph"]],
      ["toggle", "Finances", ["Reconcile Stripe payouts"]],
    ]);
  });

  it("quote joins consecutive > lines with a line break", () => {
    const b = only("> Content is the product.\n> Consistency is the marketing.");
    expect(b.type).toBe("quote");
    expect(text(b)).toBe("Content is the product.\nConsistency is the marketing.");
  });

  it("callout keeps icon (emoji → Lucide), color, first line as text and the rest as children", () => {
    const b = only(
      ['<callout icon="💡" color="yellow_bg">', "\t**Rule:** every client gets a Loom recap on Fridays.", "\t- Record under 5 minutes", "</callout>"].join("\n"),
    );
    expect(b).toMatchObject({ type: "callout", background: "yellow", props: { icon: "Lightbulb" } });
    expect(b.text?.[0]).toEqual({ text: "Rule:", bold: true });
    expect(b.children?.[0].type).toBe("bulleted");
  });

  it("export <aside> callout reads the leading emoji as its icon", () => {
    const b = only("<aside>\n🚀 Launch week starts Monday.\n</aside>");
    expect(b).toMatchObject({ type: "callout", props: { icon: "Rocket" }, background: "gray" });
    expect(text(b)).toBe("Launch week starts Monday.");
  });

  it("an unknown callout emoji falls back to Lightbulb and says so", () => {
    const { blocks, warnings } = convert('<callout icon="🦩">\n\tFlamingo campaign\n</callout>');
    expect(blocks[0].props).toEqual({ icon: "Lightbulb" });
    expect(warnings.join(" ")).toContain("🦩");
  });

  it("divider", () => {
    expect(only("---").type).toBe("divider");
  });
});

describe("code and equations", () => {
  it("code keeps language and its own indentation", () => {
    const b = only(["```javascript", "function hook(lead) {", "  return lead.name;", "}", "```"].join("\n"));
    expect(b).toMatchObject({ type: "code", props: { language: "javascript" } });
    expect(text(b)).toBe("function hook(lead) {\n  return lead.name;\n}");
  });

  it("block equation and inline equation", () => {
    const { blocks } = convert(["$$", "ROAS = \\frac{Revenue}{Ad\\ Spend}", "$$", "Target CPL is $\\frac{spend}{leads}$ under $40."].join("\n"));
    expect(blocks[0]).toMatchObject({ type: "equation", props: { expression: "ROAS = \\frac{Revenue}{Ad\\ Spend}" } });
    const eq = blocks[1].text?.find((s) => s.equation);
    expect(eq).toEqual({ text: "\\frac{spend}{leads}", equation: "\\frac{spend}{leads}" });
    expect(text(blocks[1])).toContain("under $40.");
  });
});

describe("structure", () => {
  it("columns become a columnList with equal widths", () => {
    const b = only(
      ["<columns>", "\t<column>", "\t\t### CLIENTS", '\t\t<page url="https://www.notion.so/Clients-OS-1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6">Clients OS</page>', "\t</column>", "\t<column>", "\t\t### 90 Day Plan", "\t</column>", "</columns>"].join("\n"),
    );
    expect(b.type).toBe("columnList");
    expect(b.children?.map((c) => [c.type, c.props?.width])).toEqual([
      ["column", 0.5],
      ["column", 0.5],
    ]);
    expect(b.children?.[0].children?.[1]).toMatchObject({ type: "page", props: { spaceId: "space-clients-os" } });
  });

  it("child page, link to page, and an unresolved page that says so", () => {
    const { blocks, warnings } = convert(
      [
        '<page url="https://www.notion.so/90-Day-Plan-2b3c4d5e6f7a48b9c0d1e2f3a4b5c6d7">90 Day Plan</page>',
        '<page url="https://www.notion.so/Scripts-3c4d5e6f7a8b49c0d1e2f3a4b5c6d7e8">Scripts</page>',
        '<page url="https://www.notion.so/Archive-ffff">Old Archive</page>',
      ].join("\n"),
    );
    expect(blocks.map((b) => [b.type, b.props?.spaceId])).toEqual([
      ["page", "space-90-day-plan"],
      ["linkToPage", "space-scripts"],
      ["text", undefined],
    ]);
    expect(text(blocks[2])).toContain("Old Archive");
    expect(blocks[2].props).toMatchObject({ unsupported: { from: "notion", kind: "page (not imported)" } });
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("export child page link (.md) and database link (.csv)", () => {
    const { blocks } = convert("[Clients OS](Clients%20OS%201a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6.md)\n[Client Database](Client%20Database%20abc.csv)");
    expect(blocks[0]).toMatchObject({ type: "page", props: { spaceId: "space-clients-os" } });
    expect(blocks[1]).toMatchObject({ type: "database", props: { source: { kind: "table", tableId: "table-clients" }, inline: false } });
  });

  it("inline and full-page databases carry the store table id and optional view id", () => {
    const { blocks } = convert(
      [
        '<database url="https://www.notion.so/Client-Database-9f8e?v=abc" inline="true">Client Database</database>',
        '<database url="https://www.notion.so/Client-Database-9f8e">Client Database</database>',
      ].join("\n"),
    );
    expect(blocks[0].props).toEqual({ source: { kind: "table", tableId: "table-clients", viewId: "view-active" }, inline: true, title: "Client Database" });
    expect(blocks[1].props).toEqual({ source: { kind: "table", tableId: "table-clients" }, inline: false, title: "Client Database" });
  });

  it("simple table (Notion <table>) and GFM pipe table (export)", () => {
    const { blocks } = convert(
      [
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
        "| Script | Hook |",
        "| --- | --- |",
        "| Day in the life | You won't believe this office |",
      ].join("\n"),
    );
    expect(blocks[0]).toMatchObject({ type: "table", props: { headerRow: true, headerColumn: false } });
    const rows = blocks[0].props?.rows as Array<{ cells: RichSpan[][] }>;
    expect(rows[1].cells[1]).toEqual([{ text: "Momentum", bold: true }, { text: " package" }]);
    expect((blocks[1].props?.rows as Array<{ cells: RichSpan[][] }>).map((r) => r.cells.map((c) => c[0]?.text))).toEqual([
      ["Script", "Hook"],
      ["Day in the life", "You won't believe this office"],
    ]);
  });

  it("table of contents, empty block, synced blocks as plain copies", () => {
    const { blocks, warnings } = convert(
      ["<table_of_contents/>", "<empty-block/>", '<synced_block url="https://www.notion.so/sync-1">', "\tWeekly KPI: 3 posts per client", "</synced_block>"].join("\n"),
    );
    expect(blocks.map((b) => b.type)).toEqual(["tableOfContents", "text", "text"]);
    expect(text(blocks[2])).toBe("Weekly KPI: 3 posts per client");
    expect(warnings.join(" ")).toContain("plain copy");
  });
});

describe("media, bookmark, embed", () => {
  it("image/video/file/pdf land on our file ids (the converter never fetches)", () => {
    const { blocks } = convert(
      [
        "![Rooftop pool shoot](https://prod-files-secure.s3.us-west-2.amazonaws.com/pool.jpg)",
        '<video source="https://www.youtube.com/watch?v=abc123">Brand film</video>',
        '<file source="https://prod-files-secure.s3.us-west-2.amazonaws.com/contract.docx"></file>',
        '<pdf source="https://prod-files-secure.s3.us-west-2.amazonaws.com/rate-card.pdf">2026 rate card</pdf>',
        '<audio source="https://prod-files-secure.s3.us-west-2.amazonaws.com/not-uploaded.mp3"></audio>',
      ].join("\n"),
    );
    expect(blocks[0]).toEqual(expect.objectContaining({ type: "image", props: { fileId: "file-image-pool.jpg", caption: [{ text: "Rooftop pool shoot" }] } }));
    expect(blocks[1]).toMatchObject({ type: "video", props: { url: "https://www.youtube.com/watch?v=abc123" } });
    expect(blocks[2]).toMatchObject({ type: "file", props: { fileId: "file-file-contract.docx" } });
    expect(blocks[3]).toMatchObject({ type: "pdf", props: { fileId: "file-pdf-rate-card.pdf" } });
    expect(blocks[4]).toMatchObject({ type: "text", props: { unsupported: { kind: "audio (file not resolved)" } } });
  });

  it("bookmark and embed keep their URL", () => {
    const { blocks } = convert('<bookmark url="https://later.com/blog/instagram-algorithm/"/>\n<embed source="https://www.loom.com/share/abc">Onboarding walkthrough</embed>');
    expect(blocks[0]).toEqual(expect.objectContaining({ type: "bookmark", props: { url: "https://later.com/blog/instagram-algorithm/" } }));
    expect(blocks[1]).toEqual(expect.objectContaining({ type: "embed", props: { url: "https://www.loom.com/share/abc", caption: [{ text: "Onboarding walkthrough" }] } }));
  });
});

describe("rich text", () => {
  it("bold, italic, strike, underline, code, colors, links", () => {
    const b = only(
      'Post **3 reels** a *week*, ~~daily stories~~, <span underline="true">always</span> tag `@bellavista`, <span color="red">never</span> <span color="blue_bg">miss</span> the [brief](https://docs.google.com/brief).',
    );
    const by = (t: string) => b.text?.find((s) => s.text === t);
    expect(by("3 reels")).toEqual({ text: "3 reels", bold: true });
    expect(by("week")).toEqual({ text: "week", italic: true });
    expect(by("daily stories")).toEqual({ text: "daily stories", strike: true });
    expect(by("always")).toEqual({ text: "always", underline: true });
    expect(by("@bellavista")).toEqual({ text: "@bellavista", code: true });
    expect(by("never")).toEqual({ text: "never", color: "red" });
    expect(by("miss")).toEqual({ text: "miss", background: "blue" });
    expect(by("brief")).toEqual({ text: "brief", link: "https://docs.google.com/brief" });
  });

  it("mentions of pages, people and dates; unresolved ones keep their words", () => {
    const b = only(
      'Ask <mention-user url="user://cora">Cora Reyes</mention-user> to update <mention-page url="https://www.notion.so/Clients-OS-1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6">Clients OS</mention-page> by <mention-date start="2026-10-15"/>; cc <mention-user url="user://x">Zunayed</mention-user>.',
    );
    expect(b.text?.find((s) => s.mention?.kind === "person")).toEqual({ text: "Cora Reyes", mention: { kind: "person", userId: "user-cora" } });
    expect(b.text?.find((s) => s.mention?.kind === "space")).toEqual({ text: "Clients OS", mention: { kind: "space", spaceId: "space-clients-os" } });
    expect(b.text?.find((s) => s.mention?.kind === "date")).toEqual({ text: "2026-10-15", mention: { kind: "date", iso: "2026-10-15" } });
    expect(text(b)).toContain("@Zunayed");
  });

  it("escapes and <br>", () => {
    const b = only("Price: \\*\\*not bold\\*\\*<br>Second line");
    expect(text(b)).toBe("Price: **not bold**\nSecond line");
  });
});

describe("nothing dropped silently", () => {
  it("unknown, button and meeting notes become labelled text blocks", () => {
    const { blocks, warnings } = convert(
      ['<unknown url="https://www.notion.so/x#blk" alt="button"/>', "<meeting-notes>", "\tWeekly standup", "</meeting-notes>"].join("\n"),
    );
    expect(blocks.map((b) => b.props?.unsupported)).toEqual([
      expect.objectContaining({ kind: "button" }),
      expect.objectContaining({ kind: "meeting-notes" }),
    ]);
    expect(text(blocks[0])).toMatch(/^Not imported from Notion \(button\)/);
    expect(warnings).toHaveLength(2);
  });
});

describe("the whole Traveling SMM™ OS page", () => {
  const PAGE = [
    "<columns>",
    "\t<column>",
    '\t\t<page url="https://www.notion.so/Clients-OS-1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6">Clients OS</page>',
    '\t\t## CLIENTS {color="gray_bg"}',
    '\t\t<callout icon="📌">',
    "\t\t\tPin new clients here within 24 hours of the signed contract.",
    "\t\t</callout>",
    "\t</column>",
    "\t<column>",
    '\t\t<database url="https://www.notion.so/Client-Database-9f8e?v=abc" inline="true">Client Database</database>',
    "\t</column>",
    "</columns>",
    "# 90 Day Plan",
    '<page url="https://www.notion.so/90-Day-Plan-2b3c4d5e6f7a48b9c0d1e2f3a4b5c6d7">90 Day Plan</page>',
    "## Scaling to $30K Months",
    "- [x] Hire a second editor",
    "- [ ] Raise retainer to $2,500 for new clients",
    "\t- [ ] Update the proposal template",
    '- [ ] Launch the Momentum campaign {color="orange"}',
    "Read the [Hormozi offer breakdown](https://www.acquisition.com/) before the sales call.",
    "<details>",
    "<summary>Scripts</summary>",
    "\t1. Hook: “I fly around the world filming hotels.”",
    "\t2. Value: three reasons guests book from Reels",
    "\t3. CTA: comment TRAVEL for the guide",
    "</details>",
    "---",
  ].join("\n");

  it("converts to a valid snapshot, deterministically", () => {
    const first = convert(PAGE);
    const again = convert(PAGE);
    expect(again.blocks).toEqual(first.blocks);
    const snapshot = { v: 1, settings: DEFAULT_PAGE_SETTINGS, icon: notionMediaToSpace("🌴", ctx, "icon"), cover: notionMediaToSpace("https://images.unsplash.com/palms.jpg", ctx, "cover"), blocks: first.blocks };
    expect(validateSnapshot(snapshot)).toEqual([]);
    expect(snapshot.icon).toEqual({ icon: "TreePalm" });
    expect(snapshot.cover).toEqual({ fileId: "file-image-palms.jpg" });
    expect(first.blocks.map((b) => b.type)).toEqual(["columnList", "heading", "page", "heading", "todo", "todo", "todo", "text", "toggle", "divider"]);
    expect(first.blocks[8].children?.map((c) => c.type)).toEqual(["numbered", "numbered", "numbered"]);
  });

  it("a different seed gives different ids; the same seed and position the same id", () => {
    expect(stableBlockId("a", "0")).toBe(stableBlockId("a", "0"));
    expect(stableBlockId("a", "0")).not.toBe(stableBlockId("b", "0"));
    expect(stableBlockId("a", "0")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("the validator itself refuses bad shapes", () => {
  it("names each problem", () => {
    const bad = [
      { id: "a", type: "heading", props: { level: 5 } },
      { id: "a", type: "sparkle" },
      { id: "c", type: "columnList", children: [{ id: "d", type: "text" }] },
      { id: "e", type: "image", props: {} },
      { id: "f", type: "text", text: [{ text: "x", color: "teal" }] },
    ];
    const problems = validateBlocks(bad);
    expect(problems.join("\n")).toMatch(/level must be 1, 2, 3 or 4/);
    expect(problems.join("\n")).toMatch(/used twice/);
    expect(problems.join("\n")).toMatch(/columns hold only column blocks/);
    expect(problems.join("\n")).toMatch(/exactly one of props.fileId/);
    expect(problems.join("\n")).toMatch(/not a Space color/);
  });
});
