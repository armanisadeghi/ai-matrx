/**
 * `run_shortcut` — run a saved shortcut on this item's content.
 *
 * The shortcut is the unit an organization authors (agent + config + scope
 * mappings + how results show), so a component names WHICH shortcut and hands
 * it values; it never names a raw agent or writes a prompt. Two ways to deliver
 * the result:
 *
 *  - `display: "window"` (default when nothing is saved) — opens the shortcut
 *    exactly as a menu click would: its own window, its own chat. Use for
 *    "Develop this idea further" style buttons whose answer is a conversation.
 *  - `saveAs: "<key>"` (or `display: "background"`) — runs it to completion,
 *    streaming into the floating live-run window, and returns the product
 *    (`expect: "json"` → the structured value, `"text"` → the answer text,
 *    `"image"` → `{ file_id, mime_type, width, height }` of the generated image,
 *    which the host turns into a displayable `src` when it hands state back).
 *    With `saveAs`, the host ALSO writes the product into the item's durable
 *    state under that key — even if the component unmounted mid-run — and it
 *    comes back to the component as `itemState[saveAs]`.
 *
 * Input:
 *   { shortcutId: string; scope?: object; variables?: object; userInput?: string;
 *     display?: "window" | "background"; expect?: "json" | "text" | "image";
 *     saveAs?: string; label?: string }
 * Result (background/saveAs): { data, saved: boolean }
 * Result (window): { conversationId }
 */

import type {
  KindActionContext,
  KindActionDefinition,
  KindActionResult,
  KindShortcutExpect,
  KindShortcutRequest,
} from "../kind-action-context";

/** A key a component may save under: plain, short, never a path or prototype key. */
const SAVE_KEY = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
/** Same ceiling as save_item_state: item state rides every render into the frame. */
const MAX_SAVED_BYTES = 64 * 1024;

function savedBytes(value: unknown): number {
  try {
    return JSON.stringify(value ?? null).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

interface RunShortcutInput extends KindShortcutRequest {
  display: "window" | "background";
  expect: KindShortcutExpect;
  saveAs: string | null;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseRunShortcutInput(input: unknown): RunShortcutInput | { error: string } {
  const obj = record(input);
  if (!obj) return { error: "run_shortcut expects an object { shortcutId, scope }" };
  const shortcutId = obj.shortcutId;
  if (typeof shortcutId !== "string" || !shortcutId.trim()) {
    return { error: "run_shortcut: shortcutId is required" };
  }
  let saveAs: string | null = null;
  if (obj.saveAs !== undefined && obj.saveAs !== null) {
    if (typeof obj.saveAs !== "string" || !SAVE_KEY.test(obj.saveAs) || FORBIDDEN_KEYS.has(obj.saveAs)) {
      return { error: "run_shortcut: saveAs must be a short key like \"idea_3_image\"" };
    }
    saveAs = obj.saveAs;
  }
  const display =
    obj.display === "background" || obj.display === "window"
      ? obj.display
      : saveAs
        ? "background"
        : "window";
  if (display === "window" && saveAs) {
    return { error: "run_shortcut: saveAs needs display \"background\" (a window run has no single product)" };
  }
  return {
    shortcutId: shortcutId.trim(),
    scope: record(obj.scope),
    variables: record(obj.variables),
    userInput: typeof obj.userInput === "string" ? obj.userInput : undefined,
    label: typeof obj.label === "string" ? obj.label.slice(0, 80) : undefined,
    display,
    expect: obj.expect === "text" || obj.expect === "image" ? obj.expect : "json",
    saveAs,
  };
}

async function runShortcutHandler(
  input: unknown,
  ctx: KindActionContext,
): Promise<KindActionResult> {
  const parsed = parseRunShortcutInput(input);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const { display, expect, saveAs, ...request } = parsed;

  if (display === "window") {
    const launched = await ctx.openShortcut(request);
    return { ok: true, result: launched };
  }

  if (saveAs && !ctx.itemState?.hosted) {
    return { ok: false, error: "Open this from its chat to keep results." };
  }

  const itemState = ctx.itemState;
  let tooBig = false;
  const run = await ctx.runShortcut({ ...request, expect }, (result) => {
    // The persistence seam: fires even when the component is gone.
    if (!saveAs || !itemState || !result.ok) return;
    if (savedBytes(result.data) > MAX_SAVED_BYTES) {
      tooBig = true;
      return;
    }
    itemState.patch({ [saveAs]: result.data });
  });
  if (!run.ok) return { ok: false, error: run.error ?? "The shortcut didn't return a result." };
  if (tooBig) {
    // The product is returned, never silently dropped — only not saved.
    return { ok: true, result: { data: run.data, saved: false, notSaved: "Too large to keep on this item." } };
  }
  return { ok: true, result: { data: run.data, saved: Boolean(saveAs) } };
}

export const runShortcutAction: KindActionDefinition = {
  key: "run_shortcut",
  label: "Run shortcut",
  description:
    "Run a saved shortcut on this item: open it in its own window, or run it in the background and save its result into this item (saveAs).",
  handler: runShortcutHandler,
};
