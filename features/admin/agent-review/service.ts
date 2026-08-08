import { createClient } from "@/utils/supabase/client";
import type {
  ReviewQueueRow,
  ReviewQueueUpdate,
} from "@/features/admin/agent-review/types";

export async function loadReviewQueue(): Promise<ReviewQueueRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("review_queue")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return data ?? [];
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
