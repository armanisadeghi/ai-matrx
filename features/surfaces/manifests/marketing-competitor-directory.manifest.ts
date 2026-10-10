/**
 * Surface manifest — Competitor directory (`matrx-user/marketing-competitor-directory`).
 *
 * A brand's rivals, one row per competitor: its website, its tracked social accounts with audience
 * and best outlier. Emitted by `BrandCompetitorDirectory` from the rows it already rendered (never
 * a fetch). The website autopsy modes beside it (Run, Review, Opportunities, Competitors, Evidence,
 * History) are `matrx-user/marketing-competitors`.
 *
 * Read-only for now: Add competitor, Find socials and Track have no agent twin yet (Track and Find
 * read someone else's website and spend a lookup, so they need an approval card).
 */

import type { SurfaceManifest, SurfaceScopePayload, SurfaceValue, SurfaceValueGroup } from "@ai-matrx/chat/surfaces/types";
import { MATRX_WEB_APP_EXECUTOR } from "@ai-matrx/chat/surfaces/executor";
import { mergeBaselineValues, pickBaseline } from "@ai-matrx/chat/surfaces/manifests/_baseline.manifest";

export const COMPETITOR_DIRECTORY_SURFACE_NAME = "matrx-user/marketing-competitor-directory";

const groups: SurfaceValueGroup[] = [
  { key: "brand", label: "Brand", sortOrder: 100 },
  { key: "competitors", label: "Competitors", sortOrder: 200 },
];

const v = (
  name: string,
  label: string,
  description: string,
  valueType: SurfaceValue["valueType"],
  typicalCharCount: number,
  group: string,
  sortOrder: number,
  extra: Partial<SurfaceValue> = {},
): SurfaceValue => ({ name, label, description, valueType, alwaysAvailable: false, typicalCharCount, group, sortOrder, ...extra });

const surfaceSpecific: SurfaceValue[] = [
  v("competitors_loaded", "Competitors loaded", "True once the brand's competitor rows are read. While false the other values are absent; load_error says why.", "boolean", 5, "competitors", 200, { alwaysAvailable: true }),
  v("load_error", "Load error", "Why the competitors could not be read. Absent on a clean read.", "string", 120, "competitors", 205),
  v("brand_id", "Brand id", "The brand whose competitors these are.", "string", 36, "brand", 100),
  v("brand_name", "Brand name", "The brand's name.", "string", 40, "brand", 110),
  v("brand_kind", "Brand kind", "company or person: a person's rivals are called peers.", "string", 8, "brand", 120),
  v("competitor_count", "Competitors", "How many competitors the table lists.", "number", 3, "competitors", 210),
  v("with_accounts_count", "With tracked accounts", "How many competitors have at least one tracked social account.", "number", 3, "competitors", 220),
  v("without_accounts_count", "Without tracked accounts", "How many competitors have no tracked social account yet, so show no audience numbers.", "number", 3, "competitors", 230),
  v("competitor_list", "Competitor list", "The condensed list as one XML bundle: name, website, accounts (platform, handle, followers), posts tracked, best outlier multiple, whether a social lookup is still possible.", "string", 4000, "competitors", 240),
  v("competitors", "Competitors (full rows)", "Every row as { key, name, website, tracking, accounts: [{ platform, handle, followers, posts_tracked, best_multiple }] }.", "array", 6000, "competitors", 250, { autoContext: false }),
];

export const marketingCompetitorDirectoryManifest: SurfaceManifest = {
  surfaceName: COMPETITOR_DIRECTORY_SURFACE_NAME,
  client: "matrx-user",
  executor: MATRX_WEB_APP_EXECUTOR,
  executionMode: "python-stream",
  label: "Competitors",
  description: "A brand's competitors with their websites and tracked social accounts.",
  urlPattern: "/marketing/[brandId]/intelligence/competitors",
  briefValues: ["competitors_loaded", "brand_name", "competitor_count", "with_accounts_count"],
  readiness: "partial",
  readinessNote:
    "Read values only. Add competitor, Find socials and Track have no agent twin yet (they read a website and need an approval card). No outside-helper binding test.",
  intro: `<surface_intro>
You are on a brand's competitor directory: one row per competitor with its website and tracked social accounts. Check competitors_loaded first; when false, load_error says why.
competitor_list is the condensed rows (read it first); competitors holds every row. A competitor with no tracked accounts has no audience numbers yet; null followers mean not measured, never zero. Website autopsy work (Run, Review, Opportunities) lives on the screens beside this one.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

export interface CompetitorDirectoryScopeValues {
  competitors_loaded: boolean;
  load_error?: string;
  brand_id: string;
  brand_name: string;
  brand_kind: string;
  competitor_count?: number;
  with_accounts_count?: number;
  without_accounts_count?: number;
  competitor_list?: string;
  competitors?: Array<Record<string, unknown>>;
}

export const createCompetitorDirectoryScope = (values: CompetitorDirectoryScopeValues): SurfaceScopePayload =>
  values as unknown as SurfaceScopePayload;
