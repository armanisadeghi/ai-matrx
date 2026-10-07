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
// Reload / other devices: unsent remarks are DURABLE SERVER-SIDE through
// platform.block_states (design: common-docs/projects/remarks/DESIGN-block-state.md).
// An answers / interaction chip is DERIVED from its block's saved state
// (state_version > sent_version), an edit / comment / choice chip is written
// through the `RemarkDurability` port below (registered by the app), and every
// chip carries `blockStateRef` so the server marks it sent with the message.
// Nothing about an unsent chip is kept in the browser.

import type { ChatDispatch, ChatRootState } from "../../../../store/root-state";
import type { ManagedResource } from "../../../types/instance.types";
import { generateResourceId } from "../utils/ids";
import { remarkChangeSummary, remarkDiff } from "./remark-diff";
import { taskToggleChipTitle } from "./task-toggle-projection";
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
  /** The platform entity token (`task`, `note`, `board` …). */
  token: string;
  id: string;
  title: string | null;
}

/** The platform.block_states row a chip was made from / is kept in (rides the wire as `block_state_ref`). */
export interface BlockStateRef {
  id: string;
  stateVersion: number;
}

export interface CommentRemark {
  kind: "comment";
  blockStateRef?: BlockStateRef | null;
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
  blockStateRef?: BlockStateRef | null;
  target: RemarkTarget;
  /** The decision's title, when it has one ("Cache strategy"). */
  title: string | null;
  /** What the person chose, in their words ("SQLite"). */
  chosen: string;
}

export interface EditRemark {
  kind: "edit";
  blockStateRef?: BlockStateRef | null;
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
  blockStateRef?: BlockStateRef | null;
  target: RemarkTarget;
  /** The questionnaire's title ("Intake questions"). */
  title: string | null;
  answers: { question: string; answer: string }[];
}

export interface InteractionRemark {
  kind: "interaction";
  blockStateRef?: BlockStateRef | null;
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
      return (
        taskToggleChipTitle(item.before, item.after) ??
        (clip(item.projection ?? remarkChangeSummary(item.before, item.after)) || KIND_LABEL.edit)
      );
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
  /** The chip is being put back FROM the server (restore) — do not write it again. */
  fromServer?: boolean;
}

// ── THE DURABILITY PORT ─────────────────────────────────────────────────────
// An unsent chip with no block of its own (comment / edit / choice / a kind action's
// interaction) is kept server-side (platform.block_states)
// by the app, which registers this port; the package never imports app code and
// never keeps the chip in the browser. A chip that arrives WITH a `blockStateRef`
// (derived from its block's saved state — answers, kind interactions) needs no
// `save`: that saved state IS the chip.

export interface RemarkDurability {
  /** A comment / edit / choice chip was staged or changed — write it through. */
  save(conversationId: string, resourceId: string, coalesceKey: string | null, item: RemarkItem): void;
  /** A chip left the composer without being sent (X, or an edit that became empty): retire it for good. */
  retire(conversationId: string, resourceId: string, coalesceKey: string | null, item: RemarkItem): void;
  /**
   * The composer mounted: put this conversation's unsent chips back from the
   * server — only chips staged into THIS conversation id, never any other.
   */
  restore(conversationId: string): void;
  /** True while a chip's write is queued or in flight (its row/ref has not come back yet). */
  hasPending(conversationId: string): boolean;
  /** Write everything queued NOW and wait until every chip holds its saved row/ref. */
  flush(conversationId: string): Promise<void>;
}

/** True while some chip of this conversation has not yet been saved server-side. */
export function hasPendingRemarkWrites(conversationId: string): boolean {
  return durability?.hasPending(conversationId) ?? false;
}

/**
 * True once the app has registered how unsent chips are kept. Without it every
 * chip is browser-only and lost on reload, so a missing port is announced, never
 * silently stood in for (the door a person touches must say when it is not wired).
 */
export function isRemarkDurabilityRegistered(): boolean {
  return durability !== null;
}

const announcedMissing = new Set<string>();
function announceMissingDurability(op: string): void {
  if (announcedMissing.has(op)) return;
  announcedMissing.add(op);
  console.error(
    `[remarks] ${op} ran with no durability port registered: unsent chips are NOT kept server-side. The app must call registerRemarkDurability (providers/ChatSurfaceRegistrations).`,
  );
}

