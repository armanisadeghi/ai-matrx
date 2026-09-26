"use client";

import { useState } from "react";
import { cn } from "@/styles/themes/utils";
import { formatBubbleTime } from "../../shared/relative-time";
import { MessageStatusTicks } from "../MessageStatusTicks";
import { ReplyQuote } from "../ReplyQuote";
import type { WAMessage } from "../../types";
import { codeSpanText, findCodeRanges } from "@ai-matrx/content-ir/source";

interface TextBubbleProps {
  message: WAMessage;
}

const READ_MORE_THRESHOLD = 480;

function renderContent(text: string) {
  const lines = text.split("\n");
  const blocks: Array<
    { kind: "para"; text: string } | { kind: "list"; items: string[] }
  > = [];
  let buffer: string[] = [];
  let listBuffer: string[] = [];

  const flushBuffer = () => {
    if (buffer.length) {
      blocks.push({ kind: "para", text: buffer.join("\n") });
      buffer = [];
    }
  };
  const flushList = () => {
    if (listBuffer.length) {
      blocks.push({ kind: "list", items: listBuffer });
      listBuffer = [];
    }
  };

  for (const line of lines) {
    const m = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (m) {
      flushBuffer();
      listBuffer.push(m[2]);
    } else {
      flushList();
      buffer.push(line);
    }
  }
  flushBuffer();
  flushList();
  return blocks;
}

function InlineCode({ children }: { children: string }) {
  return (
    <code className="rounded bg-black/15 px-1 py-0.5 font-mono text-[12.5px] dark:bg-black/30">
      {children}
    </code>
  );
}

function renderInline(text: string) {
  // Code spans by THE one code-range rule (@ai-matrx/content-ir/source).
  const parts: Array<{ code: boolean; text: string }> = [];
  let at = 0;
  for (const range of findCodeRanges(text)) {
    if (range.kind !== "span" || range.start < at) continue;
    if (range.start > at) parts.push({ code: false, text: text.slice(at, range.start) });
    parts.push({ code: true, text: codeSpanText(text.slice(range.start, range.end)) });
    at = range.end;
  }
  if (at < text.length) parts.push({ code: false, text: text.slice(at) });
  return parts.map((part, i) =>
    part.code ? <InlineCode key={i}>{part.text}</InlineCode> : <span key={i}>{part.text}</span>,
  );
}

export function TextBubble({ message }: TextBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const isOwn = message.isOwn;
  const isLong = message.content.length > READ_MORE_THRESHOLD;
  const text =
    isLong && !expanded
      ? message.content.slice(0, READ_MORE_THRESHOLD)
      : message.content;
  const blocks = renderContent(text);

  return (
    <div
      className={cn(
        "flex w-full px-2",
        isOwn ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "relative max-w-[85%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[14.2px] leading-[19px] shadow-sm",
          isOwn
            ? "bg-emerald-100 text-emerald-950 dark:bg-emerald-800/80 dark:text-emerald-50"
            : "bg-card text-foreground",
        )}
      >
        {message.reply ? (
          <ReplyQuote reply={message.reply} isOwnBubble={isOwn} />
        ) : null}

        <div className="whitespace-pre-wrap break-words pr-16">
          {blocks.map((block, i) =>
            block.kind === "para" ? (
              <p key={i} className={i > 0 ? "mt-2" : undefined}>
                {renderInline(block.text)}
              </p>
            ) : (
              <ol key={i} className="ml-5 mt-2 list-decimal space-y-1.5">
                {block.items.map((item, j) => (
                  <li key={j} className="pl-1">
                    {renderInline(item)}
                  </li>
                ))}
              </ol>
            ),
          )}
          {isLong && !expanded ? (
            <>
              <span className="opacity-70">…</span>
              <div className="mt-1.5">
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="text-sky-600 hover:underline dark:text-sky-400"
                >
                  Read more
                </button>
              </div>
            </>
          ) : null}
        </div>

        <div
          className={cn(
            "pointer-events-none absolute bottom-1 right-2 flex items-center gap-1 text-[11px] leading-none",
            isOwn
              ? "text-emerald-900/70 dark:text-emerald-100/70"
              : "text-muted-foreground",
          )}
        >
          {message.editedAt ? <span className="italic">edited</span> : null}
          <span>{formatBubbleTime(message.createdAt)}</span>
          {isOwn ? <MessageStatusTicks status={message.status} /> : null}
        </div>
      </div>
    </div>
  );
}
