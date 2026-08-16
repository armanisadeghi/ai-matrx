/**
 * Work destinations — WHO does the work.
 *
 * The composer always shows every destination the product intends to offer, and
 * it never lies about which of them can actually run right now:
 *
 *   • `ai-matrx` is live today. It runs through the ONE canonical execution
 *     path (`launchAgentExecution`) and leaves a canonical conversation.
 *   • Every provider destination is capability-gated and currently
 *     unselectable. Claude Code's state comes from the LIVE backend contract
 *     (`readManagedCapability`); Codex/Cursor/VS Code have no managed runtime
 *     at all, so their reason is a constant fact, not a guess.
 *
 * Wiring an available provider destination into a real launch is TASK-006
 * (PLAN Lane 5). Until that certification pass, `selectable` stays false for
 * every provider even when the backend reports `available: true` — the button
 * that would run it does not exist yet, and offering it would be the fake
 * "Resume" this product forbids.
 */

import type { ManagedCapability } from "@/features/ai-work/lib/managedClaudeCapability";

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
    label: "Claude Code",
    summary:
      "Claude Code does the work on your behalf and mirrors the session back into AI Matrx.",
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
 * The one place a destination's runnability is decided. `capability` is the
 * live managed-Claude contract; it only ever affects `claude-code`.
 */
export function destinationAvailability(
  id: WorkDestinationId,
  capability: ManagedCapability,
): DestinationAvailability {
  if (id === "ai-matrx") return { selectable: true, reason: null };

  if (id === "claude-code") {
    if (capability.state === "loading") {
      return { selectable: false, reason: "Checking the live backend…" };
    }
    if (!capability.available) {
      return {
        selectable: false,
        reason:
          capability.reason ??
          "The managed Claude runtime reports itself unavailable.",
      };
    }
    return {
      selectable: false,
      reason:
        "The managed Claude runtime is available, but starting a session from the web is not certified yet. Start it from Claude Code and it appears in Conversations.",
    };
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
