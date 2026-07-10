"use client";

/**
 * SimpleTerminal — mirrors the working `/sandbox/[id]` terminal exactly.
 *
 * No xterm, no adapter abstraction, no PTY upgrade. An `<input>` for
 * command entry + a scrollable log of past commands and output. Hits
 * `/api/sandbox/{sandboxId}/exec` (buffered JSON, same as the sandbox
 * detail page) with `sandboxId` baked in at construction time.
 *
 * Why buffered instead of streaming:
 *   The streaming `/exec/stream` endpoint was tried first but silently
 *   produced no output when the SSE connection completed with zero events
 *   (HTTP 200, empty body) — a realistic orchestrator behaviour that the
 *   former SSE fallback didn't catch. The buffered endpoint is battle-tested
 *   on the `/sandbox/[id]` detail page and always returns a full JSON
 *   response with stdout/stderr/exit_code/cwd.
 *
 * Each instance is bound to one sandbox id and one command history. Multi-
 * terminal works by mounting multiple SimpleTerminals (each with a unique
 * key), and each one talks to the same orchestrator endpoint over its own
 * fetch lifecycle. No shared state, no race conditions.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Check, Trash2, Square as StopIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";

type LineKind = "command" | "stdout" | "stderr" | "info" | "error";

interface TerminalLine {
  id: number;
  kind: LineKind;
  text: string;
  cwd?: string;
  exitCode?: number;
}

interface SimpleTerminalProps {
  /**
   * Sandbox row UUID. When `null`, the terminal renders a friendly
   * "no sandbox connected" message instead of an input.
   */
  sandboxId: string | null;
  /**
   * Whether the terminal is currently visible. When false we skip the
   * autofocus / autoscroll work so the hidden instance doesn't fight the
   * active one for focus.
   */
  visible?: boolean;
  className?: string;
}

let lineIdCounter = 0;
const nextLineId = () => ++lineIdCounter;

