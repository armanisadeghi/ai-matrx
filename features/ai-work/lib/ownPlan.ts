/**
 * ownPlan — the ONE client for running a hosted coding session on the
 * person's OWN vendor plan (their Claude subscription) instead of AI Matrx
 * credits.
 *
 * The sign-in is the vendor CLI's own sign-in, run inside the person's Matrx
 * Sandbox; the credential never leaves that box and never touches this app.
 * Every call here answers the same `OwnPlanStatus`, so the UI only ever renders
 * the server's latest verdict.
 *
 * Claude flow: `startOwnPlanSignIn` (may take a minute or two when the sandbox
 * must boot) → the person opens `sign_in_url` → Anthropic's page shows a code →
 * `submitOwnPlanCode` → `signed_in`.
 *
 * THE CODE IS NEVER KEPT. `submitOwnPlanCode` takes it as an argument and sends
 * it; nothing here stores, logs, or returns it. Callers must not put it in
 * Redux, storage, or a console line, and must clear their input after submit.
 *
 * GET never starts a sandbox (server contract): with none running the answer
 * is `unavailable` with the server's own `detail`.
 */

import { apiGet, apiPost, buildPath, withQuery } from "@/lib/api/typed-client";
import type { components } from "@ai-matrx/agents/generated/api-types";

export type OwnPlanProvider = components["schemas"]["OwnPlanProvider"];
export type OwnPlanState = components["schemas"]["OwnPlanState"];
export type OwnPlanStatus = components["schemas"]["OwnPlanStatus"];

/** Who pays for a hosted run. Mirrors the stream body's `billing` field. */
export type HostedBilling = "platform" | "own_plan";

export const OWN_PLAN_STATUS_PATH = "/coding-sessions/own-plan/{provider}" as const;
export const OWN_PLAN_SIGN_IN_PATH =
  "/coding-sessions/own-plan/{provider}/sign-in" as const;
export const OWN_PLAN_CODE_PATH =
  "/coding-sessions/own-plan/{provider}/code" as const;
export const OWN_PLAN_CANCEL_PATH =
  "/coding-sessions/own-plan/{provider}/cancel" as const;
export const OWN_PLAN_SIGN_OUT_PATH =
  "/coding-sessions/own-plan/{provider}/sign-out" as const;

/**
 * A person may connect MANY Claude accounts; each is its own sign-in (its own
 * home) in their sandbox. `account` names it: omitted = the primary account
 * (the one own-plan runs use); any other value is an opaque slot from
 * {@link newClaudeAccountSlot}. Codex has one account and ignores it.
 */
export type OwnPlanAccount = string | undefined;

/** A fresh opaque slot for connecting one more Claude account. */
export function newClaudeAccountSlot(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("") + "acct";
}

const accountQuery = (account: OwnPlanAccount) =>
  account ? { account } : undefined;

/** The person's current own-plan sign-in, as the vendor CLI reports it. */
export async function readOwnPlanStatus(
  provider: OwnPlanProvider,
  account?: OwnPlanAccount,
): Promise<OwnPlanStatus> {
  const { data } = await apiGet(buildPath(OWN_PLAN_STATUS_PATH, { provider }), {
    query: accountQuery(account),
  });
  return data;
}

/** Start the vendor's own sign-in. Boots the sandbox when none is running. */
export async function startOwnPlanSignIn(
  provider: OwnPlanProvider,
  account?: OwnPlanAccount,
): Promise<OwnPlanStatus> {
  const { data } = await apiPost(
    withQuery(buildPath(OWN_PLAN_SIGN_IN_PATH, { provider }), accountQuery(account)),
    undefined,
  );
  return data;
}

/** Hand the one-time code Anthropic's page showed to the waiting sign-in. */
export async function submitOwnPlanCode(
  provider: OwnPlanProvider,
  code: string,
  account?: OwnPlanAccount,
): Promise<OwnPlanStatus> {
  const { data } = await apiPost(
    withQuery(buildPath(OWN_PLAN_CODE_PATH, { provider }), accountQuery(account)),
    { authorization_code: code.trim() },
  );
  return data;
}

