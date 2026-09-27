// features/research/browse/actions.ts
//
// The topic list's writes, shared by the row menu and the agent write targets
// so a person and an agent change a topic the same way.

import { supabase } from "@/utils/supabase/client";
import { writeOne } from "@/utils/supabase/writeOne";

/**
 * Remove a topic from the list. A SOFT delete (owner ruling 2026-09-20;
 * db-rules §8): `deleted_at` is stamped, every reader of `research.rs_topic`
 * filters it, and the row with its sources, analyses and documents stays in
 * the database where an admin can restore it.
 */
export async function softDeleteTopic(topicId: string): Promise<void> {
  await writeOne(
    supabase
      .schema("research")
      .from("rs_topic")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", topicId)
      .is("deleted_at", null)
      .select("id, deleted_at"),
    {
      action: "delete",
      noun: "topic",
      alreadyDone: {
        reread: () =>
          supabase
            .schema("research")
            .from("rs_topic")
            .select("id, deleted_at")
            .eq("id", topicId)
            .maybeSingle(),
        isDone: (row) => row.deleted_at != null,
      },
    },
  );
}
