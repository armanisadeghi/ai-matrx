/**
 * The sandbox page's output pane, drawn by @ai-matrx/terminal: real ANSI colour, scrollback,
 * selection and phone touch scrolling, instead of raw text with escape codes in it. The page's
 * own command line stays the input (it is the agent-writable box with the staged-command marker),
 * so the terminal here is output only: stdin off, no keyboard bar.
 *
 * Entries are appended as they arrive; a shorter list than what was drawn (a lifecycle reset)
 * clears the screen and redraws.
 */

"use client";

import "@/styles/terminal-host.css";
import { useEffect, useRef, useState } from "react";
import { Terminal } from "@ai-matrx/terminal/react";
import type { TerminalHandle } from "@ai-matrx/terminal/react";

export interface SandboxTranscriptEntry {
  type: "command" | "stdout" | "stderr" | "info";
  text: string;
  exitCode?: number;
  cwd?: string;
}

const RESET = "\x1b[0m";
const BLUE = "\x1b[34m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";

function withNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

export function formatTranscriptEntry(entry: SandboxTranscriptEntry): string {
  switch (entry.type) {
    case "command":
      return `${BLUE}${entry.cwd ?? ""}${RESET}${DIM} $ ${RESET}${GREEN}${entry.text}${RESET}\n`;
    case "stdout":
      return withNewline(entry.text);
    case "stderr":
      return `${RED}${withNewline(entry.text)}${RESET}`;
    case "info":
      return `${DIM}${withNewline(entry.text)}${RESET}`;
  }
}

export function SandboxTranscript({
  entries,
  executing,
  emptyText,
  onActivate,
}: {
  entries: SandboxTranscriptEntry[];
  executing: boolean;
  emptyText: string;
  /** A click on the output (the page focuses its command line). */
  onActivate?: () => void;
}) {
  const handleRef = useRef<TerminalHandle | null>(null);
  const drawnRef = useRef(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    if (entries.length < drawnRef.current) {
      handle.reset();
      drawnRef.current = 0;
    }
    for (const entry of entries.slice(drawnRef.current)) void handle.write(formatTranscriptEntry(entry));
    drawnRef.current = entries.length;
  }, [entries, ready]);

  return (
    <div className="relative h-[50dvh] min-h-48 overflow-hidden rounded-t-md bg-[#1e1e1e] py-2" onClick={onActivate}>
      <Terminal
        theme="dark"
        convertEol
        disableStdin
        accessory="off"
        padding={12}
        aria-label="Sandbox output"
        onReady={(handle) => {
          handleRef.current = handle;
          setReady(true);
        }}
      >
        {entries.length === 0 ? (
          <p className="pointer-events-none absolute left-3 top-1 font-mono text-sm text-zinc-500">{emptyText}</p>
        ) : null}
        {executing ? (
          <span className="pointer-events-none absolute bottom-1 right-3 animate-pulse font-mono text-xs text-zinc-500">Running…</span>
        ) : null}
      </Terminal>
    </div>
  );
}
