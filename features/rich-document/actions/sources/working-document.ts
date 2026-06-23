// features/rich-document/actions/sources/working-document.ts
//
// Source adapter for the per-conversation working document / scratchpad
// (features/agents/.../instance-working-document). `edit` routes a full-body
// replacement through `persistWorkingDocumentContentThunk`, which writes the
// canonical slice content AND persists to the durable backing (the
// `cx_working_documents` row or the bound note) — the exact path the live
// editor's debounced commit uses, so an edit from the fullscreen editor and a
// keystroke in the panel converge on the same source of truth.
//
// No `delete` — a working document is a living conversation artifact retired by
// disabling/unbinding it (the panel's own controls), never by a content action.

import type { ContentSource, ContentSourceAdapter } from "../../types";

export const workingDocumentAdapter: ContentSourceAdapter = {
  instanceKeyPrefix: (source: ContentSource) => {
    if (source.type !== "working-document") {
      throw new Error(
        `workingDocumentAdapter received non-working-document source: ${source.type}`,
      );
    }
    return `wd-${source.conversationId}-${source.kind}`;
  },

  edit: async ({ newContent, source, dispatch }) => {
    if (source.type !== "working-document") {
      throw new Error(
        `workingDocumentAdapter.edit received non-working-document source: ${source.type}`,
      );
    }
    // Lazy import — the working-document thunks pull in Supabase service glue
    // and the notes save path that we don't want in every RichDocument bundle.
    const { persistWorkingDocumentContentThunk } = await import(
      "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.thunks"
    );
    await dispatch(
      persistWorkingDocumentContentThunk({
        conversationId: source.conversationId,
        kind: source.kind,
        content: newContent,
      }),
    ).unwrap();
  },
};
