/**
 * The /sandbox/[id] terminal, entirely on @ai-matrx/terminal: output, prompt, the command line,
 * history and the agent's staged markers in one terminal. The sandbox runs one command per call
 * (the exec API, not a PTY), so the package's line editor is the shell's line discipline here:
 * cursor editing, ↑/↓ history, Ctrl-C, Ctrl-L and multi-line paste, exactly as a shell shows them.
 *
 * The page keeps owning the state agents read and write (the staged command, the working
 * directory, the history and the transcript); this component draws it and reports the person's
 * edits. An agent's staged command lands on the prompt line — never run — with an amber marker
 * until the person changes it.
 */

"use client";

import "@/styles/terminal-host.css";
import { useEffect, useRef, useState } from "react";
import { createLineEditor } from "@ai-matrx/terminal";
import type { LineEditor } from "@ai-matrx/terminal";
import { Terminal } from "@ai-matrx/terminal/react";
import type { TerminalHandle } from "@ai-matrx/terminal/react";

export interface SandboxConsoleEntry {
  type: "command" | "stdout" | "stderr" | "info";
  text: string;
  exitCode?: number;
  cwd?: string;
}

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const AMBER_UNDERLINE = "\x1b[33;4m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const HOME = "/home/agent";

function withNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

/**
 * Output as the terminal shows it. A "command" entry is the line the editor already echoed after
 * its prompt, so it draws only when replaying a transcript onto a fresh screen.
 */
export function formatConsoleEntry(entry: SandboxConsoleEntry, replay = false): string {
  switch (entry.type) {
    case "command":
      return replay ? `${GREEN}agent@sandbox${RESET}:${BLUE}${shortCwd(entry.cwd ?? HOME)}${RESET}$ ${entry.text}\n` : "";
    case "stdout":
      return withNewline(entry.text);
    case "stderr":
      return `${RED}${withNewline(entry.text)}${RESET}`;
    case "info":
      return `${DIM}${withNewline(entry.text)}${RESET}`;
  }
}

export function shortCwd(cwd: string): string {
  return cwd === HOME ? "~" : cwd.startsWith(`${HOME}/`) ? `~${cwd.slice(HOME.length)}` : cwd;
}

/** The prompt: amber, underlined directory while it is an agent's proposal, not a cd you ran. */
export function sandboxPrompt(cwd: string, cwdStaged: boolean): string {
  return `${GREEN}agent@sandbox${RESET}:${cwdStaged ? AMBER_UNDERLINE : BLUE}${shortCwd(cwd)}${RESET}$ `;
}

export interface SandboxConsoleProps {
  entries: SandboxConsoleEntry[];
  executing: boolean;
  /** A running sandbox: the line takes input. */
  active: boolean;
  cwd: string;
  cwdStaged: boolean;
  /** The command on the prompt line (typed, or staged by an agent). */
  line: string;
  lineStaged: boolean;
  /** Previous commands, oldest first. */
  history: string[];
  /** The person edited the line (typing, deleting, recalling history). */
  onLineChange: (line: string) => void;
  /** Enter on a non-empty line. */
  onSubmit: (command: string) => void;
}

export function SandboxConsole(props: SandboxConsoleProps) {
  const { entries, executing, active, cwd, cwdStaged, line, lineStaged } = props;
  const handleRef = useRef<TerminalHandle | null>(null);
  const editorRef = useRef<LineEditor | null>(null);
  const drawnRef = useRef(0);
  const latest = useRef(props);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    latest.current = props;
  });

  // Output since the last draw; a shorter transcript (a lifecycle reset) redraws from scratch.
  useEffect(() => {
    const handle = handleRef.current;
    const editor = editorRef.current;
    if (!handle || !editor) return;
    if (entries.length < drawnRef.current) {
      handle.reset();
      for (const entry of entries) void handle.write(formatConsoleEntry(entry, true));
      drawnRef.current = entries.length;
      editor.prompt();
      return;
    }
    for (const entry of entries.slice(drawnRef.current)) void handle.write(formatConsoleEntry(entry));
    drawnRef.current = entries.length;
  }, [entries, ready]);

  // The command finished (its output is drawn above): prompt again, run the next pasted line.
  useEffect(() => {
    const editor = editorRef.current;
    if (!executing && editor?.busy) editor.done();
  }, [executing, ready]);

  // An agent staged a command (or the page cleared the line): show it on the prompt line.
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.line !== line) editor.setLine(line);
  }, [line, ready]);

  // The directory in the prompt changed (the shell reported one, or an agent proposed one).
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && !editor.busy) editor.refresh();
  }, [cwd, cwdStaged, ready]);

  return (
    <div className="relative h-[50dvh] min-h-48 overflow-hidden rounded-md bg-[#1e1e1e] py-2">
      <Terminal
        theme="dark"
        convertEol
        disableStdin={!active}
        padding={12}
        aria-label="Sandbox terminal"
        onReady={(handle) => {
          handleRef.current = handle;
          const editor = createLineEditor({
            write: (data) => handle.xterm.write(data),
            prompt: () => sandboxPrompt(latest.current.cwd, latest.current.cwdStaged),
            history: () => latest.current.history,
            onSubmit: (command) => latest.current.onSubmit(command),
            onClearScreen: () => handle.clear(),
            onChange: (next) => latest.current.onLineChange(next),
          });
          editorRef.current = editor;
          for (const entry of latest.current.entries) void handle.write(formatConsoleEntry(entry, true));
          drawnRef.current = latest.current.entries.length;
          if (latest.current.line) editor.setLine(latest.current.line);
          else editor.prompt();
          setReady(true);
        }}
        onData={(data) => {
          if (latest.current.active) editorRef.current?.input(data);
        }}
      >
        <div className="pointer-events-none absolute right-3 top-1 flex flex-col items-end gap-1">
          {lineStaged ? (
            <span
              data-testid="agent-staged-command-marker"
              title="An agent typed this command; nothing runs until you press Enter, and editing it clears this marker."
              className="pointer-events-auto rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-amber-400"
            >
              staged by agent · not run
            </span>
          ) : null}
          {cwdStaged ? (
            <span
              data-testid="agent-staged-cwd-marker"
              title={`${cwd} was set by an agent, not a cd you ran; your next command runs there`}
              className="pointer-events-auto rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-amber-400"
            >
              folder set by agent
            </span>
          ) : null}
        </div>
        {!active ? (
          <span className="pointer-events-none absolute bottom-1 right-3 font-mono text-xs text-zinc-500">Sandbox not running</span>
        ) : executing ? (
          <span className="pointer-events-none absolute bottom-1 right-3 animate-pulse font-mono text-xs text-zinc-500">Running…</span>
        ) : null}
      </Terminal>
    </div>
  );
}
