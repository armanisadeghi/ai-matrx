import "server-only";

/**
 * features/mandates/seed.server.ts — THE ONE BOUNDED WAY A SERVER COMPONENT
 * ASKS FOR A FIRST-PAINT SEED.
 *
 * 🚨 AN OPTIONAL READ WITH NO DEADLINE IS A REQUIRED READ.
 *
 * `resolveMandateServer` answers the system-rung Holder so a page can paint its
 * header and its composer without a flash. Every one of its callers treats that
 * answer as OPTIONAL — each one catches, screams and paints with `null`, because
 * the browser asks the real resolution door a hop later and that answer is the
 * one that counts.
 *
 * On 2026-09-21 production `/staff` answered **504 GATEWAY_TIMEOUT** on six
 * consecutive signed-in loads. The database was in a relation-lock storm, and
 * PostgREST answered `PGRST002` ("Could not query the database for the schema
 * cache. Retrying.") — a RETRY LOOP, not an error. A read that throws was caught
 * and degraded. A read that HANGS was awaited past Vercel's 15-second function
 * cap, and took the whole page down with it. The page's own comment said the
 * read was optional; the code said it was required, and the code is what ran.
 *
 * So the deadline lives HERE, on the seam the seven SSR seeds share, and not in
 * `/staff` — `/chat/new`, `/chat/talk`, `/chat/voice`, `/chat/[conversationId]`,
 * `/work/new` and the chat demos all had the identical shape.
 *
 * WHAT THIS IS NOT. It is not a fallback: there is no hardcoded agent id and no
 * remembered "last good" Holder. An unreachable seed paints NO seed, and hands
 * the page ONE sentence to show. `agent.definition` rows are re-bindable by an
 * organization at any moment, so a stale seed is a screen telling a lie.
 *
 * WHY A CONSTANT AND NOT AN ORG KNOB. The number this guards is the hosting
 * platform's own function cap, which is a property of where this code runs and
 * not of whose workspace is looking at it — an organization has no opinion to
 * express about it and no way to know a good value. See
 * `common-docs/policies/env-vars-are-values-not-toggles.md` for why it is not an
 * env var either.
 */

import { resolveMandateServer } from "@/features/mandates/service.server";
import type { AnyMandateKey } from "./mandate-key";
import type { ResolvedMandate } from "./service";

/**
 * How long a first-paint seed may take before the page paints without it.
 *
 * The cap it must stay under is the hosting function timeout — 15 s on Vercel's
 * Node runtime for this app. 2.5 s is well under it AND well over the healthy
 * read (two indexed single-row selects, single-digit milliseconds in production),
 * so a slow-but-alive database still seeds the page and only a genuinely stuck
 * one is abandoned.
 */
export const MANDATE_SEED_DEADLINE_MS = 2_500;

export interface MandateSeed {
  /** `agent.definition` id of the system-rung Holder, or null. */
  agentId: string | null;
  /** The whole resolution when it arrived in time, else null. */
  resolved: ResolvedMandate | null;
  /**
   * `null` when the seed is real. Otherwise ONE sentence naming what happened,
   * for the surface to show. Never an empty string — absent or honest.
   */
  unavailable: string | null;
}

function sentenceFor(error: unknown): string {
  if (error && typeof error === "object") {
    const shaped = error as { message?: unknown; code?: unknown };
    const message =
      typeof shaped.message === "string" && shaped.message.trim().length > 0
        ? shaped.message.trim()
        : null;
    const code = typeof shaped.code === "string" ? shaped.code : null;
    if (message) return code ? `${message} (${code})` : message;
  }
  return String(error);
}

/**
 * Resolve a mandate's system-rung Holder for first paint — bounded, and unable
 * to throw.
 *
 * The render is released at the deadline whatever the read is doing. The read
 * itself is ABORTED at the same moment rather than left running, so a stuck
 * PostgREST connection is not held open behind a page that already answered.
 */
export async function resolveMandateSeed(
  mandateKey: AnyMandateKey,
  deadlineMs: number = MANDATE_SEED_DEADLINE_MS,
): Promise<MandateSeed> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<MandateSeed>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({
        agentId: null,
        resolved: null,
        unavailable: `The default agent for "${mandateKey}" took too long to read (over ${deadlineMs} ms), so this page painted without it.`,
      });
    }, deadlineMs);
  });

  const read = resolveMandateServer(mandateKey, { signal: controller.signal })
    .then(
      (resolved): MandateSeed => ({
        agentId: resolved.agentId,
        resolved,
        unavailable: null,
      }),
    )
    .catch((error: unknown): MandateSeed => {
      // NOTHING FAILS SILENTLY. The server console gets the whole error; the
      // page gets the server's own sentence.
      console.error(
        `[mandate-seed] "${mandateKey}" did not resolve at SSR — the door's own answer is the one that counts:`,
        error,
      );
      return {
        agentId: null,
        resolved: null,
        unavailable: `The default agent for "${mandateKey}" could not be read: ${sentenceFor(error)}`,
      };
    });

  try {
    return await Promise.race([read, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
