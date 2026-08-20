import { createClient } from "@/utils/supabase/client";
import { readAllRows } from "@/lib/supabase/readAllRows";
import type {
  ReviewQueueRow,
  ReviewQueueUpdate,
} from "@/features/admin/agent-review/types";

/**
 * The board shows a true count per filter value, so the queue is a list treated
 * as COMPLETE — it reads through `readAllRows`, never a bare `.limit()` that
 * would quietly start under-reporting once the queue passes a page.
 */
export async function loadReviewQueue(): Promise<ReviewQueueRow[]> {
  const supabase = createClient();
  return readAllRows<ReviewQueueRow>(
    ({ from, to }) =>
      supabase
        .schema("agent")
        .from("review_queue")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    { label: "agent.review_queue" },
  );
}

export async function updateReviewQueueRow(
  id: string,
  patch: ReviewQueueUpdate,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .schema("agent")
    .from("review_queue")
    .update(patch)
    .eq("id", id);

  if (error) throw new Error(error.message);
}
