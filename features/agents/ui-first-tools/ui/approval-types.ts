/**
 * ApprovalChange — the structured "the agent wants to make this change, approve?"
 * descriptor rendered by <ApprovalCard>.
 *
 * This is the say-it-ONCE primitive behind agent-edit approval cards. Instead of
 * a pre-baked English sentence repeated as a chip + a context line + a question,
 * the producer emits the operation (`verb`), what it touches (`entity` + `title`),
 * and the exact field-level changes (`fields`). The card renders all of it in a
 * single, diff-aware surface: an add shows the new values; an update shows
 * before → after. Nothing is stated twice.
 *
 * Producers: the War Room write tools (features/agents/war-room-tools) today.
 * Any future client write-tool that needs human-in-the-loop approval can emit
 * the same shape and get the same card + auto-approve affordance for free.
 */

export type ApprovalVerb =
  | "add"
  | "update"
  | "rename"
  | "complete"
  | "reopen"
  | "append";

export interface ApprovalFieldDiff {
  /** Field name, Sentence case: "Title", "Status", "Due date", "Description". */
  label: string;
  /**
   * Current value. `undefined` ⇒ this is a brand-new value (an add), so the card
   * renders only `after`. `null` / "" ⇒ the field is currently empty/unset.
   */
  before?: string | null;
  /** Proposed value. `null` ⇒ the change clears the field. */
  after: string | null;
  /** Render as a multi-line block (description / note body) instead of inline. */
  block?: boolean;
}

export interface ApprovalAutoApprove {
  /** Grouping key the producer remembers (e.g. "task" | "note" | "tile"). */
  scope: string;
  /** Human noun for the toggle, lowercase: "task changes", "note edits". */
  noun: string;
}

export interface ApprovalChange {
  verb: ApprovalVerb;
  /** What's being changed, lowercase singular: "subtask", "task", "note", "tile". */
  entity: string;
  /** The thing's name — the card headline (subtask title, task name, tile name). */
  title?: string | null;
  /** Field-level diffs (updates) or new values (adds). May be empty. */
  fields: ApprovalFieldDiff[];
  /** When set, the card offers an "always approve {noun}" affordance. */
  autoApprove?: ApprovalAutoApprove;
}

/**
 * Sentinel packed into `AskUserResponse.selected` when the user approves AND asks
 * not to be asked again. The producer (war-room `approval.ts`) reads it to persist
 * the auto-approve flag — keeping the generic card free of feature-specific deps.
 */
export const REMEMBER_SENTINEL = "__matrx_remember_scope__";
