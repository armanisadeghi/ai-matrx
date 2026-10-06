/**
 * `save_item_state` — merge-patch this item's durable state.
 *
 * What a person adds to a rendered item (a pick, a note, an edited caption)
 * is saved per item and comes back as the component's `itemState` prop. A key
 * set to `null` is removed. The item's DATA (what the agent produced) is never
 * changed — state rides beside it, so the original answer stays intact.
 *
 * Input:  { patch: Record<string, unknown> }
 * Result: { saved: true }
 */

import type {
  KindActionContext,
  KindActionDefinition,
  KindActionResult,
} from "../kind-action-context";

/** Saved state is small, durable and per item — never a dump of the payload. */
const MAX_PATCH_BYTES = 64 * 1024;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

async function saveItemStateHandler(
  input: unknown,
  ctx: KindActionContext,
): Promise<KindActionResult> {
  const patch =
    input && typeof input === "object" ? (input as { patch?: unknown }).patch : undefined;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { ok: false, error: "save_item_state expects { patch: { key: value } }" };
  }
  const keys = Object.keys(patch);
  if (keys.length === 0) return { ok: false, error: "save_item_state: the patch is empty" };
  if (keys.some((k) => FORBIDDEN_KEYS.has(k))) {
    return { ok: false, error: "save_item_state: that key name isn't allowed" };
  }
  let size: number;
  try {
    size = JSON.stringify(patch).length;
  } catch {
    return { ok: false, error: "save_item_state: the patch must be plain JSON" };
  }
  if (size > MAX_PATCH_BYTES) {
    return { ok: false, error: "Too large to keep on this item (64 KB max)." };
  }
  if (!ctx.itemState?.hosted) {
    return { ok: false, error: "Open this from its chat to keep changes." };
  }
  ctx.itemState.patch(patch as Record<string, unknown>);
  return { ok: true, result: { saved: true } };
}

export const saveItemStateAction: KindActionDefinition = {
  key: "save_item_state",
  label: "Save item state",
  description:
    "Save values onto this item (merge-patch; null removes a key). They come back as the component's itemState prop.",
  handler: saveItemStateHandler,
};
