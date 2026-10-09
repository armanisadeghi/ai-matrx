/**
 * The NDJSON event contract of the long social doors (aidream
 * `services/social/FEATURE.md`), as pure functions over an event iterable so
 * the parsing is unit-tested without a network.
 */

import type { SocialProgress } from "./types";

/** A refusal that arrived IN the stream (`error` event), after the 200 opened. */
export class SocialStreamError extends Error {
  constructor(
    readonly code: string,
    readonly userMessage: string,
    /** `{credits_charged, provider, attempts}` from the error event. */
    readonly details?: Record<string, unknown>,
  ) {
    super(userMessage || code);
    this.name = "SocialStreamError";
  }
}

/**
 * Progress from a stream event. The contract (aidream `services/social/
 * FEATURE.md`): `data` events `{type: "social_stage", stage, label, current,
 * total}` (`current`/`total` 0 when a stage has no count), then ONE
 * `{type: "social_result", result}`, then `end`.
 */
/**
 * The server's stage labels are engineer-shaped ("Fetching posts, page 1 of up to 1").
 * Friendly copy: drop the page counter (a count only shows when there is more than one),
 * and say "Getting" rather than "Fetching".
 */
export function friendlyStage(label: string): { text: string; pages: number | null } {
  let pages: number | null = null;
  const text = label
    .replace(/[,·\-–]?\s*page\s+\d+\s+of\s+(?:up to\s+)?(\d+)/i, (_m, total: string) => {
      pages = Number(total);
      return "";
    })
    .replace(/^fetching\b/i, "Getting")
    .trim();
  return { text, pages };
}

export function progressOf(evt: unknown): SocialProgress | null {
  if (!evt || typeof evt !== "object") return null;
  const e = evt as { event?: string; data?: Record<string, unknown> };
  const d = e.data;
  if (e.event !== "data" || !d || d.type !== "social_stage") return null;
  const label = typeof d.label === "string" && d.label ? d.label : typeof d.stage === "string" ? d.stage : "";
  if (!label) return null;
  const current = typeof d.current === "number" && d.current > 0 ? d.current : undefined;
  const total = typeof d.total === "number" && d.total > 0 ? d.total : undefined;
  const { text, pages } = friendlyStage(label);
  // A single step carries no information ("1 of 1"): show the count only when there is more than one.
  const many = (total ?? pages ?? 0) > 1;
  return { message: text, step: many ? current : undefined, total: many ? (total ?? pages ?? undefined) : undefined };
}

/**
 * Consume a door's events: progress to `onProgress`, the one `social_result`
 * returned, an in-stream `error` thrown as `SocialStreamError` once the stream
 * has ended (it still ends with `end`).
 */
export async function consumeSocialEvents<T>(
  events: AsyncIterable<unknown>,
  onProgress?: (progress: SocialProgress) => void,
): Promise<T> {
  let result: unknown = null;
  let refusal: SocialStreamError | null = null;
  for await (const evt of events) {
    const e = evt as { event?: string; data?: Record<string, unknown> };
    const progress = progressOf(evt);
    if (progress) onProgress?.(progress);
    if (e.event === "error") {
      const d = e.data ?? {};
      refusal = new SocialStreamError(
        String(d.code ?? d.error_type ?? "social_provider_failed"),
        typeof d.user_message === "string" ? d.user_message : "The social call failed.",
        d.details && typeof d.details === "object" ? (d.details as Record<string, unknown>) : undefined,
      );
    } else if (e.event === "data" && e.data?.type === "social_result") {
      result = e.data.result;
    }
  }
  if (refusal) throw refusal;
  if (result === null) throw new Error("The social call ended without an answer.");
  return result as T;
}
