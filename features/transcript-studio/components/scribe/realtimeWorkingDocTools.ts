// features/transcript-studio/components/scribe/realtimeWorkingDocTools.ts
//
// Phase 2 of the realtime tool bridge: working-document MUTATOR client tools
// for Scribe Live. These run on the CLIENT (the voice LLM is client-side) and
// write the session's `studio_documents` working-document row live, so the
// agent can say "I'll add that heading" and the document updates on screen.
//
// They register through the SHARED realtime client-tool registry
// (`registerRealtimeClientTool`) — NOT a voice-only execution path. When such a
// tool is classified `execution: "client"` by the backend resolve endpoint, the
// realtime tool loop resolves the runner from this registry and runs it.
//
// The turn-based agent reaches the same document server-side via `ctx_patch`;
// these client tools are the realtime equivalent for the live voice surface,
// where there is no server turn to carry the patch.
//
// Import this file once for its registration side-effect — done by
// ScribeLiveScreen on mount.

import { updateWorkingDocumentContentThunk } from "@/features/transcript-studio/redux/thunks";
import { selectWorkingDocument } from "@/features/transcript-studio/redux/selectors";
import {
  registerRealtimeClientTool,
  type RealtimeClientToolContext,
} from "@/features/voice-agent/runtime/client-tool-registry";

/** JSON-Schema parameter shapes (advisory — these match what the backend tool_def stores). */
export const WORKING_DOC_TOOL_NAMES = {
  append: "scribe_working_doc_append",
  heading: "scribe_working_doc_append_heading",
} as const;

function readSessionId(ctx: RealtimeClientToolContext): string | null {
  return ctx.sessionId ?? null;
}

async function applyContent(
  ctx: RealtimeClientToolContext,
  nextContent: string,
  sessionId: string,
): Promise<string> {
  const doc = selectWorkingDocument(sessionId)(ctx.getState());
  if (!doc) {
    return "No working document exists for this session yet, so nothing could be written.";
  }
  await ctx.dispatch(
    updateWorkingDocumentContentThunk({
      sessionId,
      documentId: doc.id,
      content: nextContent,
    }),
  ).unwrap();
  return "Done — the working document was updated.";
}

/**
 * `scribe_working_doc_append` — append a block of text (e.g. a paragraph or a
 * note) to the end of the working document.
 */
registerRealtimeClientTool({
  name: WORKING_DOC_TOOL_NAMES.append,
  async run(args, ctx) {
    const sessionId = readSessionId(ctx);
    if (!sessionId) {
      return "This tool only works inside a Scribe Live session.";
    }
    const text = typeof args.text === "string" ? args.text : "";
    if (!text.trim()) {
      return "No text was provided to append.";
    }
    const doc = selectWorkingDocument(sessionId)(ctx.getState());
    const current = doc?.content ?? "";
    const next = current.trim() ? `${current.trimEnd()}\n\n${text.trim()}` : text.trim();
    return applyContent(ctx, next, sessionId);
  },
});

/**
 * `scribe_working_doc_append_heading` — append a Markdown heading (and optional
 * body) to the end of the working document.
 */
registerRealtimeClientTool({
  name: WORKING_DOC_TOOL_NAMES.heading,
  async run(args, ctx) {
    const sessionId = readSessionId(ctx);
    if (!sessionId) {
      return "This tool only works inside a Scribe Live session.";
    }
    const heading = typeof args.heading === "string" ? args.heading.trim() : "";
    if (!heading) {
      return "No heading text was provided.";
    }
    const rawLevel = typeof args.level === "number" ? args.level : 2;
    const level = Math.min(Math.max(Math.round(rawLevel), 1), 6);
    const body = typeof args.body === "string" ? args.body.trim() : "";
    const block = body
      ? `${"#".repeat(level)} ${heading}\n\n${body}`
      : `${"#".repeat(level)} ${heading}`;

    const doc = selectWorkingDocument(sessionId)(ctx.getState());
    const current = doc?.content ?? "";
    const next = current.trim() ? `${current.trimEnd()}\n\n${block}` : block;
    return applyContent(ctx, next, sessionId);
  },
});
