/**
 * A message's Print over a real message (the 19-artifact cheese message):
 *  - the flashcards deck stored as `Front:/Back:` markdown prints EVERY card, styled through the
 *    css channel (never "no cards", never bare unstyled classes);
 *  - the canvas row shape `{ data: "<markdown>" }` and a JSON string read the same;
 *  - resource link labels carry no bracketed address, and the link prints no second copy of its URL.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getBlockPrinter, type PrintBlockOutput } from "@ai-matrx/print/core";
import "@/features/canvas/artifact-types/artifact-printers";
import { parseResourcesMarkdown } from "@/components/mardown-display/blocks/resources/parseResourcesMarkdown";
import { flashcardsPrintData } from "../../flashcardsPrinter";
import { PAPER_CSS } from "../printKit";

const MESSAGE = readFileSync(join(__dirname, "fixtures/cheese-message.md"), "utf8");

function blockBody(type: string): string {
  const after = MESSAGE.split(`<artifact type="${type}"`)[1]!;
  return after.slice(after.indexOf("\n") + 1, after.indexOf("</artifact>"));
}

async function compose(type: string, data: unknown): Promise<PrintBlockOutput | null> {
  const printer = getBlockPrinter(type)!;
  return printer.toPrintHtml!(data, { type, raw: typeof data === "string" ? data : "" });
}

const CARD_FRONTS = [
  'What is "curdling," and what causes it?',
  "What are the two things milk separates into during cheesemaking?",
  "What does rennet actually do?",
  "Why are some cheeses aged for years?",
];

describe("flashcards inside a message's Print", () => {
  it("prints every card of the stored Front:/Back: markdown, styled via css with matrx-fc-* classes", async () => {
    const out = (await compose("flashcards", blockBody("flashcards"))) as { html: string; css?: string };
    expect(out).toHaveProperty("html");
    for (const front of CARD_FRONTS) expect(out.html).toContain(front.replace(/"/g, "&quot;"));
    expect(out.html).not.toContain("no cards");
    expect(out.css).toContain(".matrx-fc-sheet");
    const classes = [...out.html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1]!.split(/\s+/)).filter(Boolean);
    expect(classes.length).toBeGreaterThan(0);
    for (const c of classes) expect(c).toMatch(/^matrx-/);
  });

  it("reads a canvas row { data: markdown } and a JSON string the same way", () => {
    const md = blockBody("flashcards");
    const fromRow = flashcardsPrintData({ data: md }) as { cards: unknown[] };
    const fromJson = flashcardsPrintData(JSON.stringify({ cards: [{ front: "F", back: "B" }] })) as { cards: unknown[] };
    expect(fromRow.cards).toHaveLength(4);
    expect(fromJson.cards).toHaveLength(1);
  });

  it("answers null for a deck nothing can read (the default path runs)", async () => {
    expect(await compose("flashcards", "just some prose")).toBeNull();
  });
});

describe("resources inside a message's Print", () => {
  it("drops a bracketed address from a link label, in every form a model writes it", () => {
    const parsed = parseResourcesMarkdown(
      [
        "### R",
        "**Docs**",
        "- [Nested [https://a.example/x]](https://a.example/x) - nested label [documentation]",
        "- [Plain](https://b.example) [https://b.example] - trailing address [tool]",
        "- [[https://c.example]](https://c.example) - only an address",
      ].join("\n"),
    );
    const items = parsed.categories[0]!.resources;
    expect(items.map((r) => r.title)).toEqual(["Nested", "Plain", "https://c.example"]);
    expect(items[1]!.type).toBe("tool");
    for (const item of items) expect(item.title).not.toMatch(/\[/);
  });

  it("prints a link without a second copy of its address", async () => {
    const out = (await compose("resources", blockBody("resources"))) as { html: string; css: string };
    expect(out.html).toContain('<strong class="matrx-pl-link"><a href="https://www.cheesescience.org">Cheese Science Toolkit</a>');
    expect(out.html).not.toMatch(/\[https?:\/\//);
    expect(PAPER_CSS).toContain(".matrx-pl .matrx-pl-link a[href]::after{content:none}");
  });
});
