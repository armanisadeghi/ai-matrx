"use client";

/**
 * Write handlers for `matrx-user/transcript-scribe-live` — the receiving end of
 * the surface's `writeTargets` (declared in
 * `features/surfaces/manifests/transcript-scribe-live.manifest.ts`).
 *
 * WHAT THIS ADDS THAT DID NOT EXIST. The Scribe Live tab already lets the
 * CLIENT-SIDE VOICE agent mutate the working document, through the realtime
 * client tools in `../components/scribe/realtimeWorkingDocTools.ts`
 * (`scribe_working_doc_append` / `_append_heading`). Those are reachable only
 * from inside the xAI realtime turn loop — the agent the user is TALKING to.
 * An agent launched from the header Agents popover is an ordinary turn-based
 * run with no realtime socket, so until now it could READ the working document
 * (the surface declares `working_document_content`) and had no way to write a
 * word of it back. These targets close that half of the loop for that second,
 * entirely separate agent population, through the SAME canonical thunk the
 * realtime tools and the user's own typing already use.
 *
 * Rules, all enforced here rather than trusted to the caller:
 *
 *  • EVERY handler validates and THROWS on a bad shape. The writeback seam
 *    (`features/surfaces/runtime/surface-writeback.ts`) turns a throw into a
 *    safe error envelope the agent reads and can correct against.
 *
 *  • Nothing bypasses the canonical write path. Both handlers dispatch
 *    `updateWorkingDocumentContentThunk` — the same thunk
 *    `useWorkingDocumentDraft`'s debounced autosave fires on the user's own
 *    keystrokes and the same one the realtime mutators call. It persists via
 *    `updateStudioDocumentContent` and then dispatches `studioDocumentUpserted`,
 *    which is what feeds the draft hook's merge-in effect. There is no second
 *    write path and no raw supabase.
 *
 *  • The DOCUMENT IS READ FROM THE STORE AT CALL TIME, never from a render
 *    snapshot. `applySurfaceWrite` resolves the handler BEFORE it shows the
 *    confirm dialog, so a body captured in a closure can be many seconds stale
 *    by the time the user presses Apply — long enough for the user, or the
 *    voice agent they are talking to, to have changed the document underneath.
 *    An append built on a stale body would silently drop that work.
 *
 * NO PHASE GUARD, DELIBERATELY. Unlike the voice PLAYGROUND's settings (which
 * are consumed once, at connect, and are therefore refused mid-session on
 * `matrx-user/chat-voice`), the working document is meant to change while a
 * session is live — that IS the collaboration loop. `useWorkingDocumentDraft`
 * explicitly merges remote edits in whenever the user is not actively typing,
 * and the live agent re-reads the document into its instructions on the next
 * session. Refusing here would break the feature rather than protect it.
 *
 * `mode: "entity"`: these persist immediately through the canonical service,
 * matching what the realtime mutators already do. There is no staging layer to
 * land in — the working document has no draft/save bar of its own, only the
 * autosaving editor — so `draft` would be a lie. `applyPolicy: "ask"` keeps a
 * human in the loop before anything is written.
 *
 * Registered by `ScribeLiveScreen` on its existing `SurfaceRuntimeProvider`.
 */

import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { selectWorkingDocument } from "../redux/selectors";
import { updateWorkingDocumentContentThunk } from "../redux/thunks";

/**
 * A non-empty string, or a throw naming the target.
 *
 * The value arrives as whatever the tool-call arguments parsed to, so a
 * non-string is refused with an explicit instruction instead of being coerced:
 * `String(value)` on an object yields "[object Object]", and writing that into
 * someone's working document is precisely the corruption this check exists to
 * stop. Markdown prose is passed through verbatim — real line breaks and all —
 * because the document body IS markdown.
 */
function requireMarkdown(value: unknown, target: string): string {
  if (typeof value !== "string") {
    throw new Error(
      `${target} expects markdown text as a plain string, but received ${
        Array.isArray(value) ? "an array" : value === null ? "null" : typeof value
      }. Send the document text itself — plain multi-line markdown with real line breaks, not JSON and not an object.`,
    );
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(
      `${target} expects a non-empty string. Emptying the working document is the user's own action, not an agent write.`,
    );
  }
  return trimmed;
}

export function useScribeLiveWriteHandlers(sessionId: string) {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  // Fresh closures per call (the `getWriteHandlers` contract — it is invoked
  // between renders, so the object must never capture a stale render's state).
  return () => {
    /**
     * The session's working-document row, read fresh. A Scribe session starts
     * WITHOUT a document (it is created lazily), and there is no content to
     * replace or append to until it exists — refuse loudly rather than
     * inventing one, because creating the document is a different operation
     * with its own ownership and the user has their own control for it.
     */
    const requireDocument = () => {
      const doc = selectWorkingDocument(sessionId)(store.getState());
      if (!doc) {
        throw new Error(
          "This Scribe session has no working document yet, so there is nothing to write into. The document is created when the user first adds to it — ask them to start it, then apply this again.",
        );
      }
      return doc;
    };

    const persist = async (documentId: string, content: string) => {
      // `.unwrap()` so a rejected thunk becomes a throw the seam reports,
      // rather than a resolved action that would look like success.
      await dispatch(
        updateWorkingDocumentContentThunk({ sessionId, documentId, content }),
      ).unwrap();
    };

    return {
      working_document_content: async (value: unknown) => {
        const next = requireMarkdown(value, "working_document_content");
        const doc = requireDocument();
        await persist(doc.id, next);
      },

      append_working_document: async (value: unknown) => {
        const addition = requireMarkdown(value, "append_working_document");
        const doc = requireDocument();
        const current = (doc.content ?? "").trimEnd();
        await persist(
          doc.id,
          current ? `${current}\n\n${addition}` : addition,
        );
      },
    };
  };
}
