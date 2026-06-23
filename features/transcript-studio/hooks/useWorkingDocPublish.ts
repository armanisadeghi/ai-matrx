"use client";

// useWorkingDocPublish — "publish & clear" for a session's working document.
//
// The working document is a rolling draft: the agent + user co-edit it round
// after round. When a draft is FINISHED, the user wants to (1) keep it durably
// somewhere they own, and (2) reset the working doc to empty so the next draft
// starts clean. This hook owns exactly that two-step, destructive-ish action as
// ONE reusable primitive so every surface that shows the working document (the
// Scribe WorkingDocumentHeader, the War Room tile, the changes diff) shares one
// implementation instead of forking the flow.
//
// Publish target = a NOTE (the user's durable, list-tracked scratch surface),
// created through the canonical notes API and registered in the notes slice so
// it appears in the notes list immediately. Clearing routes through the SAME
// draft writer the editor already uses (`clearDraft`), so the empty content is
// persisted to studio_documents on the one autosave path — no second write path.
//
// It is LOUD on partial failure: if the note is created but the clear fails, we
// surface that explicitly rather than silently leaving a published-but-not-reset
// doc (the draft is safe — nothing was lost).

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useAppDispatch } from "@/lib/redux/hooks";
import { create as createNote } from "@/features/notes/service/notesApi";
import { upsertNoteFromServer } from "@/features/notes/redux/slice";

export interface UseWorkingDocPublishArgs {
  /** Current working-document content to publish. */
  content: string;
  /** A human label for the published note (e.g. the doc title / session name). */
  title?: string | null;
  /**
   * Resets the working document to empty. MUST persist (route through the
   * editor's own draft writer) so the cleared state survives a reload. Called
   * only after the note is created.
   */
  clearDraft: () => void | Promise<void>;
}

export interface UseWorkingDocPublish {
  /** True while the publish + clear is in flight. */
  publishing: boolean;
  /** Publish the content to a note, then clear the working doc. Returns true on success. */
  publishAndClear: () => Promise<boolean>;
}

export function useWorkingDocPublish({
  content,
  title,
  clearDraft,
}: UseWorkingDocPublishArgs): UseWorkingDocPublish {
  const dispatch = useAppDispatch();
  const [publishing, setPublishing] = useState(false);

  const publishAndClear = useCallback(async (): Promise<boolean> => {
    const text = content.trim();
    if (!text) {
      toast.info("Nothing to publish yet — the working document is empty");
      return false;
    }
    if (publishing) return false;
    setPublishing(true);
    try {
      // 1) Persist durably to a note the user owns + sees in their notes list.
      const note = await createNote({
        content: text,
        label: title?.trim() || "Published draft",
      });
      dispatch(upsertNoteFromServer({ note, fetchStatus: "full" }));

      // 2) Reset the working document for the next draft. Through the editor's
      //    own writer so the empty state is the canonical, persisted one.
      try {
        await clearDraft();
      } catch (clearErr) {
        // The draft is published and safe; only the reset failed. Say so loudly
        // rather than pretend the doc is clear.
        console.error(
          "[working-doc/publish] published the note but failed to clear the working document:",
          clearErr,
        );
        toast.error(
          "Published to a note, but couldn't clear the working document — clear it manually.",
        );
        return false;
      }

      toast.success("Published to a note and cleared for the next draft");
      return true;
    } catch (err) {
      console.error("[working-doc/publish] publish failed:", err);
      toast.error("Couldn't publish the working document");
      return false;
    } finally {
      setPublishing(false);
    }
  }, [content, title, clearDraft, publishing, dispatch]);

  return { publishing, publishAndClear };
}
