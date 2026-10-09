/**
 * The one seam where a post action that spends asks before it runs: fetching a
 * post's video, buying a transcript, refreshing its numbers.
 *
 * A provider charge is a hard cost charged in points (20,000 points = $1, Arman
 * 2026-10-09). Like every AI action it asks only when the cost is worth a warning
 * (`confirmSocialSpendNow`, cost.ts); a trivial cost — one fetch is 38 points —
 * asks nothing and names no vendor or credits.
 */

import { confirmSocialSpendNow, type SocialSpendAction } from "./cost";

export type PostSpendAction = "fetch_video" | "transcript" | "refresh_metrics";

const ACTION: Record<PostSpendAction, { spend: SocialSpendAction; title: string; confirmLabel: string }> = {
  fetch_video: { spend: "post", title: "Fetch this video?", confirmLabel: "Fetch" },
  transcript: { spend: "transcript", title: "Get the transcript?", confirmLabel: "Transcribe" },
  refresh_metrics: { spend: "post", title: "Refresh these numbers?", confirmLabel: "Refresh" },
};

export async function confirmPostSpend(action: PostSpendAction): Promise<boolean> {
  const a = ACTION[action];
  return confirmSocialSpendNow(a.spend, 1, { title: a.title, confirmLabel: a.confirmLabel });
}