export const SimpleTerminal: React.FC<SimpleTerminalProps> = ({
  sandboxId,
  visible = true,
  className,
}) => {
  const [history, setHistory] = useState<TerminalLine[]>([]);
  const [commandInput, setCommandInput] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [executing, setExecuting] = useState(false);
  const [cwd, setCwd] = useState<string>("/home/agent");
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom when new output arrives.
  useEffect(() => {
    if (!visible) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, visible]);

  // Refocus input when becoming visible (matches `/sandbox/[id]`'s pattern).
  // Use double RAF to ensure DOM is fully ready after panel expansion in complex layouts.
  useEffect(() => {
    if (!visible) return;
    // Double RAF ensures the input is fully rendered and ready to receive focus,
    // especially important when the terminal panel expands from collapsed state.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    });
  }, [visible]);

  const appendLine = useCallback((line: Omit<TerminalLine, "id">) => {
    setHistory((prev) => [...prev, { id: nextLineId(), ...line }]);
  }, []);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const handleClear = useCallback(() => {
    setHistory([]);
  }, []);

  const handleCopyAll = useCallback(async () => {
    const text = history
      .map((line) => {
        if (line.kind === "command") return `$ ${line.text}`;
        if (line.kind === "stderr") return `[stderr] ${line.text}`;
        if (line.kind === "error") return `[error] ${line.text}`;
        return line.text;
      })
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — silent */
    }
  }, [history]);

  const handleExec = useCallback(async () => {
    if (!sandboxId) return;
    const cmd = commandInput.trim();
    if (!cmd || executing) return;

    setCommandInput("");
    setHistoryIndex(-1);
    setCommandHistory((prev) => {
      // Don't push an exact-duplicate of the most recent command.
      if (prev[prev.length - 1] === cmd) return prev;
      return [...prev, cmd];
    });
    appendLine({ kind: "command", text: cmd, cwd });
    setExecuting(true);

    const ac = new AbortController();
    abortRef.current = ac;

    // Use buffered exec — same approach as the working `/sandbox/[id]` page.
    // Streaming was tried first previously but silently produced no output
    // when the SSE stream connected (HTTP 200) but sent zero events before
    // closing, which is a realistic orchestrator behaviour. Buffered exec is
    // synchronous, always returns a JSON response, and is battle-tested.
    try {
      await execBuffered(sandboxId, cmd, appendLine, setCwd, ac.signal);
    } catch (err) {
      const aborted =
        (err instanceof DOMException && err.name === "AbortError") ||
        ac.signal.aborted;
      if (aborted) {
        appendLine({ kind: "info", text: "(cancelled)" });
      } else {
        appendLine({ kind: "error", text: extractErrorMessage(err) });
      }
    } finally {
      abortRef.current = null;
      setExecuting(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [appendLine, commandInput, cwd, executing, sandboxId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void handleExec();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (commandHistory.length === 0) return;
        const next = Math.min(commandHistory.length - 1, historyIndex + 1);
        setHistoryIndex(next);
        setCommandInput(commandHistory[commandHistory.length - 1 - next] ?? "");
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIndex <= 0) {
          setHistoryIndex(-1);
          setCommandInput("");
          return;
        }
        const next = historyIndex - 1;
        setHistoryIndex(next);
        setCommandInput(commandHistory[commandHistory.length - 1 - next] ?? "");
        return;
      }
      if (e.key === "c" && (e.ctrlKey || e.metaKey) && executing) {
        // Allow Ctrl-C / Cmd-C to cancel running commands. The browser's
        // default copy-on-Cmd-C still works when no command is running.
        e.preventDefault();
        handleStop();
      }
    },
    [commandHistory, executing, handleExec, handleStop, historyIndex],
  );

  if (!sandboxId) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center px-6 text-center text-[12px] text-neutral-500 dark:text-neutral-400",
          className,
        )}
      >
        <div className="space-y-1">
          <p>No sandbox connected.</p>
          <p className="text-[11px]">
            Pick one from the Sandboxes activity bar on the left.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-white text-[12px] dark:bg-neutral-950",
        className,
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Toolbar */}
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-neutral-200 px-2 text-[11px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        <span className="font-mono truncate" title={`cwd: ${cwd}`}>
          {cwd}
        </span>
        <div className="flex items-center gap-0.5">
          {executing && (
            <button
              type="button"
              onClick={handleStop}
              title="Stop running command (Ctrl+C)"
              className="flex h-5 w-5 items-center justify-center rounded-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
            >
              <StopIcon size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={handleCopyAll}
            disabled={history.length === 0}
            title="Copy all output"
            className="flex h-5 w-5 items-center justify-center rounded-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            {copied ? (
              <Check size={12} className="text-emerald-500" />
            ) : (
              <Copy size={12} />
            )}
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={history.length === 0}
            title="Clear terminal"
            className="flex h-5 w-5 items-center justify-center rounded-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Scrollback */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono leading-snug"
      >
        {history.length === 0 ? (
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Type a shell command and press Enter. Use ↑/↓ for history, Ctrl+C to
            cancel a running command.
          </p>
        ) : (
          history.map((line) => (
            <div key={line.id} className="whitespace-pre-wrap break-words">
              {line.kind === "command" ? (
                <span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {line.cwd ?? cwd}
                  </span>{" "}
                  <span className="text-blue-600 dark:text-blue-400">❯</span>{" "}
                  <span className="text-neutral-900 dark:text-neutral-100">
                    {line.text}
                  </span>
                </span>
              ) : line.kind === "error" ? (
                <span className="text-red-600 dark:text-red-400">
                  {line.text}
                </span>
              ) : line.kind === "stderr" ? (
                // stderr is a stream, not a failure signal — git/npm progress
                // lands here on success. Keep default text color; only
                // `error` (exec-layer failures) should look alarming.
                <span className="text-neutral-800 dark:text-neutral-200">
                  {line.text}
                </span>
              ) : line.kind === "info" ? (
                <span className="text-neutral-500 dark:text-neutral-400">
                  {line.text}
                </span>
              ) : (
                <span className="text-neutral-800 dark:text-neutral-200">
                  {line.text}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input row */}
      <div className="flex shrink-0 items-center gap-2 border-t border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
        <span className="font-mono text-emerald-600 dark:text-emerald-400">
          {cwd}
        </span>
        <span className="font-mono text-blue-600 dark:text-blue-400">❯</span>
        <input
          ref={inputRef}
          type="text"
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={executing}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          placeholder={executing ? "Running…" : ""}
          className="flex-1 bg-transparent font-mono text-neutral-900 outline-none placeholder:text-neutral-400 disabled:opacity-50 dark:text-neutral-100 dark:placeholder:text-neutral-600"
        />
      </div>
    </div>
  );
};

// =============================================================================
// Buffered fallback — same shape as `/sandbox/[id]`'s handleExec.
// =============================================================================

async function execBuffered(
  sandboxId: string,
  command: string,
  appendLine: (line: Omit<TerminalLine, "id">) => void,
  setCwd: (cwd: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch(
    `/api/sandbox/${encodeURIComponent(sandboxId)}/exec`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, timeout: 60 }),
      signal,
    },
  );
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => resp.statusText);
    appendLine({
      kind: "error",
      text: `exec failed (${resp.status}): ${errBody}`,
    });
    return;
  }
  const result = (await resp.json()) as {
    stdout: string;
    stderr: string;
    exit_code: number;
    cwd?: string;
  };
  if (result.cwd) setCwd(result.cwd);
  if (result.stdout) appendLine({ kind: "stdout", text: result.stdout });
  if (result.stderr) appendLine({ kind: "stderr", text: result.stderr });
  if (result.exit_code !== 0 && !result.stdout && !result.stderr) {
    appendLine({
      kind: "info",
      text: `(exit code ${result.exit_code})`,
      exitCode: result.exit_code,
    });
  }
  // AbortError propagates to the caller's catch block — do not swallow it here.
}

export default SimpleTerminal;
