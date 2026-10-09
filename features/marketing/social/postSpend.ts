/**
 * The one seam where a post action that spends from the organization's balance
 * asks before it runs: fetching a post's video, buying a transcript, refreshing
 * its numbers.
 *
 * Today no action asks: the person pressed the button, and nothing about
 * provider names or credits is shown. The shared points helper fills this
 * function (and only this function) with the points-based confirmation; every
 * caller already awaits it.
 */

export type PostSpendAction = "fetch_video" | "transcript" | "refresh_metrics";

export async function confirmPostSpend(_action: PostSpendAction): Promise<boolean> {
  return true;
}
