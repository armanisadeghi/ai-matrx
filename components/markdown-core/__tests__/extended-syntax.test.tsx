/**
 * FORCING FUNCTION: the extended markdown syntax renders at EVERY level of
 * <RichContent> through the one core — and degrades cleanly mid-stream.
 *
 * Each case is a real authoring situation (a pottery studio's kiln manual, a
 * chemistry lesson, a dispatcher's checklist) written the way the ecosystem
 * it comes from writes it — GitHub alerts, Obsidian callouts and wikilinks,
 * MkDocs admonitions, Pandoc super/subscript and definition lists, front
 * matter — and each asserts on what a READER sees: the element, its text,
 * and that the raw marker is gone. On the pre-RC-B8 core every case prints
 * its markers as text.
 *
 * Renders the REAL pipeline (same harness and stand-ins as page-break-parity).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

jest.mock("@/components/markdown-core/MarkdownCore", () => {
  const actual = jest.requireActual("@/components/markdown-core/MarkdownCoreImpl") as typeof import("@/components/markdown-core/MarkdownCoreImpl");
  const heal = jest.requireActual("@/components/markdown-core/stream-heal") as typeof import("@/components/markdown-core/stream-heal");
  const Impl = actual.default;
  return {
    __esModule: true,
    default: ({ streaming, children, ...rest }: { streaming?: boolean; children: string }) => (
      <Impl {...rest}>{streaming ? heal.healStreamingMarkdown(children) : children}</Impl>
    ),
  };
});
jest.mock("@/components/matrx/buttons/MarkdownCopyButton", () => ({ InlineCopyButton: () => null }));
jest.mock("@/features/code-editor/components/code-block/CodeBlock", () => ({
  __esModule: true,
  default: ({ code, meta }: { code: string; meta?: string }) => <pre data-meta={meta}>{code}</pre>,
}));
jest.mock("@/components/mardown-display/blocks/csv/CsvBlock", () => ({
  __esModule: true,
  default: ({ content, delimiter }: { content: string; delimiter: string }) => {
    const rows = content.trim().split("\n").map((r) => r.split(delimiter));
    return (
      <table data-csv-table="">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
}));
// The platform search is the resolver's job; here it answers like the real
// one would for a studio that has a "Kiln schedule" note and no "Glaze notes".
jest.mock("@/components/markdown-core/syntax/elements/wikilink-resolver", () => ({
  splitHeading: (t: string) => ({ page: t.split("#")[0], heading: t.split("#")[1] ?? null }),
  resolveWikiTarget: (target: string) =>
    Promise.resolve(
      target.toLowerCase().startsWith("kiln schedule")
        ? { status: "found", token: "note", id: "11111111-1111-4111-8111-111111111111", title: "Kiln schedule", href: "/notes/11111111-1111-4111-8111-111111111111", typeLabel: "Note" }
        : { status: "missing", title: target },
    ),
  createWikiPage: jest.fn(() => Promise.resolve({ ok: true, href: "/notes/new-id" })),
}));
jest.mock("@/components/rich-content/standard/NestedRichContent", () => {
  const { StandardBlocks } = jest.requireActual("@/components/rich-content/standard/StandardBlocks");
  return { __esModule: true, NestedRichContent: ({ source }: { source: string }) => <StandardBlocks source={source} />, default: () => null };
});

jest.mock("@/features/organizations/people/visiblePeople", () => ({
  resolveVisiblePerson: (userId: string) =>
    Promise.resolve(
      userId === "9f1c0000-0000-4000-8000-000000000001"
        ? { userId, name: "Dana Ruiz", email: "dana@kilnworks.example", avatarUrl: null, role: "member" }
        : null,
    ),
}));

jest.mock("@/features/organizations/peek/ResourcePeekHost", () => ({
  ResourcePeekHost: ({ kind, id }: { kind: string; id: string }) => <div data-peek-kind={kind} data-peek-id={id} />,
}));

import BasicMarkdownContent from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { RichContentInline } from "@/components/rich-content/RichContentInline";
import { StandardBlocks } from "@/components/rich-content/standard/StandardBlocks";
import MarkdownCoreImpl from "@/components/markdown-core/MarkdownCoreImpl";
import { healStreamingMarkdown } from "@/components/markdown-core/stream-heal";
import { extractFrontmatter } from "@/components/markdown-core/syntax/frontmatter";
import { MarkdownSourceEditProvider } from "@/components/markdown-core/syntax/elements/MarkdownSourceEdit";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(node: React.ReactElement): Promise<HTMLElement> {
  await act(async () => {
    root.render(node);
  });
  // Lazy elements (wikilink resolver, CSV table) settle over a few ticks.
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  return container;
}

const full = (s: string) => <BasicMarkdownContent imagePolicy="self" content={s} showCopyButton={false} />;
const standard = (s: string) => <StandardBlocks source={s} />;
const core = (s: string) => <MarkdownCoreImpl preset="gfm">{s}</MarkdownCoreImpl>;

/** What a reader sees: the element's text without the prose frame's <style> sheet. */
const text = (el: Element) => {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("style").forEach((s) => s.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
};

describe("callouts — one component for GitHub, Obsidian, MkDocs and directive spellings", () => {
  it.each([
    ["GitHub alert", "> [!WARNING]\n> Never open the kiln above 150 °C.", "warning", "Warning"],
    ["Obsidian titled", "> [!tip] Cone packs\n> Put a witness cone on every shelf.", "tip", "Cone packs"],
    ["MkDocs admonition", '!!! caution "Hot surface"\n    Let the shelves cool overnight.', "caution", "Hot surface"],
    ["directive", ":::info[Firing log]\nRecord every bisque.\n:::", "info", "Firing log"],
    ["Docusaurus titled", ":::note Loading order\nHeavy pieces go low.\n:::", "note", "Loading order"],
  ])("%s", async (_name, source, type, title) => {
    for (const renderAt of [full, standard, core]) {
      const scope = await render(renderAt(source));
      const callout = scope.querySelector(`[data-callout="${type}"]`);
      expect(callout).not.toBeNull();
      expect(text(callout!.querySelector(".matrx-callout-title")!)).toBe(title);
      expect(text(scope)).not.toMatch(/\[!|!!!|:::/);
    }
  });

  it("an Obsidian `-` callout folds closed, `+` opens", async () => {
    const scope = await render(full("> [!faq]- Why crawl?\n> Glaze too thick.\n\n> [!success]+ Done\n> Kiln unloaded."));
    const folded = scope.querySelector('details[data-callout="question"]') as HTMLDetailsElement;
    const open = scope.querySelector('details[data-callout="success"]') as HTMLDetailsElement;
    expect(folded.open).toBe(false);
    expect(text(folded.querySelector("summary")!)).toBe("Why crawl?");
    expect(open.open).toBe(true);
  });

  it("an unknown [!word] stays an ordinary quote", async () => {
    const scope = await render(full("> [!banana] not a callout"));
    expect(scope.querySelector("[data-callout]")).toBeNull();
    expect(text(scope)).toContain("[!banana] not a callout");
  });
});

describe("front matter — hidden from the page, exposed as properties", () => {
  const SOURCE = "---\ntitle: Kiln manual\ntags: [studio, safety]\nrevision: 3\n---\n# Loading the kiln\n\nStart low.";

  it("never renders, at any level", async () => {
    for (const renderAt of [full, standard, core]) {
      const scope = await render(renderAt(SOURCE));
      expect(text(scope)).not.toContain("Kiln manual");
      expect(text(scope)).not.toContain("revision");
      expect(text(scope)).toContain("Loading the kiln");
    }
  });

  it("reads YAML and TOML as properties", () => {
    expect(extractFrontmatter(SOURCE).properties).toEqual({ title: "Kiln manual", tags: ["studio", "safety"], revision: 3 });
    expect(extractFrontmatter('+++\ntitle = "Glaze book"\n+++\nbody').properties).toEqual({ title: "Glaze book" });
    expect(extractFrontmatter("no properties here").properties).toEqual({});
    expect(extractFrontmatter("---\n: : bad\n---\n").error).toMatch(/could not be read/);
  });
});

describe("wikilinks — real records or an honest create", () => {
  it("links a found record, offers Create for a missing one, never a fake href", async () => {
    const scope = await render(full("Follow [[Kiln schedule]] and [[Glaze notes|the glaze book]]."));
    const found = scope.querySelector('[data-wikilink="found"]') as HTMLAnchorElement;
    expect(found.getAttribute("href")).toBe("/notes/11111111-1111-4111-8111-111111111111");
    expect(text(found)).toBe("Kiln schedule");
    const missing = scope.querySelector('[data-wikilink="missing"]')!;
    expect(text(missing)).toContain("the glaze book");
    expect(missing.querySelector("a")).toBeNull();
    expect(missing.querySelector("button")?.textContent).toContain("Create");
    expect(text(scope)).not.toContain("[[");
  });
});

describe("blocks from the directive grammar", () => {
  it("renders definition lists, details, columns, tabs, figures, asides", async () => {
    const source = [
      "Bisque\n: The first, lower firing.",
      "",
      ":::details[Why two firings?]\nThe bisque hardens the clay.\n:::",
      "",
      "::::columns\n:::column\nLeft shelf\n:::\n:::column\nRight shelf\n:::\n::::",
      "",
      "::::tabs\n:::tab[Cone 6]\nMid-fire.\n:::\n:::tab[Cone 10]\nHigh-fire.\n:::\n::::",
      "",
      ":::figure[The loaded kiln]{#fig:kiln}\nPhoto goes here.\n:::",
      "",
      "See @fig:kiln for the layout.",
      "",
      ":::aside\nWear gloves.\n:::",
    ].join("\n");
    const scope = await render(full(source));
    expect(text(scope.querySelector("dl dt")!)).toBe("Bisque");
    expect(text(scope.querySelector("dl dd")!)).toBe("The first, lower firing.");
    expect(text(scope.querySelector("details summary")!)).toBe("Why two firings?");
    expect(scope.querySelectorAll(".matrx-columns .matrx-column")).toHaveLength(2);
    const tabs = scope.querySelectorAll('[role="tab"]');
    expect([...tabs].map(text)).toEqual(["Cone 6", "Cone 10"]);
    expect((scope.querySelectorAll('[role="tabpanel"]')[1] as HTMLElement).hidden).toBe(true);
    await act(async () => (tabs[1] as HTMLButtonElement).click());
    expect((scope.querySelectorAll('[role="tabpanel"]')[1] as HTMLElement).hidden).toBe(false);
    const figure = scope.querySelector("figure#user-content-fig\\:kiln")!;
    expect(text(figure.querySelector("figcaption")!)).toBe("Figure 1. The loaded kiln");
    expect(text(scope.querySelector('a[data-xref="fig:kiln"]')!)).toBe("Figure 1");
    expect(text(scope.querySelector("aside")!)).toBe("Wear gloves.");
    expect(text(scope)).not.toContain(":::");
  });

  it("never eats a colon in ordinary prose", async () => {
    const scope = await render(full("Mix at a ratio of 3:2, fire at 10:30, key:value stays."));
    expect(text(scope)).toBe("Mix at a ratio of 3:2, fire at 10:30, key:value stays.");
  });
});

describe("inline marks", () => {
  it("renders sub/superscript, highlight, emoji, colour and keys", async () => {
    const scope = await render(
      full("H~2~O and E = mc^2^ — ==watch the cone== :fire: ~~old~~ :span[hot]{color=danger} :span[raw]{color=#ff0000} press :kbd[Ctrl] or <kbd>Esc</kbd>"),
    );
    expect(text(scope.querySelector("sub")!)).toBe("2");
    expect(text(scope.querySelector("sup")!)).toBe("2");
    expect(text(scope.querySelector("mark")!)).toBe("watch the cone");
    expect(text(scope)).toContain("🔥");
    expect(text(scope.querySelector("del")!)).toBe("old");
    const spans = [...scope.querySelectorAll("span")].filter((s) => s.textContent === "hot" || s.textContent === "raw");
    expect(spans[0]!.className).toContain("text-red-600");
    expect(spans[1]!.className).toBe("");
    expect([...scope.querySelectorAll("kbd")].map(text)).toEqual(["Ctrl", "Esc"]);
  });

  it("wraps every use of an abbreviation and hides its definition line", async () => {
    const scope = await render(full("*[PPE]: Personal protective equipment\n\nWear PPE. PPE first."));
    const abbrs = scope.querySelectorAll("abbr");
    expect(abbrs).toHaveLength(2);
    expect(abbrs[0]!.getAttribute("title")).toBe("Personal protective equipment");
    expect(text(scope)).not.toContain("*[PPE]");
  });
});

describe("headings, anchors and the table of contents", () => {
  it("ids every heading, adds an anchor, builds the contents from [[toc]] and ::toc", async () => {
    for (const marker of ["[[toc]]", "<!-- toc -->", "::toc", ":::toc\n:::"]) {
      const scope = await render(full(`${marker}\n\n## Loading {#sec:loading}\n\nText.\n\n## Cooling down\n\nMore.\n\nBack to @sec:loading.`));
      expect(scope.querySelector("h2#user-content-sec\\:loading")).not.toBeNull();
      expect(scope.querySelector("h2#user-content-cooling-down")).not.toBeNull();
      expect(scope.querySelector("h2#user-content-sec\\:loading [data-heading-anchor]")?.getAttribute("href")).toBe("#sec:loading");
      const toc = scope.querySelector('nav[aria-label="Contents"]')!;
      expect([...toc.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["#sec:loading", "#cooling-down"]);
      expect(text(scope.querySelector('a[data-xref="sec:loading"]')!)).toBe("Loading");
      expect(text(scope)).not.toMatch(/\[\[toc\]\]|::toc/);
    }
  });
});

describe("footnotes end to end", () => {
  it("renders the note, links both ways, previews on hover", async () => {
    Element.prototype.scrollIntoView = jest.fn();
    const scope = await render(full("Cone 6 is mid-fire.[^1]\n\n[^1]: About 1,222 °C."));
    const ref = scope.querySelector("a[data-footnote-ref]") as HTMLAnchorElement;
    const note = scope.querySelector("#user-content-fn-1")!;
    expect(text(note)).toContain("About 1,222 °C.");
    expect(note.querySelector("a[data-footnote-backref]")?.getAttribute("href")).toBe("#user-content-fnref-1");
    await act(async () => {
      ref.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toBe("About 1,222 °C.");
    await act(async () => ref.click());
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("keeps a note whose reference is in another rendered block", async () => {
    const scope = await render(
      <>
        {full("See the manual.[^m]")}
        {full("[^m]: Kiln manual, page 4.")}
      </>,
    );
    expect(text(scope)).not.toContain("[^m]");
    expect(scope.querySelector("#user-content-fn-m")).not.toBeNull();
    expect(scope.querySelector('a[href="#user-content-fn-m"]')).not.toBeNull();
  });
});

describe("math: chemistry and equation numbers", () => {
  it("renders mhchem and numbers labelled equations with working references", async () => {
    const scope = await render(full("$$\n\\ce{2H2 + O2 -> 2H2O}\n$$\n\n\\[E = mc^2 \\label{eq:energy}\\]\n\nBy \\eqref{eq:energy} we know."));
    expect(scope.querySelector(".katex-error")).toBeNull();
    expect(scope.querySelectorAll(".katex-display")).toHaveLength(2);
    expect(scope.querySelector("#user-content-eq\\:energy")).not.toBeNull();
    expect(text(scope.querySelectorAll(".katex-display")[1]!)).toContain("(1)");
    expect(text(scope.querySelector('a[data-xref="eq:energy"]')!)).toBe("(1)");
  });
});

describe("CSV fences and <details>", () => {
  it("renders a CSV fence as a table at the core level", async () => {
    const scope = await render(core("```csv\nglaze,cone\nCeladon,10\n```"));
    expect(scope.querySelectorAll("[data-csv-table] tr")).toHaveLength(2);
  });

  it("keeps raw <details>/<summary> from chat text", async () => {
    const scope = await render(full("<details><summary>Kiln specs</summary>48 cubic feet</details>"));
    expect(text(scope.querySelector("details summary")!)).toBe("Kiln specs");
    expect(text(scope)).not.toContain("&lt;details");
  });
});

describe("task lists — interactive only with a save adapter", () => {
  const SOURCE = "- [ ] Load shelves\n- [x] Check cones";

  it("is read-only (and says so) without one", async () => {
    const scope = await render(full(SOURCE));
    expect(scope.querySelectorAll("[data-task-readonly]")).toHaveLength(2);
    expect(scope.querySelector("button[role=checkbox]")).toBeNull();
  });

  it("toggles exactly that line through the splice API with one", async () => {
    const save = jest.fn();
    const stored = "# Checklist\n\n```md\n- [ ] Load shelves\n```\n\n" + SOURCE;
    const scope = await render(
      <MarkdownSourceEditProvider source={stored} save={save}>
        {full(SOURCE)}
      </MarkdownSourceEditProvider>,
    );
    const boxes = scope.querySelectorAll<HTMLButtonElement>("button[role=checkbox]");
    expect(boxes).toHaveLength(2);
    await act(async () => boxes[0]!.click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // The fenced sample is untouched; only the real task flipped.
    expect(save).toHaveBeenCalledWith("# Checklist\n\n```md\n- [ ] Load shelves\n```\n\n- [x] Load shelves\n- [x] Check cones");
  });
});

describe("page breaks keep the print grammar", () => {
  it("shows the divider", async () => {
    const scope = await render(full("Page one.\n\n<!-- pagebreak -->\n\nPage two."));
    expect(scope.querySelector('[data-matrx-page-break][role="separator"]')).not.toBeNull();
  });
});

describe("the inline level stays phrasing content", () => {
  it("renders every new block construct without a block element", async () => {
    const scope = await render(
      <p>
        <RichContentInline source={"> [!NOTE]\n> Keep the lid shut.\n\n:::details[More]\nHidden\n:::\n\nTerm\n: Meaning\n\n:::figure[Cap]\nx\n:::"} />
      </p>,
    );
    const inlineRoot = scope.querySelector('[data-rich-content="inline"]')!;
    const blocks = inlineRoot.querySelectorAll("div, p, details, summary, aside, figure, figcaption, dl, dt, dd, nav, section, table");
    expect([...blocks].map((el) => el.tagName)).toEqual([]);
    for (const piece of ["Keep the lid shut.", "Hidden", "Meaning", "Cap"]) expect(text(inlineRoot)).toContain(piece);
  });
});

describe("streaming — no half-arrived marker ever shows", () => {
  const FINAL = [
    "---\ntitle: Kiln manual\n---",
    "> [!WARNING] Hot",
    "> Wait for it to cool.",
    "",
    ":::tip[Shelf order]",
    "Heavy pieces low. See [[Kiln schedule]].",
    ":::",
    "",
    "Water is H~2~O and ==always== check :fire: the cone.[^1]",
    "",
    "[^1]: Cone 6.",
  ].join("\n");
  const MARKERS = [/\[!/, /(^|\s):::/, /\[\[/, /title: Kiln/, /\[\^1(?!\])/, /:fir(?!e:)/, /:span\[/];

  it("every prefix renders without a raw marker", async () => {
    for (let n = 1; n <= FINAL.length; n++) {
      const prefix = FINAL.slice(0, n);
      const scope = await render(<MarkdownCoreImpl preset="chat">{healStreamingMarkdown(prefix)}</MarkdownCoreImpl>);
      const shown = scope.textContent ?? "";
      for (const marker of MARKERS) {
        if (marker.test(shown)) throw new Error(`prefix ${n} (${JSON.stringify(prefix.slice(-24))}) shows ${marker}: ${JSON.stringify(shown.slice(-80))}`);
      }
    }
  }, 60000);
});


describe("numbering is document-wide, not per rendered block", () => {
  // Two code fences cut this manual into five rendered blocks.
  const DOC = [
    ":::figure[Bisque shelf]{#fig:bisque}",
    "Three shelves.",
    ":::",
    "",
    "\\[ Q = m c \\Delta T \\label{eq:heat} \\]",
    "",
    "```bash",
    "kiln fire --cone 06",
    "```",
    "",
    ":::figure[Glaze shelf]{#fig:glaze}",
    "Posts on every shelf.",
    ":::",
    "",
    "\\[ P = V I \\label{eq:power} \\]",
    "",
    "```bash",
    "kiln fire --cone 6",
    "```",
    "",
    "Compare @fig:bisque with @fig:glaze; energy \\eqref{eq:heat}, power \\eqref{eq:power}.",
  ].join("\n");

  it("numbers figures and equations across blocks, and references resolve across blocks", async () => {
    const scope = await render(standard(DOC));
    expect([...scope.querySelectorAll("figcaption")].map(text)).toEqual(["Figure 1. Bisque shelf", "Figure 2. Glaze shelf"]);
    expect([...scope.querySelectorAll(".katex-display")].map((d) => text(d).slice(-3))).toEqual(["(1)", "(2)"]);
    expect([...scope.querySelectorAll("a[data-xref]")].map(text)).toEqual(["Figure 1", "Figure 2", "(1)", "(2)"]);
  });

  it("keeps the same numbers while the document is still streaming", async () => {
    const prefix = DOC.slice(0, DOC.indexOf("Posts on every shelf.") + 5);
    const scope = await render(<StandardBlocks source={prefix} isStreaming />);
    expect([...scope.querySelectorAll("figcaption")].map(text)).toEqual(["Figure 1. Bisque shelf", "Figure 2. Glaze shelf"]);
    expect(text(scope.querySelectorAll(".katex-display")[0]!).slice(-3)).toBe("(1)");
  });
});

describe("a directive container keeps its children at every level", () => {
  const TABS = "Pick a range.\n\n::::tabs\n:::tab[Cone 6]\n```bash\nkiln fire --cone 6\n```\n:::\n:::tab[Cone 10]\nHigh fire.\n:::\n::::\n\nThen load.";

  it("the block splitter keeps the container (fence included) in one text block", () => {
    const blocks = splitContentIntoBlocksV2(TABS);
    expect(blocks.map((b) => b.type)).toEqual(["text"]);
  });

  it.each([
    ["standard", standard],
    ["core", core],
  ])("%s: the fence renders INSIDE its tab, never below it", async (_level, renderAt) => {
    const scope = await render(renderAt(TABS));
    const panels = scope.querySelectorAll('[role="tabpanel"]');
    expect(panels).toHaveLength(2);
    expect(text(panels[0]!)).toContain("kiln fire --cone 6");
    expect(text(scope)).not.toContain(":::");
    expect(text(scope)).not.toContain("```");
  });
});


describe("verify-RC-B8 fix round", () => {
  it.each([
    ["bullet", "- Load shelves\n  > [!caution] Hot surfaces\n  > Wear gloves."],
    ["numbered", "1. Mix the glaze\n\n   > [!tip] Sieve twice\n   > Use an 80-mesh sieve."],
  ])("a callout inside a %s list item renders as a callout", async (_k, source) => {
    for (const renderAt of [full, standard]) {
      const scope = await render(renderAt(source));
      expect(scope.querySelector("li [data-callout]")).not.toBeNull();
      expect(text(scope)).not.toContain("[!");
    }
  });

  it("a :::directive inside a list item keeps its body inside it", async () => {
    const scope = await render(full("- Before firing\n  :::note\n  Check the kiln sitter.\n  :::\n- After"));
    const callout = scope.querySelector('li [data-callout="note"]');
    expect(callout).not.toBeNull();
    expect(text(callout!)).toContain("Check the kiln sitter.");
    expect(text(scope)).not.toContain(":::");
  });

  it("a CSV fence is a table at the standard level", async () => {
    const scope = await render(standard("Before.\n\n```csv\nglaze,cone\nCeladon,10\n```\n\nAfter."));
    expect(scope.querySelectorAll("[data-csv-table] tr")).toHaveLength(2);
  });

  it("a short fence with a title keeps its meta at the standard level", async () => {
    const scope = await render(standard('Intro.\n\n```py title="kiln.py" {2}\nfire()\ncool()\n```'));
    expect(scope.querySelector("pre[data-meta]")?.getAttribute("data-meta")).toContain('title="kiln.py"');
  });

  it("a titled image is a numbered figure, counted document-wide", async () => {
    const doc = ':::figure[First]{#fig:a}\nx\n:::\n\n```js\nsplit()\n```\n\n![Kiln shelf](https://example.com/k.png "Cone 6 shelf layout")\n\nSee @fig:a.';
    const scope = await render(standard(doc));
    expect([...scope.querySelectorAll("figcaption")].map(text)).toEqual(["Figure 1. First", "Figure 2. Cone 6 shelf layout"]);
    expect(scope.querySelector("figure img")).not.toBeNull();
  });

  it("author ids are prefixed user-content- and anchors still resolve", async () => {
    const scope = await render(full(":::aside{#evil}\nx\n:::\n\n:::figure[Shelf]{#__proto__}\ny\n:::\n\n## Loading {#sec:loading}\n\nSee @sec:loading."));
    expect(scope.querySelector("#evil")).toBeNull();
    expect(scope.querySelector("#__proto__")).toBeNull();
    expect(scope.querySelector("#user-content-evil")).not.toBeNull();
    expect(scope.querySelector("#user-content-__proto__")).not.toBeNull();
    expect(scope.querySelector('a[data-xref="sec:loading"]')?.textContent).toBe("Loading");
  });

  it("streaming holds back a half-typed heading id and unclosed math", () => {
    expect(healStreamingMarkdown("## Loading {#sec")).toBe("## Loading");
    expect(healStreamingMarkdown("Water is \\(\\ce{H")).toBe("Water is ");
    expect(healStreamingMarkdown("Energy:\n\n$$\nE = mc^2 \\tag{1}")).toBe("Energy:\n\n");
  });
});


describe("footnotes are numbered document-wide (verify-RC-B8 round 2)", () => {
  it("a split document numbers its notes 1, 2 — never a second list starting at 1", async () => {
    const doc = "Bisque first.[^bisque]\n\n```bash\nkiln fire --cone 06\n```\n\nGlaze second.[^glaze]\n\n[^bisque]: About 999 °C.\n\n[^glaze]: About 1,222 °C.";
    const scope = await render(standard(doc));
    expect([...scope.querySelectorAll("a[data-footnote-ref]")].map(text)).toEqual(["1", "2"]);
    const items = [...scope.querySelectorAll('li[id^="user-content-fn-"]')] as HTMLLIElement[];
    expect(items.map((li) => [li.id, li.value])).toEqual(
      expect.arrayContaining([
        ["user-content-fn-bisque", 1],
        ["user-content-fn-glaze", 2],
      ]),
    );
  });
});


describe("@-mentions (RC-B11's stored form) render as chips that open", () => {
  it("a visible person is a chip, an unknown one is plain text, a date a chip, a record the wikilink", async () => {
    const scope = await render(
      full(
        "Ask @[Dana](user:9f1c0000-0000-4000-8000-000000000001) and @[Former staff](user:9f1c0000-0000-4000-8000-000000000009) by @[Tue, Sep 30](date:2026-09-30) about @[Kiln schedule](note:11111111-1111-4111-8111-111111111111).",
      ),
    );
    const person = scope.querySelector('button[data-mention="person"]') as HTMLButtonElement;
    expect(text(person)).toBe("Dana Ruiz");
    // The chip opens the platform's person peek — not a mailto.
    await act(async () => person.click());
    const peek = scope.querySelector("[data-peek-kind]")!;
    expect(peek.getAttribute("data-peek-kind")).toBe("user");
    expect(peek.getAttribute("data-peek-id")).toBe("9f1c0000-0000-4000-8000-000000000001");
    expect(text(scope.querySelector('[data-mention="unresolved"]')!)).toBe("@Former staff");
    expect(scope.querySelector('time[data-mention="date"]')?.getAttribute("datetime")).toBe("2026-09-30");
    expect(scope.querySelector("[data-wikilink]")).not.toBeNull();
    expect(text(scope)).not.toMatch(/\]\((user|date|note):/);
  });
});
