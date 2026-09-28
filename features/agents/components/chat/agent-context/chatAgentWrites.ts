/**
 * chatAgentWrites — the pure checks behind the `matrx-user/chat` write targets
 * (declared in `features/surfaces/manifests/chat.manifest.ts`, registered in
 * `ChatConversationSurface.tsx`). No React, no store, no network: every rule is
 * unit-tested here (`__tests__/chatAgentWrites.test.ts`).
 *
 * The agents these serve are OUTSIDE agents — run from the header Agents menu
 * into a window, sidebar or overlay while the chat page is open. The page's
 * own conversation is never offered these targets.
 *
 * Every list check reports ALL problems at once, so the agent fixes its whole
 * value in one retry, and a value that is partly wrong is refused whole.
 */

import { readCollectionList } from "@/features/surfaces/runtime/collection-write-targets";
import { resolveSurfaceWritePatch } from "@/features/surfaces/runtime/surface-write-patch";
import {
  CHAT_DRAFT_WRITE_MODES,
  CHAT_INPUT_DRAFT_MAX,
  CHAT_MESSAGE_TEXT_MAX,
  CHAT_MESSAGES_PER_WRITE,
  isChatDraftWriteMode,
} from "@/features/surfaces/manifests/chat.manifest";

/** A loaded message, as the checks need it. */
export interface ChatMessageSnapshot {
  id: string;
  role: string;
  /** The text the transcript shows (what a patch anchors against). */
  text: string;
  streaming: boolean;
}

/** A text patch: replace exactly one occurrence of `old_str`. */
export interface ChatTextPatch {
  old_str: string;
  new_str: string;
}

/** One checked message edit. */
export interface ChatMessageEditPlan {
  messageId: string;
  role: "user" | "assistant";
  /** Whole replacement text, or the patch to re-apply to the stored text. */
  edit: { text: string } | { patch: ChatTextPatch };
  /** The resulting text against the text the agent saw. */
  next: string;
}

const EDITABLE_ROLES = new Set(["user", "assistant"]);
const UPDATE_KEYS = ["message_id", "text", "patch"];

/** Refuse with every problem, numbered, in one sentence block. */
export function refuseProblems(
  target: string,
  problems: readonly string[],
): void {
  if (problems.length === 0) return;
  if (problems.length === 1)
    throw new Error(`${target} refused, nothing was changed: ${problems[0]}`);
  throw new Error(
    `${target} refused, nothing was changed. ${problems.length} problems:\n${problems
      .map((p, i) => `${i + 1}. ${p}`)
      .join("\n")}`,
  );
}

function describeReceived(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value === "object" ? "an object" : JSON.stringify(value);
}

/** Read a `{ old_str, new_str }` patch; returns a problem string or the patch. */
function readPatch(where: string, raw: unknown): ChatTextPatch | string {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    return `${where}.patch must be an object { "old_str": string, "new_str": string }; received ${describeReceived(raw)}.`;
  const { old_str, new_str } = raw as Record<string, unknown>;
  if (typeof old_str !== "string" || old_str.length === 0)
    return `${where}.patch.old_str must be the exact, non-empty text to replace.`;
  if (typeof new_str !== "string")
    return `${where}.patch.new_str must be a string (send "" to delete the matched text).`;
  return { old_str, new_str };
}

/** Apply a patch to a text; returns the new text or a problem string. */
export function applyTextPatch(
  where: string,
  current: string,
  patch: ChatTextPatch,
): { next: string } | { problem: string } {
  const outcome = resolveSurfaceWritePatch(current, {
    command: "str_replace",
    old_str: patch.old_str,
    new_str: patch.new_str,
  });
  if (!outcome.ok) return { problem: `${where}: ${outcome.reason}` };
  return { next: outcome.next };
}

function lookup(messages: readonly ChatMessageSnapshot[]) {
  return new Map(messages.map((m) => [m.id, m]));
}

function unknownIdProblem(where: string, id: string): string {
  return `${where}: "${id}" is not a message on this page. Use an id from the transcript value (only loaded messages can be changed).`;
}

