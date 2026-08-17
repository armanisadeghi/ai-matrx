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
 *     (`readLocalRuntimeCapability`) — never a guess. The hosted sandbox
 *     runtime (`readManagedCapability`) remains a separate, backend-certified
 *     lane that this composer does not launch yet.
 *   • Codex/Cursor have no managed runtime at all, so their reason is a
 *     constant fact; VS Code work starts inside the editor.
 */

import type { ManagedCapability } from "@/features/ai-work/lib/managedClaudeCapability";
import type { LocalRuntimeCapability } from "@/features/ai-work/lib/matrxLocalRuntime";

export type WorkDestinationId =
  | "ai-matrx"
  | "claude-code"
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
 * The one place a destination's runnability is decided.
 *
 * `localCapability` is the LIVE answer from the user's own Matrx Local app
 * (undefined while a caller has not asked yet); `capability` is the hosted
 * managed-sandbox contract and is reported as context, never as a launch path
 * from here.
 */
export function destinationAvailability(
  id: WorkDestinationId,
  capability: ManagedCapability,
  localCapability?: LocalRuntimeCapability,
): DestinationAvailability {
  if (id === "ai-matrx") return { selectable: true, reason: null };

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
