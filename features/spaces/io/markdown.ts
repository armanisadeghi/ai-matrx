// features/spaces/io/markdown.ts — a Space's blocks as Markdown (K1 export, and the page text the AI reads).
//
// Notion's Markdown export: headings `#`, lists `-` / `1.`, to-dos `- [ ]`, toggles as a list item with
// the body indented under it, quotes `>`, callouts as an `<aside>`, dividers `---`, fenced code, block
// equations `$$`, tables as pipe tables, sub-pages as links to the sub-page's file, media / bookmarks as
// links. Inline: `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `[text](url)`, `$equation$`.

import type { RichSpan, SpaceBlock } from "../contract";

export interface MarkdownContext {
  /** A page's title (sub-page and link-to-page blocks, page mentions). */
  titleOf: (spaceId: string) => string;
  /** Where a page link points: a file name inside an export, or the page's address. */
  hrefOf: (spaceId: string) => string;
  /** A stored file's address (image / file blocks with a fileId); null = unknown. */
  fileUrl?: (fileId: string) => string | null;
  /** An Applet block's Applet (name + slug), when the exporter read it; null/absent = unknown or not readable. */
  appletOf?: (appletId: string) => { name: string; slug: string } | null;
}

/** Where an Applet opens on the web (the full address, so a file outside the app still opens it). */
const APPLET_WEB = "https://www.aimatrx.com/applets/";

const esc = (s: string) => s.replace(/([\\`*_[\]<>])/g, "\\$1");

export function spansToMarkdown(spans: RichSpan[] | undefined, ctx: MarkdownContext): string {
  if (!spans?.length) return "";
  return spans
    .map((s) => {
      if (s.equation) return `$${s.equation}$`;
      const m = s.mention;
      if (m?.kind === "space") return `[${esc(ctx.titleOf(m.spaceId) || s.text || "Untitled")}](${ctx.hrefOf(m.spaceId)})`;
      if (m?.kind === "link") return `[${esc(m.title || s.text || m.url)}](${m.url})`;
      if (m) return esc(s.text);
      if (!s.text) return "";
      if (s.code) return `\`${s.text.replace(/`/g, "\\`")}\``;
      // Marks wrap the words, never the spaces around them (Markdown ignores `** a**`).
      const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(s.text) ?? ["", "", s.text, ""];
      if (!core) return s.text;
      let t = esc(core);
      if (s.bold) t = `**${t}**`;
      if (s.italic) t = `*${t}*`;
      if (s.strike) t = `~~${t}~~`;
      if (s.link) t = `[${t}](${s.link})`;
      return `${lead}${t}${trail}`;
    })
    .join("");
}

function mediaHref(p: Record<string, unknown>, ctx: MarkdownContext): string {
  if (typeof p.url === "string") return p.url;
  if (typeof p.fileId === "string") return ctx.fileUrl?.(p.fileId) ?? "";
  return "";
}

function tableToMarkdown(p: Record<string, unknown>, ctx: MarkdownContext): string[] {
  const rows = (p.rows as Array<{ cells: RichSpan[][] }> | undefined) ?? [];
  if (!rows.length) return [];
  const width = Math.max(...rows.map((r) => r.cells.length));
  const line = (cells: RichSpan[][]) =>
    `| ${Array.from({ length: width }, (_, i) => spansToMarkdown(cells[i], ctx).replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`;
  const out = [line(rows[0].cells), `| ${Array.from({ length: width }, () => "---").join(" | ")} |`];
  for (const r of rows.slice(1)) out.push(line(r.cells));
  return out;
}