/** `update_messages`: an array of `{ message_id, text }` or `{ message_id, patch }`. */
export function parseUpdateMessagesValue(
  value: unknown,
  messages: readonly ChatMessageSnapshot[],
): ChatMessageEditPlan[] {
  const target = "update_messages";
  const list = readCollectionList(target, "messages", value, CHAT_MESSAGES_PER_WRITE);
  const byId = lookup(messages);
  const problems: string[] = [];
  const plans: ChatMessageEditPlan[] = [];
  const seen = new Set<string>();

  list.forEach((raw, i) => {
    const where = `${target}[${i}]`;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      problems.push(
        `${where} must be an object { "message_id", "text" } or { "message_id", "patch": { "old_str", "new_str" } }; received ${describeReceived(raw)}.`,
      );
      return;
    }
    const item = raw as Record<string, unknown>;
    const extra = Object.keys(item).filter((k) => !UPDATE_KEYS.includes(k));
    if (extra.length)
      problems.push(
        `${where} does not accept ${extra.join(", ")}. Allowed keys: ${UPDATE_KEYS.join(", ")}.`,
      );
    const id = typeof item.message_id === "string" ? item.message_id.trim() : "";
    if (!id) {
      problems.push(`${where}.message_id is required (an id from the transcript value).`);
      return;
    }
    if (seen.has(id)) {
      problems.push(`${where}: message ${id} is listed more than once. Combine its edits into one item.`);
      return;
    }
    seen.add(id);
    const message = byId.get(id);
    if (!message) {
      problems.push(unknownIdProblem(where, id));
      return;
    }
    if (!EDITABLE_ROLES.has(message.role)) {
      problems.push(`${where}: message ${id} is a ${message.role} message; only user and assistant messages can be edited.`);
      return;
    }
    if (message.streaming) {
      problems.push(`${where}: message ${id} is still being written. Wait until the response finishes.`);
      return;
    }
    const hasText = "text" in item && item.text !== undefined;
    const hasPatch = "patch" in item && item.patch !== undefined;
    if (hasText === hasPatch) {
      problems.push(
        `${where} needs exactly one of "text" (the whole new text) or "patch" ({ "old_str", "new_str" }).`,
      );
      return;
    }
    const role = message.role as "user" | "assistant";
    if (hasText) {
      if (typeof item.text !== "string" || !item.text.trim()) {
        problems.push(`${where}.text must be non-empty text. To remove a message use delete_messages.`);
        return;
      }
      if (item.text.length > CHAT_MESSAGE_TEXT_MAX) {
        problems.push(`${where}.text is ${item.text.length} characters; the maximum is ${CHAT_MESSAGE_TEXT_MAX}.`);
        return;
      }
      if (item.text === message.text) {
        problems.push(`${where}: the new text is identical to message ${id}'s current text.`);
        return;
      }
      plans.push({ messageId: id, role, edit: { text: item.text }, next: item.text });
      return;
    }
    const patch = readPatch(where, item.patch);
    if (typeof patch === "string") {
      problems.push(patch);
      return;
    }
    const applied = applyTextPatch(`${where} (message ${id})`, message.text, patch);
    if ("problem" in applied) {
      problems.push(applied.problem);
      return;
    }
    if (!applied.next.trim()) {
      problems.push(`${where}: the patch would leave message ${id} empty. To remove a message use delete_messages.`);
      return;
    }
    if (applied.next === message.text) {
      problems.push(`${where}: the patch does not change message ${id} (old_str and new_str are the same).`);
      return;
    }
    plans.push({ messageId: id, role, edit: { patch }, next: applied.next });
  });

  refuseProblems(target, problems);
  return plans;
}

/**
 * The text to save for a plan against the message's CURRENT text (the stored
 * answer re-read at apply time, or the live user text). A patch is re-applied
 * so an edit that landed meanwhile is never overwritten.
 */
export function resolveEditAgainst(
  plan: ChatMessageEditPlan,
  current: string,
): string {
  if ("text" in plan.edit) return plan.edit.text;
  const applied = applyTextPatch(`message ${plan.messageId}`, current, plan.edit.patch);
  if ("problem" in applied)
    throw new Error(
      `${applied.problem} (the saved text differs from what the transcript showed; read it again and resend).`,
    );
  return applied.next;
}

