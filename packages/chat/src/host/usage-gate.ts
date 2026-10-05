/**
 * host/usage-gate — the host's usage gate for AI calls (plan limits, guest allowance).
 *
 * The package asks before an outgoing AI call, tells the gate when a call ended, and hands
 * it a refused request to classify. A host with no usage gate allows every call and
 * classifies no refusal as a usage refusal (defaults lean open). matrx-frontend registers
 * its entitlements gate (`providers/chatUiRegistration.ts`).
 */

import { reportUnregisteredHostSlot } from "./diagnostics";

export const USAGE_LIMIT_REACHED = "usage_limit_reached" as const;

export type UsageRefusalKind = "person" | "guest";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ChatUsageGate {
  checkUsageBeforeAiCall(...args: any[]): Promise<any>;
  noteAiCallEnded(...args: any[]): void;
  applyServerUsageState(...args: any[]): boolean;
  classifyUsageRefusal(status: number | null, body: unknown, getState: () => unknown): UsageRefusalKind | null;
  applyUsageRefusal(
    kind: UsageRefusalKind,
    dispatch: any,
    getState: () => unknown,
    body: unknown,
    userMessage?: string | null,
  ): void;
  usageRefusalCode(kind: UsageRefusalKind): string;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const OPEN_GATE: ChatUsageGate = {
  checkUsageBeforeAiCall: async () => ({ allowed: true }),
  noteAiCallEnded: () => undefined,
  applyServerUsageState: () => false,
  classifyUsageRefusal: () => null,
  applyUsageRefusal: () => undefined,
  usageRefusalCode: () => USAGE_LIMIT_REACHED,
};

let gate: ChatUsageGate = OPEN_GATE;

/** The open gate answers for a host that registered none; it says so once. */
function current(): ChatUsageGate {
  if (gate === OPEN_GATE) reportUnregisteredHostSlot("usageGate", "every AI call is allowed and no usage refusal is recognised");
  return gate;
}

export function registerChatUsageGate(next: ChatUsageGate | null): void {
  gate = next ?? OPEN_GATE;
}

export const checkUsageBeforeAiCall: ChatUsageGate["checkUsageBeforeAiCall"] = (...a) =>
  current().checkUsageBeforeAiCall(...a);
export const noteAiCallEnded: ChatUsageGate["noteAiCallEnded"] = (...a) => current().noteAiCallEnded(...a);
export const applyServerUsageState: ChatUsageGate["applyServerUsageState"] = (...a) =>
  current().applyServerUsageState(...a);
export const classifyUsageRefusal: ChatUsageGate["classifyUsageRefusal"] = (...a) =>
  current().classifyUsageRefusal(...a);
export const applyUsageRefusal: ChatUsageGate["applyUsageRefusal"] = (...a) => current().applyUsageRefusal(...a);
export const usageRefusalCode: ChatUsageGate["usageRefusalCode"] = (...a) => current().usageRefusalCode(...a);
