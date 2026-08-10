/**
 * Surface manifest — CMS hub (`matrx-user/cms`).
 *
 * Drives the `/cms` landing page (`app/(core)/cms/page.tsx`): the list of
 * websites the user owns plus the entry card into standalone `html_pages`.
 * This is a LIST surface, not an editor — it has no `site_structure` (that's
 * per-site framing owned by `matrx-user/cms-site` and below) but gives an
 * agent enough to find, compare, or create a site by name before drilling in.
 *
 * The hub loads SUMMARY rows (`CmsSiteService.listSites()` →
 * `ClientSiteSummary`), which still carry more than id/name: domain, active
 * flag, agent write policy, and whether the site has minted its public data
 * key — but NOT `theme_config` / `navigation` / `footer_config`. The site's
 * `data_api_key` VALUE is deliberately never emitted — `has_data_api_key`
 * carries the only fact an agent needs, and the key itself belongs in the
 * Collections tab UI where it can be revealed/rotated deliberately.
 *
 * Runtime scope assembly lives in
 * `features/cms/agent-context/buildCmsHubContextData.ts`; the emitter is the
 * `<SurfaceRuntimeProvider>` + v3 context menus mounted in
 * `app/(core)/cms/page.tsx`.
 *
 * NOTE: this whole feature talks to a SEPARATE Supabase project
 * (`viyklljfdhtidwecakwx`) through the `/api/cms/*` routes — see
 * `features/cms/FEATURE.md`. There is no browser Supabase client for it.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  CMS_SITE_DOMAIN_RULE,
  CMS_SITE_SLUG_RULE,
} from "@/features/cms/utils/siteSlug";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "site_inventory",
    label: "Site inventory",
    sortOrder: 100,
    description:
      "Every website the current user owns, as listed on the hub, plus its headline counts.",
  },
  {
    key: "hub_focus",
    label: "Hub focus",
    sortOrder: 200,
    description:
      "Which site card the user is currently pointing at on the hub grid.",
  },
  {
    key: "hub_authoring",
    label: "Hub authoring",
    sortOrder: 300,
    description:
      "In-progress state of the Create New Site dialog and any load failure the hub is showing.",
  },
];

/** One row of the `owned_sites_summary` surface value. */
export interface CmsHubSiteSummaryEntry {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
  is_active: boolean;
  agent_write_policy: string;
  has_data_api_key: boolean;
  created_at: string;
  updated_at: string;
}

const surfaceSpecific: SurfaceValue[] = [
  // ── Site inventory ───────────────────────────────────────────────────
  {
    name: "owned_sites_count",
    label: "Owned sites count",
    description:
      "Number of client websites (`client_sites` rows) the current user owns. Always populated — zero when the user hasn't created a site yet, which is the empty state the hub renders.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 300,
    group: "site_inventory",
  },
  {
    name: "active_sites_count",
    label: "Active sites count",
    description:
      "How many of the owned sites carry `is_active = true` (the Active badge on the hub card). Always populated — zero when every site is inactive or none exist.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 310,
    group: "site_inventory",
  },
  {
    name: "owned_sites_summary",
    label: "Owned sites summary",
    description:
      "Every site the user owns, in hub list order: `{ id, slug, name, domain, is_active, agent_write_policy, has_data_api_key, created_at, updated_at }`. Always populated — empty array when no sites exist. Lets an agent find or reference a site by name/slug/domain without a separate list call. The site's data key VALUE is never included, only whether one has been minted.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1200,
    sortOrder: 320,
    group: "site_inventory",
  },

  // ── Hub focus ────────────────────────────────────────────────────────
  {
    name: "selected_site_id",
    label: "Selected site ID",
    description:
      "UUID of the site card the user last pointed at on the hub (hover, or the card the right-click menu opened from). Empty when no card is focused — e.g. when the menu was opened on the page background.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 400,
    group: "hub_focus",
  },
  {
    name: "selected_site",
    label: "Selected site",
    description:
      "The full `owned_sites_summary` entry for `selected_site_id` as one composite object (completeness law — saves the agent an index lookup). Empty when no card is focused.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 260,
    sortOrder: 410,
    group: "hub_focus",
  },

  // ── Hub authoring ────────────────────────────────────────────────────
  {
    name: "new_site_draft",
    label: "New site draft",
    description:
      "What the user has typed into the Create New Site dialog so far: `{ name, slug, domain }` (slug is auto-derived from the name until edited). Empty when the dialog has never been opened or every field is blank. Bindable only — an agent helping name a site asks for this deliberately. This is the read twin of the `new_site_draft` write target: read it to see what is already staged, write it to stage more.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    autoContext: false,
    sortOrder: 500,
    group: "hub_authoring",
  },
  {
    name: "sites_load_error",
    label: "Sites load error",
    description:
      "The error message the hub is currently displaying from a failed list/create call against `/api/cms/sites`. Empty when the hub loaded cleanly — which is the normal case.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 510,
    group: "hub_authoring",
  },
];

