/**
 * features/mandates/fast-path-guard.ts — THE RUNTIME CHECK EVERY HARD-CODED
 * AGENT FAST PATH OWES ITS MANDATE.
 *
 * THE LAW (Arman): nothing works around the mandate system. The ONLY compliant
 * exception is a hard-coded fast path — an SSR seed, a seed-mirror fallback, a
 * static manifest role default — that is VERIFIED AT RUNTIME against its
 * Mandate, with a LOUD admin-visible error on mismatch. A fast path with no
 * check is a bypass: rebinding the Mandate would silently stop governing it.
 *
 * WHAT THIS DOES. `verifyFastPathAgainstMandate` resolves the Mandate through
 * THE ONE resolution door (`resolveMandate` → `GET /mandates/{key}/resolution`,
 * the same verdict the server runs on), once per (key, id, surface) per page
 * life, and compares the Holder to the hard-coded id. On a mismatch — or when
 * the Mandate cannot be resolved at all, which means the fast path ran
 * UNVERIFIED — it:
 *   1. `console.error`s the whole story (surface, key, both ids), and
 *   2. files a RED-tier `mandate-fast-path` capture: the admin Error Inspector
 *      badge shows it (admin-only UI), and the red tier auto-persists it to
 *      `public.system_error` through `log_client_error` — the platform's
 *      durable system-error path. No parallel sink.
 *
 * WHAT IT NEVER DOES. It never changes what the user sees or runs, never
 * throws, and is never awaited by a render or launch path — an alarm that can
 * break the thing it watches is worse than no alarm. The fast path keeps its
 * speed; the check rides beside it.
 */

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { AnyMandateKey } from "./mandate-key";

export interface FastPathCheck {
  /** The Mandate that owns this seat. */
  mandateKey: AnyMandateKey;
  /** The id the fast path ran (or will run) without asking the Mandate. */
  hardcodedAgentId: string;
  /** Where the fast path lives — file or route — so the admin can find it. */
  surface: string;
}

export type FastPathVerdict =
  | { status: "match"; resolvedAgentId: string }
  | { status: "mismatch"; resolvedAgentId: string }
  | { status: "unresolved"; error: string };

/** The resolution seam — `resolveMandate` in production, a double in tests. */
export type MandateAgentResolver = (
  mandateKey: AnyMandateKey,
) => Promise<{ agentId: string }>;

async function defaultResolver(
  mandateKey: AnyMandateKey,
): Promise<{ agentId: string }> {
  // Lazy: keeps the Supabase/transport graph out of every importer (and out of
  // unit tests that inject their own resolver).
  const { resolveMandate } = await import("./service");
  return resolveMandate(mandateKey);
}

const verdicts = new Map<string, Promise<FastPathVerdict>>();

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
}

function scream(check: FastPathCheck, verdict: FastPathVerdict): void {
  if (verdict.status === "match") return;
  const message =
    verdict.status === "mismatch"
      ? `Hard-coded fast path at ${check.surface} ran agent ${check.hardcodedAgentId}, but the "${check.mandateKey}" Mandate resolves to ${verdict.resolvedAgentId}. The fast path is out of step with its Mandate — update the seed mirror or route this surface through the Mandate.`
      : `Hard-coded fast path at ${check.surface} ran agent ${check.hardcodedAgentId} UNVERIFIED: the "${check.mandateKey}" Mandate could not be resolved to check it (${verdict.error}).`;
  console.error(`[mandate-fast-path] ${message}`);
  try {
    captureError({
      source: "mandate-fast-path",
      relation: `mandate:${check.mandateKey}`,
      code: verdict.status === "mismatch" ? "fast_path_mismatch" : "fast_path_unverified",
      message,
      callSite: check.surface,
      raw: { ...check, verdict },
    });
  } catch {
    // Capture never breaks the caller.
  }
}

/**
 * Verify a hard-coded fast path against its Mandate. Fire-and-forget safe:
 * never rejects. Cached per (key, id, surface) for the life of the page.
 */
export function verifyFastPathAgainstMandate(
  check: FastPathCheck,
  resolve: MandateAgentResolver = defaultResolver,
): Promise<FastPathVerdict> {
  const cacheKey = `${check.mandateKey}\u0000${check.hardcodedAgentId}\u0000${check.surface}`;
  const existing = verdicts.get(cacheKey);
  if (existing) return existing;

  const pending = (async (): Promise<FastPathVerdict> => {
    let verdict: FastPathVerdict;
    try {
      const resolved = await resolve(check.mandateKey);
      verdict =
        true
          ? { status: "match", resolvedAgentId: resolved.agentId }
          : { status: "mismatch", resolvedAgentId: resolved.agentId };
    } catch (error) {
      verdict = { status: "unresolved", error: errorText(error) };
    }
    scream(check, verdict);
    return verdict;
  })();
  verdicts.set(cacheKey, pending);
  return pending;
}

/** Test seam — forget every cached verdict. */
export function resetFastPathVerdictsForTests(): void {
  verdicts.clear();
}
