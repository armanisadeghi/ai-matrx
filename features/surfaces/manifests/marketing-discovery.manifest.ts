/**
 * Surface manifest — Marketing discovery inbox
 * (`matrx-user/marketing-discovery`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/discovery` — the
 * review inbox of the Marketing system (`features/marketing`,
 * `DiscoveryInbox`): machine-discovered candidates (`web.discovered_item` —
 * media, identity copy, social profiles, business facts, notable links)
 * grouped by category with pending/confirmed/dismissed tabs, where a human
 * promotes candidates to confirmed brand truth or dismisses them. Inherits
 * the shared brand + site context blocks from `matrx-user/marketing-site`.
 *
 * Runtime emitter: `DiscoveryInbox` mounts a nested SurfaceRuntimeProvider and
 * spreads `useMarketingSiteSurfaceBase().getBaseValues()` (the inherited
 * brand/site block) into `createMarketingDiscoveryScope`.
 *
 * The write half (`writeTargets`, below) covers the other direction: an agent
 * can STAGE the per-item classification the reviewer confirms with — never
 * confirm, dismiss, or delete. See the docblock above `writeTargets` for the
 * full ranking of this mount's state and why the line falls there.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  DISCOVERY_KIND_POOL_PROSE,
  LABEL_REQUIRED_KIND,
} from "@/features/marketing/discovery-classification";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "inbox_state",
    label: "Inbox state",
    sortOrder: 100,
    description:
      "Which review queue the user is looking at and how much is in it.",
  },
  {
    key: "candidates",
    label: "Discovered candidates",
    sortOrder: 200,
    description:
      "The machine-discovered rows themselves — unreviewed guesses, never confirmed brand truth.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Inbox state ───────────────────────────────────────────────────────
  {
    name: "active_status",
    label: "Active review tab",
    description:
      "Which review queue is on screen: pending, confirmed, or dismissed. Always present — the inbox always has exactly one tab selected, defaulting to pending.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 9,
    sortOrder: 300,
    group: "inbox_state",
  },
  {
    name: "pending_count",
    label: "Pending count",
    description:
      "Number of discovered items awaiting human review for this brand, from the dedicated brand-scoped count query (never the loaded row count, which caps at the list limit). Zero is the only proof the inbox is clear; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 310,
    group: "inbox_state",
  },
  {
    name: "loaded_count",
    label: "Loaded item count",
    description:
      "How many rows the active tab currently has loaded. Always present once the inbox renders (zero when the tab is empty). Distinct from pending_count, which is brand-wide and tab-independent.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 320,
    group: "inbox_state",
  },
  {
    name: "category_counts",
    label: "Counts by category",
    description:
      "Row counts per discovery category for the active tab (media, identity, social, fact, link, other) — the section grouping the inbox renders. Empty array when the tab has no rows.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 330,
    group: "inbox_state",
  },

  // ── Discovered candidates ─────────────────────────────────────────────
  {
    name: "pending_items",
    label: "Pending discovery items",
    description:
      "The machine-discovered candidates currently awaiting review: category, guessed_kind, confidence, url, and label per pending item (capped at 30). Empty when the Pending tab is not the active tab, during initial load, or when nothing is pending — an empty value is never proof the inbox is clear (use pending_count). Bindable only — not auto-shipped.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2200,
    autoContext: false,
    sortOrder: 400,
    group: "candidates",
  },
  {
    name: "discovered_items",
    label: "Loaded discovery items",
    description:
      "The rows loaded for whichever tab is active (capped at 30): id, category, guessed_kind, confidence, url, label, context snippet, and status. On the Pending tab this is the same set as pending_items with more fields; on the Confirmed/Dismissed tabs it is the only view of those rows. Empty during initial load or when the tab has no rows. Bindable only — not auto-shipped.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 410,
    group: "candidates",
  },
  {
    name: "staged_classifications",
    label: "Staged classifications",
    description:
      "The type (and label) currently staged against each loaded PENDING row (capped at 30, matching discovered_items) — the read twin of the item_classifications write target: item_id, kind, label, and is_default (true while the kind is still the machine's untouched guess, false once someone staged one). Rows appear whether or not anyone has touched them, so this is what Confirm would use right now, not just what was overridden. Empty on the Confirmed/Dismissed tabs (those rows render no classification controls) and during initial load. Staged only — nothing here reaches the brand until the user clicks Confirm on the row.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1800,
    autoContext: false,
    sortOrder: 420,
    group: "candidates",
  },
];

/**
 * THE JUDGMENT CALL, written down (2026-08-10).
 *
 * This surface earns exactly ONE write target, and the reasoning matters more
 * than the count. Every piece of state the mount owns, ranked:
 *
 *  - `kindOverrides` (per-item type) — YES. A classification an agent derives
 *    from the item's own evidence, which the read side already supplies in
 *    full (`discovered_items` carries category, guessed_kind, confidence,
 *    url, label, context). This is exactly the "labels/categories derived
 *    from the item's content" case.
 *  - `labelOverrides` (per-item label) — YES, and INSEPARABLE from the kind:
 *    the two controls sit in the same row, are committed by the same Confirm
 *    click, and are coupled by a hard rule (`other` REQUIRES a label, and the
 *    Confirm button stays disabled without one). Per the skill's own rule —
 *    one field object for values edited together, separate targets only for
 *    independent decisions — they are ONE target, not two.
 *  - `status` (active tab), `page`, `pageSize` — NO. Browse/pagination view
 *    state; a surface whose only writable state is list state does not earn
 *    targets.
 *  - `selected` — NO, and deliberately. It looks like triage staging, but the
 *    selection drives Confirm AND Dismiss AND **Delete/Bulk-delete**. An
 *    agent that populates the selection pre-loads a destructive control it is
 *    not allowed to fire; one mis-click by the human turns an agent's
 *    suggestion into a bulk delete. Selection stays human.
 *  - `confirmingDelete` / `confirmingBulkDelete` — NO. Destructive confirm
 *    state, full stop.
 *  - Confirm / Dismiss / Delete themselves — NO. These COMMIT a decision into
 *    `web.discovered_item` and the confirmed brand tables. This surface's own
 *    intro states the invariant: the machine writes ONLY candidates,
 *    promotion is "a human, explicit act", and the agent "recommends confirm
 *    or dismiss". Dismiss is the mirror of Confirm — both commit — so neither
 *    is a draft and neither gets a target.
 *
 * One target is below the campaign's rough "~2 YES fields" bar as literally
 * counted, and it is still worth the work here rather than a ruled-out
 * write-up: this surface exists to be agent-reviewed (it declares two agent
 * roles, `discovery_reviewer` and `fact_researcher`, purpose-built for
 * exactly this), its read side already gives an agent everything needed to
 * classify, and classification was the one half of the reviewer's loop an
 * agent could not reach. The target is array-valued so a reviewer agent can
 * triage the whole visible queue in ONE confirmed action, mirroring the bulk
 * "Set type for selected" control the human already has.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "item_classifications",
    label: "Item classifications",
    description:
      `Stages the TYPE (and its label) for one or more discovered items — the classification half of review, which the user still commits by clicking Confirm on the row. Value is a NON-EMPTY ARRAY of objects: [{ item_id: string, kind: string, label?: string }]. ` +
      `\`item_id\` must be the id of a row currently loaded on the PENDING tab — read the ids from discovered_items; an id that is not on screen is REFUSED (an item you cannot see is one the user cannot review beside you), as is any call while the Confirmed or Dismissed tab is active, because those rows render no classification controls at all. ` +
      `\`kind\` is REQUIRED per entry and its allowed vocabulary DEPENDS ON THAT ITEM'S CATEGORY, because each category promotes into a different table: ${DISCOVERY_KIND_POOL_PROSE}. A kind from the wrong pool is refused, never coerced. ` +
      `\`label\` is optional for every other kind and REQUIRED (non-empty) when kind is "${LABEL_REQUIRED_KIND}" — an "${LABEL_REQUIRED_KIND}" row with no label cannot be confirmed by the user at all, so staging one is refused. ` +
      `MERGES BY item_id: items you do not list keep whatever is staged for them, and this never clears another item's classification. Within a listed item the classification is REPLACED wholesale — kind and label travel together, so omitting \`label\` CLEARS any label already staged for that item; resend it to keep it. ` +
      `Read the current state back from staged_classifications, which lists every loaded pending row with its staged kind and label. ` +
      `The whole array is validated BEFORE anything is staged: one bad entry rejects the call and leaves every row untouched, so you never get a half-applied triage. ` +
      `This ONLY stages the classification. Confirming an item into the brand's assets/facts/properties, dismissing it, and deleting it are human acts on this surface and are not available to you.`,
    valueType: "array",
    updatesValue: "staged_classifications",
    mode: "draft",
    applyPolicy: "ask",
    group: "candidates",
    sortOrder: 100,
  },
];

export const marketingDiscoveryManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-discovery",
  readiness: "verified",
  label: "Marketing Discovery Inbox",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/discovery",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the Marketing discovery inbox: the review queue where machine-discovered candidates about this brand (logos and imagery, identity copy, social profiles, phone/fax/address facts, notable links) wait for a human decision. Each pending item carries the machine's guess (guessed_kind), its source URL, and a label; the user confirms it into brand truth, dismisses it, or deletes it.
The one invariant that governs this surface: the machine writes ONLY discovered_item candidates — promotion to confirmed truth (properties, brand assets, business facts) is a human, explicit act. You recommend confirm or dismiss with reasoning grounded in the item's evidence and the brand context; you never write confirmed rows, never treat a pending guess as established fact, and never invent candidates that are not in the inbox.
Use the inherited brand_context and site_context to judge whether a candidate fits the client (right company, right domain, plausible fact) before recommending confirmation.
Read active_status FIRST: the inbox shows one queue at a time, and discovered_items holds only that tab's rows. pending_items is populated only while the Pending tab is active. An empty item list means not-yet-loaded or that tab is empty — pending_count (brand-wide, tab-independent) at zero is the only proof the inbox is clear.
The ONE thing you can change here is the CLASSIFICATION: item_classifications stages the type (and label) a pending row will be confirmed with, exactly as the user's own type dropdown does, and staged_classifications reads it back. That is the half of review you can do. The decisions themselves — confirm, dismiss, delete — stay with the user; stage the types, then say which items you would confirm and why.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
  agentRoles: [
    {
      name: "discovery_reviewer",
      label: "Discovery reviewer",
      description:
        "Reviews pending discovered items and recommends confirm/dismiss decisions with evidence-grounded reasoning; never writes confirmed truth.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "fact_researcher",
      label: "Fact researcher",
      description:
        "Cross-checks pending candidates against the live site and brand context, and researches missing facts worth proposing for review.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING those
 * inherited from `matrx-user/marketing-site` (site block) and its parent
 * `matrx-user/marketing-brand` (brand block): `brand_id` + `site_id`.
 */
export function createMarketingDiscoveryScope(values: {
  // Inherited alwaysAvailable: true → required
  brand_id: string;
  site_id: string;
  // Inherited alwaysAvailable: false → optional
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  gsc_synced_at?: string;
  // Own alwaysAvailable: true → required
  active_status: string;
  loaded_count: number;
  category_counts: ReadonlyArray<{ category: string; count: number }>;
  // Own alwaysAvailable: false → optional
  pending_items?: ReadonlyArray<Record<string, unknown>>;
  discovered_items?: ReadonlyArray<Record<string, unknown>>;
  staged_classifications?: ReadonlyArray<Record<string, unknown>>;
  pending_count?: number;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