/** `delete_messages`: an array of ids or `{ message_id }`. */
export function parseDeleteMessagesValue(
  value: unknown,
  messages: readonly ChatMessageSnapshot[],
): ChatMessageSnapshot[] {
  const target = "delete_messages";
  const list = readCollectionList(target, "messages", value, CHAT_MESSAGES_PER_WRITE);
  const byId = lookup(messages);
  const problems: string[] = [];
  const out: ChatMessageSnapshot[] = [];
  const seen = new Set<string>();
  list.forEach((raw, i) => {
    const where = `${target}[${i}]`;
    const id =
      typeof raw === "string"
        ? raw.trim()
        : raw && typeof raw === "object" && !Array.isArray(raw)
          ? String((raw as Record<string, unknown>).message_id ?? "").trim()
          : "";
    if (!id) {
      problems.push(`${where} must be a message id or { "message_id": "<id>" }; received ${describeReceived(raw)}.`);
      return;
    }
    if (seen.has(id)) {
      problems.push(`${where}: message ${id} is listed more than once.`);
      return;
    }
    seen.add(id);
    const message = byId.get(id);
    if (!message) {
      problems.push(unknownIdProblem(where, id));
      return;
    }
    if (!EDITABLE_ROLES.has(message.role)) {
      problems.push(`${where}: message ${id} is a ${message.role} message; only user and assistant messages can be deleted.`);
      return;
    }
    if (message.streaming) {
      problems.push(`${where}: message ${id} is still being written. Stop the response first (stop_response) or wait.`);
      return;
    }
    out.push(message);
  });
  refuseProblems(target, problems);
  return out;
}

/**
 * `input_draft`: `{ text, mode?: "replace" | "append" }` or
 * `{ patch: { old_str, new_str } }` against the current draft. Returns the
 * whole next draft.
 */
export function planInputDraftWrite(value: unknown, current: string): string {
  const target = "input_draft";
  const modes = CHAT_DRAFT_WRITE_MODES.map((m) => `"${m}"`).join(" | ");
  const shape = `{ "text": string, "mode"?: ${modes} } or { "patch": { "old_str": string, "new_str": string } }`;
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${target} expects ${shape}; received ${describeReceived(value)}.`);
  const item = value as Record<string, unknown>;
  const extra = Object.keys(item).filter((k) => !["text", "mode", "patch"].includes(k));
  if (extra.length)
    throw new Error(`${target} does not accept ${extra.join(", ")}. Expected ${shape}.`);
  let next: string;
  if (item.patch !== undefined) {
    if (item.text !== undefined || item.mode !== undefined)
      throw new Error(`${target} takes either "patch" or "text" (+ "mode"), not both.`);
    if (!current)
      throw new Error(`${target} patch refused: the composer is empty, so there is nothing to patch. Send { "text": "..." } instead.`);
    const patch = readPatch(target, item.patch);
    if (typeof patch === "string") throw new Error(patch);
    const applied = applyTextPatch(`${target} patch`, current, patch);
    if ("problem" in applied) throw new Error(applied.problem);
    next = applied.next;
  } else {
    const { text, mode } = item;
    if (typeof text !== "string" || !text.trim())
      throw new Error(`${target} expects a non-empty "text" string (the message to stage), or a "patch". Expected ${shape}.`);
    if (mode !== undefined && !isChatDraftWriteMode(mode))
      throw new Error(`${target} "mode" must be ${modes} when present, got ${JSON.stringify(mode)}.`);
    next = mode === "append" && current.trim() ? `${current.trimEnd()}\n${text}` : text;
  }
  if (next.length > CHAT_INPUT_DRAFT_MAX)
    throw new Error(`${target} would make the draft ${next.length} characters; the maximum is ${CHAT_INPUT_DRAFT_MAX}.`);
  return next;
}

/** A single-message action value: `"<id>"` or `{ "message_id": "<id>" }`. */
export function parseMessageIdValue(target: string, value: unknown): string {
  const id =
    typeof value === "string"
      ? value.trim()
      : value && typeof value === "object" && !Array.isArray(value)
        ? String((value as Record<string, unknown>).message_id ?? "").trim()
        : "";
  if (!id)
    throw new Error(`${target} expects { "message_id": "<id from the transcript value>" }; received ${describeReceived(value)}.`);
  return id;
}

/** An action that takes no data: the value must be `true`. */
export function requireConfirmTrue(target: string, value: unknown): void {
  if (value !== true && value !== "true")
    throw new Error(`${target} takes the value true; received ${describeReceived(value)}.`);
}
