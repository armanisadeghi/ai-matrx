// packages/chat/src/agents/redux/execution-system/instance-resources/remarks.ts
//
// REMARKS — what a person did to an agent's answer that rides along with their
// NEXT message (Turn References, plan approved by Arman 2026-10-03). A comment on
// a passage, a choice in a decision block, an edit to an answer, questionnaire
// answers, an interaction with a shape. None of them triggers a reply: each is
// staged as ONE chip in the composer, the person can X it away, and the next send
// carries every remaining one.
//
// Staging reuses the composer's resource system (instance-resources): one remark
// = one `ManagedResource` of block type `REMARKS_BLOCK_TYPE`, so chips, the X and
// the detail drawer come from SmartAgentResourceChips + the context-items
// registry with no parallel UI. The model-facing projection (markdown-native,
// see the plan) is the server's; this module stores the remark STRUCTURED.
//
// THE API FOR EVERY CALLER (comments here; edits / choices / questionnaires /
// shapes in the next lane):
//
//   dispatch(stageRemark(conversationId, item, { coalesceKey }))  → resourceId
//   dispatch(unstageRemark(conversationId, coalesceKey))           → removed?
//
// Coalescing: one chip per `coalesceKey` (e.g. `edit:<messageId>`), updated in
// place while it is unsent. A chip that was already part of a submitted message
// is NEVER mutated — a later stage under the same key mints a NEW resource id, so
// the request already on its way keeps exactly what the person sent.
//
// Reload: unsent remarks are kept by the composer draft store (same submit
// generation + tombstone as the typed draft) and put back by
// `restoreComposerRemarks` when the composer mounts.

import type { ChatDispatch, ChatRootState } from "../../../../store/root-state";
import type { ManagedResource } from "../../../types/instance.types";
import { generateResourceId } from "../utils/ids";
import { remarkDiff } from "./remark-diff";
import {
  addResource,
  removeResource,
  setResourcePreview,
  setResourceSource,
} from "./instance-resources.slice";

/** The one name for the remarks block / wire part in this repo (rename here only). */
export const REMARKS_BLOCK_TYPE = "input_remarks" as const;

export type RemarkKind = "comment" | "choice" | "edit" | "answers" | "interaction";

/**
 * Where a remark points. `messageId` is the answer it is about (a durable
 * chat message id); `conversationId` is the conversation that answer lives in —
 * which is NOT always the conversation the remark is staged into ("New chat
 * about this" stages a remark about another conversation's answer).
 */
export interface RemarkTarget {
  conversationId: string | null;
  messageId: string | null;
  /** A shape inside the answer (Content IR block index), when the remark is about one. */
  blockIndex?: number | null;
  /**
   * Any other platform record the remark is about (a board, a task on it, a
   * note's passage): its entity token, id and the title the person saw. The
   * model reads `comment c5 on task “Ship pricing page”`.
   */
  record?: RemarkRecordTarget | null;
}

/** A non-chat record a remark points at. */
export interface RemarkRecordTarget {
  /** The platform entity token (`task`, `note`, `spatial_board` …). */
  token: string;
  id: string;
  title: string | null;
}

export interface CommentRemark {
  kind: "comment";
  target: RemarkTarget;
  /** The platform.comments row this comment is (null = an unsaved passage, e.g. New chat about this). */
  commentId: string | null;
  /** The highlighted passage, verbatim. */
  quote: string | null;
  /** The person's words (may be empty: the passage itself is the point). */
  body: string;
  /**
   * The thread as it stood when the person continued it in a new chat — every
   * reply after the root, oldest first, with who wrote it. Absent on a fresh comment.
   */
  thread?: RemarkThreadEntry[];
}

/** One thread message, in the server's `RemarkThreadEntry` shape (camel-cased). */
export interface RemarkThreadEntry {
  /** "You", a person's name, or the agent's name. */
  authorName: string;
  authorKind: "person" | "agent";
  body: string;
  createdAt?: string | null;
}

export interface ChoiceRemark {
  kind: "choice";
  target: RemarkTarget;
  /** The decision's title, when it has one ("Cache strategy"). */
  title: string | null;
  /** What the person chose, in their words ("SQLite"). */
  chosen: string;
}

export interface EditRemark {
  kind: "edit";
  target: RemarkTarget;
  /** The answer text as of the last send (the diff base). */
  before: string;
  /** The answer text now. */
  after: string;
  /** What produced the edit: typed text, a choice, or a kind interaction. */
  origin: "text" | "choice" | "kind";
  /** A caller's projection that replaces the raw diff ("I chose SQLite"). */
  projection: string | null;
  /** What the projection answers (a decision's prompt), shown as the quote. */
  quote?: string | null;
}