/** Save every pending chip write and wait for its row/ref (called before a send). */
export async function flushRemarkWrites(conversationId: string): Promise<void> {
  if (!durability) announceMissingDurability("flush");
  await durability?.flush(conversationId);
}

/** Put a conversation's unsent chips back (any device) — the composer calls this once on mount. */
export function restoreComposerRemarks(conversationId: string): void {
  if (!durability) announceMissingDurability("restore");
  durability?.restore(conversationId);
}

let durability: RemarkDurability | null = null;

/** The app registers how unsent chips are kept. Returns the release. */
export function registerRemarkDurability(port: RemarkDurability): () => void {
  durability = port;
  return () => {
    if (durability === port) durability = null;
  };
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
        if (!options.fromServer && !item.blockStateRef) {
          if (!durability) announceMissingDurability("save");
          durability?.save(conversationId, live.resourceId, coalesceKey, item);
        }
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
    if (!options.fromServer && !item.blockStateRef) {
      if (!durability) announceMissingDurability("save");
      durability?.save(conversationId, resourceId, coalesceKey, item);
    }
    return resourceId;
  };
}

/** Record which block_states row (and version) holds a staged chip, so the send marks it sent. */
export function attachRemarkRef(conversationId: string, resourceId: string, ref: BlockStateRef) {
  return (dispatch: ChatDispatch, getState: () => ChatRootState): boolean => {
    const resource = getState().instanceResources.byConversationId[conversationId]?.[resourceId];
    const source = resource ? remarkSourceOf(resource) : null;
    if (!resource || !source) return false;
    const held = source.remark.blockStateRef;
    if (held && held.id === ref.id && held.stateVersion >= ref.stateVersion) return false;
    dispatch(
      setResourceSource({
        conversationId,
        resourceId,
        source: { ...source, remark: { ...source.remark, blockStateRef: ref } },
      }),
    );
    return true;
  };
}

/** The X on a chip: retire it durably, then remove it. */
export function dismissRemarkChip(conversationId: string, resourceId: string) {
  return (dispatch: ChatDispatch, getState: () => ChatRootState): void => {
    const resource = getState().instanceResources.byConversationId[conversationId]?.[resourceId];
    const source = resource ? remarkSourceOf(resource) : null;
    if (source) durability?.retire(conversationId, resourceId, source.coalesceKey, source.remark);
    dispatch(removeResource({ conversationId, resourceId }));
  };
}

/** Remove the unsent chip staged under `coalesceKey` (an edit whose diff became empty). */
export function unstageRemark(conversationId: string, coalesceKey: string, options: { retire?: boolean } = {}) {
  return (dispatch: ChatDispatch, getState: () => ChatRootState): boolean => {
    const state = getState();
    const resources = state.instanceResources.byConversationId[conversationId] ?? {};
    const submitted = new Set(state.instanceResources.submittedIds[conversationId] ?? []);
    const live = Object.values(resources).find(
      (r) => !submitted.has(r.resourceId) && remarkSourceOf(r)?.coalesceKey === coalesceKey,
    );
    if (!live) return false;
    const source = remarkSourceOf(live);
    if (source && options.retire !== false) {
      durability?.retire(conversationId, live.resourceId, source.coalesceKey, source.remark);
    }
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

/**
 * Put stored remarks back as chips (ids preserved; one already present is left alone).
 *
 * `persist: true` is for remarks that are NEW to the server — "New chat about
 * this" hands its passage over in memory, so no row holds it yet. Without it the
 * chip lived only in this tab and was lost on reload. The default (`false`) is a
 * restore of rows the server already holds.
 */
export function restageRemarks(
  conversationId: string,
  remarks: readonly StoredRemark[],
  options: { persist?: boolean } = {},
) {
  return (dispatch: ChatDispatch, getState: () => ChatRootState): number => {
    let restored = 0;
    for (const stored of remarks) {
      const present = getState().instanceResources.byConversationId[conversationId]?.[stored.resourceId];
      if (present) continue;
      dispatch(
        stageRemark(conversationId, stored.item, {
          coalesceKey: stored.coalesceKey,
          resourceId: stored.resourceId,
          fromServer: !options.persist,
        }),
      );
      restored += 1;
    }
    return restored;
  };
}

/** Narrow an unknown handed-over value (an in-memory transfer, a server row) to remarks. */
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
