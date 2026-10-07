// features/esign/contract/paper.ts — STEP 0, FROZEN (e-sign parity CONTRACT.md §12.6, verbatim;
// `recipientColor`'s body is the one the contract described as "hex → rgba").
// Every lane imports these; nobody keeps a private copy. Only the owning session amends this file.

/** The document is paper in light and dark mode; fields and marks are drawn in these. */
export const PAPER = { page: "#ffffff", ink: "#0d2673", rule: "#9ca3af", muted: "#6b7280" } as const;
/** Recipient colours on paper (fills at 18 % alpha, borders solid). Index = recipient.color_index % 6. */
export const RECIPIENT_PALETTE = ["#2563eb", "#d97706", "#059669", "#db2777", "#7c3aed", "#0891b2"] as const;
export function recipientColor(colorIndex: number, alpha = 1): string {
  const n = RECIPIENT_PALETTE.length;
  const index = Number.isFinite(colorIndex) ? ((Math.trunc(colorIndex) % n) + n) % n : 0;
  const hex = RECIPIENT_PALETTE[index];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
/** Rule: a recipient's color_index is assigned when added (lowest unused), kept for life, frozen at send. */
