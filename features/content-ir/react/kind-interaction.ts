"use client";

// features/content-ir/react/kind-interaction.ts
//
// THE SHAPE INTERACTION SEAM (Turn References ruling 7). What a person DOES
// inside an interactive shape (`__kind`) that never touches the answer text —
// ticking recipe ingredients, finishing progress items, walking a decision
// tree, a quiz score — rides along with their NEXT message as ONE `interaction`
// remark chip per shape instance (conversationId, messageId, blockIndex),
// updated in place while unsent and removable with its X.
//
// Two funnels: the block's saved state (features/block-state `useBlockState` —
// the chip is DERIVED from the row, durable server-side) and the kind action
// runner's surface-write result (`emitKindInteraction`, kept server-side
// through the remark durability port).
//
// Only ANSWER state is ever staged: each kind lists the state keys that are the
// person's answer. Everything else is pure view state (a slide, a sort, an
// expanded row, fullscreen) and is never staged. A kind with no entry here is
// never staged. Edits that change the answer TEXT go through the edit stager
// (saveAnswerEdit), not here. Gated by `chat.remarks.auto_include_interactions`.

import type { AppDispatch } from "@/lib/redux/store";
import { durableRecordId } from "@ai-matrx/kit/ids";
import {
  stageRemark,
  unstageRemark,
  type InteractionRemark,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remarks";
import { remarksAutoIncludeEnabled } from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remark-knob";
import type { ChatRootState } from "@ai-matrx/chat/store/root-state";

type State = Record<string, unknown>;

interface KindInteractionRule {
  /** The state keys that are the person's answer (everything else is view state). */
  keys: readonly string[];
  /** One line a person could read: what they did. Empty = nothing to say (unstage). */
  summarize: (state: State, data: unknown) => string;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function count(data: unknown, key: string): number | null {
  const items = data && typeof data === "object" ? (data as Record<string, unknown>)[key] : undefined;
  return Array.isArray(items) ? items.length : null;
}

function ofTotal(n: number, total: number | null): string {
  return total ? `${n} of ${total}` : String(n);
}

function names(value: unknown[], max = 4): string {
  const shown = value.slice(0, max).map(String).join(", ");
  return value.length > max ? `${shown} +${value.length - max}` : shown;
}

/** A progress tracker step's words for its id (`phases[].steps[]`), or null. */
function progressStepText(data: unknown, id: unknown): string | null {
  const phases = data && typeof data === "object" ? (data as { phases?: unknown }).phases : undefined;
  for (const phase of list(phases)) {
    for (const step of list((phase as { steps?: unknown } | null)?.steps)) {
      const s = step as { id?: unknown; text?: unknown } | null;
      if (s?.id === id && typeof s.text === "string" && s.text.trim()) return s.text.trim();
    }
  }
  return null;
}

/** Per-kind answer keys. A kind not listed is never staged. */
export const KIND_INTERACTION_RULES: Readonly<Record<string, KindInteractionRule>> = {
  recipe: {
    keys: ["checkedIngredients", "completedSteps", "servingMultiplier"],
    summarize: (s, data) => {
      const parts: string[] = [];
      const ing = list(s.checkedIngredients).length;
      const steps = list(s.completedSteps).length;
      if (ing) parts.push(`checked ${ofTotal(ing, count(data, "ingredients"))} ingredients`);
      if (steps) parts.push(`finished ${ofTotal(steps, count(data, "instructions"))} steps`);
      if (typeof s.servingMultiplier === "number" && s.servingMultiplier !== 1) {
        parts.push(`scaled servings ×${s.servingMultiplier}`);
      }
      return parts.length ? `I ${parts.join(", ")}.` : "";
    },
  },
  progress: {
    keys: ["completed"],
    summarize: (s, data) => {
      const done = list(s.completed).map((id) => progressStepText(data, id) ?? id);
      return done.length ? `I marked done: ${names(done)}.` : "";
    },
  },
  decision_tree: {
    keys: ["currentNodeId", "history", "completedPaths"],
    summarize: (s) => {
      const steps = list(s.history).length;
      const finished = list(s.completedPaths).length;
      if (!steps && !finished) return "";
      const at = typeof s.currentNodeId === "string" && s.currentNodeId ? ` and I am at “${s.currentNodeId}”` : "";
      return `I made ${steps} choice${steps === 1 ? "" : "s"}${at}${finished ? `; finished ${finished} path${finished === 1 ? "" : "s"}` : ""}.`;
    },
  },
  tasks: {
    keys: ["checkboxState"],
    summarize: (s, data) => {
      const state = (s.checkboxState ?? {}) as Record<string, unknown>;
      const done = Object.values(state).filter((v) => v === true).length;
      return done ? `I ticked ${ofTotal(done, Object.keys(state).length)} tasks.` : "";
    },
  },
  troubleshooting: {
    keys: ["completedSteps"],
    summarize: (s) => {
      const done = list(s.completedSteps);
      return done.length ? `I completed ${done.length} step${done.length === 1 ? "" : "s"}: ${names(done)}.` : "";
    },
  },
  quiz: {
    keys: ["results"],
    summarize: (s) => {
      const r = s.results as { correctCount?: number; totalQuestions?: number; scorePercentage?: number } | undefined;
      if (!r || typeof r.correctCount !== "number") return "";
      return `I scored ${r.correctCount}/${r.totalQuestions ?? "?"} (${Math.round(r.scorePercentage ?? 0)}%).`;
    },
  },
  surface_write: {
    keys: ["written"],
    summarize: (s) => (typeof s.written === "string" && s.written ? `I applied: ${s.written}` : ""),
  },
};

/**
 * Keys that are PURE VIEW state for kinds that have no answer rule: a slide, a
 * sort, a hidden column. They stay local — never written to block state, never
 * staged (Arman's design B4).
 */
const KIND_VIEW_KEYS: Readonly<Record<string, readonly string[]>> = {
  presentation: ["currentSlide"],
  comparison: ["sortBy", "sortDirection", "hiddenColumns", "showScores"],
};

/**
 * Split a state patch into what the person MADE (durable, server-side) and what
 * is only how they are LOOKING at it (local). A kind with an answer rule keeps
 * the answer keys; a kind listed in KIND_VIEW_KEYS drops the view keys; any
 * other kind (a questionnaire's form) keeps everything.
 */
/** Durable keys a kind keeps beyond its answer keys (a quiz's whole session, whose `results` is the chip). */
const KIND_EXTRA_DURABLE_KEYS: Readonly<Record<string, readonly string[]>> = {
  quiz: ["quizState"],
};

export function splitKindState(kind: string, patch: State): { durable: State; view: State } {
  const canonical = canonicalInteractionKind(kind);
  const rule = KIND_INTERACTION_RULES[canonical];
  const viewKeys = KIND_VIEW_KEYS[canonical];
  const durable: State = {};
  const view: State = {};
  for (const [key, value] of Object.entries(patch)) {
    const isView = rule ? !rule.keys.includes(key) && !KIND_EXTRA_DURABLE_KEYS[canonical]?.includes(key) : viewKeys ? viewKeys.includes(key) : false;
    (isView ? view : durable)[key] = value;
  }
  return { durable, view };
}

/** Canvas adapter/type names → the kind the rules are keyed by. */
const KIND_ALIASES: Readonly<Record<string, string>> = {
  "decision-tree": "decision_tree",
  decisionTree: "decision_tree",
  progress_tracker: "progress",
  "progress-tracker": "progress",
};

export function canonicalInteractionKind(kind: string): string {
  return KIND_ALIASES[kind] ?? kind;
}

/** Only the answer keys of `state` (pure: exported for the tests). */
export function answerStateOf(kind: string, state: State): State | null {
  const rule = KIND_INTERACTION_RULES[canonicalInteractionKind(kind)];
  if (!rule) return null;
  const out: State = {};
  for (const key of rule.keys) if (key in state && state[key] !== undefined) out[key] = state[key];
  return Object.keys(out).length ? out : null;
}

export interface KindInteractionEvent {
  kind: string;
  /** Human title of the shape ("Weeknight chili"), when it has one. */
  title?: string | null;
  conversationId: string | null | undefined;
  messageId: string | null | undefined;
  blockIndex: number | null | undefined;
  /** The interaction state after (may include view keys — they are dropped). */
  state: State;
  /**
   * The state before this change, when known. If its answer keys equal the
   * new ones the change was view-only (a slide, a sort, an expanded row) and
   * nothing is staged.
   */
  previous?: State | null;
  /** The shape's data, for summaries that count against it. */
  data?: unknown;
}

export function interactionRemarkKey(messageId: string, blockIndex: number | null | undefined): string {
  return `interaction:${messageId}:${blockIndex ?? 0}`;
}

/** True when the answer keys did not change (pure view state moved). Pure. */
export function isViewOnlyChange(event: Pick<KindInteractionEvent, "kind" | "state" | "previous">): boolean {
  if (event.previous === undefined) return false;
  const before = event.previous ? answerStateOf(event.kind, event.previous) : null;
  const after = answerStateOf(event.kind, event.state);
  return JSON.stringify(before) === JSON.stringify(after);
}

/** The remark this event stages, or null when it carries no answer state. Pure. */
export function interactionRemarkOf(event: KindInteractionEvent): InteractionRemark | null {
  if (!event.conversationId || !event.messageId) return null;
  const kind = canonicalInteractionKind(event.kind);
  const rule = KIND_INTERACTION_RULES[kind];
  const answer = answerStateOf(kind, event.state);
  if (!rule || !answer) return null;
  const summary = rule.summarize(answer, event.data);
  if (!summary) return null;
  return {
    kind: "interaction",
    // The answer's database id (the transcript key is only the coalesce key).
    target: {
      conversationId: event.conversationId,
      messageId: durableRecordId(event.messageId) ?? null,
      blockIndex: event.blockIndex ?? null,
    },
    shape: kind,
    title: event.title?.trim() || null,
    summary,
    state: answer,
  };
}

/**
 * Stage (or update, or remove) the ONE interaction chip for this shape.
 * Pure view state and kinds without a rule never stage; an answer state that
 * says nothing removes the chip.
 */
export function emitKindInteraction(event: KindInteractionEvent) {
  return async (dispatch: AppDispatch, getState: () => unknown): Promise<string | null> => {
    if (!event.conversationId || !event.messageId) return null;
    if (!KIND_INTERACTION_RULES[canonicalInteractionKind(event.kind)]) return null;
    if (isViewOnlyChange(event)) return null;
    if (!(await remarksAutoIncludeEnabled(getState as () => ChatRootState))) return null;
    const key = interactionRemarkKey(event.messageId, event.blockIndex);
    const remark = interactionRemarkOf(event);
    if (!remark) {
      dispatch(unstageRemark(event.conversationId, key));
      return null;
    }
    return dispatch(stageRemark(event.conversationId, remark, { coalesceKey: key }));
  };
}