/** Abandon a sign-in that is waiting for a code or a browser. */
export async function cancelOwnPlanSignIn(
  provider: OwnPlanProvider,
  account?: OwnPlanAccount,
): Promise<OwnPlanStatus> {
  const { data } = await apiPost(
    withQuery(buildPath(OWN_PLAN_CANCEL_PATH, { provider }), accountQuery(account)),
    undefined,
  );
  return data;
}

/** The vendor CLI's own sign-out, inside the person's sandbox. */
export async function signOutOwnPlan(
  provider: OwnPlanProvider,
  account?: OwnPlanAccount,
): Promise<OwnPlanStatus> {
  const { data } = await apiPost(
    withQuery(buildPath(OWN_PLAN_SIGN_OUT_PATH, { provider }), accountQuery(account)),
    undefined,
  );
  return data;
}

/** One of the person's sandboxes holding a slot of the host's per-person cap. */
export type SandboxOccupant = {
  row_id: string;
  sandbox_id: string;
  name?: string | null;
  template?: string | null;
  tier?: string | null;
  status?: string | null;
  organization_id?: string | null;
  last_heartbeat_at?: string | null;
};

/** The server's `sandbox_capacity_full` refusal: every box holding a slot. */
export type SandboxCapacityRefusal = {
  message: string;
  ceiling: number | null;
  occupants: SandboxOccupant[];
};

function isOccupant(value: unknown): value is SandboxOccupant {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { row_id?: unknown }).row_id === "string" &&
    typeof (value as { sandbox_id?: unknown }).sandbox_id === "string"
  );
}

/**
 * Find the `sandbox_capacity_full` refusal inside whatever the API client threw.
 * The detail can sit on `details`, `body`, `detail` or a `cause`, so look
 * through those (bounded) rather than depending on one client's wrapping.
 */
export function capacityRefusalOf(cause: unknown): SandboxCapacityRefusal | null {
  const seen = new Set<unknown>();
  const visit = (value: unknown, depth: number): SandboxCapacityRefusal | null => {
    if (depth > 5 || typeof value !== "object" || value === null || seen.has(value)) return null;
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (
      (record.code === "sandbox_capacity_full" || record.error === "sandbox_capacity_full") &&
      Array.isArray(record.occupants)
    ) {
      const message =
        typeof record.user_message === "string"
          ? record.user_message
          : typeof record.message === "string"
            ? record.message
            : "All of your sandbox slots are in use. Stop one to continue.";
      return {
        message,
        ceiling: typeof record.ceiling === "number" ? record.ceiling : null,
        occupants: record.occupants.filter(isOccupant),
      };
    }
    for (const key of ["details", "detail", "body", "data", "error", "cause"]) {
      const found = visit(record[key], depth + 1);
      if (found) return found;
    }
    return null;
  };
  return visit(cause, 0);
}

/** The hosted-runtime readiness path (never boots anything). */
export const HOSTED_RUNTIME_PATH = "/coding-sessions/hosted/runtime" as const;

/**
 * The cap refusal as the readiness read reports it: `occupants` and
 * `capacity_ceiling` ride beside the verdict when the per-person cap is what
 * refuses. Null when the cap is not the reason (or nobody holds a slot).
 */
export function capacityFromReadiness(readiness: unknown): SandboxCapacityRefusal | null {
  if (typeof readiness !== "object" || readiness === null) return null;
  const r = readiness as Record<string, unknown>;
  if (!Array.isArray(r.occupants) || typeof r.capacity_ceiling !== "number") return null;
  const occupants = r.occupants.filter(isOccupant);
  if (occupants.length === 0) return null;
  return {
    message:
      typeof r.reason === "string" && r.reason
        ? r.reason
        : "All of your sandbox slots are in use. Stop one to continue.",
    ceiling: r.capacity_ceiling,
    occupants,
  };
}

/** Read the hosted runtime's readiness and report the cap refusal, if any. */
export async function readHostedCapacity(): Promise<SandboxCapacityRefusal | null> {
  const { data } = await apiGet(HOSTED_RUNTIME_PATH);
  return capacityFromReadiness(data);
}
