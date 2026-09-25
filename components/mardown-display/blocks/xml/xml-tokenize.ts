// ─────────────────────────────────────────────────────────────────────────
// The XML card's tokenizer — pure and environment-neutral (moved out of the
// "use client" XmlBlock, 2026-09-25, RC-B2b) so a static root (the server
// level, the SSR'd share-page leaf) tokenizes a card EXACTLY as XmlBlock
// does and can render its prose segments on the server, keyed by the same
// token index (XmlBlock `renderedProse`).
// ─────────────────────────────────────────────────────────────────────────

import { readXmlTag } from "./readXmlTag";

export interface XmlToken {
  type:
    | "open"
    | "close"
    | "selfClose"
    | "markdown"
    | "comment"
    | "declaration"
    | "cdata";
  tagName?: string;
  attributes?: Array<{ name: string; value: string }>;
  text?: string;
  raw: string;
  indent: number;
}

function indentAt(content: string, offset: number): number {
  const lineStart = content.lastIndexOf("\n", offset - 1) + 1;
  return content.slice(lineStart, offset).search(/\S|$/);
}

function fenceAtLineStart(
  content: string,
  offset: number,
): { marker: string; contentStart: number } | null {
  if (offset !== 0 && content[offset - 1] !== "\n") return null;
  let markerStart = offset;
  while (content[markerStart] === " " || content[markerStart] === "\t")
    markerStart++;
  const markerCharacter = content[markerStart];
  if (markerCharacter !== "`" && markerCharacter !== "~") return null;
  let markerEnd = markerStart;
  while (content[markerEnd] === markerCharacter) markerEnd++;
  if (markerEnd - markerStart < 3) return null;
  const lineEnd = content.indexOf("\n", markerEnd);
  return {
    marker: content.slice(markerStart, markerEnd),
    contentStart: lineEnd === -1 ? content.length : lineEnd + 1,
  };
}

function fenceEnd(content: string, start: number, marker: string): number {
  const closing = new RegExp(
    `^[ \\t]*${marker[0]}{${marker.length},}[ \\t]*(?:\\n|$)`,
    "m",
  );
  const match = closing.exec(content.slice(start));
  return match ? start + match.index + match[0].length : content.length;
}

function normalizeMarkdownIndentation(raw: string): {
  text: string;
  indent: number;
} {
  const lines = raw.split("\n");
  let indent: number | undefined;
  for (const line of lines) {
    if (!line.trim()) continue;
    const current = line.match(/^[ \t]*/)?.[0].length ?? 0;
    indent = indent === undefined ? current : Math.min(indent, current);
  }
  const resolvedIndent = indent ?? 0;
  if (!resolvedIndent) return { text: raw, indent: 0 };
  return {
    text: lines.map((line) => line.slice(resolvedIndent)).join("\n"),
    indent: resolvedIndent,
  };
}

function isEscaped(content: string, offset: number): boolean {
  let slashCount = 0;
  for (let index = offset - 1; content[index] === "\\"; index--) slashCount++;
  return slashCount % 2 === 1;
}

function inlineCodeEnd(content: string, start: number): number | null {
  if (isEscaped(content, start)) return null;
  let markerEnd = start;
  while (content[markerEnd] === "`") markerEnd++;
  const markerLength = markerEnd - start;
  for (let index = markerEnd; index < content.length;) {
    if (content[index] !== "`") {
      index++;
      continue;
    }
    let runEnd = index;
    while (content[runEnd] === "`") runEnd++;
    if (runEnd - index === markerLength) return runEnd;
    index = runEnd;
  }
  return markerEnd;
}

/** Lex XML chrome without parsing or executing the text between tags. */
export function tokenizeXml(content: string): XmlToken[] {
  const tokens: XmlToken[] = [];
  let textStart = 0;
  let cursor = 0;
  // Scan preceding text lines once per text region. Re-scanning the entire
  // prefix for every literal '<' makes long code examples quadratic.
  let scannedRegionStart = -1;
  let scannedLineEnd = 0;
  let baseIndent: number | undefined;
  let cachedLineStart = -1;
  let cachedLineEnd = -1;
  let currentIndent = 0;
  const isIndentedMarkdownCode = (offset: number): boolean => {
    if (offset > cachedLineEnd) {
      cachedLineStart = content.lastIndexOf("\n", offset - 1) + 1;
      const nextNewline = content.indexOf("\n", offset);
      cachedLineEnd = nextNewline === -1 ? content.length : nextNewline;
      currentIndent = 0;
      while (
        content[cachedLineStart + currentIndent] === " " ||
        content[cachedLineStart + currentIndent] === "\t"
      )
        currentIndent++;
    }
    const lineStart = cachedLineStart;
    if (scannedRegionStart !== textStart) {
      scannedRegionStart = textStart;
      scannedLineEnd = textStart;
      baseIndent = undefined;
    }
    while (scannedLineEnd < lineStart) {
      const end = content.indexOf("\n", scannedLineEnd);
      const line = content.slice(scannedLineEnd, end);
      if (line.trim()) {
        const indent = line.match(/^[ \t]*/)?.[0].length ?? 0;
        baseIndent =
          baseIndent === undefined ? indent : Math.min(baseIndent, indent);
      }
      scannedLineEnd = end + 1;
    }
    return baseIndent !== undefined && currentIndent >= baseIndent + 4;
  };
  const pushMarkdown = (end: number) => {
    if (end <= textStart) return;
    const raw = content.slice(textStart, end);
    const markdown = normalizeMarkdownIndentation(raw);
    tokens.push({
      type: "markdown",
      text: markdown.text,
      raw,
      indent: markdown.indent,
    });
  };

  while (cursor < content.length) {
    const fence = fenceAtLineStart(content, cursor);
    if (fence) {
      cursor = fenceEnd(content, fence.contentStart, fence.marker);
      continue;
    }
    if (content[cursor] === "`") {
      cursor = inlineCodeEnd(content, cursor) ?? cursor + 1;
      continue;
    }
    if (
      content.startsWith("<!--", cursor) ||
      content.startsWith("<![CDATA[", cursor) ||
      content.startsWith("<?", cursor)
    ) {
      const [kind, terminator, afterStart] = content.startsWith("<!--", cursor)
        ? (["comment", "-->", 4] as const)
        : content.startsWith("<![CDATA[", cursor)
          ? (["cdata", "]]>", 9] as const)
          : (["declaration", "?>", 2] as const);
      const endMarker = content.indexOf(terminator, cursor + afterStart);
      const end =
        endMarker === -1 ? content.length : endMarker + terminator.length;
      pushMarkdown(cursor);
      const raw = content.slice(cursor, end);
      tokens.push({
        type: kind,
        text: raw,
        raw,
        indent: indentAt(content, cursor),
      });
      cursor = end;
      textStart = end;
      continue;
    }
    if (content[cursor] !== "<") {
      cursor++;
      continue;
    }
    if (isIndentedMarkdownCode(cursor)) {
      cursor++;
      continue;
    }
    const tag = readXmlTag(content, cursor);
    if (!tag) {
      cursor++;
      continue;
    }
    pushMarkdown(cursor);
    tokens.push({
      type: tag.isClosing ? "close" : tag.isSelfClosing ? "selfClose" : "open",
      tagName: tag.tagName,
      attributes: tag.attributes,
      raw: tag.raw,
      indent: indentAt(content, cursor),
    });
    cursor += tag.raw.length;
    textStart = cursor;
  }
  pushMarkdown(content.length);
  return tokens;
}
