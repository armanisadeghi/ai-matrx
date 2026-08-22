/**
 * Streaming contract for the authority-routing strategist.
 *
 * The workspace owns the operational recommendation UI; Content IR owns the
 * live, progressively parsed strategist narrative. Priorities deliberately
 * remain open JSON records because their IDs are validated server-side against
 * the deterministic candidate allowlist before they can become actions.
 */

import type { KindSchema } from "@ai-matrx/content-ir";
import type { KindDefinition } from "@ai-matrx/content-ir";

export const seoAuthorityRouteAnalysisKindSchema: KindSchema = {
  kind: "seo_authority_route_analysis",
  fields: {
    executive_summary: { type: "string", required: true },
    overall_verdict: {
      type: "enum",
      values: ["healthy", "opportunities", "urgent"],
      required: true,
    },
    priorities: { type: "json[]", required: true },
    warnings: { type: "string[]", required: true },
  },
};

export const SEO_AUTHORITY_ROUTE_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "seo_authority_route_analysis",
    schemaSource: "system",
    tier: "eager",
    schema: seoAuthorityRouteAnalysisKindSchema,
    persistence: { persistStructured: true },
    loadingComponent: "list",
  },
];
