/**
 * KindDefinition — one kind, many facets. THE canonical registry entry.
 *
 * This does NOT merge BlockComponentRegistry or artifact-type-registry; the
 * `legacyBlockType` and `artifact` facets are FACADES pointing into them, so
 * migration is incremental and each registry keeps its own job.
 */

import type { ComponentType } from "react";
import type { KindSchema } from "../core/kind-schema.types";
import type { IrPath, IrResidue } from "../core/ir-types";

/**
 * The uniform props contract for kind-driven block components. This is what
 * de-special-cases flashcards: no component receives bespoke glue — every
 * kind component gets exactly this shape.
 */
export interface KindBlockProps {
  kind: string;
  schema: KindSchema;
  /** Compliant snapshot value (schema fields + __kind). */
  data: Record<string, unknown>;
  status: "streaming" | "complete" | "error";
  residue: IrResidue | null;
  path: IrPath;
  /** ParseSession identity for live child subscriptions; null after reload. */
  identity: string | null;
  /** Child-kind schema lookup (replaces passing allSchemas around). */
  resolve: (kind: string) => KindSchema | undefined;
}

export type KindTier = "eager" | "warm" | "cold";

export interface KindDefinition {
  /** Canonical slug — THE key. */
  kind: string;
  /** null until the warm/cold fetch delivers it. */
  schema: KindSchema | null;
  schemaSource: "system" | "flexible_data";
  tier: KindTier;
  /** Component facet — lazy-loaded renderer for this kind. */
  component?: {
    load: () => Promise<{ default: ComponentType<KindBlockProps> }>;
  };
  /** Facade → BlockComponentRegistry type string (e.g. "flashcards"). */
  legacyBlockType?: string;
  /** Facade → artifact-type-registry canvasType. */
  artifact?: { canvasType: string };
  persistence?: { persistStructured: boolean };
  /** Future XML tags / kind aliases resolving to this kind. */
  discriminatorAliases?: string[];
}
