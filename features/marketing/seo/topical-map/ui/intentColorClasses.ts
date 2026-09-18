// features/marketing/seo/topical-map/ui/intentColorClasses.ts
//
// The `intent_colors` knob speaks in COLOUR NAMES (`green`, `amber`, …). This
// file is the only place a name becomes classes, and every class is a semantic
// token so light and dark both work without a second palette.
//
// 🚨 AN UNKNOWN NAME IS NEVER A BLANK DOT. The knob is a row in
// `platform.feature_knob`; an admin can put anything in it and a future
// migration can add a colour this build has never heard of. A `??` to
// `undefined` there renders an invisible mark on a page whose whole job is to
// say where a page is going — so an unknown name renders the `missing`
// treatment (which is honest: we do not know) AND reaches the Error Inspector
// through `captureError`, exactly as `errors.ts` does for an RPC refusal.

import { captureError } from "@/lib/diagnostics/errorCaptureStore";

/** The colour vocabulary `seo.topical_map.intent_colors` is allowed to hold. */
export type MapIntentColorName =
  | "green"
  | "amber"
  | "blue"
  | "red"
  | "gray_dashed"
  | "purple_dashed";

export interface IntentColorClasses {
  /** Classes for the dot / swatch itself. */
  dot: string;
  /** Classes for text drawn in the same tone. */
  text: string;
}

/**
 * WHY `purple_dashed` IS DRAWN IN `primary`. There is no purple semantic token
 * in `app/globals.css` — the only purple-ish value, `--chart-6`, is violet in
 * light mode and cyan in dark, so using it would fail light/dark integrity.
 * `primary` keeps the planned treatment visibly distinct from `gray_dashed`
 * (muted) and from the four filled tones while staying on-brand in both
 * themes. Changing it later is one line here and nothing else.
 */
const CLASSES: Record<MapIntentColorName, IntentColorClasses> = {
  green: { dot: "bg-success border-success", text: "text-success" },
  amber: { dot: "bg-warning border-warning", text: "text-warning" },
  blue: { dot: "bg-info border-info", text: "text-info" },
  red: { dot: "bg-destructive border-destructive", text: "text-destructive" },
  gray_dashed: {
    dot: "bg-transparent border-dashed border-muted-foreground",
    text: "text-muted-foreground",
  },
  purple_dashed: {
    dot: "bg-transparent border-dashed border-primary",
    text: "text-primary",
  },
};

/** The treatment for a colour we could not resolve — deliberately the same as `gray_dashed`. */
export const MISSING_INTENT_COLOR_CLASSES: IntentColorClasses = CLASSES.gray_dashed;

export function isMapIntentColorName(value: string): value is MapIntentColorName {
  return Object.prototype.hasOwnProperty.call(CLASSES, value);
}

/**
 * Resolves one colour name. An unrecognised name captures once per signature
 * (the store dedupes) and falls back to the `missing` treatment.
 */
export function intentColorClasses(name: string): IntentColorClasses {
  if (isMapIntentColorName(name)) return CLASSES[name];
  try {
    captureError({
      source: "topical-map-rpc",
      relation: "seo.topical_map.intent_colors",
      operation: "unknown",
      message: `Unknown intent colour "${name}" in the intent_colors knob.`,
      userMessage:
        "A topic colour setting names a colour this app does not know, so those pages are drawn as unknown.",
      hint: "Fix the seo.topical_map.intent_colors knob, or add the colour to intentColorClasses.ts.",
      callSite: "features/marketing/seo/topical-map/ui/intentColorClasses.ts",
    });
  } catch {
    // Capture is best-effort — it must never take a page down over a colour.
  }
  return MISSING_INTENT_COLOR_CLASSES;
}