/**
 * What an in-body edit says about itself when it is not plain typing: a
 * decision choice or a kind interaction, with the words that replace the raw
 * diff. Passed down `onContentChange` → `commitInlineContentEdit` →
 * `saveAnswerEdit` (the ONE edit stager).
 */
export interface AnswerEditRemarkMeta {
  origin: "choice" | "kind";
  /** "I chose SQLite." — replaces the raw diff when it is the only change. */
  projection?: string | null;
  /** The decision's prompt (or the shape's title). */
  quote?: string | null;
}

export interface AnswersRemark {
  kind: "answers";
  target: RemarkTarget;
  /** The questionnaire's title ("Intake questions"). */
  title: string | null;
  answers: { question: string; answer: string }[];
}

export interface InteractionRemark {
  kind: "interaction";
  target: RemarkTarget;
  /** The shape's `__kind`. */
  shape: string;
  title: string | null;
  /** One line a person could read: what they did. */
  summary: string;
  /** The interaction state after (structured, kind-specific). */
  state: unknown;
}

export type RemarkItem =
  | CommentRemark
  | ChoiceRemark
  | EditRemark
  | AnswersRemark
  | InteractionRemark;

/** What a remark resource holds in `ManagedResource.source`. */
export interface RemarkResourceSource {
  remark: RemarkItem;
  coalesceKey: string | null;
  /** Chip / drawer title (displayTitle reads `label`). */
  label: string;
  /** Drawer body (GenericBody reads `text`). */
  text: string;
}

const KIND_LABEL: Record<RemarkKind, string> = {
  comment: "Comment",
  choice: "Choice",
  edit: "Edit",
  answers: "Answers",
  interaction: "Interaction",
};

export function remarkKindLabel(kind: RemarkKind): string {
  return KIND_LABEL[kind];
}

const QUOTE_CHARS = 60;

function clip(text: string, max = QUOTE_CHARS): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function firstChangedLine(before: string, after: string): string {
  const lines = remarkDiff(before, after).split("\n");
  const added = lines.find((l) => l.startsWith("+ ") && l.slice(2).trim());
  const removed = lines.find((l) => l.startsWith("- ") && l.slice(2).trim());
  return added ? added.slice(2) : removed ? `Removed: ${removed.slice(2)}` : "";
}

/** The chip's words: the short quote (or what the person did), never prose. */
export function remarkChipTitle(item: RemarkItem): string {
  switch (item.kind) {
    case "comment":
      if (item.quote) return `“${clip(item.quote)}”`;
      return clip(item.body) || KIND_LABEL.comment;
    case "choice":
      return clip(item.chosen) || KIND_LABEL.choice;
    case "edit":
      // The words the person changed, not the answer's opening line.
      return clip(item.projection ?? firstChangedLine(item.before, item.after)) || KIND_LABEL.edit;
    case "answers":
      return item.title ? clip(item.title) : `${item.answers.length} answers`;
    case "interaction":
      return clip(item.summary) || clip(item.title ?? item.shape);
  }
}

