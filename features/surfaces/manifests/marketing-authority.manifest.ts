import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { AUTHORITY_GUIDANCE_MAX_CHARS } from "@/features/marketing/authority/authority-write-targets";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "authority_model",
    label: "Authority model",
    sortOrder: 100,
    description: "The joined evidence and deterministic authority-flow model.",
  },
  {
    key: "authority_actions",
    label: "Recommended routes",
    sortOrder: 200,
    description:
      "Exact source-to-target actions proposed by the grounded strategist.",
  },
  {
    key: "authority_run",
    label: "Run form",
    sortOrder: 300,
    description:
      "What the NEXT analysis will be told — staged on the page, sent only when the user presses run.",
  },
];

const values: SurfaceValue[] = [
  {
    name: "authority_summary",
    label: "Authority verdict",
    description:
      "Latest authority-router verdict, evidence coverage, warnings, and calculation time.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 900,
    group: "authority_model",
    sortOrder: 100,
  },
  {
    name: "authority_pages",
    label: "Modeled pages",
    description:
      "Canonical pages with Link Score, backlink entry signals, GSC demand, role, keyword, and current in/out link counts.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    autoContext: false,
    group: "authority_model",
    sortOrder: 110,
  },
  {
    name: "authority_candidates",
    label: "Grounded candidate routes",
    description:
      "The deterministic allowlist of missing source-to-target edges the strategist was permitted to judge.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    group: "authority_actions",
    sortOrder: 200,
  },
  {
    name: "authority_recommendations",
    label: "Authority route recommendations",
    description:
      "Ranked exact source, target, anchor, placement, expected benefit, evidence, confidence, and cannibalization risk.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    group: "authority_actions",
    sortOrder: 210,
  },
  {
    name: "authority_guidance",
    label: "Optional priority",
    description:
      "The free-text priority note currently staged in the run form, steering which pages the next analysis should favour or leave alone. Empty when no note has been written. Nothing is persisted — it is sent only when the user presses the run button.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "authority_run",
    sortOrder: 300,
  },
];

/**
 * Write targets — the run form's guidance note, plus triage on the proposed
 * routes. Handlers are registered by `AuthorityRouterWorkspace`, the component
 * that owns both the guidance state and the two server actions.
 *
 * **Why these three.** The surface's whole authored input is one textarea, and
 * its whole decision surface is "which of these proposed routes do we take".
 * `authority_guidance` is prose an agent drafts well and is the classic staged
 * run-input (`marketing-crawls`, `image-generate`, `chat-voice`): the value is
 * staged, nothing is persisted, and the user presses run. The two triage
 * targets are the `marketing-findings` shape — suppress / act on an item in a
 * reviewed list — and both go through the SAME server actions the Dismiss and
 * "Add to link plan" buttons call.
 *
 * **DELIBERATELY NOT WRITABLE.** Running the analysis: `authority.start` opens
 * a durable run that joins backlinks, the crawl graph, Search Console and the
 * content plan and then spends model budget on the strategist — the human
 * press stays the gate, per `podcast-studio` / `image-generate` /
 * `marketing-crawls`. `forceRefresh` is part of that same press. The `view`
 * toggle (map / routes / evidence) is mechanical view state nobody would ask
 * an agent to flip. And every model value — `authority_summary`,
 * `authority_pages`, `authority_candidates`, `authority_recommendations` — is
 * the RECORD of what the analysis computed from real evidence; writing them
 * would forge the finding rather than change it. An agent moves those by
 * writing guidance and letting the user re-run, which IS the evidence loop
 * here.
 *
 * **Both triage targets are `mode: "entity"`** because there is no draft state
 * behind those buttons: one click calls `updatePageDesiredValues` and the row
 * changes. `applyPolicy: "ask"` is therefore doing the real work, and the
 * descriptions say plainly that the write persists and that it touches the
 * PLAN and not the live site.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "authority_guidance",
    label: "Optional priority",
    description: `Replaces the ENTIRE "Optional priority" note in the run form — pass the full text you want, not an addition, and pass "" to clear it. Free-form prose telling the next analysis which pages to favour or leave alone (e.g. "prioritize the California service pages and avoid changing the pricing guide"). Maximum ${AUTHORITY_GUIDANCE_MAX_CHARS} characters. This only stages the note: nothing is persisted and no analysis runs until the user presses the run button themselves. Refused while an analysis is already running.`,
    valueType: "string",
    updatesValue: "authority_guidance",
    mode: "draft",
    applyPolicy: "ask",
  },
  {
    name: "authority_dismiss_recommendation",
    label: "Dismiss recommendation",
    description:
      "Dismisses ONE proposed route so it stops being offered, exactly as the user's own Dismiss button does. Pass the `candidate_key` string of a recommendation from authority_recommendations — not its URL, index or anchor. Persists immediately to the source page's `authority_router_dismissed` list. Refused if the key is unknown, already dismissed, the result has not loaded, or an analysis is running.",
    valueType: "string",
    updatesValue: "authority_recommendations",
    mode: "entity",
    applyPolicy: "ask",
  },
  {
    name: "authority_add_recommendation_to_plan",
    label: "Add recommendation to link plan",
    description:
      "Enters ONE proposed route into BOTH pages' existing link plans — the target URL and anchor onto the source page's outbound links, and the source URL onto the target page's inbound links — exactly as the user's own \"Add to link plan\" button does. Pass the `candidate_key` string of a recommendation from authority_recommendations. Persists immediately and is idempotent by partner URL. It changes the PLAN only; the live site and the observed link graph are unaffected until someone edits the site and it is crawled again. Refused if the key is unknown, already dismissed, already in the plan, the result has not loaded, or an analysis is running.",
    valueType: "string",
    updatesValue: "authority_recommendations",
    mode: "entity",
    applyPolicy: "ask",
  },
];

export const marketingAuthorityManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-authority",
  readiness: "verified",
  label: "Internal Authority Router",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/authority",
  inheritsFrom: "matrx-user/marketing-site",
  groups,
  intro: `<surface_intro>
You are on the Internal Authority Router for one managed website. This surface joins observed backlink entry points, the current crawl link graph and Link Score, Search Console demand and educational traffic, page roles, keyword mapping, content plans, and cannibalization evidence.
Recommendations are grounded actions, not invented strategy: every source and target is a real canonical page and every pair came from the deterministic candidate allowlist. Use authority_recommendations for exact anchors and placements; use authority_pages and authority_candidates when challenging the rationale. When a scan warning says evidence was truncated, state that limitation.
Approved recommendations enter the existing bidirectional page link plan; the observed link graph changes only after the live site is edited and crawled again.
</surface_intro>`,
  values: mergeBaselineValues(pickBaseline("selection", "context"), values),
  writeTargets,
  agentRoles: [
    {
      name: "authority_routing_strategist",
      label: "Authority routing strategist",
      description:
        "Explains and refines grounded internal-authority routes without inventing pages or evidence.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
  ],
};

export function createMarketingAuthorityScope(values: {
  brand_id: string;
  site_id: string;
  authority_summary?: Record<string, unknown>;
  authority_pages?: Array<Record<string, unknown>>;
  authority_candidates?: Array<Record<string, unknown>>;
  authority_recommendations?: Array<Record<string, unknown>>;
  authority_guidance?: string;
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
