// features/esign/signature-creator/styles.ts — the twelve handwriting styles of CONTRACT.md §14.2.
// Keys are the wire values (`typed_style`); the first is the one pre-selected (S7.1). The font
// files themselves are imported in `fonts.ts` so this list stays cheap to import.

export interface SignatureStyle {
  key: string;
  label: string;
  /** CSS font-family the @fontsource face registers. */
  family: string;
  /** Preview size multiplier — some hands are drawn small on their em box. */
  previewScale: number;
}

export const SIGNATURE_STYLES: readonly SignatureStyle[] = [
  { key: "caveat", label: "Caveat", family: "Caveat", previewScale: 1.15 },
  { key: "dancing_script", label: "Dancing Script", family: "Dancing Script", previewScale: 1 },
  { key: "great_vibes", label: "Great Vibes", family: "Great Vibes", previewScale: 1.15 },
  { key: "allura", label: "Allura", family: "Allura", previewScale: 1.2 },
  { key: "alex_brush", label: "Alex Brush", family: "Alex Brush", previewScale: 1.1 },
  { key: "sacramento", label: "Sacramento", family: "Sacramento", previewScale: 1.1 },
  { key: "parisienne", label: "Parisienne", family: "Parisienne", previewScale: 1.1 },
  { key: "pinyon_script", label: "Pinyon Script", family: "Pinyon Script", previewScale: 1.05 },
  { key: "homemade_apple", label: "Homemade Apple", family: "Homemade Apple", previewScale: 0.8 },
  { key: "mrs_saint_delafield", label: "Mrs Saint Delafield", family: "Mrs Saint Delafield", previewScale: 1.5 },
  { key: "herr_von_muellerhoff", label: "Herr Von Muellerhoff", family: "Herr Von Muellerhoff", previewScale: 1.5 },
  { key: "la_belle_aurore", label: "La Belle Aurore", family: "La Belle Aurore", previewScale: 1 },
];

export const DEFAULT_STYLE_KEY = SIGNATURE_STYLES[0].key;

export function styleByKey(key: string | null | undefined): SignatureStyle {
  return SIGNATURE_STYLES.find((s) => s.key === key) ?? SIGNATURE_STYLES[0];
}

/** "Ada Lovelace" -> "AL". Used when the signer has not typed their own initials. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts
    .slice(0, 3)
    .map((p) => Array.from(p)[0]?.toUpperCase() ?? "")
    .join("");
}
