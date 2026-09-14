"use client";

/**
 * features/marketing/strategy/data.ts
 *
 * THE strategy brief — one staged-confidence document in two scopes.
 *
 * Org → Brand → Website (Arman, 2026-09-14): "if it's a property of the brand,
 * it belongs to the brand; if it's a property of the site, it belongs to the
 * site." The BRAND strategy holds the business facts — what they do, who they
 * serve, each service line with its own footprint. The SITE brief holds what
 * one website is FOR — which of those lines it carries, who this site is for,
 * what it must win, its shape — and READS the brand facts, never restates
 * them. A brand with one site gets both and it feels like one document; a
 * brand with three corrects a fact once.
 *
 * Storage is `seo.landscape_brief` (one table, `scope` = brand|site), the same
 * staged-confidence machine the competitor classifier already trusted: facts,
 * a plain-language brief the owner corrects in one sentence, a 1-5 confidence
 * the system honours, a 24-hour review window that never blocks, and the
 * owner's own words carried forward through every regeneration. Regenerating
 * SUPERSEDES — it never overwrites — so history is real.
 *
 * HONESTY RULE (as `content-plan/setup/bridge.ts`): every field shown is the
 * server's own row, parsed defensively; a row we cannot read is dropped loudly.
 */
import { callApi, type ApiCallResult } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";

export type StrategyScope = "brand" | "site";

export type StrategyStatus =
  | "awaiting_review"
  | "confirmed"
  | "auto_accepted"
  | "superseded"
  | "draft";

export interface StrategyServiceLine {
  name: string;
  customerSegment: string;
  footprint: string;
  footprintDetail: string;
  why: string;
}

export interface StrategyBrief {
  id: string;
  scope: StrategyScope;
  brandId: string;
  siteId: string | null;
  status: StrategyStatus;
  briefMarkdown: string;
  /** The agent's established facts; site scope carries purpose/audience/shape here too. */
  facts: Record<string, unknown>;
  serviceLines: StrategyServiceLine[];
  agentConfidence: number | null;
  confidenceReason: string;
  /** The owner's own words — outranks every inference downstream. */
  guidance: string;
  autoAcceptAt: string | null;
  reviewedAt: string | null;
  generatedAt: string | null;
  /** What this version was built from (crawl size, GSC window, research doc…). */
  inputs: Record<string, unknown>;
  versionNo: number;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseStrategyBrief(raw: unknown): StrategyBrief | null {
  const row = record(raw);
  const id = str(row.id);
  const scope = str(row.scope);
  if (!id || (scope !== "brand" && scope !== "site")) return null;
  const lines: StrategyServiceLine[] = [];
  for (const item of Array.isArray(row.service_lines) ? row.service_lines : []) {
    const line = record(item);
    const name = str(line.name);
    if (!name) continue;
    lines.push({
      name,
      customerSegment: str(line.customer_segment),
      footprint: str(line.footprint) || "regional",
      footprintDetail: str(line.footprint_detail),
      why: str(line.why),
    });
  }
  return {
    id,
    scope,
    brandId: str(row.brand_id),
    siteId: str(row.site_id) || null,
    status: (str(row.status) || "draft") as StrategyStatus,
    briefMarkdown: str(row.brief_markdown),
    facts: record(row.facts),
    serviceLines: lines,
    agentConfidence:
      typeof row.agent_confidence === "number" ? row.agent_confidence : null,
    confidenceReason: str(row.confidence_reason),
    guidance: str(row.guidance),
    autoAcceptAt: str(row.auto_accept_at) || null,
    reviewedAt: str(row.reviewed_at) || null,
    generatedAt: str(row.generated_at) || null,
    inputs: record(row.inputs),
    versionNo: typeof row.version_no === "number" ? row.version_no : 1,
  };
}

function requireBody(result: ApiCallResult, what: string): Record<string, unknown> {
  if (result.error) throw new Error(result.error.message || `The ${what} call failed.`);
  if (!result.data || typeof result.data !== "object") {
    throw new Error(`The ${what} call returned no body.`);
  }
  return result.data as Record<string, unknown>;
}

/** The ONE route family, keyed by scope (typed literals — the contract is generated). */
export function strategyPath(scope: StrategyScope) {
  return scope === "brand"
    ? ("/seo/brands/{brand_id}/strategy" as const)
    : ("/seo/sites/{site_id}/strategy" as const);
}
function historyPath(scope: StrategyScope) {
  return scope === "brand"
    ? ("/seo/brands/{brand_id}/strategy/history" as const)
    : ("/seo/sites/{site_id}/strategy/history" as const);
}
function rulingPath(scope: StrategyScope) {
  return scope === "brand"
    ? ("/seo/brands/{brand_id}/strategy/ruling" as const)
    : ("/seo/sites/{site_id}/strategy/ruling" as const);
}

function pathParams(scope: StrategyScope, id: string): Record<string, string> {
  return scope === "brand" ? { brand_id: id } : { site_id: id };
}

/** The brief as it stands, or null when none has ever been generated. */
export async function loadStrategy(
  dispatch: AppDispatch,
  scope: StrategyScope,
  id: string,
  organizationId: string,
): Promise<StrategyBrief | null> {
  const result = await dispatch(
    callApi({
      path: strategyPath(scope),
      method: "GET",
      pathParams: pathParams(scope, id),
      // The brand's org, not the shell's active org — a plan applied to
      // another of the user's orgs must still read its own brief.
      scopeOverrides: { organization_id: organizationId },
    }),
  );
  const body = requireBody(result, "strategy");
  return body.brief ? parseStrategyBrief(body.brief) : null;
}

/** Every superseded version, newest first. */
export async function loadStrategyHistory(
  dispatch: AppDispatch,
  scope: StrategyScope,
  id: string,
  organizationId: string,
): Promise<StrategyBrief[]> {
  const result = await dispatch(
    callApi({
      path: historyPath(scope),
      method: "GET",
      pathParams: pathParams(scope, id),
      scopeOverrides: { organization_id: organizationId },
    }),
  );
  const body = requireBody(result, "strategy/history");
  const briefs: StrategyBrief[] = [];
  for (const raw of Array.isArray(body.briefs) ? body.briefs : []) {
    const parsed = parseStrategyBrief(raw);
    if (parsed) briefs.push(parsed);
  }
  return briefs;
}

/**
 * The owner's correction, in their own words. This is the training signal —
 * free text on purpose: a structured form would destroy exactly the part
 * worth keeping ("I think it's more like 30 miles").
 */
export async function ruleOnStrategy(
  dispatch: AppDispatch,
  scope: StrategyScope,
  id: string,
  organizationId: string,
  ruling: { guidance: string; briefMarkdown?: string },
): Promise<StrategyBrief> {
  const result = await dispatch(
    callApi({
      path: rulingPath(scope),
      method: "POST",
      pathParams: pathParams(scope, id),
      scopeOverrides: { organization_id: organizationId },
      body: {
        guidance: ruling.guidance,
        ...(ruling.briefMarkdown !== undefined
          ? { brief_markdown: ruling.briefMarkdown }
          : {}),
      },
    }),
  );
  const body = requireBody(result, "strategy/ruling");
  const parsed = parseStrategyBrief(body.brief);
  if (!parsed) throw new Error("The ruling was saved but the brief could not be read back.");
  return parsed;
}
