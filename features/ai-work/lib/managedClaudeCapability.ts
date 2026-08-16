/**
 * managedClaudeCapability — ONE reader for the live managed-Claude runtime
 * capability contract (`GET /coding-sessions/claude/capabilities`).
 *
 * Two AI Work surfaces ask the same question and must never disagree:
 *   • `/work/connections` — "can I start a Claude Code session from here?"
 *   • `/work/new`         — "is the Claude Code destination selectable?"
 *
 * Both consume this reader. It NEVER invents availability: a failed call is
 * reported as unavailable with the real error text, and the caller renders the
 * truthful reason instead of a button. Wiring the available=true path into a
 * real launch is TASK-006 (Lane 5) — this module only reports the contract.
 */

import { apiGet } from "@/lib/api/typed-client";

export type ManagedCapability = {
  state: "loading" | "ready" | "error";
  available: boolean;
  nativeResume: boolean;
  nativeFork: boolean;
  reason: string | null;
};

export const INITIAL_CAPABILITY: ManagedCapability = {
  state: "loading",
  available: false,
  nativeResume: false,
  nativeFork: false,
  reason: null,
};

export async function readManagedCapability(): Promise<ManagedCapability> {
  try {
    const { data } = await apiGet("/coding-sessions/claude/capabilities");
    return {
      state: "ready",
      available: data.available,
      nativeResume: data.native_resume,
      nativeFork: data.native_fork,
      reason: data.reason ?? null,
    };
  } catch (capabilityError) {
    return {
      state: "error",
      available: false,
      nativeResume: false,
      nativeFork: false,
      reason:
        capabilityError instanceof Error
          ? capabilityError.message
          : "Capability check failed",
    };
  }
}
