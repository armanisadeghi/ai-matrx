/**
 * Surface manifest — Marketing site integrations (`matrx-user/marketing-integrations`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/integrations` — the
 * provider-binding workspace of one managed website (`features/marketing`,
 * `SiteIntegrationsWorkspace`): built-in Google Search Console / GA4 /
 * PageSpeed / CMS bindings plus custom provider references. The site row
 * holds ONLY safe connection/resource references — refresh tokens and client
 * secrets live in the canonical secrets vault and never reach this surface,
 * its values, or any agent. Inherits the brand + site context blocks from
 * `matrx-user/marketing-site`.
 *
 * Runtime emitter: features/marketing/lib/scopes/integrations-scope.ts —
 * being built in parallel.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Observed evidence (400-499) ───────────────────────────────────────
  {
    name: "provider_bindings",
    label: "Provider bindings",
    description:
      "Per-provider binding state for the built-in providers (google_search_console, google_analytics_4, pagespeed_insights, cms) plus custom providers: enabled, reference-configured vs needs-reference vs off, and last-synced where applicable. Safe metadata only — NEVER contains tokens, secrets, or credential material. Empty during initial load.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 400,
  },
  {
    name: "gsc_synced_at",
    label: "GSC last synced at",
    description:
      "ISO timestamp of the last completed Google Search Console sync (`web.site.gsc_synced_at`). Empty when GSC has never synced — a configured binding with no sync means no data has ever flowed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 410,
  },
];

export const marketingIntegrationsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-integrations",
  label: "Marketing Site Integrations",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/integrations",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the integrations workspace of a managed website: where the user binds Google Search Console, GA4, PageSpeed, a CMS, and custom providers to this site so evidence can start flowing. The user comes here to complete setup, fix a broken binding, or trigger a sync.
Read brand_context and site_context first for the client and site framing. provider_bindings is safe reference metadata only — enabled flags, binding status, and sync freshness. Secrets NEVER appear on this surface: refresh tokens and credentials live in the canonical vault, and you must never ask for, echo, or attempt to reconstruct any credential material.
A binding's status is derived evidence — a provider that is configured but has never synced has no data flowing (treat it as needing attention, never as connected), and gsc_synced_at empty means Search Console data has never arrived. Your job is to diagnose and guide: explain what is missing, what the next click is, and what each state means — the user performs the actual connection through the UI's OAuth flows, never through you.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "setup_assistant",
      label: "Setup assistant",
      description:
        "Walks the user through connecting and binding providers (GSC, GA4, PageSpeed, CMS) and completing first syncs for this site.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "integration_diagnostician",
      label: "Integration diagnostician",
      description:
        "Diagnoses broken or stale bindings from the binding states and sync freshness, and explains the exact fix path.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING the
 * inherited `brand_id` + `site_id` from the marketing-brand → marketing-site
 * chain.
 */
export function createMarketingIntegrationsScope(values: {
  // alwaysAvailable: true → required (inherited)
  brand_id: string;
  site_id: string;
  // Inherited optionals (marketing-brand + marketing-site)
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  // alwaysAvailable: false → optional
  provider_bindings?: Record<string, unknown>;
  gsc_synced_at?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
