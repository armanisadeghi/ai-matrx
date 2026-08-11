/**
 * accessDeniedRegistry — per-entity variants of the denied surface.
 *
 * The generic `AccessDeniedView` is deliberately good enough for every entity
 * in the platform, so this registry starts EMPTY. It exists so that a feature
 * which genuinely earns a bespoke screen (richer preview, domain-specific
 * doors) can register one instead of forking `AccessDenied.tsx` — the same
 * shape as the peek registry.
 *
 * The bar for adding a row: the bespoke version must tell the user something
 * true that the generic one cannot. "It should match our branding" is not that.
 *
 * A variant receives the SAME resolved context as the generic view and is
 * responsible for the same promises — human words, a real next step, and a door
 * on every identity it names.
 */

import type { ComponentType } from "react";
import type { AccessDeniedContext } from "@/features/access-gate/types";

export interface AccessDeniedVariantProps {
  context: AccessDeniedContext;
  id: string;
  fallbackHref?: string;
  fallbackLabel?: string;
  onRetry?: () => void;
  onChanged: () => void;
}

/** Entity token → bespoke surface. Empty by design; see the header. */
const VARIANTS: Record<string, ComponentType<AccessDeniedVariantProps>> = {};

export function getAccessDeniedVariant(
  token: string,
): ComponentType<AccessDeniedVariantProps> | null {
  return VARIANTS[token] ?? null;
}

/** Whether a token has a bespoke surface (for admin maps and tests). */
export function hasAccessDeniedVariant(token: string): boolean {
  return token in VARIANTS;
}
