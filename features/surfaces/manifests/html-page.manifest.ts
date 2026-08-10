/**
 * Surface manifest — standalone HTML page editor (`matrx-user/html-page`).
 *
 * Drives `/cms/html-pages` and `/cms/html-pages/[pageId]` — the OTHER CMS
 * content system (`html_pages` table), deliberately separate from
 * `client_sites`/`client_pages`. No draft/publish twins, no site tree, no
 * `agent_write_policy` — a standalone page publishes immediately on save.
 * Framing value is `html_pages_structure` (flat sibling list), NOT
 * `site_structure` — do not conflate the two systems.
 *
 * ONE surface, TWO mount points, and the value contract spans both:
 *   - the EDITOR (`buildHtmlPageContextData.ts`) has a fully-loaded record,
 *     live buffers, an active tab, and a selection;
 *   - the LIST (`buildHtmlPagesListContextData.ts`) has only summary rows —
 *     it emits the framing XML plus the right-clicked row's identity, and
 *     leaves every body/editor value empty.
 * Consequently only the values BOTH mount points write are
 * `alwaysAvailable: true`, and those are documented as "empty on the list
 * route when no row is targeted" rather than silently guaranteed.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "framing",
    label: "Standalone pages framing",
    sortOrder: 100,
    description:
      "The user's whole standalone-page library — the orientation value read before anything else.",
  },
  {
    key: "page_identity",
    label: "Page identity",
    sortOrder: 200,
    description:
      "Which standalone page this is, where it is published, and when it was created.",
  },
  {
    key: "page_seo",
    label: "Page SEO",
    sortOrder: 300,
    description:
      "Metadata that governs how the published page appears in search and social previews.",
  },
  {
    key: "page_content",
    label: "Page content",
    sortOrder: 400,
    description:
      "The full HTML document body of the page and the editor state around it.",
  },
  {
    key: "navigation",
    label: "Library navigation",
    sortOrder: 500,
    description:
      "Where this page sits in the sibling list the editor's prev/next moves through.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Framing ───────────────────────────────────────────────────────────
  {
    name: "html_pages_structure",
    label: "Standalone pages structure (big picture)",
    description:
      'Compact XML list of every standalone HTML page the user has published (`html_pages` rows): id, title, indexability, and live URL. The page open in the editor — or the row a list menu was opened on — is marked `current="true"`; nothing is marked when the list menu is opened outside a row. Always emitted. Read this first to see sibling pages before creating a duplicate or asking the user which page they mean.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 3000,
    sortOrder: 100,
    group: "framing",
  },

  // ── Page identity ─────────────────────────────────────────────────────
  {
    name: "page_id",
    label: "Page ID",
    description:
      "UUID of the `html_pages` row in focus. Always populated on the editor route; empty on the list route when the menu was opened outside any row.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 200,
    group: "page_identity",
  },
  {
    name: "live_url",
    label: "Page live URL",
    description:
      "Public URL of this page (`/p/{id}`). A standalone page is live the moment it is saved — there is no draft twin. Always populated on the editor route; empty on the list route when no row is targeted.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 210,
    group: "page_identity",
  },
  {
    name: "page_timestamps",
    label: "Page timestamps",
    description:
      "When this page was created and last updated, as { created_at, updated_at } ISO strings. Empty on the list route (the menu emits identity only) and while a brand-new record has not loaded.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    autoContext: false,
    sortOrder: 220,
    group: "page_identity",
  },
  {
    name: "page_provenance",
    label: "Page provenance",
    description:
      "Where this page came from, as { artifact_id, source_message_id, source_conv_id }: a page published out of a chat artifact carries the ids of the conversation and message that produced it. Members are null for a hand-authored page; empty on the list route.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 160,
    autoContext: false,
    sortOrder: 230,
    group: "page_identity",
  },
  {
    name: "page_context_metadata",
    label: "Page context metadata",
    description:
      "The free-form `context_metadata` jsonb on the row — most importantly `promotions[]`, the record of this page having been promoted onto a full CMS site. Empty when the page has never been promoted and carries no metadata; empty on the list route.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    autoContext: false,
    sortOrder: 240,
    group: "page_identity",
  },

  // ── SEO ───────────────────────────────────────────────────────────────
  {
    name: "meta_title",
    label: "Meta title",
    description:
      "SEO title / HTML `<title>` of the page, read live from the editor buffer. Required by the save flow — never actually empty once saved; empty on the list route when no row is targeted.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 300,
    group: "page_seo",
  },
  {
    name: "meta_description",
    label: "Meta description",
    description:
      "SEO description shown in search results, read live from the editor buffer (this is the field the Metadata tab's Pro textarea edits). Empty when the user has set none.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 310,
    group: "page_seo",
  },
  {
    name: "meta_keywords",
    label: "Meta keywords",
    description:
      "Comma-separated SEO keywords, read live from the editor buffer. Empty when unset (the common case).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 320,
    group: "page_seo",
  },
  {
    name: "og_image",
    label: "Open Graph image URL",
    description:
      "Social-share preview image URL, read live from the editor buffer. Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 330,
    group: "page_seo",
  },
  {
    name: "canonical_url",
    label: "Canonical URL",
    description:
      "Canonical URL override for duplicate-content SEO, read live from the editor buffer. Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 340,
    group: "page_seo",
  },
  {
    name: "is_indexable",
    label: "Allow search indexing",
    description:
      "True when search engines may index this page. Defaults to false (noindex) on new pages, so a page being unindexable is normal, not a defect. Always populated on the editor route; false on the list route when no row is targeted.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 350,
    group: "page_seo",
  },
  {
    name: "page_seo",
    label: "Page SEO",
    description:
      "The composite SEO object: { meta_title, meta_description, meta_keywords, og_image, canonical_url, is_indexable }. Mirrors the individual SEO values as one group value (completeness law), read from the same live buffers. Always emitted on the editor route.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 450,
    autoContext: false,
    sortOrder: 360,
    group: "page_seo",
  },

  // ── Content ───────────────────────────────────────────────────────────
  {
    name: "html_content",
    label: "Full HTML document",
    description:
      "The COMPLETE HTML document this page publishes, read live from the editor buffer (unsaved edits included). A standalone page is a whole document, not a fragment — head, styles, and scripts live in here. Empty on the list route and on a page whose body has not loaded. Bindable-only because it is large: when the HTML tab is active the same text also arrives as `content`.",
    valueType: "document",
    alwaysAvailable: false,
    typicalCharCount: 20000,
    autoContext: false,
    sortOrder: 400,
    group: "page_content",
  },
  {
    name: "active_tab",
    label: "Active editor tab",
    description:
      '"meta" | "html" | "preview" — which editor region is mounted. Gates what `content`/`selection` read from: the meta description on "meta", the full document on "html", nothing on "preview". Empty on the list route (no editor is mounted).',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 410,
    group: "page_content",
  },
  {
    name: "is_dirty",
    label: "Has unsaved edits",
    description:
      "True when the editor holds changes the user has not saved yet. A standalone page publishes on save, so dirty means the live page does NOT yet match what you can see. Empty on the list route.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 420,
    group: "page_content",
  },

  // ── Navigation ────────────────────────────────────────────────────────
  {
    name: "sibling_page_count",
    label: "Sibling page count",
    description:
      "How many standalone pages the user has in total, including this one. Always populated; 1 when this is the user's only page.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 500,
    group: "navigation",
  },
  {
    name: "prev_page_id",
    label: "Previous page ID",
    description:
      "UUID of the page the editor's Previous control moves to. Empty when this is the first page in the list order, and on the list route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 510,
    group: "navigation",
  },
  {
    name: "next_page_id",
    label: "Next page ID",
    description:
      "UUID of the page the editor's Next control moves to. Empty when this is the last page in the list order, and on the list route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 520,
    group: "navigation",
  },
];

/**
 * Write targets — the agent-writable half of this surface.
 *
 * WHY THESE TWO, and why nothing else on a form with seven inputs:
 *
 * - The SEO cluster is ONE object target, not three. `meta_title`,
 *   `meta_description` and `meta_keywords` are authored together on the
 *   Metadata tab against the same page, they are judged against the same
 *   character budgets (`features/marketing/seo/serp/metrics.ts`), and an
 *   agent asked to "improve the SEO" produces all three in one thought.
 *   Three micro-targets would mean three separate ask dialogs for one
 *   decision the user makes once — the manifest's own guidance (multiple
 *   values in one field object beat five micro-targets when they are edited
 *   together). Every key is optional so a title-only rewrite stays a
 *   title-only write.
 * - `html_content` earns a target on the OPPOSITE argument from every other
 *   surface in this campaign. Elsewhere the body already has a user-driven
 *   seam: right-click a textarea → the v3 menu → `onTextReplace`. Here the
 *   body is Monaco, and Monaco swallows `contextmenu` before it reaches our
 *   `EditableContextMenu` wrapper (documented at length in
 *   `features/html-pages/README.md` → "Known limitation"). So on the HTML
 *   tab there is NO usable text-replace path for an agent result at all —
 *   the declared target is not a convenience over the menu, it is the only
 *   way an agent can touch the document. That makes it the highest-value
 *   target on the surface, not a marginal one.
 *
 * DELIBERATELY NOT TARGETS:
 * - `is_indexable` — indexability is a human gate. A standalone page
 *   publishes the instant it is saved, so flipping noindex→index is a
 *   publishing decision with SEO consequences the agent cannot own.
 * - `canonical_url` — a wrong canonical silently de-indexes the page in
 *   favour of someone else's URL. Identity/routing, not authored content.
 * - `og_image` — points at a real uploaded asset. An agent can only invent a
 *   plausible-looking URL, and a broken OG image is worse than none.
 * - Save/publish, promote-to-site, and delete — actions, human-owned. The
 *   agent stages; the user still presses Save.
 *
 * Both targets are `mode: "draft"` + `applyPolicy: "ask"`: they stage through
 * the SAME `useState` setters the user's own typing uses, mark the editor
 * dirty, and leave the Save affordance armed. Nothing reaches `html_pages`
 * without the user pressing Save.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "page_seo_metadata",
    label: "Page SEO metadata",
    description:
      'Sets this page\'s SEO metadata fields on the Metadata tab. Value is ONE object with any of these OPTIONAL keys: { "meta_title": string, "meta_description": string, "meta_keywords": string }. Only the keys you send are changed — omit a key to leave that field exactly as the user has it; do NOT send a key back unchanged just to fill the shape, and never send an empty string to "keep" a value. Each key REPLACES that field entirely (these are single-line/short-text fields, not append targets) — read `page_seo` first so you are rewriting from what is actually there. meta_title is the HTML <title> and primary SEO title: a non-empty single-line plain string, 15–60 characters recommended, no markdown and no surrounding quotes. meta_description is the search-result snippet: plain prose, 70–160 characters recommended, no HTML. meta_keywords is a single comma-separated string ("wedding photography, portland, elopement"), not an array. Staged into the live editor and marks the page unsaved — the user reviews and presses Save, which is what publishes it.',
    valueType: "object",
    updatesValue: "page_seo",
    mode: "draft",
    applyPolicy: "ask",
    group: "page_seo",
    sortOrder: 100,
  },
  {
    name: "page_html_content",
    label: "Page HTML document",
    description:
      "REPLACES the entire HTML document this page publishes with the value. This page is a COMPLETE standalone document, not a fragment: the value must be a full, valid HTML document — <!doctype>, <html>, <head> (with its <title>, meta tags, and <style>), and <body>. Sending a bare fragment or a body-only snippet breaks the published page, and sending a markdown or code-fenced block is always wrong. Read `html_content` first and edit that document rather than writing a new one from scratch, so the page's existing styles, scripts, and structure survive. Staged into the HTML tab's live code editor and marks the page unsaved — the user reviews the diff in the editor and the Preview tab, then presses Save, which is what republishes the live page at its /p/{id} URL.",
    valueType: "string",
    updatesValue: "html_content",
    mode: "draft",
    applyPolicy: "ask",
    group: "page_content",
    sortOrder: 110,
  },
];

export const htmlPageManifest: SurfaceManifest = {
  surfaceName: "matrx-user/html-page",
  readiness: "verified",
  label: "HTML Page",
  urlPattern: "/cms/html-pages/[pageId]",
  intro: `<surface_intro>
You are on the standalone HTML page system — single, self-contained documents the user quick-publishes at /p/{id}. This is NOT the multi-page client-site CMS: there is no site tree, no shared header/footer, no draft/publish twins and no agent write policy. A save publishes immediately, so is_dirty true means the live page does not yet match what the user is looking at.
html_pages_structure is the whole library in compact XML with the page in focus marked current="true" — read it before creating a page that may already exist.
html_content is the COMPLETE document (head, styles, scripts, body), not a fragment: edits must keep it a valid standalone document. active_tab tells you which region the user is in and therefore what content and selection contain — the meta description on "meta", the full document on "html", nothing on "preview".
The same surface is also mounted on the list route, where only the framing XML and the right-clicked row's identity are populated and every body/editor value is empty. Check page_id before assuming you have a page to work on.
You can also WRITE here, through apply_surface_write: page_seo_metadata stages the title/description/keywords the Metadata tab edits, and page_html_content stages the whole document into the HTML tab's code editor. Both ask the user first and both only STAGE — the human still presses Save, and on this system Save is what republishes the live page, so nothing you write reaches /p/{id} on its own. Read page_seo and html_content before writing: both targets replace what they touch rather than merging into it. Neither the indexability toggle nor the canonical/OG URLs are writable — those stay the user's call. Both targets need a page actually open in the editor; on the list route there is no buffer and the write is refused.
</surface_intro>`,
  groups,
  writeTargets,
  values: mergeBaselineValues(
    pickBaseline(
      "selection",
      "text_before",
      "text_after",
      "content",
      "context",
    ),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "html_page_editor",
      label: "HTML page editor",
      description:
        "Default agent offered for edits to a standalone published HTML page.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
  ],
};

export function createHtmlPageScope(values: {
  // alwaysAvailable: true → required
  html_pages_structure: string;
  page_id: string;
  live_url: string;
  meta_title: string;
  is_indexable: boolean;
  sibling_page_count: number;
  // alwaysAvailable: false → optional
  meta_description?: string;
  meta_keywords?: string;
  og_image?: string;
  canonical_url?: string;
  page_seo?: Record<string, unknown>;
  page_timestamps?: Record<string, unknown>;
  page_provenance?: Record<string, unknown>;
  page_context_metadata?: Record<string, unknown>;
  html_content?: string;
  active_tab?: string;
  is_dirty?: boolean;
  prev_page_id?: string;
  next_page_id?: string;
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown> | string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
