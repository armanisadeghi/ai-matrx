/**
 * Presentation labels for catalog values.
 *
 * PURELY COSMETIC — every value here still comes from the ingested catalog;
 * this only decides how a value READS. It is not a compatibility matrix and
 * must never become one: an unrecognized value falls through unchanged, so a
 * new Lulu option renders correctly (just less prettily) the day it appears.
 */

import type { LuluBindingOption, LuluOption, LuluTrimOption } from "./types";

/** "Black & White · Standard" → "Standard Black & White". */
export function colorLabel(id: string): string {
  const [color, quality] = id.split(" · ");
  if (!color || !quality) return id;
  return `${quality} ${color}`;
}

/** Roughly what the option costs you, said in one short phrase. */
export function colorHint(id: string): string | null {
  const [color, quality] = id.split(" · ");
  if (!color || !quality) return null;
  const isPremium = quality.toLowerCase().startsWith("prem");
  return isPremium
    ? "Richer ink, higher cost per page"
    : "The everyday choice — best value";
}

/** "60# Uncoated Cream" → "60# Cream", coating moved to the hint line. */
export function paperLabel(id: string): { label: string; hint: string | null } {
  const match = /^(\d+#)\s+(coated|uncoated)\s+(\w+)$/i.exec(id.trim());
  if (!match) return { label: id, hint: null };
  const [, weight, coating, shade] = match;
  const coated = coating.toLowerCase() === "coated";
  return {
    label: `${weight} ${shade}`,
    hint: coated
      ? "Coated — smooth, best for images"
      : "Uncoated — natural feel, easy on the eyes",
  };
}

export function coverFinishHint(id: string): string | null {
  const normalized = id.trim().toLowerCase();
  if (normalized === "gloss" || normalized === "glossy") {
    return "Shiny, makes color pop";
  }
  if (normalized === "matte") return "Soft, no glare";
  if (normalized.startsWith("unlaminated")) return "Bare stock, no coating";
  return null;
}

const BINDING_HINTS: Record<string, string> = {
  perfect: "Square glued spine — the standard paperback",
  coil: "Metal spiral — lies completely flat",
  "saddle stitch": "Folded and stapled — for thin books",
  "wire o": "Twin-loop wire — lies flat, premium feel",
  "case wrap": "Hard cover printed edge to edge",
  "linen wrap": "Cloth-wrapped hard cover with foil stamping",
};

export function bindingHint(binding: LuluBindingOption): string | null {
  return BINDING_HINTS[binding.id.trim().toLowerCase()] ?? null;
}

/** The size line a reader actually scans: inches first, mm second. */
export function trimSizeLine(trim: LuluTrimOption): string | null {
  if (trim.widthIn === null || trim.heightIn === null) return null;
  const inches = `${trim.widthIn}" × ${trim.heightIn}"`;
  if (trim.widthMm === null || trim.heightMm === null) return inches;
  return `${inches}  ·  ${trim.widthMm} × ${trim.heightMm} mm`;
}

/** The book-type name without the size suffix the catalog bakes into label. */
export function trimName(trim: LuluTrimOption): string {
  const [name] = trim.label.split(" — ");
  return name ?? trim.label;
}

/** Size class ("Small" / "Medium"), used to group the size dropdown. */
export function trimSizeClass(trim: LuluTrimOption): string {
  const [sizeClass] = (trim.sublabel ?? "").split(" · ");
  return sizeClass?.trim() || "Other";
}

/** Options rendered with a friendly label + an optional one-line hint. */
export interface DecoratedOption {
  option: LuluOption;
  label: string;
  hint: string | null;
}

export function decorateColor(option: LuluOption): DecoratedOption {
  return { option, label: colorLabel(option.id), hint: colorHint(option.id) };
}

export function decoratePaper(option: LuluOption): DecoratedOption {
  const { label, hint } = paperLabel(option.id);
  return { option, label, hint };
}

export function decorateCoverFinish(option: LuluOption): DecoratedOption {
  return { option, label: option.label, hint: coverFinishHint(option.id) };
}

export function decorateBinding(option: LuluBindingOption): DecoratedOption {
  return { option, label: option.label, hint: bindingHint(option) };
}
