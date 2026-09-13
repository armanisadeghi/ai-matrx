"use client";

/**
 * ShellInline — the human renderer for the process-execution tools
 * (`shell_execute`, `shell_python`, `code_execute_python`).
 *
 * Until now these fell to `GenericRenderer`, which dumps `stdout` /
 * `stderr` / `exit_code` / `backend` / `cwd` / `log_path` as six equal-weight
 * key/value rows — so the reader of a chat had to hunt a key/value table to
 * learn whether the command they just watched an agent run actually worked.
 * This is the `fs_*` "OUCH" fix applied to the one family that still had it.
 *
 * THE READER'S QUESTION: *what ran, where, and did it work?*
 *   • The command IS the headline, monospace, at a terminal's weight.
 *   • Exit code is a chip, and a nonzero one is red — a failed run is a
 *     RESULT (the backend returns the payload with success=false), so it must
 *     never read like a success.
 *   • Output is a bounded terminal block: the last `TAIL_LINES` lines by
 *     default with a "Show all N lines" control, because the tail is where a
 *     command's verdict lives. stderr is tinted, never hidden.
 *   • The BACKEND is always named. `sandbox` = the bound container;
 *     `host` = aidream's scoped workspace; `durable_vfs` = the in-process
 *     coreutils emulator — which is NOT the user's sandbox. A routing defect
 *     has silently sent a sandbox-bound conversation to the emulator before,
 *     and neither the agent nor the operator could tell. That case gets a
 *     loud red badge saying so, with the remedy, rather than a quiet word.
 *
 * Shapes are read DEFENSIVELY: an unrecognised payload falls through to
 * <GenericRenderer> — never a wrong guess.
 */

import React from "react";
import { AlertTriangle, SquareTerminal } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ToolRendererProps } from "../../types";
import { getArg, isTerminal, resultAsObject } from "../_shared";
import { GenericRenderer } from "../../registry/GenericRenderer";
import { ToolErrorCard } from "../../result-fields/ToolErrorCard";
import { ToolResultCard } from "../_shared-entity/ToolResultCard";
import type { ToolResultCardProps } from "../_shared-entity/ToolResultCard";

/** How much output the collapsed view shows before offering the rest. */
export const TAIL_LINES = 12;

/**
 * The wording for a result that ran somewhere other than the box the user
 * believes is bound. Exported so the guard asserts the exact sentence a
 * reader sees, not a paraphrase of it.
 */
export const DURABLE_VFS_BADGE_TEXT = "not your sandbox — binding was lost";

const SHELL_ICON_TINT = "text-slate-600 dark:text-slate-300";

type ShellCardProps = Pick<
  ToolResultCardProps,
  "expanded" | "onToggleExpanded" | "onOpenWindowPanel" | "onOpenOverlay"
>;

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  backend: string | null;
  cwd: string | null;
  truncated: boolean;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Narrow the `shell_execution` payload. Returns null when the result carries
 * none of the process fields — that is a shape we do not understand, and the
 * generic floor is the honest answer for it.
 */
export function asProcessResult(
  result: Record<string, unknown> | null,
): ProcessResult | null {
  if (!result) return null;
  const hasProcessShape =
    "stdout" in result || "stderr" in result || "exit_code" in result;
  if (!hasProcessShape) return null;
  return {
    stdout: str(result.stdout),
    stderr: str(result.stderr),
    exitCode:
      typeof result.exit_code === "number" && Number.isFinite(result.exit_code)
        ? result.exit_code
        : null,
    backend: typeof result.backend === "string" ? result.backend : null,
    cwd: typeof result.cwd === "string" ? result.cwd : null,
    truncated:
      result.stdout_truncated === true || result.stderr_truncated === true,
  };
}

/** A single-line, muted fact chip. Text only — the house rule bans tiles. */
const Chip: React.FC<{ children: React.ReactNode; tone?: "ok" | "bad" }> = ({
  children,
  tone,
}) => (
  <span
    className={cn(
      "text-xs tabular-nums",
      tone === "bad"
        ? "font-medium text-red-600 dark:text-red-400"
        : "text-muted-foreground",
    )}
  >
    {children}
  </span>
);

/**
 * The loud badge for a command that ran in the durable-VFS emulator rather
 * than the bound container. Never quiet: the whole point is that the silent
 * version of this cost an operator an afternoon.
 */
