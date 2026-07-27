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
 * Runtime emitter: `SiteIntegrationsWorkspace` mounts a nested
 * SurfaceRuntimeProvider and spreads
 * `useMarketingSiteSurfaceBase().getBaseValues()` (the inherited brand/site
 * block) into `createMarketingIntegrationsScope`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "bindings",
    label: "Provider bindings",
    sortOrder: 100,
    description:
      "Which data providers this site is bound to and whether each binding is actually usable.",
  },
  {
    key: "google_account",
    label: "Google account inventory",
    sortOrder: 200,
    description:
      "The connected Google accounts and the Search Console / Analytics properties they expose — reference metadata only, never credentials.",
  },
  {
    key: "editor_state",
    label: "Editor state",
    sortOrder: 300,
    description:
      "Unsaved edits and validation problems in the integrations form on screen right now.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Provider bindings ─────────────────────────────────────────────────
  {
    name: "provider_bindings",
    label: "Provider bindings",
    description:
      "Per-provider binding state for the built-in providers (google_search_console, google_analytics_4, pagespeed_insights, cms) plus custom_providers: enabled, reference-configured vs needs-reference vs disabled, and last-synced where applicable. Reflects the on-screen draft, which may differ from what is saved (see unsaved_changes). Safe metadata only — NEVER contains tokens, secrets, or credential material. Empty during initial load.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 700,
    sortOrder: 400,
    group: "bindings",
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
    group: "bindings",
  },
  {
    name: "custom_provider_count",
    label: "Custom provider count",
    description:
      "How many additional (non-built-in) provider references are configured on the site draft. Zero when only the built-in providers are used.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    sortOrder: 420,
    group: "bindings",
  },

  // ── Google account inventory ──────────────────────────────────────────
  {
    name: "google_connections",
    label: "Google connections",
    description:
      "The Google accounts available to bind, as loaded from the connection inventory: id, account label, owner (user vs organization), health, and — when unhealthy — the diagnosis label. No tokens or credential material. Empty array when no Google account is connected; empty while the inventory is loading.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 500,
    group: "google_account",
  },
  {
    name: "google_resources",
    label: "Discovered Google properties",
    description:
      "The Search Console properties and GA4 properties discovered on the connected accounts: connection_id, resource_type, resource_ref, and display_name. These are the candidate values for a provider's resource reference. Empty array when no account is connected or none was discovered.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 510,
    group: "google_account",
  },

  // ── Editor state ──────────────────────────────────────────────────────
  {
    name: "unsaved_changes",
    label: "Unsaved changes",
    description:
      "True when the on-screen integrations draft differs from what is saved on the site row. Always present. When true, provider_bindings describes the pending edit, not the live configuration.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 600,
    group: "editor_state",
  },
  {
    name: "configuration_issues",
    label: "Configuration issues",
    description:
      "Validation problems blocking a save, as shown in the issues alert: field and message per issue. Empty array when the draft is valid — the Save button is disabled while this is non-empty.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 300,
    sortOrder: 610,
    group: "editor_state",
  },
];

export const marketingIntegrationsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-integrations",
  readiness: "verified",
  label: "Marketing Site Integrations",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/integrations",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the integrations workspace of a managed website: where the user binds Google Search Console, GA4, PageSpeed, a CMS, and custom providers to this site so evidence can start flowing. The user comes here to complete setup, fix a broken binding, or trigger a sync.
Read brand_context and site_context first for the client and site framing. provider_bindings is safe reference metadata only — enabled flags, binding status, and sync freshness. Secrets NEVER appear on this surface: refresh tokens and credentials live in the canonical vault, and you must never ask for, echo, or attempt to reconstruct any credential material.
A binding's status is derived evidence — a provider that is configured but has never synced has no data flowing (treat it as needing attention, never as connected), and gsc_synced_at empty means Search Console data has never arrived. Your job is to diagnose and guide: explain what is missing, what the next click is, and what each state means — the user performs the actual connection through the UI's OAuth flows, never through you.
This page is an EDITOR, so read unsaved_changes before you reason about state: when it is true, provider_bindings describes a pending draft the user has not saved, and configuration_issues lists exactly what is blocking the save. google_connections and google_resources are the account inventory the user picks from — a provider that needs a reference usually needs one of these resource_ref values, and an unhealthy connection must be reconnected before any binding on it can work.
</surface_intro>`,
  groups,
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
  // Own alwaysAvailable: true → required
  provider_bindings: Record<string, unknown>;
  custom_provider_count: number;
  unsaved_changes: boolean;
  configuration_issues: ReadonlyArray<Record<string, unknown>>;
  // alwaysAvailable: false → optional
  google_connections?: ReadonlyArray<Record<string, unknown>>;
  google_resources?: ReadonlyArray<Record<string, unknown>>;
  gsc_synced_at?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
