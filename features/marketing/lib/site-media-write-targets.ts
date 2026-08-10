/**
 * Pure validation + merge core for the `matrx-user/marketing-site-media` write
 * targets (`media_order`, `media_standards_slots`, `media_standards_notes`).
 * Kept free of React/services so the failure modes that matter — an agent
 * silently widening the preset vocabulary, or a slots write quietly dropping
 * the site's existing standards — are provable in unit tests
 * (`site-media-write-targets.test.ts`).
 *
 * Contract (mirrors the manifest target descriptions exactly):
 * - `media_order` is a PARTIAL order draft `{ type?, brief?, style?, width?,
 *   height? }`. Omitted keys keep their current value; an empty string CLEARS
 *   style/width/height (back to "inherit from the preset + standards"). The
 *   brief may not be cleared to empty — an order with no subject cannot be
 *   placed. `type` is validated against the REAL preset vocabulary
 *   (`isMediaOrderPresetId`), never a re-typed literal list. Unknown keys
 *   throw: an agent's typo must be heard, never coerced away.
 * - `media_standards_slots` REPLACES the full slot list. Each slot needs a
 *   name; width/height/max_kb are positive integers or null; ids are minted
 *   here so the agent never invents one.
 * - `media_standards_notes` replaces the free-form site-wide rules string.
 *
 * NOTHING here generates an image, spends money, or persists on its own — the
 * component seam stages these into the page's draft state and the USER presses
 * "Order this image" / "Save standards".
 */

import {
  MEDIA_ORDER_PRESET_IDS,
  isMediaOrderPresetId,
  type MediaOrderPresetId,
} from "@/features/marketing/lib/media-order-presets";
import type { MediaStandardSlot } from "@/features/marketing/data/media-library";

/**
 * The Generate view's order form, lifted to the workspace so it survives view
 * switches (and so the surface can emit it as `media_order_draft`).
 *
 * `width`/`height` are the raw digit STRINGS the numeric inputs hold — empty
 * means "no override, inherit from the matching media standard or the preset".
 */
export interface MediaOrderDraft {
  type: MediaOrderPresetId;
  /** What the image should show — the subject/brief the user or agent wrote. */
  brief: string;
  /** Optional style override; empty means the preset's own style. */
  style: string;
  width: string;
  height: string;
}

export const EMPTY_MEDIA_ORDER_DRAFT: MediaOrderDraft = {
  type: MEDIA_ORDER_PRESET_IDS[0]!,
  brief: "",
  style: "",
  width: "",
  height: "",
};

/** Widest dimension the generator will accept, in pixels. */
const MAX_DIMENSION = 8000;

