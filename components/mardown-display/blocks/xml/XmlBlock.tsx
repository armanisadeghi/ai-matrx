"use client";

import React, { useState } from "react";
import { ChevronRight, ChevronDown, Copy, Check } from "lucide-react";
import MarkdownCore from "@/components/markdown-core/MarkdownCore";
import { cn } from "@/styles/themes/utils";

interface XmlBlockProps {
  content: string;
  language?: string;
  className?: string;
}

interface XmlToken {
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

const XML_NAME_START = /[A-Za-z_]/;
const XML_NAME_CHARACTER = /[\w.:-]/;

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

function readXmlTag(
  content: string,
  start: number,
): {
  tagName: string;
  raw: string;
  isClosing: boolean;
  isSelfClosing: boolean;
  attributes: Array<{ name: string; value: string }>;
} | null {
  let cursor = start + 1;
  const isClosing = content[cursor] === "/";
  if (isClosing) cursor++;
  if (!XML_NAME_START.test(content[cursor] ?? "")) return null;
  const nameStart = cursor;
  while (XML_NAME_CHARACTER.test(content[cursor] ?? "")) cursor++;
  const tagName = content.slice(nameStart, cursor);
  const attributes: Array<{ name: string; value: string }> = [];
  if (isClosing) {
    while (/\s/.test(content[cursor] ?? "")) cursor++;
    if (content[cursor] !== ">") return null;
    return {
      tagName,
      raw: content.slice(start, cursor + 1),
      isClosing,
      isSelfClosing: false,
      attributes,
    };
  }
  while (cursor < content.length) {
    while (/\s/.test(content[cursor] ?? "")) cursor++;
    if (content[cursor] === ">")
      return {
        tagName,
        raw: content.slice(start, cursor + 1),
        isClosing,
        isSelfClosing: false,
        attributes,
      };
    if (content[cursor] === "/") {
      cursor++;
      while (/\s/.test(content[cursor] ?? "")) cursor++;
      if (content[cursor] !== ">") return null;
      return {
        tagName,
        raw: content.slice(start, cursor + 1),
        isClosing,
        isSelfClosing: true,
        attributes,
      };
    }
    if (!XML_NAME_START.test(content[cursor] ?? "")) return null;
    const attributeStart = cursor;
    while (XML_NAME_CHARACTER.test(content[cursor] ?? "")) cursor++;
    const name = content.slice(attributeStart, cursor);
    while (/\s/.test(content[cursor] ?? "")) cursor++;
    if (content[cursor] !== "=") return null;
    cursor++;
    while (/\s/.test(content[cursor] ?? "")) cursor++;
    const quote = content[cursor];
    if (quote !== '"' && quote !== "'") return null;
    const valueStart = ++cursor;
    while (cursor < content.length && content[cursor] !== quote) cursor++;
    if (cursor === content.length) return null;
    attributes.push({ name, value: content.slice(valueStart, cursor) });
    cursor++;
  }
  return null;
}

/** Lex XML chrome without parsing or executing the text between tags. */
function tokenizeXml(content: string): XmlToken[] {
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
      ) currentIndent++;
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
        baseIndent = baseIndent === undefined ? indent : Math.min(baseIndent, indent);
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

function renderAttributes(
  attrs: Array<{ name: string; value: string }>,
): React.ReactNode {
  return attrs.map((attr, i) => (
    <span key={i}>
      {" "}
      <span className="text-amber-600 dark:text-amber-400">{attr.name}</span>
      <span className="text-muted-foreground">=</span>
      <span className="text-green-600 dark:text-green-400">
        &quot;{attr.value}&quot;
      </span>
    </span>
  ));
}

const XmlBlock: React.FC<XmlBlockProps> = ({
  content,
  language = "xml",
  className,
}) => {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const tokens = tokenizeXml(content);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleCollapse = (idx: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const findMatchingClose = (openIdx: number): number => {
    const openToken = tokens[openIdx];
    if (openToken.type !== "open" || !openToken.tagName) return openIdx;
    let depth = 1;
    for (let j = openIdx + 1; j < tokens.length; j++) {
      const t = tokens[j];
      if (t.type === "open" && t.tagName === openToken.tagName) depth++;
      if (t.type === "close" && t.tagName === openToken.tagName) {
        depth--;
        if (depth === 0) return j;
      }
    }
    return tokens.length - 1;
  };

  const hiddenRanges: Set<number> = new Set();
  for (const idx of collapsed) {
    const end = findMatchingClose(idx);
    for (let j = idx + 1; j <= end; j++) hiddenRanges.add(j);
  }

  return (
    <div
      className={cn(
        "my-3 rounded-lg border border-border bg-card overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-muted/30">
        <span className="text-xs font-mono font-semibold text-orange-600 dark:text-orange-400">
          {language.toUpperCase()}
        </span>
        <button
          aria-label="Copy XML"
          onClick={handleCopy}
          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      <div className="px-3 py-2 font-mono text-sm leading-relaxed overflow-x-auto">
        {tokens.map((token, idx) => {
          if (hiddenRanges.has(idx)) return null;

          const style = { paddingLeft: token.indent * 8 };

          if (token.type === "markdown" && !token.text?.trim()) {
            return <div key={idx} className="h-3" />;
          }

          if (token.type === "comment") {
            return (
              <div
                key={idx}
                className="text-muted-foreground italic"
                style={style}
              >
                {token.text}
              </div>
            );
          }

          if (token.type === "declaration" || token.type === "cdata") {
            return (
              <div key={idx} className="text-muted-foreground" style={style}>
                {token.text}
              </div>
            );
          }

          if (token.type === "markdown") {
            return (
              <div
                key={idx}
                className="xml-markdown-content prose prose-sm max-w-none overflow-x-auto font-sans text-foreground dark:prose-invert"
                style={style}
              >
                <MarkdownCore preset="gfm">{token.text ?? ""}</MarkdownCore>
              </div>
            );
          }

          if (token.type === "close") {
            return (
              <div key={idx} style={style}>
                <span className="text-muted-foreground">&lt;/</span>
                <span className="text-red-600 dark:text-red-400">
                  {token.tagName}
                </span>
                <span className="text-muted-foreground">&gt;</span>
              </div>
            );
          }

          if (token.type === "selfClose") {
            return (
              <div key={idx} style={style}>
                <span className="text-muted-foreground">&lt;</span>
                <span className="text-blue-600 dark:text-blue-400">
                  {token.tagName}
                </span>
                {token.attributes && renderAttributes(token.attributes)}
                <span className="text-muted-foreground"> /&gt;</span>
              </div>
            );
          }

          // open tag
          const isCollapsed = collapsed.has(idx);
          const hasChildren =
            idx + 1 < tokens.length && tokens[idx + 1].type !== "close";

          return (
            <div
              key={idx}
              className="flex items-start group/line hover:bg-muted/30 rounded-sm -mx-1 px-1"
              style={style}
            >
              {hasChildren ? (
                <button
                  aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${token.tagName}`}
                  onClick={() => toggleCollapse(idx)}
                  className="mr-1 mt-0.5 p-0 flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              ) : (
                <span className="w-[18px] flex-shrink-0" />
              )}
              <span>
                <span className="text-muted-foreground">&lt;</span>
                <span className="text-blue-600 dark:text-blue-400">
                  {token.tagName}
                </span>
                {token.attributes && renderAttributes(token.attributes)}
                <span className="text-muted-foreground">&gt;</span>
                {isCollapsed && (
                  <span className="ml-1 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    ...
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default XmlBlock;
