"use client";

import "@/styles/terminal-host.css";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createLineEditor } from "@ai-matrx/terminal";
import type { LineEditor } from "@ai-matrx/terminal";
import { Terminal } from "@ai-matrx/terminal/react";
import type { TerminalHandle, TerminalSize } from "@ai-matrx/terminal/react";
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

type XtermTerminal = TerminalHandle["xterm"];

interface SessionState {
  term: XtermTerminal;
  /** Read-line emulation when no PTY is attached (prompt, editing, history, paste queue). */
  editor: LineEditor;
  /** Latest Redux line id rendered into xterm (for agent-line mirroring). */
  lastSeenLineId: number;
  /** Live PTY handle when the adapter supports it; xterm is attached
   *  directly to it and the read-line emulation below is bypassed. */
  pty: PtyHandle | null;
  /** Disposable for the current keystroke sink so we can swap it when the
   *  PTY connects/disconnects without leaking handlers. */
  onDataDisposer: (() => void) | null;
  /** When a streaming `runCommand` is in flight, this aborts the SSE
   *  request and tells the orchestrator to SIGTERM the underlying
   *  process. Cleared back to null when the command finishes. */
  runAbort: AbortController | null;
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

  const sessionRef = useRef<SessionState | null>(null);
  const [handle, setHandle] = useState<TerminalHandle | null>(null);
  /** Where keystrokes go right now: read-line emulation, or straight into a live PTY. */
  const dataSinkRef = useRef<((data: string) => void) | null>(null);
  const listen = useCallback((sink: (data: string) => void) => {
    dataSinkRef.current = sink;
    return {
      dispose: () => {
        if (dataSinkRef.current === sink) dataSinkRef.current = null;
      },
    };
  }, []);
  const historyRef = useRef(history);
  const processRef = useRef(process);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    processRef.current = process;
  }, [process]);

  const [ready, setReady] = useState(false);
  // The mobile disclosure keeps this component mounted while its host is
  // hidden. Boot once on its first real reveal, then retain that PTY/session
  // across later disclosure closes.
  const [hasBeenVisible, setHasBeenVisible] = useState(visible);

  useEffect(() => {
    if (visible) setHasBeenVisible(true);
  }, [visible]);

  /** The emulated prompt: the adapter's cwd, the way a shell would show it. */
  const promptText = useCallback(
    () => `${PROMPT_GREEN}${shortCwd(processRef.current.cwd)}${RESET} ${PROMPT_BLUE}❯${RESET} `,
    [],
  );

  /** The latest runCommand, for the line editor created once at boot. */
  const runCommandRef = useRef<
    ((state: SessionState, command: string) => Promise<void>) | null
  >(null);

  const runCommand = useCallback(
    async (state: SessionState, command: string) => {
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
          let result;
          try {
            result = await adapter.stream(
              command,
              (event) => {
                // Write stdout and stderr the same way. stderr ≠ error —
                // git/npm/docker put progress on stderr by design. Only the
                // catch path below paints red (real exec-layer failures).
                // Programs that want color emit their own ANSI.
                if (
                  (event.type === "stdout" || event.type === "stderr") &&
                  event.text
                ) {
                  state.term.write(ansiNormalize(event.text));
                }
                // `info` and `exit` events are summarised after the await
                // resolves so we render a single trailing exit line.
              },
              { signal: ac.signal, env: baseEnv },
            );
          } catch (streamError) {
            if (ac.signal.aborted) throw streamError;
            state.term.write(
              `${RED}[live stream unavailable: ${extractErrorMessage(streamError)}; using buffered command execution]${RESET}\r\n`,
            );
            result = await adapter.exec(command, { env: baseEnv });
            if (result.stdout) state.term.write(ansiNormalize(result.stdout));
            if (result.stderr) state.term.write(ansiNormalize(result.stderr));
          }
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
            state.term.write(ansiNormalize(result.stderr));
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
        state.runAbort = null;
        dispatch(setExecuting(false));
        // Prompt again, then run the next line of a multi-line paste, if any.
        state.editor.done();
      }
    },
    [dispatch],
  );

  // Keep the ref in sync so the editor (created once at boot) always runs the
  // current `runCommand`.
  useEffect(() => {
    runCommandRef.current = runCommand;
  }, [runCommand]);

  // ── Boot the session once the package terminal is up ────────────────────
  // @ai-matrx/terminal owns xterm itself: creation, fit, refit on reveal (its resize observer
  // sees the hidden box get a size), theme, touch and the phone keyboard bar. This component
  // owns only what it drives: read-line emulation or a live PTY.
  useEffect(() => {
    if (!handle) return undefined;
    let cancelled = false;

    const boot = () => {
      const term = handle.xterm;
      // The editor's handlers reach the session through this cell; it is set right below.
      const self: { session: SessionState | null } = { session: null };
      const editor = createLineEditor({
        write: (data) => term.write(data),
        prompt: promptText,
        history: () => historyRef.current,
        onSubmit: (command) => {
          if (self.session) void runCommandRef.current?.(self.session, command);
        },
        // Ctrl-C while a streamed command runs: abort the SSE so the orchestrator SIGTERMs it.
        onInterrupt: () => self.session?.runAbort?.abort(),
        onClearScreen: () => term.clear(),
      });
      const session: SessionState = {
        term,
        editor,
        lastSeenLineId: parseLineId(reduxLines[reduxLines.length - 1]?.id),
        pty: null,
        onDataDisposer: null,
        runAbort: null,
      };
      self.session = session;
      sessionRef.current = session;

      // Default wiring: read-line emulation on top of `process.exec()`.
      // If the active adapter supports a real PTY, we'll swap this out
      // below.
      const bufferedListener = listen((data) => session.editor.input(data));
      session.onDataDisposer = () => bufferedListener.dispose();

      const expectsPty = Boolean(processRef.current.openPty);
      term.options.disableStdin = expectsPty;

      term.write(
        `${BOLD}Matrx Terminal${RESET}${DIM} — ${processRef.current.isReady ? "connected" : "no process adapter"}${RESET}\r\n`,
      );
      if (expectsPty) {
        term.write(`${DIM}[connecting interactive terminal…]${RESET}`);
      } else {
        session.editor.prompt();
      }
      setReady(true);

      // Try to upgrade to a real PTY in the background. If the adapter
      // doesn't expose `openPty` (Mock) or the WebSocket can't connect
      // fails, we visibly retain the buffered fallback.
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
            state.editor.prompt();
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
        if (!handle.isOpen) {
          throw new Error("PTY connection closed during terminal attachment");
        }
        // Publish the handle before replacing the input listener. If the
        // socket closes after this synchronous block, onExit can now restore
        // buffered input instead of leaving xterm wired to a dead handle.
        state.pty = handle;
        // Tear down the buffered listener and route keystrokes straight to
        // the PTY. The remote daemon owns line editing, history, signal
        // handling, and prompt rendering from this point.
        state.onDataDisposer?.();
        const liveListener = listen((data) => handle.write(data));
        state.onDataDisposer = () => liveListener.dispose();
        term.options.disableStdin = false;
        // Clear the connecting marker before the daemon emits its prompt.
        term.write("\r\x1b[K");
      } catch (error) {
        term.options.disableStdin = false;
        term.write(
          `\r\x1b[K${RED}[interactive PTY unavailable: ${extractErrorMessage(error)}; using buffered terminal]${RESET}\r\n`,
        );
        state.editor.prompt();
      }
    };

    /** Restore buffered read-line emulation after a PTY drops. */
    const detachPty = (state: SessionState) => {
      state.pty?.close();
      state.pty = null;
      state.term.options.disableStdin = false;
      state.onDataDisposer?.();
      const bufferedListener = listen((data) => state.editor.input(data));
      state.onDataDisposer = () => bufferedListener.dispose();
    };

    boot();

    return () => {
      cancelled = true;
      const s = sessionRef.current;
      if (s) {
        // Abort any in-flight stream so the orchestrator stops the
        // process and doesn't leak compute when the user navigates away.
        s.runAbort?.abort();
        s.pty?.close();
        s.onDataDisposer?.();
        sessionRef.current = null;
      }
    };
    // Boots once per terminal; the handlers read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  // A tab switch back to the terminal puts the cursor in it.
  useEffect(() => {
    if (visible && handle) handle.focus();
  }, [visible, handle]);

  /** Hardware Ctrl-C: the PTY's explicit SIGINT (page shortcuts may eat the key), else emulation. */
  const onInterrupt = useCallback((): boolean => {
    const s = sessionRef.current;
    if (!s) return false;
    if (s.pty?.isOpen) s.pty.signal("SIGINT");
    else s.editor.input("\x03");
    return true;
  }, []);

  /** The remote PTY follows the visible grid so wrapping and full-screen apps stay right. */
  const onResize = useCallback((size: TerminalSize) => {
    const s = sessionRef.current;
    if (!s?.pty?.isOpen) return;
    try {
      s.pty.resize(size.cols, size.rows);
    } catch {
      /* connection changed while fitting */
    }
  }, []);

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
      } else if (line.type === "stdout" || line.type === "stderr") {
        // Same as live exec: do not force-red stderr (progress ≠ failure).
        s.term.write(ansiNormalize(line.text.replace(/\r?\n$/, "")) + "\r\n");
      } else {
        const text =
          line.exitCode !== undefined ? `exit ${line.exitCode}` : line.text;
        s.term.write(`${DIM}${text}${RESET}\r\n`);
      }
      s.editor.prompt();
    }
  }, [reduxLines]);

  const handleClear = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    s.term.clear();
    dispatch(clearLines("terminal"));
    if (!s.pty?.isOpen) s.editor.refresh();
  }, [dispatch]);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col bg-white dark:bg-[#1e1e1e]",
        !visible && "hidden",
        className,
      )}
    >
      {hasBeenVisible ? (
        <div className="h-full min-h-0 w-full overflow-hidden pt-1" onClick={() => handle?.focus()}>
          <Terminal
            theme={dark ? "dark" : "light"}
            fontSize={12.5}
            lineHeight={1.25}
            padding={4}
            convertEol
            aria-label="Terminal"
            onReady={setHandle}
            onData={(data) => dataSinkRef.current?.(data)}
            onResize={onResize}
            onInterrupt={onInterrupt}
          />
        </div>
      ) : null}
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
