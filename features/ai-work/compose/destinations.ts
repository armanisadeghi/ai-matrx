/**
 * Work destinations — WHO does the work.
 *
 * The composer always shows every destination the product intends to offer, and
 * it never lies about which of them can actually run right now:
 *
 *   • `ai-matrx` is live today. It runs through the ONE canonical execution
 *     path (`launchAgentExecution`) and leaves a canonical conversation.
 *   • `claude-code` is live when the user's OWN Matrx Local desktop app
 *     reports its local Claude Code runtime available (installed `claude`,
 *     signed-in subscription login, approved folders). The session runs on
 *     the user's Mac and mirrors into a canonical conversation as it runs.
 *     The check is the LIVE engine answer over the per-user bridge channel
 *     (`readLocalRuntimeCapability`) — never a guess.
 *   • `claude-code-hosted` runs in a Matrx Sandbox we start for the user. Its
 *     runnability comes from ONE place and nowhere else: the coding session
 *     bridge's `capabilities` verdict for `claude_code × matrx_sandbox`
 *     (`lib/codingBridgeCapability.ts`), which is per user and per
 *     organization. Selectable ONLY when the report says `available` AND the
 *     `start` AND `stream` operations are both supported — an `available`
 *     report whose `start` is refused is exactly the shape that used to put a
 *     button on the screen with nothing behind it.
 *   • Codex/Cursor have no managed runtime at all, so their reason is a
 *     constant fact; VS Code work starts inside the editor.
 */

import type { CodingBridgeCapability } from "@/features/ai-work/lib/codingBridgeCapability";
import type { LocalRuntimeCapability } from "@/features/ai-work/lib/matrxLocalRuntime";

export type WorkDestinationId =
  | "ai-matrx"
  | "claude-code"
  | "claude-code-hosted"
  | "codex"
  | "cursor"
  | "vscode";

export interface WorkDestinationDef {
  id: WorkDestinationId;
  label: string;
  /** One plain-language sentence: what this destination does for the user. */
  summary: string;
}

export const WORK_DESTINATIONS: readonly WorkDestinationDef[] = [
  {
    id: "ai-matrx",
    label: "AI Matrx",
    summary:
      "An AI Matrx expert system does the work here, and the whole conversation stays in your account.",
  },
  {
    id: "claude-code",
    label: "Claude Code on my Mac",
    summary:
      "Claude Code runs on your own computer, in a folder you approved, and the session mirrors into AI Matrx as it runs.",
  },
  {
    id: "claude-code-hosted",
    label: "Claude Code (hosted)",
    summary:
      "Claude Code runs in a Matrx Sandbox we start for you — nothing to install — and the session lands in a conversation in your account.",
  },
  {
    id: "codex",
    label: "Codex",
    summary: "Codex does the work and mirrors the session back into AI Matrx.",
  },
  {
    id: "cursor",
    label: "Cursor",
    summary: "Cursor does the work and mirrors the session back into AI Matrx.",
  },
  {
    id: "vscode",
    label: "VS Code",
    summary:
      "The @matrx participant works inside VS Code; conversations start there, not here.",
  },
] as const;

export interface DestinationAvailability {
  /** True only when the composer can actually launch this destination today. */
  selectable: boolean;
  /** Shown verbatim when `selectable` is false. Never empty in that case. */
  reason: string | null;
}

/**
 * The sentence used ONLY when the server refused without one. Never a guess at
 * the cause — a refused control beside an empty reason is the dead screen
 * Law 4 forbids.
 */
const HOSTED_REFUSED_WITHOUT_REASON =
  "AI Matrx did not say whether a hosted sandbox can be started for you, so it is not offered here.";

/**
 * The one place a destination's runnability is decided.
 *
 * `bridgeCapability` is the coding session bridge's live verdict for
 * `claude_code × matrx_sandbox` — the ONLY source for the hosted destination.
 * `localCapability` is the LIVE answer from the user's own Matrx Local app
 * (undefined while a caller has not asked yet) and the ONLY source for the
 * Matrx Local destination. Neither reads the other.
 */
export function destinationAvailability(
  id: WorkDestinationId,
  bridgeCapability: CodingBridgeCapability,
  localCapability?: LocalRuntimeCapability,
): DestinationAvailability {
  if (id === "ai-matrx") return { selectable: true, reason: null };

  if (id === "claude-code-hosted") {
    if (bridgeCapability.state === "loading") {
      return {
        selectable: false,
        reason: "Checking whether a hosted sandbox can be started for you…",
      };
    }
    const start = bridgeCapability.operations.start;
    const stream = bridgeCapability.operations.stream;
    if (
      bridgeCapability.state === "ready" &&
      bridgeCapability.available &&
      start?.supported === true &&
      stream?.supported === true
    ) {
      return { selectable: true, reason: null };
    }
    // The server's own words, in the server's own order: the report-level
    // reason first, then the operation that actually failed.
    const failing = start?.supported !== true ? start : stream;
    return {
      selectable: false,
      reason:
        bridgeCapability.reason ??
        failing?.reason ??
        HOSTED_REFUSED_WITHOUT_REASON,
    };
  }

  if (id === "claude-code") {
    const local = localCapability ?? null;
    if (!local || local.state === "loading") {
      return { selectable: false, reason: "Checking your Matrx Local app…" };
    }
    if (local.state === "unreachable") {
      return {
        selectable: false,
        reason:
          local.reasons[0] ??
          "Matrx Local is not reachable. Open the desktop app on your Mac and sign in.",
      };
    }
    if (!local.available) {
      return {
        selectable: false,
        reason: local.reasons.join(" · ") || "The local runtime is not ready.",
      };
    }
    if (local.approvedFolders.length === 0) {
      return {
        selectable: false,
        reason:
          "No folders are approved for agent runs yet. Approve one in Matrx Local (Claude Code → Agent Runtime).",
      };
    }
    return { selectable: true, reason: null };
  }

  if (id === "vscode") {
    return {
      selectable: false,
      reason:
        "VS Code work starts from the @matrx participant inside the editor. AI Matrx opens and continues those conversations; it cannot create one.",
    };
  }

  return {
    selectable: false,
    reason:
      "There is no managed runtime for this provider yet. Work started in the app itself still mirrors into Conversations.",
  };
}