function asRecord(value: unknown, target: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${target} expects an object value.`);
  }
  return value as Record<string, unknown>;
}

/**
 * Validate one optional pixel dimension. Returns the digit string to store, or
 * `""` for the documented "clear the override" signal.
 */
function dimensionValue(
  raw: unknown,
  key: "width" | "height",
): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string" && raw.trim() === "") return "";
  if (typeof raw !== "number" && typeof raw !== "string") {
    throw new Error(
      `media_order: ${key} must be a positive integer (or "" to clear the override).`,
    );
  }
  const parsed = typeof raw === "number" ? raw : Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_DIMENSION) {
    throw new Error(
      `media_order: ${key} must be a whole number of pixels between 1 and ${MAX_DIMENSION}; got ${JSON.stringify(raw)}.`,
    );
  }
  return String(parsed);
}

const MEDIA_ORDER_KEYS = ["type", "brief", "style", "width", "height"] as const;

/**
 * Validate a `media_order` write value into a PATCH of just the keys it
 * provided. Throws on any contract break.
 *
 * Validation is deliberately separate from the merge: the component applies
 * the patch inside a functional state update (so two applies in one agent
 * message compose against the freshest draft), and a throw must happen
 * BEFORE that — synchronously, where the writeback seam can catch it — never
 * inside a React updater.
 */
export function validateMediaOrderWrite(
  value: unknown,
): Partial<MediaOrderDraft> {
  const obj = asRecord(value, "media_order");
  const unknown = Object.keys(obj).filter(
    (key) => !(MEDIA_ORDER_KEYS as readonly string[]).includes(key),
  );
  if (unknown.length > 0) {
    throw new Error(
      `media_order: unknown field(s) ${unknown.join(", ")}. Allowed: ${MEDIA_ORDER_KEYS.join(", ")}.`,
    );
  }
  if (Object.keys(obj).length === 0) {
    throw new Error(
      `media_order: provide at least one of ${MEDIA_ORDER_KEYS.join(", ")}.`,
    );
  }

  const next: Partial<MediaOrderDraft> = {};

  if (obj.type !== undefined && obj.type !== null) {
    if (!isMediaOrderPresetId(obj.type)) {
      throw new Error(
        `media_order: type must be one of ${MEDIA_ORDER_PRESET_IDS.join(" | ")}; got ${JSON.stringify(obj.type)}.`,
      );
    }
    next.type = obj.type;
  }

  if (obj.brief !== undefined && obj.brief !== null) {
    if (typeof obj.brief !== "string") {
      throw new Error("media_order: brief must be a string.");
    }
    const brief = obj.brief.trim();
    if (!brief) {
      throw new Error(
        "media_order: brief must be a non-empty string — an image order needs a subject.",
      );
    }
    next.brief = brief;
  }

  if (obj.style !== undefined && obj.style !== null) {
    if (typeof obj.style !== "string") {
      throw new Error(
        'media_order: style must be a string (or "" to fall back to the preset style).',
      );
    }
    next.style = obj.style.trim();
  }

  const width = dimensionValue(obj.width, "width");
  if (width !== undefined) next.width = width;
  const height = dimensionValue(obj.height, "height");
  if (height !== undefined) next.height = height;

  return next;
}

/**
 * Validate a `media_order` write value and merge it over the given draft.
 * Convenience for tests and for callers holding a definitely-fresh draft.
 */
export function mergeMediaOrderWrite(
  current: MediaOrderDraft,
  value: unknown,
): MediaOrderDraft {
  return { ...current, ...validateMediaOrderWrite(value) };
}

function slotNumber(
  raw: unknown,
  key: string,
  where: string,
): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "number" && typeof raw !== "string") {
    throw new Error(`${where}.${key} must be a positive integer or null.`);
  }
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `${where}.${key} must be a positive whole number or null; got ${JSON.stringify(raw)}.`,
    );
  }
  return parsed;
}

const SLOT_KEYS = ["name", "width", "height", "format", "max_kb", "notes"];

/**
 * Validate a `media_standards_slots` write value into the FULL replacement
 * slot list. Ids are minted here (`mintId`, injectable for tests) — the agent
 * never supplies one.
 */
export function validateMediaStandardsSlotsWrite(
  value: unknown,
  mintId: () => string = () => crypto.randomUUID(),
): MediaStandardSlot[] {
  const obj = asRecord(value, "media_standards_slots");
  const rawSlots = obj.slots;
  if (!Array.isArray(rawSlots)) {
    throw new Error(
      "media_standards_slots: slots must be an array of { name, width?, height?, format?, max_kb?, notes? } — it REPLACES the full list.",
    );
  }
  if (rawSlots.length === 0) {
    throw new Error(
      "media_standards_slots: slots must not be empty. Removing every standard is a human decision — do it in the Standards view.",
    );
  }
  const seen = new Set<string>();
  return rawSlots.map((entry, index): MediaStandardSlot => {
    const where = `media_standards_slots: slots[${index}]`;
    const slot = asRecord(entry, where);
    const unknown = Object.keys(slot).filter((key) => !SLOT_KEYS.includes(key));
    if (unknown.length > 0) {
      throw new Error(
        `${where}: unknown field(s) ${unknown.join(", ")}. Allowed: ${SLOT_KEYS.join(", ")}.`,
      );
    }
    const name = slot.name;
    if (typeof name !== "string" || !name.trim()) {
      throw new Error(`${where}.name must be a non-empty string.`);
    }
    const key = name.trim().toLowerCase();
    if (seen.has(key)) {
      throw new Error(
        `${where}.name duplicates an earlier slot ("${name.trim()}"). Slot names must be unique.`,
      );
    }
    seen.add(key);
    const format = slot.format;
    if (format !== undefined && format !== null && typeof format !== "string") {
      throw new Error(`${where}.format must be a string or null.`);
    }
    const notes = slot.notes;
    if (notes !== undefined && notes !== null && typeof notes !== "string") {
      throw new Error(`${where}.notes must be a string.`);
    }
    return {
      id: mintId(),
      name: name.trim(),
      width: slotNumber(slot.width, "width", where),
      height: slotNumber(slot.height, "height", where),
      format:
        typeof format === "string" ? format.trim().toLowerCase() || null : null,
      maxKb: slotNumber(slot.max_kb, "max_kb", where),
      notes: typeof notes === "string" ? notes.trim() : "",
    };
  });
}

/**
 * Validate a `media_standards_notes` write value into the replacement notes
 * string. An empty string is allowed — clearing the site-wide rules is a
 * legitimate edit, and it stays a draft until the user saves.
 */
export function validateMediaStandardsNotesWrite(value: unknown): string {
  const obj = asRecord(value, "media_standards_notes");
  const unknown = Object.keys(obj).filter((key) => key !== "notes");
  if (unknown.length > 0) {
    throw new Error(
      `media_standards_notes: unknown field(s) ${unknown.join(", ")}. Allowed: notes.`,
    );
  }
  const notes = obj.notes;
  if (typeof notes !== "string") {
    throw new Error("media_standards_notes: notes must be a string.");
  }
  return notes.trim();
}
