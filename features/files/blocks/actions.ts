/**
 * features/files/blocks/actions.ts
 *
 * Shared "extra action" contract for the canonical media renderers
 * (`UnifiedImageBlockRenderer`, `UnifiedVideoBlockRenderer`).
 *
 * A renderer owns ONE menu surface (the hover toolbar "…" dropdown, the
 * right-click context menu, and the mobile long-press drawer). Domain
 * callers — e.g. the podcast studio's "Regenerate" / "Use as cover" —
 * must NOT bolt on a second "…" menu beside the canonical one. Instead
 * they pass their domain actions here and the renderer folds them into
 * the single canonical menu as a leading group.
 *
 * Keep this minimal and provider-agnostic: it's a description of a menu
 * row, nothing more. No coupling to any one feature.
 */

import type { ReactNode } from "react";

export interface MediaExtraAction {
  /** Stable key for React lists. */
  id: string;
  /** Menu-row label. */
  label: string;
  /** Optional leading icon (Lucide element). */
  icon?: ReactNode;
  /** Invoked on click/tap. */
  onClick: () => void;
  /** Greys out + blocks the row when true. */
  disabled?: boolean;
  /** Destructive styling (red text) when true. */
  danger?: boolean;
}
