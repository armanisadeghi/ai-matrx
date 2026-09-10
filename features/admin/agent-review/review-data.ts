import { loadReviewRegistry, type ReviewRegistry } from "./registry";
import { loadReviewQueue } from "./service";
import type { ReviewQueueRow } from "./types";

export type ReviewData = {
  queue: ReviewQueueRow[];
  registry: ReviewRegistry;
};

/**
 * RLS can legally turn an anonymous queue read into an empty success. Wait for
 * the app's authenticated identity so that first paint cannot silently cache a
 * false zero-count board before Supabase session hydration finishes.
 */
export async function loadAuthenticatedReviewData(
  userId: string | null | undefined,
): Promise<ReviewData | null> {
  if (!userId) return null;

  const [queue, registry] = await Promise.all([
    loadReviewQueue(),
    loadReviewRegistry(),
  ]);
  return { queue, registry };
}