/** A readable rendering for the drawer (structured data stays in `remark`). */
export function remarkReadableText(item: RemarkItem): string {
  switch (item.kind) {
    case "comment":
      return [item.quote ? `> ${item.quote.replace(/\n/g, "\n> ")}` : null, item.body || null]
        .filter(Boolean)
        .join("\n\n");
    case "choice":
      return [item.title ? `> ${item.title}` : null, item.chosen].filter(Boolean).join("\n\n");
    case "edit":
      return item.projection ?? remarkDiff(item.before, item.after);
    case "answers":
      return item.answers.map((a) => `- ${a.question}: ${a.answer}`).join("\n");
    case "interaction":
      return item.summary;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** The remark a resource carries, or null when it is not a remark. */
export function remarkSourceOf(resource: Pick<ManagedResource, "blockType" | "source">): RemarkResourceSource | null {
  if (resource.blockType !== REMARKS_BLOCK_TYPE || !isRecord(resource.source)) return null;
  const remark = resource.source.remark;
  if (!isRecord(remark) || typeof remark.kind !== "string" || !(remark.kind in KIND_LABEL)) return null;
  return resource.source as unknown as RemarkResourceSource;
}

function buildSource(item: RemarkItem, coalesceKey: string | null): RemarkResourceSource {
  return {
    remark: item,
    coalesceKey,
    label: remarkChipTitle(item),
    text: remarkReadableText(item),
  };
}

export interface StageRemarkOptions {
  /** One chip per key while unsent (e.g. `edit:<messageId>`, `comment:<commentId>`). Absent = always a new chip. */
  coalesceKey?: string | null;
  /** Re-stage under a known id (rehydration only). */
  resourceId?: string;
}

/**
 * Stage one remark into `conversationId`'s composer. Returns the resource id of
 * the chip that now holds it.
 */
export function stageRemark(conversationId: string, item: RemarkItem, options: StageRemarkOptions = {}) {
  return (dispatch: ChatDispatch, getState: () => ChatRootState): string => {
    const coalesceKey = options.coalesceKey ?? null;
    const state = getState();
    const resources = state.instanceResources.byConversationId[conversationId] ?? {};
    const submitted = new Set(state.instanceResources.submittedIds[conversationId] ?? []);
    const source = buildSource(item, coalesceKey);

    if (coalesceKey) {
      const live = Object.values(resources).find(
        (r) => !submitted.has(r.resourceId) && remarkSourceOf(r)?.coalesceKey === coalesceKey,
      );
      if (live) {
        dispatch(setResourceSource({ conversationId, resourceId: live.resourceId, source }));
        dispatch(setResourcePreview({ conversationId, resourceId: live.resourceId, preview: source.label }));
        return live.resourceId;
      }
    }

    // Never reuse an id that belongs to a submitted message.
    const requested = options.resourceId;
    const resourceId =
      requested && !submitted.has(requested) && !resources[requested] ? requested : generateResourceId();
    dispatch(addResource({ conversationId, blockType: REMARKS_BLOCK_TYPE, source, resourceId }));
    // Local and complete — no resolution step; setResourcePreview marks it ready.
    dispatch(setResourcePreview({ conversationId, resourceId, preview: source.label }));
    return resourceId;
  };
}

/** Remove the unsent chip staged under `coalesceKey` (an edit whose diff became empty). */
export function unstageRemark(conversationId: string, coalesceKey: string) {
  return (dispatch: ChatDispatch, getState: () => ChatRootState): boolean => {
    const state = getState();
    const resources = state.instanceResources.byConversationId[conversationId] ?? {};
    const submitted = new Set(state.instanceResources.submittedIds[conversationId] ?? []);
    const live = Object.values(resources).find(
      (r) => !submitted.has(r.resourceId) && remarkSourceOf(r)?.coalesceKey === coalesceKey,
    );
    if (!live) return false;
    dispatch(removeResource({ conversationId, resourceId: live.resourceId }));
    return true;
  };
}

/** A remark as the draft store keeps it. */
export interface StoredRemark {
  resourceId: string;
  coalesceKey: string | null;
  item: RemarkItem;
}

/** The remarks a conversation's composer holds that are NOT part of a submitted message. */
export function selectUnsentRemarks(state: ChatRootState, conversationId: string): StoredRemark[] {
  const resources = state.instanceResources.byConversationId[conversationId];
  if (!resources) return [];
  const submitted = new Set(state.instanceResources.submittedIds[conversationId] ?? []);
  return Object.values(resources)
    .filter((r) => !submitted.has(r.resourceId))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((r) => {
      const source = remarkSourceOf(r);
      return source ? [{ resourceId: r.resourceId, coalesceKey: source.coalesceKey, item: source.remark }] : [];
    });
}

/** Put stored remarks back as chips (ids preserved; one already present is left alone). */
export function restageRemarks(conversationId: string, remarks: readonly StoredRemark[]) {
  return (dispatch: ChatDispatch, getState: () => ChatRootState): number => {
    let restored = 0;
    for (const stored of remarks) {
      const present = getState().instanceResources.byConversationId[conversationId]?.[stored.resourceId];
      if (present) continue;
      dispatch(
        stageRemark(conversationId, stored.item, {
          coalesceKey: stored.coalesceKey,
          resourceId: stored.resourceId,
        }),
      );
      restored += 1;
    }
    return restored;
  };
}

/** Narrow an unknown stored value to remarks (storage is outside the type system). */
export function readStoredRemarks(value: unknown): StoredRemark[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.resourceId !== "string" || !isRecord(entry.item)) return [];
    const kind = entry.item.kind;
    if (typeof kind !== "string" || !(kind in KIND_LABEL) || !isRecord(entry.item.target)) return [];
    return [
      {
        resourceId: entry.resourceId,
        coalesceKey: typeof entry.coalesceKey === "string" ? entry.coalesceKey : null,
        item: entry.item as unknown as RemarkItem,
      },
    ];
  });
}
