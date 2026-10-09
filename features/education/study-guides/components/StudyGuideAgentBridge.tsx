"use client";

// features/education/study-guides/components/StudyGuideAgentBridge.tsx
//
// The study guide's annotation half for agents (`matrx-user/education-study-guide`).
// The Notes & comments state lives in the annotation sidecar, which the reader
// installs ABOVE its surface provider, so the reader's own `getScope` cannot
// read it. This child sits inside both: it publishes the saved private notes
// and comment threads into a ref the reader owns (getScope stays synchronous —
// it is polled every 400 ms) and registers the six CRUD targets over them.
//
// Every write goes through the sidecar's own functions — `createHighlight` /
// `addComment` (the service calls the sidecar itself makes; they return the new
// id, which the agent needs) and then the sidecar's `reload`; `saveNote`,
// `recolor`, `removeHighlight`, `editComment`, `resolveComment`,
// `deleteComment` straight from the sidecar API. Validation is the pure,
// unit-tested `../studyGuideAgentWrites.ts`.

import { useEffect, type MutableRefObject } from "react";
import { useSidecar } from "@/features/rich-document/annotations/AnnotationSidecar";
import { addComment, createHighlight } from "@/features/rich-document/annotations/service";
import { newRequestId } from "@/features/rich-document/annotations/useAnnotationSidecar";
import type { ResolvedItem } from "@/features/rich-document/annotations/types";
import { collectionWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";
import { useSurfaceWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { refuseSurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import {
  EDUCATION_STUDY_GUIDE_SURFACE_NAME,
  type GuideCommentScope,
  type PersonalAnnotationScope,
} from "@/features/surfaces/manifests/education-study-guide.manifest";
import {
  parseCreateGuideCommentsValue,
  parseCreatePersonalNotesValue,
  parseDeleteGuideCommentsValue,
  parseDeletePersonalNotesValue,
  parseUpdateGuideCommentsValue,
  parseUpdatePersonalNotesValue,
  type CurrentComment,
  type CurrentPersonalNote,
} from "../studyGuideAgentWrites";

/** What the bridge publishes for the reader's getScope. Absent lists = still loading or failed. */
export interface StudyGuideAnnotationSnapshot {
  personal?: PersonalAnnotationScope[];
  comments?: GuideCommentScope[];
  error?: string;
}

const short = (text: string, max = 40) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function personalOf(items: readonly ResolvedItem[]): PersonalAnnotationScope[] {
  const seen = new Set<string>();
  const out: PersonalAnnotationScope[] = [];
  for (const item of items) {
    if ((item.kind !== "highlight" && item.kind !== "note") || item.saveState !== "confirmed" || !item.annotationDocumentId) continue;
    if (seen.has(item.annotationDocumentId)) continue;
    seen.add(item.annotationDocumentId);
    out.push({
      id: item.annotationDocumentId,
      kind: item.anchor ? "highlight" : "note",
      quote: item.anchor?.exact ?? null,
      note: item.body,
      color: item.color ?? "yellow",
      attached: !item.anchor || item.resolution?.status !== "orphaned",
      created_at: item.createdAt,
    });
  }
  return out;
}

function commentsOf(items: readonly ResolvedItem[]): GuideCommentScope[] {
  return items
    .filter((item) => (item.kind === "comment" || item.kind === "suggestion") && item.saveState === "confirmed" && item.commentId)
    .map((item) => ({
      id: item.commentId!,
      quote: item.anchor?.exact ?? null,
      body: item.body,
      suggested_text: item.suggestedText ?? null,
      author: item.author.name,
      mine: item.mine,
      resolved: Boolean(item.resolvedAt),
      attached: !item.anchor || item.resolution?.status !== "orphaned",
      created_at: item.createdAt,
      replies: item.replies.map((reply) => ({ id: reply.id, body: reply.body, author: reply.author.name, mine: reply.mine, created_at: reply.createdAt })),
    }));
}

export function StudyGuideAgentBridge({
  snapshotRef,
  isEditing,
}: {
  snapshotRef: MutableRefObject<StudyGuideAnnotationSnapshot>;
  /** True while the Notes editor is open on the guide — writes refuse then. */
  isEditing: boolean;
}) {
  const { source, api } = useSidecar();
  const { items, loading, error } = api.state;

  // Publish for getScope. Only a completed read reports lists.
  const personal = personalOf(items);
  const comments = commentsOf(items);
  useEffect(() => {
    snapshotRef.current = loading ? {} : error ? { error } : { personal, comments };
  });
  useEffect(() => () => { snapshotRef.current = {}; }, [snapshotRef]);

  const guideText = () => ({ body: source.body, version: Math.max(1, source.contentVersion) });
  const currentPersonal = (): CurrentPersonalNote[] =>
    personal.map((p) => ({ id: p.id, kind: p.kind, quote: p.quote, note: p.note, color: p.color }));
  const currentComments = (): CurrentComment[] =>
    items
      .filter((item) => (item.kind === "comment" || item.kind === "suggestion") && item.saveState === "confirmed" && item.commentId)
      .flatMap((item): CurrentComment[] => [
        { id: item.commentId!, parentId: null, quote: item.anchor?.exact ?? null, body: item.body, mine: item.mine, resolved: Boolean(item.resolvedAt), version: item.version ?? null },
        ...item.replies.map((reply) => ({ id: reply.id, parentId: item.commentId!, quote: null, body: reply.body, mine: reply.mine, resolved: false, version: reply.version })),
      ]);
  const ready = <T,>(parse: () => T): T => {
    if (isEditing) refuseSurfaceWrite("The person has the guide open in the editor. Ask them to press \"Back to reading\" first; nothing was changed.");
    if (loading) refuseSurfaceWrite("The guide's notes and comments are still loading. Try again in a moment; nothing was changed.");
    if (error) refuseSurfaceWrite(`The guide's notes and comments could not load (${error}), so nothing was changed.`);
    return parse();
  };
  const orThrow = (message: string | null) => {
    if (message) throw new Error(message);
  };

  const personalTargets = collectionWriteHandlers(
    {
      plural: "personal_notes",
      singular: "personal note",
      create: {
        parse: (value) => ready(() => parseCreatePersonalNotesValue(value, guideText(), currentPersonal())),
        run: async (plan) => {
          const { documentId } = await createHighlight({
            source,
            anchor: plan.anchor,
            color: plan.color,
            note: plan.note,
            clientRequestId: newRequestId(),
          });
          await api.reload();
          return { id: documentId, name: plan.quote ? `highlight "${short(plan.quote)}"` : `note "${short(plan.note)}"` };
        },
        nameOf: (plan) => (plan.quote ? `highlight "${short(plan.quote)}"` : `note "${short(plan.note)}"`),
        refusalFor: (e) =>
          undefined,
      },
      update: {
        parse: (value) => ready(() => parseUpdatePersonalNotesValue(value, currentPersonal())),
        run: async (plan) => {
          if (plan.note !== undefined) orThrow(await api.saveNote(plan.id, plan.note));
          if (plan.color !== undefined) {
            const item = items.find((i) => i.annotationDocumentId === plan.id && i.anchor);
            if (!item) throw new Error("that highlight is no longer on the page");
            orThrow(await api.recolor(item, plan.color));
          }
          return { id: plan.id, name: plan.name };
        },
        nameOf: (plan) => plan.name,
        changedOf: (plan) => plan.changed,
      },
      delete: {
        parse: (value) => ready(() => parseDeletePersonalNotesValue(value, currentPersonal())),
        run: async (item) => {
          orThrow(await api.removeHighlight(item.id));
          return { id: item.id, name: item.quote ? `highlight "${short(item.quote)}"` : `note "${short(item.note)}"` };
        },
        nameOf: (item) => (item.quote ? `highlight "${short(item.quote)}"` : `note "${short(item.note)}"`),
      },
    },
    refuseSurfaceWrite,
  );

  const commentTargets = collectionWriteHandlers(
    {
      plural: "guide_comments",
      singular: "comment",
      create: {
        parse: (value) => ready(() => parseCreateGuideCommentsValue(value, guideText(), currentComments())),
        run: async (plan) => {
          const id = await addComment({
            source,
            body: plan.body,
            parentId: plan.parentId,
            anchor: plan.anchor,
            suggestedText: plan.suggestedText,
            clientRequestId: newRequestId(),
            doors: api.state.capabilities.collaborationDoors,
            firstAttemptAt: new Date().toISOString(),
          });
          await api.reload();
          return { id, name: `${plan.parentId ? "reply" : plan.suggestedText != null ? "suggestion" : "comment"} "${short(plan.body)}"` };
        },
        nameOf: (plan) => `comment "${short(plan.body)}"`,
      },
      update: {
        parse: (value) => ready(() => parseUpdateGuideCommentsValue(value, currentComments())),
        run: async (plan) => {
          if (plan.body !== undefined) await api.editComment(plan.id, plan.body, plan.base);
          if (plan.resolved !== undefined) orThrow(await api.resolveComment(plan.id, plan.resolved));
          return { id: plan.id, name: plan.name };
        },
        nameOf: (plan) => plan.name,
        changedOf: (plan) => plan.changed,
      },
      delete: {
        parse: (value) => ready(() => parseDeleteGuideCommentsValue(value, currentComments())),
        run: async (item) => {
          orThrow(await api.deleteComment(item.id));
          return { id: item.id, name: `comment "${short(item.body)}"` };
        },
        nameOf: (item) => `comment "${short(item.body)}"`,
      },
    },
    refuseSurfaceWrite,
  );

  useSurfaceWriteHandlers(EDUCATION_STUDY_GUIDE_SURFACE_NAME, { ...personalTargets, ...commentTargets });
  return null;
}