/**
 * Write half of the 360 loop — handlers in `app/(core)/cms/page.tsx`.
 *
 * JUDGMENT BAR, applied honestly, and the honest answer is ONE target.
 *
 * This is a LIST surface. Almost everything it emits is a record of sites that
 * already exist, and the one place a user AUTHORS anything on the hub is the
 * Create New Site dialog. That dialog is the textbook YES: turning "set me up
 * a site for the dental practice, brightsmile.com" into a name, a URL slug and
 * a domain is naming work an agent does well, and the fields are drafted in a
 * single thought and consumed by ONE save — exactly the case
 * `crm-create-party` reserves for a composite object target. One target also
 * means ONE confirm dialog for one decision instead of three in a row. Every
 * key is optional and partial, so the granularity of separate targets survives
 * without the dialog spam; the cost, stated plainly, is that the user accepts
 * or declines the draft as a whole.
 *
 * `mode: "draft"` in the literal sense: the handler calls the SAME
 * `handleNameChange` / `setNewSlug` / `setNewDomain` the dialog's own inputs
 * call, so a staged value and a typed one are indistinguishable and the user
 * edits or cancels normally. Writing `name` alone re-derives `slug` from it
 * precisely because that is what typing in the Name field does — pass `slug`
 * explicitly to override, which is what editing the slug field does.
 *
 * The handler also OPENS the dialog when it is closed. That is deliberate, and
 * it is the difference between this target being usable and being dead —
 * verified in the browser, not assumed: the create dialog is a MODAL, so while
 * it is open the header's "Agents for this page" button sits inside an
 * `aria-hidden` subtree and cannot be clicked. A user therefore CANNOT launch
 * an agent while the dialog is open, which means every agent-originated write
 * to this target arrives with the dialog closed. A handler that refused when
 * the dialog was shut would refuse always.
 *
 * The rule it has to honour instead is the `education-grade-work` one — never
 * report "applied" for a value nobody can see. The two ways to honour it are
 * refuse or make it visible; refusing is off the table above, and here the
 * state is always mounted (only the dialog's RENDERING is gated), so showing
 * the user the form they just consented to fill is the completion of the
 * write, not a second unconsented effect. Opening it is also free to undo:
 * Cancel and Escape both close it and nothing was ever persisted.
 *
 * WHAT IS NOT WRITABLE, on purpose:
 *  - **Creating the site.** `CmsSiteService.createSite` mints a real
 *    `client_sites` row the user owns, with a public slug and its own agent
 *    write policy, and then navigates away from the hub. Following
 *    `crm-create-party` and `image-generate`: an agent may fill the form, the
 *    human presses Create Site.
 *  - `is_active` — publishing. Flipping a site live or dark is not authoring.
 *  - `agent_write_policy` — an agent editing the rule that governs what agents
 *    may do to a site is the campaign's clearest NO, whichever direction it
 *    moves.
 *  - `has_data_api_key` and the key value — a credential. The manifest already
 *    refuses to emit the key; minting or rotating it belongs to the deliberate
 *    Collections tab UI.
 *  - Name / slug / domain of an EXISTING site — identity of a live site, and
 *    renaming a slug moves its public URL. That is `cms-site` settings, not a
 *    hub draft.
 *  - `selected_site_id` / `selected_site` — a hover pointer derived from the
 *    user's mouse. Nobody asks an agent to move it.
 *  - `sites_load_error` — status the page owns from a failed fetch. An agent
 *    writing it would be fabricating the page's own account of itself.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "new_site_draft",
    label: "New site draft",
    description: [
      "Stages a new site into the hub's Create New Site dialog — the same three fields the user would type, staged the same way. NOTHING is created: no site exists until the user presses Create Site, and until then nothing is saved and no URL is claimed.",
      "Opens the dialog if it is closed, so the user can see, edit, or cancel what you staged.",
      "Value: an object with AT LEAST ONE of `{ name, slug, domain }`, all strings. Each key REPLACES that one field; omit a key to leave the user's value exactly as they left it (read the `new_site_draft` value first if you mean to extend rather than replace).",
      "`name` — the site's display name, a non-empty string.",
      `\`slug\` — the URL identifier: ${CMS_SITE_SLUG_RULE}. A value that breaks that rule is REJECTED, not corrected.`,
      "Sending `name` WITHOUT `slug` re-derives the slug from the name, exactly as typing in the Name field does; send `slug` as well when you want a specific one.",
      `\`domain\` — the site's optional custom domain: ${CMS_SITE_DOMAIN_RULE}. Pass an empty string to clear it. A URL with a scheme or a path is rejected — send the bare host.`,
      "Refused while a site is already being created.",
    ].join(" "),
    valueType: "object",
    updatesValue: "new_site_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "hub_authoring",
    sortOrder: 500,
  },
];

export const cmsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/cms",
  readiness: "verified",
  label: "CMS",
  urlPattern: "/cms",
  intro: `<surface_intro>
You are on the CMS hub — the entry point to the AI Matrx website platform, listing every client website the user owns plus a card into their standalone quick-publish HTML pages.
This is a LIST surface: you can see and compare sites, but you cannot see any page's HTML from here. There is deliberately no site_structure value — that framing appears once the user opens a site (the CMS Site surface) and everything below it.
owned_sites_summary is the working set: match the user's words ("the dentist site", "example.com") against name, slug, or domain to identify which site they mean, then drill in. selected_site / selected_site_id tell you which card they were pointing at when they invoked you — prefer it over guessing.
agent_write_policy rides on every summary entry: "blocked" means agents may not write to that site at all, "draft_only" means you may save drafts but a human must publish, "full" means you may publish directly. Check it before promising any change.
has_data_api_key only says whether the site has minted its public collections write key; the key value itself is never handed to you.
The one thing you can CHANGE here is new_site_draft: it stages a name, a URL slug, and an optional domain into the Create New Site dialog (opening it if it is closed) so the user can review them. Filling that form is never the same as creating the site — pressing Create Site mints a real website the user owns, and that stays their move. Nothing else on this hub is writable: activating a site, its agent write policy, its data key, and the identity of any site that already exists are all human decisions, so propose those in words instead.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createCmsHubScope(values: {
  // alwaysAvailable: true → required
  owned_sites_count: number;
  active_sites_count: number;
  owned_sites_summary: CmsHubSiteSummaryEntry[];
  // alwaysAvailable: false → optional
  selected_site_id?: string;
  selected_site?: CmsHubSiteSummaryEntry;
  new_site_draft?: Record<string, unknown>;
  sites_load_error?: string;
  content?: string;
  context?: Record<string, unknown> | string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