export const DurableVfsWarning: React.FC = () => (
  <div
    role="alert"
    data-testid="shell-durable-vfs-warning"
    className="flex items-start gap-2 border-t border-red-500/30 bg-red-50 px-4 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
  >
    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
    <span>
      <span className="font-semibold">
        Ran in the durable file store — {DURABLE_VFS_BADGE_TEXT}.
      </span>{" "}
      This emulator has no git, no loops and no shell redirection, so results
      can differ from the container. Re-attach a running sandbox from the chat
      input&apos;s sandbox control and run the command again.
    </span>
  </div>
);

/** Bounded terminal output: tail by default, full on request. */
const OutputBlock: React.FC<{
  text: string;
  stream: "stdout" | "stderr";
}> = ({ text, stream }) => {
  const [showAll, setShowAll] = React.useState(false);
  const lines = text.replace(/\n+$/, "").split("\n");
  const hidden = Math.max(0, lines.length - TAIL_LINES);
  const shown = showAll || hidden === 0 ? lines : lines.slice(-TAIL_LINES);

  return (
    <div className="border-t border-border/30">
      {hidden > 0 && (
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            setShowAll((v) => !v);
          }}
          className="flex w-full items-center px-4 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {showAll
            ? `Show last ${TAIL_LINES} lines`
            : `Show all ${lines.length} lines`}
        </button>
      )}
      <pre
        className={cn(
          // `overflow-x-auto` on the block itself: a long line scrolls HERE
          // and never widens the transcript (the 390px rule).
          "max-h-80 overflow-auto whitespace-pre px-4 py-2 font-mono text-xs leading-relaxed",
          stream === "stderr"
            ? "text-amber-700 dark:text-amber-400"
            : "text-foreground",
        )}
      >
        {shown.join("\n")}
      </pre>
    </div>
  );
};

const ShellResultCard: React.FC<
  { command: string; result: ProcessResult } & ShellCardProps
> = ({ command, result, ...shell }) => {
  const failed = result.exitCode !== null && result.exitCode !== 0;
  const sub = [
    result.exitCode !== null ? `exit ${result.exitCode}` : null,
    result.backend ? `ran in ${result.backend}` : null,
    result.cwd,
    result.truncated ? "output truncated" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ToolResultCard
      icon={SquareTerminal}
      iconClassName={SHELL_ICON_TINT}
      title={command || "Command"}
      sub={sub || null}
      headerAction={
        result.exitCode !== null ? (
          <Chip tone={failed ? "bad" : undefined}>
            {failed ? `exit ${result.exitCode}` : "exit 0"}
          </Chip>
        ) : undefined
      }
      {...shell}
    >
      <div>
        {result.backend === "durable_vfs" && <DurableVfsWarning />}
        {result.stdout.trim() !== "" && (
          <OutputBlock text={result.stdout} stream="stdout" />
        )}
        {result.stderr.trim() !== "" && (
          <OutputBlock text={result.stderr} stream="stderr" />
        )}
        {result.stdout.trim() === "" && result.stderr.trim() === "" && (
          <p className="border-t border-border/30 px-4 py-2 text-xs text-muted-foreground">
            No output.
          </p>
        )}
      </div>
    </ToolResultCard>
  );
};

export const ShellInline: React.FC<ToolRendererProps> = (props) => {
  const {
    entry,
    onOpenOverlay,
    onOpenWindowPanel,
    toolGroupId,
    expanded,
    onToggleExpanded,
  } = props;

  if (entry.status === "error") {
    return (
      <ToolErrorCard
        entry={entry}
        onOpenOverlay={onOpenOverlay}
        toolGroupId={toolGroupId}
      />
    );
  }
  // Not terminal — the shell line shimmers with the intent; nothing yet.
  if (!isTerminal(entry)) return null;

  const result = asProcessResult(resultAsObject(entry));
  if (!result) return <GenericRenderer {...props} />;

  const command =
    getArg<string>(entry, "command") ||
    getArg<string>(entry, "code") ||
    getArg<string>(entry, "script") ||
    "";

  return (
    <ShellResultCard
      command={command}
      result={result}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      onOpenWindowPanel={onOpenWindowPanel ? () => onOpenWindowPanel() : undefined}
      onOpenOverlay={onOpenOverlay ? () => onOpenOverlay() : undefined}
    />
  );
};

export default ShellInline;