function blockLines(b: SpaceBlock, ctx: MarkdownContext, number: number): string[] {
  const p = (b.props ?? {}) as Record<string, unknown>;
  const text = spansToMarkdown(b.text, ctx);
  const kids = (indent: string) => blocksToMarkdownLines(b.children ?? [], ctx).map((l) => (l ? indent + l : l));
  switch (b.type) {
    case "heading": {
      const level = Math.min(3, Math.max(1, Number(p.level ?? 1)));
      return [`${"#".repeat(level)} ${text}`, ...(b.children?.length ? ["", ...blocksToMarkdownLines(b.children, ctx)] : [])];
    }
    case "bulleted":
    case "toggle":
      return [`- ${text}`, ...kids("    ")];
    case "numbered":
      return [`${number}. ${text}`, ...kids("    ")];
    case "todo":
      return [`- [${p.checked ? "x" : " "}] ${text}`, ...kids("    ")];
    case "quote":
      return [text.split("\n").map((l) => `> ${l}`).join("\n"), ...kids("")];
    case "callout":
      return ["<aside>", text, ...(b.children?.length ? ["", ...blocksToMarkdownLines(b.children, ctx)] : []), "</aside>"];
    case "divider":
      return ["---"];
    case "code": {
      const code = (b.text ?? []).map((s) => s.text).join("");
      const lang = typeof p.language === "string" && p.language !== "text" ? p.language : "";
      return ["```" + lang, code, "```"];
    }
    case "equation":
      return ["$$", String(p.expression ?? ""), "$$"];
    case "page":
    case "linkToPage": {
      const id = String(p.spaceId ?? "");
      return [`[${esc(ctx.titleOf(id) || "Untitled")}](${ctx.hrefOf(id)})`];
    }
    case "columnList":
    case "column":
    case "tabs":
      return blocksToMarkdownLines(b.children ?? [], ctx);
    case "tab":
      return [`**${text || "Tab"}**`, ...(b.children?.length ? ["", ...blocksToMarkdownLines(b.children, ctx)] : [])];
    case "table":
      return tableToMarkdown(p, ctx);
    case "image": {
      const href = mediaHref(p, ctx);
      const caption = spansToMarkdown(p.caption as RichSpan[] | undefined, ctx);
      return href ? [`![${caption}](${href})`] : ["*Image (uploaded file, not included in this export)*"];
    }
    case "video":
    case "audio":
    case "file":
    case "pdf": {
      const href = mediaHref(p, ctx);
      return href ? [`[${esc(String(p.name ?? href))}](${href})`] : [`*${esc(String(p.name ?? b.type))} (uploaded file, not included in this export)*`];
    }
    case "bookmark":
    case "embed":
      return typeof p.url === "string" ? [`[${esc(p.url)}](${p.url})`] : [];
    case "applet": {
      // An Applet runs only in a browser: the export carries a link to it (or says what it was).
      const app = typeof p.appletId === "string" ? ctx.appletOf?.(p.appletId) : null;
      return app ? [`[Applet: ${esc(app.name)}](${APPLET_WEB}${encodeURIComponent(app.slug)})`] : ["*Applet (opens only in AI Matrx)*"];
    }
    case "database":
      return typeof p.title === "string" && p.title ? [`**${esc(p.title)}**`] : [];
    case "tableOfContents":
    case "breadcrumb":
    case "slot":
      return [];
    default:
      return text || b.children?.length ? [text, ...kids("    ")] : [""];
  }
}

const LIST = new Set(["bulleted", "numbered", "todo", "toggle"]);

export function blocksToMarkdownLines(blocks: SpaceBlock[], ctx: MarkdownContext): string[] {
  const out: string[] = [];
  let number = 0;
  let prev: string | null = null;
  for (const b of blocks) {
    number = b.type === "numbered" ? (prev === "numbered" ? number + 1 : 1) : 0;
    const lines = blockLines(b, ctx, number);
    // List items of one list sit on consecutive lines; everything else is a paragraph of its own.
    if (out.length && !(prev && LIST.has(prev) && LIST.has(b.type))) out.push("");
    out.push(...lines);
    prev = b.type;
  }
  return out;
}

/** The whole page: `# Title`, then its blocks. */
export function spaceToMarkdown(title: string, blocks: SpaceBlock[], ctx: MarkdownContext): string {
  const body = blocksToMarkdownLines(blocks, ctx).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return `# ${title || "Untitled"}\n\n${body}\n`;
}
