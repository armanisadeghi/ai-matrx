/**
 * codingBridgeCapability — THE ONE capability reader for coding-agent
 * destinations.
 *
 * ## Why this replaced the second reader
 *
 * Until 2026-09-17 AI Work had TWO capability readers. One was the coding
 * session bridge's own `capabilities` action; the other was a module in this
 * same folder that read the Claude-only
 * `GET /coding-sessions/claude/capabilities` probe. The second one was inert:
 * `destinationAvailability` accepted its value as an argument and never read a
 * field of it, so a surface could render "available" from one reader while the
 * other refused — and nothing could launch either way. Two readers of the same
 * question is the defect class, so there is now exactly one, and it is the
 * bridge: the bridge verdict is per user, per organization, per provider and
 * per origin, and it is the only place a client may learn what it can do
 * (`BridgeCapabilityReport.supported_actions`).
 *
 * ## The contract
 *
 * `POST /coding-sessions/bridge` with `action: "capabilities"` answers
 * `BridgeResponse`: either a `dispatch.capabilities` report or a `refusal`.
 * Both are readable answers. A refusal, a transport failure and a missing
 * report are all reported as `state: "error"` carrying the SERVER's own
 * sentence — never a sentence invented here, and never silence.
 *
 * `available: false` always arrives with a `reason` written for a person. Every
 * consumer renders that reason verbatim; see `compose/destinations.ts`.
 *
 * This module NEVER throws. A thrown error at this seam is how a screen ends up
 * with an empty panel and no sentence (the same rule `conversations/
 * cloudSyncTruth.ts` follows for the bridge's `diagnose` action, which is the
 * precedent this call site copies).
 */

import { apiPost } from "@/lib/api/typed-client";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";
import type { components } from "@/types/python-generated/api-types";

/** The eleven operations a `BridgeCapabilityReport` grades, from the contract. */
export type BridgeOperation = components["schemas"]["BridgeOperation"];

/** Provider × origin — the two halves of a verdict's identity. */
export type BridgeCapabilityProvider = components["schemas"]["BridgeProvider"];
export type BridgeCapabilityOrigin = components["schemas"]["BridgeOrigin"];

/** One operation's verdict, with the server's reason when it refused. */
export interface BridgeOperationVerdict {
  operation: BridgeOperation;
  supported: boolean;
  reason: string | null;
}

export interface CodingBridgeCapability {
  state: "loading" | "ready" | "error";
  /** The report-level verdict. `false` always carries `reason`. */
  available: boolean;
  /** The server's own sentence, for a person. Rendered verbatim, never re-worded. */
  reason: string | null;
  /** Which runtime the verdict is about (`matrx_sandbox`, `matrx_local`, `seeded`). */
  runtime: string | null;
  /** Per-operation verdicts. Absent means the server graded no such operation. */
  operations: Record<BridgeOperation, BridgeOperationVerdict | undefined>;
  /** The call never left the browser: no organization is selected yet. */
  organizationRequired: boolean;
}

/** No operation graded yet — the shape every reader starts from. */
const NO_OPERATIONS: Record<BridgeOperation, BridgeOperationVerdict | undefined> =
  {
    start: undefined,
    send: undefined,
    stream: undefined,
    cancel: undefined,
    resume_native: undefined,
    fork_native: undefined,
    list: undefined,
    mirror: undefined,
    export: undefined,
    open: undefined,
    handoff: undefined,
  };

export const INITIAL_BRIDGE_CAPABILITY: CodingBridgeCapability = {
  state: "loading",
  available: false,
  reason: null,
  runtime: null,
  operations: NO_OPERATIONS,
  organizationRequired: false,
};

/**
 * The sentence used ONLY when the server answered without one. It says what is
 * missing rather than inventing a cause — an empty reason beside a refused
 * control is the dead screen Law 4 forbids.
 */
export const BRIDGE_VERDICT_WITHOUT_REASON =
  "AI Matrx did not say why this is unavailable. Refresh, and report it if it keeps happening.";

function errorSentence(error: unknown): string {
  if (isOrganizationRequiredError(error)) {
    return "Choosing where this work runs needs to know which organization to work in.";
  }
  return error instanceof Error && error.message
    ? error.message
    : "The capability check could not be completed.";
}

/**
 * Ask the bridge what this user can do with one provider × origin pair.
 *
 * Never throws. Never invents availability: every unavailable answer carries
 * the server's own sentence, or `BRIDGE_VERDICT_WITHOUT_REASON` when the server
 * sent none.
 */
export async function readBridgeCapability(
  provider: BridgeCapabilityProvider,
  origin: BridgeCapabilityOrigin,
): Promise<CodingBridgeCapability> {
  try {
    const { data } = await apiPost("/coding-sessions/bridge", {
      schema_version: 1,
      // `CodingSessionBridgeRestRequest.action` is `BridgeAction | string`, so
      // this binds to the CURRENT contract. A build that does not implement
      // the action answers with a refusal, which is read below.
      action: "capabilities",
      provider,
      origin,
    });

    const refusal = data.refusal;
    if (refusal) {
      return {
        ...INITIAL_BRIDGE_CAPABILITY,
        state: "error",
        reason: refusal.reason || refusal.remedy || BRIDGE_VERDICT_WITHOUT_REASON,
      };
    }

    const report = data.dispatch?.capabilities;
    if (!report) {
      return {
        ...INITIAL_BRIDGE_CAPABILITY,
        state: "error",
        reason:
          data.dispatch?.detail ||
          "AI Matrx answered the capability question without a verdict.",
      };
    }

    const operations = { ...NO_OPERATIONS };
    for (const verdict of report.operations) {
      operations[verdict.operation] = {
        operation: verdict.operation,
        supported: verdict.supported,
        reason: verdict.reason ?? null,
      };
    }

    return {
      state: "ready",
      available: report.available,
      reason: report.reason ?? null,
      runtime: report.runtime ?? null,
      operations,
      organizationRequired: false,
    };
  } catch (error) {
    return {
      ...INITIAL_BRIDGE_CAPABILITY,
      state: "error",
      reason: errorSentence(error),
      organizationRequired: isOrganizationRequiredError(error),
    };
  }
}

/** True only when the server graded this operation supported. */
export function operationSupported(
  capability: CodingBridgeCapability,
  operation: BridgeOperation,
): boolean {
  return capability.operations[operation]?.supported === true;
}

/** The server's reason for one operation, or null when it gave none. */
export function operationReason(
  capability: CodingBridgeCapability,
  operation: BridgeOperation,
): string | null {
  return capability.operations[operation]?.reason ?? null;
}
