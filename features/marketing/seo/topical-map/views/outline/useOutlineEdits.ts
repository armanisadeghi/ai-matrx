"use client";

/**
 * views/outline/useOutlineEdits.ts — every WRITE the outline can make, behind
 * one hook, with one failure slot.
 *
 * The writes themselves are the feature's own hooks (`usePatchMapTopics`,
 * `useMoveMapTopic`, `useRetireMapTopics`, `useRejectMapTopics`) — optimistic
 * where the hook is, rolled back where the hook rolls back. What this adds is
 * the OUTLINE's answer to a refusal: the function's own sentence, unaltered,
 * held in `failure` so the view can render it beside the tree
 * (`TopicalMapFailed`), and echoed once as a toast. Nothing is swallowed.
 *
 * `patch_map_topics` is per-edit: the call can SUCCEED while `result.errors`
 * names an edit the database refused. That is a failure to the person too,
 * so it lands in the same slot with the database's own message.
 */

import { useState } from "react";

import { toast } from "@/lib/toast";

import { topicalMapErrorText } from "../../errors";
import {
  useMoveMapTopic,
  usePatchMapTopics,
  useRejectMapTopics,
  useRetireMapTopics,
} from "../../hooks";

export interface OutlineFailure {
  /** Fills `Could not load {what}` in `TopicalMapFailed` — phrased as the action. */
  what: string;
  error: unknown;
}

export interface OutlineEdits {
  rename: (slug: string, name: string, currentName: string) => Promise<void>;
  move: (slug: string, newParentSlug: string | null) => Promise<unknown>;
  retire: (slug: string, name: string) => Promise<void>;
  reject: (slug: string, name: string) => Promise<void>;
  /** True while a retire/reject is in flight (the confirm dialog's `busy`). */
  removing: boolean;
  failure: OutlineFailure | null;
  dismissFailure: () => void;
}

export function useOutlineEdits(mapId: string): OutlineEdits {
  const patch = usePatchMapTopics(mapId);
  const moveTopic = useMoveMapTopic(mapId);
  const retireTopics = useRetireMapTopics(mapId);
  const rejectTopics = useRejectMapTopics(mapId);
  const [failure, setFailure] = useState<OutlineFailure | null>(null);

  function fail(what: string, error: unknown): void {
    setFailure({ what, error });
    toast.error(topicalMapErrorText(error));
  }

  return {
    async rename(slug, name, currentName) {
      const what = `renaming "${currentName}"`;
      try {
        const result = await patch.mutateAsync([{ slug, name }]);
        if (result.errors.length > 0) {
          // The database's per-edit words, joined as it gave them.
          fail(what, new Error(result.errors.map((entry) => entry.message).join("\n")));
        }
      } catch (error) {
        fail(what, error);
      }
    },

    move(slug, newParentSlug) {
      // The caller (drag, or the dialog) decides where the refusal renders; the
      // banner gets it too so a drag that bounced back is explained.
      return moveTopic.mutateAsync({ slug, newParentSlug }).catch((error: unknown) => {
        fail(`moving "${slug}"`, error);
        throw error;
      });
    },

    async retire(slug, name) {
      try {
        await retireTopics.mutateAsync({ slugs: [slug] });
        toast.success(`Retired "${name}".`);
      } catch (error) {
        fail(`retiring "${name}"`, error);
      }
    },

    async reject(slug, name) {
      try {
        await rejectTopics.mutateAsync({ slugs: [slug] });
        toast.success(`Rejected "${name}". It is on the History screen.`);
      } catch (error) {
        fail(`rejecting "${name}"`, error);
      }
    },

    removing: retireTopics.isPending || rejectTopics.isPending,
    failure,
    dismissFailure: () => setFailure(null),
  };
}
