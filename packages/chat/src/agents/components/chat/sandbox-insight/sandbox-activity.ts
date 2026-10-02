/**
 * Sandbox activity rows — the pure normalizer behind the chat Sandbox panel's
 * "Activity" tab.
 *
 * The panel does not open a second data path. Every row is derived from tool
 * calls the conversation ALREADY has: the live `ToolLifecycleEntry` map that
 * the message thread renders from while a turn streams, and the persisted
 * `cx_tool_call` rows the observability slice loads for a reloaded turn. Both
 * collapse into one row shape here so a running command and a command from an
 * hour ago read identically — the thing that makes a feed a feed.
 *
 * No React, no Redux: this file is the unit under test.
 */

import type { CxToolCallRecord } from "@/features/agents/redux/execution-system/observability/observability.slice";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

/**
 * Tools that act INSIDE the bound box. Anything else the agent does (a web
 * search, a DB read) belongs to the transcript, not to the sandbox view —
 * mixing them would make the panel a second, worse transcript.
 *
 * `shell_*` covers `shell_execute` / `shell_python`; `code_execute_python` is
 * the same "a process ran in the box" class under a different name (aidream
 * gives all three the one `shell_execution` result shape), so it is named
 * explicitly rather than left to fall off the filter.
 */
const EXACT_SANDBOX_TOOLS = new Set([
  "git_ingest",
  "github_repositories",
  "code_execute_python",
]);

export function isSandboxTool(toolName: string | null | undefined): boolean {
  if (!toolName) return false;
  // Bundled tools arrive as "<bundle>:<tool>"; the canonical leaf is what the
  // registry and this filter both key on.
  const leaf = toolName.includes(":")
    ? (toolName.split(":").pop() ?? toolName)
    : toolName;
  return (
    leaf.startsWith("fs_") ||
    leaf.startsWith("shell_") ||
    EXACT_SANDBOX_TOOLS.has(leaf)
  );
}

export type SandboxActivityStatus = "running" | "ok" | "failed";

export interface SandboxActivityRow {
  callId: string;
  toolName: string;
  /** The one fact the reader came for: the command, or the path. */
  subject: string | null;
  status: SandboxActivityStatus;
  /** Process exit code when the result carries one. */
  exitCode: number | null;
  /** Where the command actually ran, when the result says so. */
  backend: string | null;
  durationMs: number | null;
  /** stdout/stderr, or a readable rendering of a non-process result. */
  output: string | null;
  /** Error message for a transport-level failure (no output at all). */
  errorMessage: string | null;
  startedAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The subject line: a command for a shell tool, a path for a filesystem one. */
export function activitySubject(
  args: Record<string, unknown> | null | undefined,
): string | null {
  if (!args) return null;
  return (
    str(args.command) ??
    str(args.code) ??
    str(args.script) ??
    str(args.path) ??
    str(args.file_path) ??
    str(args.repo_url) ??
    str(args.query) ??
    null
  );
}

/**
 * Pull the process facts out of a tool result. The `shell_execution` shape is
 * read defensively — the result may still be a string mid-stream, and a
 * filesystem result carries none of these fields at all.
 */
function readProcessFacts(result: unknown): {
  exitCode: number | null;
  backend: string | null;
  output: string | null;
} {
  if (typeof result === "string") {
    return { exitCode: null, backend: null, output: result || null };
  }
  if (!isRecord(result)) {
    return { exitCode: null, backend: null, output: null };
  }
  const stdout = str(result.stdout);
  const stderr = str(result.stderr);
  const joined =
    stdout && stderr ? `${stdout}\n${stderr}` : (stdout ?? stderr ?? null);
  return {
    exitCode: num(result.exit_code),
    backend: str(result.backend),
    output: joined ?? str(result.content) ?? null,
  };
}

function liveStatus(entry: ToolLifecycleEntry): SandboxActivityStatus {
  if (entry.status === "error") return "failed";
  if (entry.status === "completed") return "ok";
  return "running";
}

function durationFrom(
  startedAt: string | null,
  completedAt: string | null,
): number | null {
  if (!startedAt || !completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/** One live in-flight (or just-finished) tool call → an activity row. */
export function rowFromLifecycle(
  entry: ToolLifecycleEntry,
): SandboxActivityRow {
  const facts = readProcessFacts(entry.result);
  // A nonzero exit code is a RESULT, not a transport error — the backend
  // returns success=false with the payload. The row must say "failed" for it,
  // otherwise a command that did not work reads as one that did.
  const status =
    facts.exitCode !== null && facts.exitCode !== 0
      ? "failed"
      : liveStatus(entry);
  return {
    callId: entry.callId,
    toolName: entry.toolName,
    subject: activitySubject(entry.arguments),
    status,
    exitCode: facts.exitCode,
    backend: facts.backend,
    durationMs: durationFrom(entry.startedAt, entry.completedAt),
    output: facts.output ?? entry.resultPreview ?? null,
    errorMessage: entry.errorMessage,
    startedAt: entry.startedAt ?? null,
  };
}

/** One persisted `cx_tool_call` row → an activity row. */
export function rowFromRecord(record: CxToolCallRecord): SandboxActivityRow {
  let parsed: unknown = record.output;
  if (typeof record.output === "string") {
    try {
      parsed = JSON.parse(record.output);
    } catch {
      parsed = record.output;
    }
  }
  const facts = readProcessFacts(parsed);
  const failed = record.isError === true || record.status === "failed";
  const status: SandboxActivityStatus =
    facts.exitCode !== null && facts.exitCode !== 0
      ? "failed"
      : failed
        ? "failed"
        : record.status === "completed"
          ? "ok"
          : "running";
  return {
    callId: record.callId,
    toolName: record.toolName,
    subject: activitySubject(
      isRecord(record.arguments) ? record.arguments : null,
    ),
    status,
    exitCode: facts.exitCode,
    backend: facts.backend,
    durationMs: num(record.durationMs),
    output: facts.output,
    errorMessage: record.errorMessage,
    startedAt: record.startedAt ?? null,
  };
}

/**
 * The feed: persisted rows and live entries merged, sandbox tools only,
 * oldest → newest, one row per callId (a live entry wins over its persisted
 * twin — it is the fresher copy of the same call).
 */
export function buildSandboxActivity(
  records: readonly CxToolCallRecord[],
  live: ReadonlyMap<string, ToolLifecycleEntry> | null,
): SandboxActivityRow[] {
  const byCallId = new Map<string, SandboxActivityRow>();
  for (const record of records) {
    if (!isSandboxTool(record.toolName)) continue;
    byCallId.set(record.callId, rowFromRecord(record));
  }
  if (live) {
    for (const entry of live.values()) {
      if (!isSandboxTool(entry.toolName)) continue;
      byCallId.set(entry.callId, rowFromLifecycle(entry));
    }
  }
  return [...byCallId.values()].sort((a, b) => {
    const at = a.startedAt ?? "";
    const bt = b.startedAt ?? "";
    if (at < bt) return -1;
    if (at > bt) return 1;
    return 0;
  });
}
