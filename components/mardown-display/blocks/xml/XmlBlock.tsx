"use client";

import React, { useState } from "react";
import { ChevronRight, ChevronDown, Copy, Check } from "lucide-react";
import { NestedRichContent } from "@/components/rich-content/standard/NestedRichContent";
import { cn } from "@/styles/themes/utils";
import { tokenizeXml } from "./xml-tokenize";
import { useMarkdownStreaming } from "@/components/markdown-core/streaming-context";

interface XmlBlockProps {
  content: string;
  language?: string;
  className?: string;
  /**
   * Prose segments ALREADY RENDERED by a static root (server level / SSR'd
   * share leaf), keyed by token index from the shared tokenizer
   * (xml-tokenize.ts), so a card's text is in the server HTML. Missing keys
   * render client-side through NestedRichContent, as before.
   */
  renderedProse?: Record<number, React.ReactNode>;
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
  renderedProse,
}) => {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [cardCollapsed, setCardCollapsed] = useState(false);
  const tokens = tokenizeXml(content);
  const isStreaming = useMarkdownStreaming();

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

  const findMatchingClose = (openIdx: number): number | null => {
    const openToken = tokens[openIdx];
    if (openToken.type !== "open" || !openToken.tagName) return null;
    let depth = 1;
    for (let j = openIdx + 1; j < tokens.length; j++) {
      const t = tokens[j];
      if (t.type === "open" && t.tagName === openToken.tagName) depth++;
      if (t.type === "close" && t.tagName === openToken.tagName) {
        depth--;
        if (depth === 0) return j;
      }
    }
    return null;
  };

  // The outer XML element is the card's semantic label, not document content.
  // Keeping its chrome out of the body lets Markdown inside read naturally
  // while the raw source remains available through Copy XML.
  const rootOpenIndex = tokens.findIndex(
    (token) => token.type === "open" || token.type === "selfClose",
  );
  const rootCloseIndex =
    rootOpenIndex === -1 ? null : findMatchingClose(rootOpenIndex);
  const rootTagName =
    rootOpenIndex === -1 ? undefined : tokens[rootOpenIndex]?.tagName;
  const hasCardBody = tokens.some(
    (_, idx) => idx !== rootOpenIndex && idx !== rootCloseIndex,
  );

  const hiddenRanges: Set<number> = new Set();
  for (const idx of collapsed) {
    const end = findMatchingClose(idx);
    for (let j = idx + 1; j < (end ?? tokens.length); j++) {
      hiddenRanges.add(j);
    }
  }


  // NOT XML: no complete tag, comment, CDATA or declaration anywhere — only a
  // fragment like `<inf` / `<thinkin` (an opener whose `>` has not arrived,
  // or never will). While a stream is live it is pending text and shows
  // nothing yet; once settled it is the literal text it is. Never an XML card
  // whose body is itself — that is what recursed into nested empty cards.
  if (!tokens.some((token) => token.type !== "markdown")) {
    if (isStreaming) return null;
    return (
      <div
        data-xml-fragment
        className={cn("my-2 whitespace-pre-wrap break-words", className)}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "my-3 rounded-lg border border-border bg-card overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-muted/30">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-mono font-semibold text-orange-600 dark:text-orange-400">
            {language.toUpperCase()}
          </span>
          {rootTagName ? (
            hasCardBody ? (
              <button
                aria-label={`${cardCollapsed ? "Expand" : "Collapse"} ${rootTagName}`}
                aria-expanded={!cardCollapsed}
                onClick={() => setCardCollapsed((previous) => !previous)}
                className="size-11 flex min-w-0 items-center gap-1 rounded px-1 py-0.5 font-mono text-sm text-blue-600 transition-colors hover:bg-muted hover:text-foreground dark:text-blue-400 lg:size-auto lg:p-0"
              >
                {cardCollapsed ? (
                  <ChevronRight className="size-3.5 shrink-0" />
                ) : (
                  <ChevronDown className="size-3.5 shrink-0" />
                )}
                <span className="truncate">{rootTagName}</span>
              </button>
            ) : (
              <span
                data-xml-root-name
                className="truncate font-mono text-sm text-blue-600 dark:text-blue-400"
              >
                {rootTagName}
              </span>
            )
          ) : null}
        </div>
        <button
          aria-label="Copy XML"
          onClick={handleCopy}
          className="size-11 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground lg:size-auto lg:p-1"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      {!cardCollapsed && (
        <div
          data-xml-card-body
          className="px-3 py-2 font-mono text-sm leading-relaxed overflow-x-auto"
        >
          {tokens.map((token, idx) => {
            if (idx === rootOpenIndex || idx === rootCloseIndex) return null;
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
                  {/* Prose between tags is content INSIDE content: the same
                      core at the standard level, one depth deeper (math,
                      tables, fenced code, nested sections) — bounded by the
                      depth cap instead of a never-recurse rule. */}
                  {renderedProse && idx in renderedProse && !isStreaming ? (
                    renderedProse[idx]
                  ) : (
                    <NestedRichContent source={token.text ?? ""} />
                  )}
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
                    className="size-11 mr-1 flex flex-shrink-0 items-center justify-center text-muted-foreground hover:text-foreground transition-colors lg:size-auto lg:mt-0.5 lg:p-0"
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
      )}
    </div>
  );
};

export default XmlBlock;
