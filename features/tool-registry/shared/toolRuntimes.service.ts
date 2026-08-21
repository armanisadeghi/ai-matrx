"use client";

/**
 * Tool runtime ("runs on") lookup for the tool/bundle pickers.
 *
 * A tool's executor bindings (`tool.binding`) say WHERE it runs: on the server,
 * in the web app UI, in the Chrome extension, in the desktop app, or on an MCP
 * server. The pickers use this to label each tool so nobody assigns a
 * client-only tool (e.g. a Chrome-extension loader) to an agent expecting it to
 * work in a plain chat. Labeling only — assignment is never blocked here:
 * agents are surface-independent and the server gates execution at runtime.
 *
 * Reads are public (RLS SELECT `true` on tool.binding) via the browser client.
 */

import { createClient } from "@/utils/supabase/client";
import { readAllRows } from "@/lib/supabase/readAllRows";

// ─── Executor name → runtime label ───────────────────────────────────────────

export type RuntimeBadgeLabel =
  | "Server"
  | "Web app"
  | "Chrome extension"
  | "Desktop app"
  | "MCP";

/** Client executors: the tool only runs when that client is attached to the conversation. */
const CLIENT_ONLY_EXECUTORS = new Set(["chrome-extension", "matrx-local"]);

export function executorRuntimeLabel(executorName: string): RuntimeBadgeLabel {
  if (executorName === "chrome-extension") return "Chrome extension";
  if (executorName === "matrx-local") return "Desktop app";
  if (executorName === "matrx-user") return "Web app";
  if (executorName.startsWith("mcp.")) return "MCP";
  // matrx-ai-core, aidream, and anything unrecognized run server-side.
  return "Server";
}

export interface ToolRuntimeInfo {
  /** Deduped labels in a stable order. `["Server"]` when there are no bindings
   * (a tool with no binding rows executes server-side by default). */
  badges: RuntimeBadgeLabel[];
  /** Set when the tool is bound ONLY to client executors (chrome-extension /
   * matrx-local) — a full "Only runs when …" sentence, else null. */
  clientOnlyNote: string | null;
}

const BADGE_ORDER: RuntimeBadgeLabel[] = [
  "Server",
  "Web app",
  "Chrome extension",
  "Desktop app",
  "MCP",
];

/** True when the executor list is non-empty and every executor is a client. */
export function isClientOnly(executorNames: string[]): boolean {
  return (
    executorNames.length > 0 &&
    executorNames.every((n) => CLIENT_ONLY_EXECUTORS.has(n))
  );
}

export function clientOnlyNoteFor(executorNames: string[]): string | null {
  if (!isClientOnly(executorNames)) return null;
  const hasChrome = executorNames.includes("chrome-extension");
  const hasDesktop = executorNames.includes("matrx-local");
  if (hasChrome && hasDesktop) {
    return "Only runs when the Chrome extension or desktop app is connected";
  }
  return hasChrome
    ? "Only runs when the Chrome extension is connected"
    : "Only runs when the desktop app is connected";
}

/** Badges + client-only warning for one tool's executor names. */
export function runtimeInfoForExecutors(
  executorNames: string[],
): ToolRuntimeInfo {
  const labels = new Set<RuntimeBadgeLabel>(
    executorNames.length > 0
      ? executorNames.map(executorRuntimeLabel)
      : ["Server"],
  );
  return {
    badges: BADGE_ORDER.filter((b) => labels.has(b)),
    clientOnlyNote: clientOnlyNoteFor(executorNames),
  };
}

// ─── Batched bindings read ───────────────────────────────────────────────────

// Module-scoped single-flight cache (same pattern as useAgentBundleOptions).
// tool.binding is a small, rarely-changing table (~300 rows), and the picker
// asks about the whole visible catalog anyway — so we read it ONCE to
// completion (readAllRows: a bare .select() silently caps at 1000 rows) and
// answer every per-tool lookup from the cached map for the session.
let cached: Map<string, string[]> | null = null;
let inFlight: Promise<Map<string, string[]>> | null = null;

async function loadAllBindings(): Promise<Map<string, string[]>> {
  const client = createClient();
  const rows = await readAllRows(
    ({ from, to }) =>
      client
        .schema("tool")
        .from("binding")
        .select("tool_id, executor_name, is_active", { count: "exact" })
        .order("tool_id", { ascending: true })
        .order("executor_name", { ascending: true })
        .range(from, to),
    { label: "tool.binding" },
  );
  const map = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.is_active) continue; // inactive bindings don't grant a runtime
    const arr = map.get(row.tool_id);
    if (arr) arr.push(row.executor_name);
    else map.set(row.tool_id, [row.executor_name]);
  }
  return map;
}

/**
 * The full toolId → active-executor-names map (every bound tool). A tool
 * absent from the map has NO bindings (i.e. runs server-side by default).
 * Rejects on read failure — callers (useToolRuntimes) treat that as "unknown"
 * and render NO badge rather than a wrong "Server" one. A failure is not
 * cached, so a later mount retries.
 */
export async function getAllExecutorBindings(): Promise<Map<string, string[]>> {
  if (!cached) {
    inFlight ??= loadAllBindings()
      .then((map) => {
        cached = map;
        inFlight = null;
        return map;
      })
      .catch((err) => {
        inFlight = null;
        throw err;
      });
    await inFlight;
  }
  return cached!;
}

/**
 * Active executor bindings for the given tool ids, as toolId → executor names.
 * Answered from the one cached whole-table read (see above); same rejection
 * contract.
 */
export async function getExecutorBindingsByToolId(
  toolIds: string[],
): Promise<Map<string, string[]>> {
  const all = await getAllExecutorBindings();
  const out = new Map<string, string[]>();
  for (const id of toolIds) {
    const executors = all.get(id);
    if (executors) out.set(id, executors);
  }
  return out;
}
