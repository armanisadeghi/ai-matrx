"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { extractErrorMessage } from "@/utils/errors";
import {
  appendLine,
  clearLines,
  pushHistory,
  selectTerminalExecuting,
  selectTerminalHistory,
  selectTerminalLines,
  setExecuting,
} from "../redux/terminalSlice";
import { useCodeWorkspace } from "../CodeWorkspaceProvider";
import { useMonacoTheme } from "../editor/useMonacoTheme";
import type { PtyHandle } from "../adapters/ProcessAdapter";

interface TerminalTabProps {
  className?: string;
  /** Keep the terminal rendered even when its bottom-panel tab isn't
   *  active. When `false`, the terminal element is still in the DOM but
   *  visually hidden; xterm state is preserved across tab switches. */
  visible?: boolean;
}

type XtermTerminal = import("@xterm/xterm").Terminal;
type FitAddon = import("@xterm/addon-fit").FitAddon;

interface SessionState {
  term: XtermTerminal;
  fit: FitAddon;
  /** Current in-progress user input. */
  buffer: string;
  /** Cursor index within the buffer. */
  cursor: number;
  /** Position in history ring buffer (null = not recalling). */
  historyIdx: number | null;
  /** True while a command is executing — keystrokes are ignored. */
  running: boolean;
  /** Latest Redux line id rendered into xterm (for agent-line mirroring). */
  lastSeenLineId: number;
  /** Live PTY handle when the adapter supports it; xterm is attached
   *  directly to it and the read-line emulation below is bypassed. */
  pty: PtyHandle | null;
  /** Disposable for the term.onData listener so we can swap it when the
   *  PTY connects/disconnects without leaking handlers. */
  onDataDisposer: (() => void) | null;
  /** When a streaming `runCommand` is in flight, this aborts the SSE
   *  request and tells the orchestrator to SIGTERM the underlying
   *  process. Cleared back to null when the command finishes. */
  runAbort: AbortController | null;
  /** Pending lines from a multi-line paste that are queued to run after
   *  the current command finishes. Each entry is the trimmed line content
   *  (no trailing newline). */
  pasteQueue: string[];
}

