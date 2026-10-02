// features/mandates/feature-intelligence/types.ts
//
// The FEATURE INTELLIGENCE vocabulary — what one feature's jobs look like from
// the seat of the person working in that part of the app (UI-REGISTER
// "Feature intelligence pages", Arman 2026-09-25).

import type { MandateMemberRow } from "../member-list/types";
import type { AnyMandateKey } from "@/features/mandates/mandate-key";

export type {
  IntelligenceContext,
  MandatePlace,
  FeaturePlaces,
} from "@ai-matrx/chat/surfaces/runtime/intelligence-types";

/**
 * A place as the page shows it: a declared place, or a place recorded on a
 * registered screen (`ui.ui_surface_agent_role`).
 */
export interface ResolvedPlace {
  id: string;
  label: string;
  trigger: string;
  /** Filled link, or null when a needed value is not known here. */
  href: string | null;
  /** The route pattern, kept so an unlinked stop can say what it needs. */
  urlPattern: string | null;
  mandateKeys: readonly AnyMandateKey[];
  origin: "declared" | "registered";
}

/** Which ladder rung the page manages. */
export type IntelligenceLevel = "person" | "organization";

/** One job of the feature, from the viewer's seat. */
export interface FeatureIntelligenceRow extends MandateMemberRow {
  /** Name without the feature prefix the label may repeat. */
  shortName: string;
  outputKind: string | null;
  description: string | null;
}
