import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  { key: "selection", label: "Selected site", sortOrder: 100, description: "The managed site currently being investigated." },
  { key: "competitors", label: "Competitors", sortOrder: 200, description: "Stable competitors and their resolved threat assessments." },
  { key: "opportunities", label: "Opportunities", sortOrder: 300, description: "Prioritized actions produced from the evidence." },
  { key: "evidence", label: "Evidence", sortOrder: 400, description: "The latest verdict, coverage, limitations, and run state." },
];

const values: SurfaceValue[] = [
  { group: "selection", name: "site_id", label: "Site id", description: "The selected web.site identity.", valueType: "string", alwaysAvailable: false, typicalCharCount: 36, sortOrder: 100 },
  { group: "selection", name: "site", label: "Selected site", description: "Name, domain, and root URL for the selected managed site.", valueType: "object", alwaysAvailable: false, typicalCharCount: 300, sortOrder: 110 },
  { group: "competitors", name: "competitors", label: "Competitor assessments", description: "The currently loaded stable competitors, including tracking, relevance, threat, overlap, visibility, and latest resolved judgment.", valueType: "array", alwaysAvailable: false, typicalCharCount: 5000, autoContext: false, sortOrder: 200 },
  { group: "opportunities", name: "opportunities", label: "Prioritized opportunities", description: "The currently loaded normalized opportunities with verdicts, actions, evidence, dependencies, owned-page relationships, scores, and human status.", valueType: "array", alwaysAvailable: false, typicalCharCount: 9000, autoContext: false, sortOrder: 300 },
  { group: "evidence", name: "latest_autopsy", label: "Latest autopsy", description: "The latest completed Content IR strategist artifact, including executive verdict and evidence coverage.", valueType: "object", alwaysAvailable: false, typicalCharCount: 7000, autoContext: false, sortOrder: 400 },
  { group: "evidence", name: "active_run", label: "Active run", description: "Current run status, durable run id, and visible pipeline stage.", valueType: "object", alwaysAvailable: false, typicalCharCount: 300, sortOrder: 410 },
];

export const marketingCompetitorsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-competitors",
  readiness: "verified",
  label: "Competitor Opportunity Autopsy",
  urlPattern: "/marketing/competitors",
  intro: `<surface_intro>
You are on the competitor opportunity autopsy workspace. The selected site is the client; competitors are only rivals supported by provider overlap or explicitly supplied by the user. Read latest_autopsy for the causal verdict and evidence limitations, competitors for stable threat assessments, and opportunities for the concrete work queue.
Keep provider facts, crawler observations, AI judgments, and human workflow status separate. Never restate authority or keyword counts as strategy. Lead with why the competitor wins, what the client already has, and the smallest high-leverage action that closes the gap. Every owned page id and competitor URL is a real door; use it rather than naming an unreachable record.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), values),
  agentRoles: [
    { name: "competitor_strategist", label: "Competitor strategist", description: "Explains causal advantages and prioritizes the minimum action set from stored evidence.", kind: "single", defaultAgentId: null, sortOrder: 100 },
  ],
};

export function createMarketingCompetitorsScope(values: {
  site_id?: string;
  site?: Record<string, unknown>;
  competitors?: Array<Record<string, unknown>>;
  opportunities?: Array<Record<string, unknown>>;
  latest_autopsy?: Record<string, unknown>;
  active_run?: Record<string, unknown>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
