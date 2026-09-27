// features/research/browse/actions.ts
//
// The topic list's writes, shared by the row menu and the agent write targets
// so a person and an agent change a topic the same way.

import { supabase } from "@/utils/supabase/client";
import { writeOne } from "@/utils/supabase/writeOne";

/**
 * ARCHIVE a topic. `research.rs_topic` archives by stamping `deleted_at`
 * (owner ruling 2026-09-20; db-rules §8): every reader filters it, the row with
 * its sources, analyses and documents stays, the topic's association edges are
 * soft-deleted with it, and `restoreTopic` brings all of it back.
 */
export async function archiveTopic(topicId: string): Promise<void> {
  await writeOne(
    supabase
      .schema("research")
      .from("rs_topic")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", topicId)
      .is("deleted_at", null)
      .select("id, deleted_at"),
    {
      action: "archive",
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

/**
 * Restore an archived topic. Clearing `deleted_at` also restores the association
 * edges the archive soft-deleted (platform._gc_entity_associations keys them to
 * this topic), so its project link comes back with it.
 */
export async function restoreTopic(topicId: string): Promise<void> {
  await writeOne(
    supabase
      .schema("research")
      .from("rs_topic")
      .update({ deleted_at: null })
      .eq("id", topicId)
      .not("deleted_at", "is", null)
      .select("id, deleted_at"),
    {
      action: "restore",
      noun: "topic",
      alreadyDone: {
        reread: () =>
          supabase
            .schema("research")
            .from("rs_topic")
            .select("id, deleted_at")
            .eq("id", topicId)
            .maybeSingle(),
        isDone: (row) => row.deleted_at == null,
      },
    },
  );
}