// ANSI color escape codes
const PROMPT_GREEN = "\x1b[32m";
const PROMPT_BLUE = "\x1b[34m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const PURPLE = "\x1b[35m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

export const TerminalTab: React.FC<TerminalTabProps> = ({
  className,
  visible = true,
}) => {
  const dispatch = useAppDispatch();
  const history = useAppSelector(selectTerminalHistory);
  const reduxLines = useAppSelector(selectTerminalLines);
  const executing = useAppSelector(selectTerminalExecuting);
  const { process } = useCodeWorkspace();
  const dark = useMonacoTheme();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<SessionState | null>(null);
  const historyRef = useRef(history);
  const processRef = useRef(process);
  historyRef.current = history;
  processRef.current = process;

  const [ready, setReady] = useState(false);

  // ── Prompt writing helpers ──────────────────────────────────────────────
  const writePromptFor = useCallback((state: SessionState) => {
    const cwd = shortCwd(processRef.current.cwd);
    state.term.write(`${PROMPT_GREEN}${cwd}${RESET} ${PROMPT_BLUE}❯${RESET} `);
    if (state.buffer) {
      state.term.write(state.buffer);
      const trailing = state.buffer.length - state.cursor;
      if (trailing > 0) state.term.write(`\x1b[${trailing}D`);
    }
  }, []);

  const refreshLine = useCallback(
    (state: SessionState) => {
      state.term.write("\r\x1b[K");
      writePromptFor(state);
    },
    [writePromptFor],
  );

  /** Pop the next queued paste line (if any) and run it. Lets a multi-line
   *  paste behave the way the user expects — one command after the next.
   *  Defined as a ref-mutating closure so `runCommand` can call it without
   *  taking a circular dep on itself. */
  const runCommandRef = useRef<
    ((state: SessionState, command: string) => Promise<void>) | null
  >(null);

  const runCommand = useCallback(
    async (state: SessionState, command: string) => {
      if (!command.trim()) {
        state.term.write("\r\n");
        writePromptFor(state);
        const next = state.pasteQueue.shift();
        if (next !== undefined && runCommandRef.current) {
          state.buffer = "";
          state.cursor = 0;
          state.historyIdx = null;
          void runCommandRef.current(state, next);
        }
        return;
      }

      state.running = true;
      dispatch(pushHistory(command));
      dispatch(setExecuting(true));

      dispatch(
        appendLine({
          type: "command",
          text: command,
          tab: "terminal",
          cwd: processRef.current.cwd,
          source: "user",
        }),
      );

      state.term.write("\r\n");

      const adapter = processRef.current;
      const ac = new AbortController();
      state.runAbort = ac;

      try {
        let exitCode = 0;
        let cwd: string | undefined;

        // Tools like `clear`, `less`, `git push` (with prompts), `vim`,
        // `top`, etc. read TERM and tput-style capabilities from the
        // environment. Without a TERM value we get "TERM environment
        // variable not set" / "Inappropriate ioctl for device". Setting
        // a sane default at the streaming-exec layer gives most CLIs
        // what they need without paying the cost of a real PTY.
        // COLUMNS/LINES help wrapping on tools like `git log --graph`.
        const baseEnv: Record<string, string> = {
          TERM: "xterm-256color",
          COLUMNS: String(state.term.cols ?? 100),
          LINES: String(state.term.rows ?? 30),
        };

        if (adapter.stream) {
          // Streaming path — write each chunk to xterm as it arrives so
          // the user sees output live (git clone progress, npm install
          // logs, test output, …) instead of waiting for the buffered
          // result at end-of-command.
          const result = await adapter.stream(
            command,
            (event) => {
              if (event.type === "stdout" && event.text) {
                state.term.write(ansiNormalize(event.text));
              } else if (event.type === "stderr" && event.text) {
                state.term.write(`${RED}${ansiNormalize(event.text)}${RESET}`);
              }
              // `info` and `exit` events are summarised after the await
              // resolves so we render a single trailing exit line.
            },
            { signal: ac.signal, env: baseEnv },
          );
          exitCode = result.exitCode;
          cwd = result.cwd;
        } else {
          // Buffered fallback (Mock adapter, or any adapter without
          // streaming support).
          const result = await adapter.exec(command, { env: baseEnv });
          if (result.stdout) {
            state.term.write(ansiNormalize(result.stdout));
          }
          if (result.stderr) {
            state.term.write(`${RED}${ansiNormalize(result.stderr)}${RESET}`);
          }
          exitCode = result.exitCode;
          cwd = result.cwd;
        }

        state.term.write(`${DIM}exit ${exitCode}${RESET}\r\n`);

        dispatch(
          appendLine({
            type: "info",
            text: `Exit ${exitCode}`,
            exitCode,
            cwd,
            tab: "terminal",
            source: "user",
          }),
        );
      } catch (err) {
        // AbortError is the user's own Ctrl-C — surface it cleanly
        // instead of dumping a stack trace into the terminal.
        const aborted =
          (err instanceof DOMException && err.name === "AbortError") ||
          ac.signal.aborted;
        if (aborted) {
          state.term.write(`${DIM}^C cancelled${RESET}\r\n`);
        } else {
          const message = extractErrorMessage(err);
          state.term.write(`${RED}${message}${RESET}\r\n`);
          dispatch(
            appendLine({
              type: "stderr",
              text: message,
              tab: "terminal",
              source: "user",
            }),
          );
        }
      } finally {
        state.running = false;
        state.runAbort = null;
        state.buffer = "";
        state.cursor = 0;
        state.historyIdx = null;
        dispatch(setExecuting(false));
        writePromptFor(state);
        const next = state.pasteQueue.shift();
        if (next !== undefined && runCommandRef.current) {
          void runCommandRef.current(state, next);
        }
      }
    },
    [dispatch, writePromptFor],
  );

  // Keep the ref in sync so the queue-drain hop above always calls the
  // current `runCommand`.
  runCommandRef.current = runCommand;

  // ── Input handler (read-line emulation, used when no PTY is available) ─
  const handleData = useCallback(
    (state: SessionState, data: string) => {
      // Ctrl-C while a streamed command is running: abort the SSE so the
      // orchestrator SIGTERMs the process. The `runCommand` finally block
      // takes care of redrawing the prompt.
      if (state.running) {
        if (data === "\x03" && state.runAbort) {
          state.runAbort.abort();
        }
        return;
      }

      // Paste-in: multi-char chunk without escape prefix.
      if (data.length > 1 && !data.startsWith("\x1b")) {
        const lines = data.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const chunk = lines[i];
          if (chunk) {
            state.buffer =
              state.buffer.slice(0, state.cursor) +
              chunk +
              state.buffer.slice(state.cursor);
            state.cursor += chunk.length;
            state.term.write(chunk);
          }
          if (i < lines.length - 1) {
            // Newline boundary inside the paste — run the first line now,
            // and queue the remaining lines so they execute one-by-one
            // after each command completes (see `runCommand`'s finally
            // block). Empty lines are kept so the visual rhythm matches
            // what the user pasted.
            const toRun = state.buffer;
            state.buffer = "";
            state.cursor = 0;
            for (let j = i + 1; j < lines.length; j++) {
              state.pasteQueue.push(lines[j] ?? "");
            }
            void runCommand(state, toRun);
            return;
          }
        }
        return;
      }

      switch (data) {
        case "\r": {
          const command = state.buffer;
          state.buffer = "";
          state.cursor = 0;
          state.historyIdx = null;
          void runCommand(state, command);
          return;
        }
        case "\x7f": {
          if (state.cursor === 0) return;
          state.buffer =
            state.buffer.slice(0, state.cursor - 1) +
            state.buffer.slice(state.cursor);
          state.cursor -= 1;
          refreshLine(state);
          return;
        }
        case "\x1b[3~": {
          if (state.cursor >= state.buffer.length) return;
          state.buffer =
            state.buffer.slice(0, state.cursor) +
            state.buffer.slice(state.cursor + 1);
          refreshLine(state);
          return;
        }
        case "\x1b[A": {
          const hist = historyRef.current;
          if (hist.length === 0) return;
          const idx =
            state.historyIdx === null
              ? hist.length - 1
              : Math.max(0, state.historyIdx - 1);
          state.historyIdx = idx;
          state.buffer = hist[idx] ?? "";
          state.cursor = state.buffer.length;
          refreshLine(state);
          return;
        }
        case "\x1b[B": {
          const hist = historyRef.current;
          if (state.historyIdx === null) return;
          const next = state.historyIdx + 1;
          if (next >= hist.length) {
            state.historyIdx = null;
            state.buffer = "";
          } else {
            state.historyIdx = next;
            state.buffer = hist[next] ?? "";
          }
          state.cursor = state.buffer.length;
          refreshLine(state);
          return;
        }
        case "\x1b[C": {
          if (state.cursor < state.buffer.length) {
            state.cursor += 1;
            state.term.write("\x1b[C");
          }
          return;
        }
        case "\x1b[D": {
          if (state.cursor > 0) {
            state.cursor -= 1;
            state.term.write("\x1b[D");
          }
          return;
        }
        case "\x01": {
          if (state.cursor > 0) {
            state.term.write(`\x1b[${state.cursor}D`);
            state.cursor = 0;
          }
          return;
        }
        case "\x05": {
          const dist = state.buffer.length - state.cursor;
          if (dist > 0) {
            state.term.write(`\x1b[${dist}C`);
            state.cursor = state.buffer.length;
          }
          return;
        }
        case "\x0b": {
          state.buffer = state.buffer.slice(0, state.cursor);
          refreshLine(state);
          return;
        }
        case "\x15": {
          state.buffer = state.buffer.slice(state.cursor);
          state.cursor = 0;
          refreshLine(state);
          return;
        }
        case "\x0c": {
          state.term.clear();
          refreshLine(state);
          return;
        }
        case "\x03": {
          state.term.write("^C\r\n");
          state.buffer = "";
          state.cursor = 0;
          state.historyIdx = null;
          writePromptFor(state);
          return;
        }
        default: {
          if (data >= " " && data.length === 1) {
            state.buffer =
              state.buffer.slice(0, state.cursor) +
              data +
              state.buffer.slice(state.cursor);
            state.cursor += 1;
            if (state.cursor === state.buffer.length) {
              state.term.write(data);
            } else {
              refreshLine(state);
            }
          }
        }
      }
    },
    [refreshLine, runCommand, writePromptFor],
  );

  // ── Boot xterm once ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      if (!containerRef.current) return;
      // eslint-disable-next-line @typescript-eslint/consistent-type-imports
      const xtermModule = await import("@xterm/xterm");
      const fitModule = await import("@xterm/addon-fit");
      const linksModule = await import("@xterm/addon-web-links");
      if (cancelled || !containerRef.current) return;

      const term = new xtermModule.Terminal({
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
        fontSize: 12.5,
        lineHeight: 1.25,
        cursorBlink: true,
        cursorStyle: "bar",
        scrollback: 5000,
        convertEol: true,
        theme: makeTheme(document.documentElement.classList.contains("dark")),
      });
      const fit = new fitModule.FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new linksModule.WebLinksAddon());
      term.open(containerRef.current);
      try {
        fit.fit();
      } catch {
        /* container may not be sized yet */
      }

      const session: SessionState = {
        term,
        fit,
        buffer: "",
        cursor: 0,
        historyIdx: null,
        running: false,
        lastSeenLineId: parseLineId(reduxLines[reduxLines.length - 1]?.id),
        pty: null,
        onDataDisposer: null,
        runAbort: null,
        pasteQueue: [],
      };
      sessionRef.current = session;

      // Default wiring: read-line emulation on top of `process.exec()`.
      // If the active adapter supports a real PTY, we'll swap this out
      // below.
      const bufferedListener = term.onData((data) => handleData(session, data));
      session.onDataDisposer = () => bufferedListener.dispose();

      term.write(
        `${BOLD}Matrx Terminal${RESET}${DIM} — ${processRef.current.isReady ? "connected" : "no process adapter"}${RESET}\r\n`,
      );
      writePromptFor(session);
      setReady(true);

      // Try to upgrade to a real PTY in the background. If the adapter
      // doesn't expose `openPty` (Mock) or the WebSocket can't connect
      // (Vercel deploy without an upgrade hook), we silently keep the
      // buffered fallback so users still get a working terminal.
      void attachPty(session);
    };

    /** Attempt to attach xterm directly to a PTY WebSocket. */
    const attachPty = async (state: SessionState) => {
      const adapter = processRef.current;
      if (!adapter.openPty) return;
      const term = state.term;
      try {
        const handle = await adapter.openPty({
          cols: term.cols,
          rows: term.rows,
          cwd: adapter.cwd || "/home/agent",
          onData: (data: string) => {
            // The remote PTY echoes input itself, drives its own prompt,
            // and emits ANSI directly. Just write the bytes through.
            term.write(data);
          },
          onExit: (code, signal) => {
            term.write(
              `\r\n${DIM}[pty closed${
                code !== null ? ` exit ${code}` : ""
              }${signal ? ` signal ${signal}` : ""}]${RESET}\r\n`,
            );
            // Fall back to buffered emulation so the user still has a
            // useful prompt while we don't auto-reconnect.
            detachPty(state);
            writePromptFor(state);
          },
          onError: (err) => {
            term.write(
              `\r\n${DIM}[pty error: ${err.message}; falling back to buffered terminal]${RESET}\r\n`,
            );
          },
        });
        if (cancelled) {
          handle.close();
          return;
        }
        // Tear down the buffered listener and route keystrokes straight
        // to the PTY. The remote daemon owns line editing, history,
        // signal handling, and prompt rendering from this point.
        state.onDataDisposer?.();
        const liveListener = term.onData((data) => handle.write(data));
        state.onDataDisposer = () => liveListener.dispose();
        state.pty = handle;
        // Clear the local-prompt scaffolding so we don't render two
        // prompts on top of each other when the daemon emits its own.
        term.write("\r\x1b[K");
      } catch {
        // Adapter said it supports PTY but the connection failed; keep
        // the buffered fallback active.
      }
    };

    /** Restore buffered read-line emulation after a PTY drops. */
    const detachPty = (state: SessionState) => {
      state.pty?.close();
      state.pty = null;
      state.onDataDisposer?.();
      const bufferedListener = state.term.onData((data) =>
        handleData(state, data),
      );
      state.onDataDisposer = () => bufferedListener.dispose();
    };

    void boot();

    return () => {
      cancelled = true;
      const s = sessionRef.current;
      if (s) {
        // Abort any in-flight stream so the orchestrator stops the
        // process and doesn't leak compute when the user navigates away.
        s.runAbort?.abort();
        s.pty?.close();
        s.onDataDisposer?.();
        s.term.dispose();
        sessionRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resize observer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const ro = new ResizeObserver(() => {
      const s = sessionRef.current;
      if (!s) return;
      try {
        s.fit.fit();
      } catch {
        /* noop */
      }
      // Tell the remote PTY about the new viewport so line wrapping and
      // full-screen apps (vim/top) stay correct.
      if (s.pty?.isOpen) {
        try {
          s.pty.resize(s.term.cols, s.term.rows);
        } catch {
          /* ignore */
        }
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // When the panel becomes visible again, refit + refocus.
  useEffect(() => {
    if (!visible) return;
    const s = sessionRef.current;
    if (!s) return;
    try {
      s.fit.fit();
    } catch {
      /* noop */
    }
    s.term.focus();
  }, [visible]);

  // ── Theme swap ──────────────────────────────────────────────────────────
  useEffect(() => {
    const s = sessionRef.current;
    if (!s) return;
    s.term.options.theme = makeTheme(dark);
  }, [dark]);

  // ── Mirror agent-originated Redux lines into xterm ──────────────────────
  useEffect(() => {
    const s = sessionRef.current;
    if (!s) return;
    // When a real PTY is attached the daemon owns the screen — painting
    // over agent output would corrupt full-screen apps like vim. Bail
    // unconditionally; agent commands are still recorded in Redux and
    // can be inspected via the agent log views.
    if (s.pty?.isOpen) return;
    for (const line of reduxLines) {
      const id = parseLineId(line.id);
      if (id <= s.lastSeenLineId) continue;
      s.lastSeenLineId = id;
      if (line.tab !== "terminal" || line.source !== "agent") continue;

      // Clear pending prompt, render the agent output, then redraw prompt.
      s.term.write("\r\x1b[K");
      if (line.type === "command") {
        const cwd = line.cwd ? shortCwd(line.cwd) : "~";
        s.term.write(
          `${PURPLE}[agent]${RESET} ${PROMPT_GREEN}${cwd}${RESET} ${PROMPT_BLUE}❯${RESET} ${line.text}\r\n`,
        );
      } else if (line.type === "stdout") {
        s.term.write(ansiNormalize(line.text.replace(/\r?\n$/, "")) + "\r\n");
      } else if (line.type === "stderr") {
        s.term.write(
          `${RED}${ansiNormalize(line.text.replace(/\r?\n$/, ""))}${RESET}\r\n`,
        );
      } else {
        const text =
          line.exitCode !== undefined ? `exit ${line.exitCode}` : line.text;
        s.term.write(`${DIM}${text}${RESET}\r\n`);
      }
      writePromptFor(s);
    }
  }, [reduxLines, writePromptFor]);

  const handleClear = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    s.term.clear();
    dispatch(clearLines("terminal"));
    if (!s.pty?.isOpen) writePromptFor(s);
  }, [dispatch, writePromptFor]);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col bg-white dark:bg-[#1e1e1e]",
        !visible && "hidden",
        className,
      )}
    >
      <div
        ref={containerRef}
        className="h-full min-h-0 w-full overflow-hidden px-1 pt-1"
        onClick={() => sessionRef.current?.term.focus()}
      />
      {ready && (
        <button
          type="button"
          aria-label="Clear terminal"
          title="Clear terminal (Ctrl+L)"
          onClick={handleClear}
          disabled={executing}
          className="absolute right-2 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-sm text-neutral-500 opacity-0 transition-opacity hover:bg-neutral-800/60 hover:text-neutral-200 hover:opacity-100 focus:opacity-100 disabled:opacity-30"
        >
          <ClearIcon />
        </button>
      )}
    </div>
  );
};

function ClearIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

function shortCwd(cwd: string): string {
  if (!cwd) return "~";
  const home = "/home/agent";
  if (cwd === home) return "~";
  if (cwd.startsWith(`${home}/`)) return `~/${cwd.slice(home.length + 1)}`;
  return cwd;
}

function ansiNormalize(text: string): string {
  return text.replace(/\r?\n/g, "\r\n");
}

function parseLineId(id: string | undefined): number {
  if (!id) return 0;
  const m = id.match(/^line-(\d+)$/);
  return m ? Number.parseInt(m[1], 10) : 0;
}

function makeTheme(dark: boolean) {
  return dark
    ? {
        background: "#1e1e1e",
        foreground: "#e4e4e7",
        cursor: "#e4e4e7",
        cursorAccent: "#1e1e1e",
        black: "#1e1e1e",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#facc15",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#e5e7eb",
        brightBlack: "#52525b",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fde047",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#f4f4f5",
        selectionBackground: "#3b82f6",
      }
    : {
        background: "#ffffff",
        foreground: "#18181b",
        cursor: "#18181b",
        cursorAccent: "#ffffff",
        black: "#18181b",
        red: "#b91c1c",
        green: "#15803d",
        yellow: "#b45309",
        blue: "#1d4ed8",
        magenta: "#7c3aed",
        cyan: "#0e7490",
        white: "#d4d4d8",
        brightBlack: "#71717a",
        brightRed: "#dc2626",
        brightGreen: "#16a34a",
        brightYellow: "#d97706",
        brightBlue: "#2563eb",
        brightMagenta: "#9333ea",
        brightCyan: "#0891b2",
        brightWhite: "#a1a1aa",
        selectionBackground: "#93c5fd",
      };
}
