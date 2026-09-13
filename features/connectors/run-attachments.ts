/**
 * Per-run MCP truth: which attached servers actually reached this run.
 *
 * The connection catalog answers "could this work?"; only the run itself
 * answers "did it?". aidream emits both halves (aidream commit 626a47fa3 and
 * its 2026-09-13 follow-up):
 *
 *   - one `mcp_attachments` INFO event naming EVERY attached slug with its
 *     state, its reason, and the tool count the server contributed;
 *   - one `mcp_server_unavailable` WARNING per slug that could not produce a
 *     single tool, carrying the server's own error text.
 *
 * A chip reading from this can say "GitHub — 47 tools this run" or "GitHub —
 * not connected: Connect GitHub in AI Matrx…", and can never show a checkmark
 * for a server the model was never handed (Arman, 2026-09-13).
 */

import type { McpConnectionState } from "./connection-state";

export const MCP_ATTACHMENTS_INFO_CODE = "mcp_attachments";
export const MCP_SERVER_UNAVAILABLE_WARNING_CODE = "mcp_server_unavailable";

export interface RunMcpAttachment {
  slug: string;
  state: McpConnectionState;
  /** The server's own sentence for why, when it is not plainly connected. */
  reason: string | null;
  /** Tools this server contributed to the run; null when unknown. */
  toolCount: number | null;
}

interface CodedPayload {
  code?: string | null;
  user_message?: string | null;
  system_message?: string | null;
  metadata?: Record<string, unknown> | null;
}

const KNOWN_STATES = new Set<McpConnectionState>([
  "connected",
  "needs_reauth",
  "not_connected",
]);

function asState(value: unknown): McpConnectionState {
  return KNOWN_STATES.has(value as McpConnectionState)
    ? (value as McpConnectionState)
    : "not_connected";
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Read every attached MCP server's real outcome for one run.
 *
 * Warnings are applied AFTER the summary: a server that screamed is never
 * left looking healthy, even if an earlier summary disagreed.
 */
export function readRunMcpAttachments(
  infoEvents: readonly CodedPayload[] | undefined,
  warnings: readonly CodedPayload[] | undefined,
): RunMcpAttachment[] {
  const bySlug = new Map<string, RunMcpAttachment>();

  for (const info of infoEvents ?? []) {
    if (info?.code !== MCP_ATTACHMENTS_INFO_CODE) continue;
    const rows = info.metadata?.["attachments"];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      const slug = asString(record["slug"]);
      if (!slug) continue;
      bySlug.set(slug, {
        slug,
        state: asState(record["state"]),
        reason: asString(record["reason"]),
        toolCount:
          typeof record["tool_count"] === "number"
            ? (record["tool_count"] as number)
            : null,
      });
    }
  }

  for (const warning of warnings ?? []) {
    if (warning?.code !== MCP_SERVER_UNAVAILABLE_WARNING_CODE) continue;
    const slug = asString(warning.metadata?.["slug"]);
    if (!slug) continue;
    const reason =
      asString(warning.metadata?.["reason"]) ??
      asString(warning.user_message) ??
      asString(warning.system_message);
    const existing = bySlug.get(slug);
    bySlug.set(slug, {
      slug,
      // A warning means it produced no tools on this run, whatever else said.
      state: existing?.state === "needs_reauth" ? "needs_reauth" : "not_connected",
      reason: reason ?? existing?.reason ?? null,
      toolCount: 0,
    });
  }

  return [...bySlug.values()];
}

/** Index the run's attachments by slug for O(1) chip lookups. */
export function indexRunMcpAttachments(
  attachments: readonly RunMcpAttachment[],
): Record<string, RunMcpAttachment> {
  const index: Record<string, RunMcpAttachment> = {};
  for (const attachment of attachments) index[attachment.slug] = attachment;
  return index;
}

// ---------------------------------------------------------------------------
// What one chip shows
// ---------------------------------------------------------------------------

/**
 * The chip's whole decision, in one pure place.
 *
 * `check` is the ONLY presentation that reads as "this chat has it", and it
 * requires BOTH halves: attached to this chat AND actually connected, with
 * nothing in this run saying otherwise. Everything else is `add` (offer) or
 * `broken` (say what is wrong and how to fix it) — never a dead checkmark
 * and never a disabled-looking control (Arman, 2026-09-13).
 */
export type McpChipKind = "check" | "add" | "broken";

export interface McpChipPresentation {
  kind: McpChipKind;
  /** Short status word shown on a broken chip. */
  status: string | null;
  /** The sentence explaining a broken chip, from the server where possible. */
  reason: string | null;
  /** Tools this server gave the run, when it gave any. */
  toolCount: number | null;
}

export function mcpChipPresentation(
  state: McpConnectionState,
  reason: string | null,
  attached: boolean,
  runAttachment: RunMcpAttachment | undefined,
): McpChipPresentation {
  const failedThisRun =
    attached &&
    runAttachment !== undefined &&
    runAttachment.state !== "connected";

  if (failedThisRun) {
    return {
      kind: "broken",
      status:
        runAttachment.state === "needs_reauth"
          ? "needs re-auth"
          : "failed this run",
      reason: runAttachment.reason ?? reason,
      toolCount: null,
    };
  }
  if (state === "connected") {
    return {
      kind: attached ? "check" : "add",
      status: null,
      reason: null,
      toolCount:
        attached && runAttachment?.state === "connected"
          ? runAttachment.toolCount
          : null,
    };
  }
  return {
    kind: "broken",
    status: state === "needs_reauth" ? "needs re-auth" : "not connected",
    reason,
    toolCount: null,
  };
}
