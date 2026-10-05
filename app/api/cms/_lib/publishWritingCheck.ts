import { NextResponse } from "next/server";
import { BackendClient } from "@/lib/api/backend-client";
import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";
import { OrganizationContextError } from "@/lib/api/organization-context";

/**
 * The publish writing check for the CMS editor's publish (OpenSEO Wave 2 item 6).
 *
 * An organization that set `brand_voice.writing_check_severity` to `block` gets a
 * block: before `publish_page_draft` runs for a page that realizes a plan node
 * (an SEO page), aidream's `POST /cms/publish-check` runs the same gate its own
 * publish seam runs, on the page's final text. Under `warn` or `off` the server is
 * never called, so a publish is not slowed down. A page outside the plan is never
 * checked.
 *
 * The data path stays direct: the plan node and the setting are read from
 * Supabase here; only the text check is server work.
 *
 * STAND-IN, LOUDLY: the path below is `ENDPOINTS.cms.publishCheck` in
 * `@ai-matrx/agents` (aidream b1b9c6a2fa, "Unreleased" in its CHANGELOG). Replace
 * this constant with that entry when this app adopts the release.
 */
export const CMS_PUBLISH_CHECK_PATH = "/cms/publish-check";

const CHECK_TIMEOUT_MS = 8_000;
const WRITING_FEATURE = "brand_voice";
const SEVERITY_KEY = "writing_check_severity";

export interface WritingMustFix {
  field: string;
  rule_id: string;
  match: string;
  fix_hint: string;
}

export interface WritingLift {
  allowed_terms_setting: string;
  rules_setting: string;
  rule_ids: string[];
  severity_setting: string;
}

export type PublishWritingCheckResult =
  | { blocked: false; skipped: boolean }
  | { blocked: true; skipped: false; mustFix: WritingMustFix[]; lift: WritingLift };

/** The two Supabase reads the check needs, injectable for tests. */
export interface PublishWritingCheckReads {
  planNodeOrganization: (planNodeId: string) => Promise<string | null>;
  writingSeverity: (organizationId: string) => Promise<string | null>;
}

interface SchemaClient {
  schema: (name: string) => {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
        };
      };
    };
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
}

/** Reads through the signed-in person's main-database client (RLS applies). */
export function supabaseWritingReads(mainSupabase: unknown): PublishWritingCheckReads {
  const db = mainSupabase as SchemaClient;
  return {
    async planNodeOrganization(planNodeId) {
      const { data, error } = await db
        .schema("plan")
        .from("node")
        .select("organization_id")
        .eq("id", planNodeId)
        .maybeSingle();
      if (error) throw new Error(`plan.node ${planNodeId}: ${error.message}`);
      const row = data as { organization_id?: string | null } | null;
      return row?.organization_id ?? null;
    },
    async writingSeverity(organizationId) {
      const { data, error } = await db.schema("platform").rpc("knob_resolve", {
        p_feature: WRITING_FEATURE,
        p_key: SEVERITY_KEY,
        p_organization_id: organizationId,
      });
      if (error) throw new Error(`${WRITING_FEATURE}.${SEVERITY_KEY}: ${error.message}`);
      return typeof data === "string" ? data : null;
    },
  };
}

function skipped(reason: string, cause?: unknown): PublishWritingCheckResult {
  console.error(
    `[cms/writing-check] SKIPPED — ${reason}. The publish proceeds unchecked; nobody is known to have chosen block.`,
    cause,
  );
  return { blocked: false, skipped: true };
}

function isMustFix(value: unknown): value is WritingMustFix {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.field === "string" &&
    typeof v.rule_id === "string" &&
    typeof v.match === "string" &&
    typeof v.fix_hint === "string"
  );
}

function isLift(value: unknown): value is WritingLift {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.allowed_terms_setting === "string" &&
    typeof v.rules_setting === "string" &&
    typeof v.severity_setting === "string" &&
    Array.isArray(v.rule_ids) &&
    v.rule_ids.every((id) => typeof id === "string")
  );
}

/** The live text columns a save to an already-published page writes directly. */
export interface WritingLiveEdit {
  html_content?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
}

const LIVE_EDIT_COLUMNS = ["html_content", "meta_title", "meta_description"] as const;

/** The gated live columns present in a row update, or null when it writes none. */
export function liveEditOf(updateData: Record<string, unknown>): WritingLiveEdit | null {
  const edit: WritingLiveEdit = {};
  for (const column of LIVE_EDIT_COLUMNS) {
    if (column in updateData) {
      const value = updateData[column];
      edit[column] = typeof value === "string" ? value : null;
    }
  }
  return Object.keys(edit).length ? edit : null;
}

export async function publishWritingCheck(input: {
  pageId: string;
  planNodeId: string | null | undefined;
  accessToken: string | null;
  reads: PublishWritingCheckReads;
  /** A save that writes live columns of a published page: judged as that edit. */
  liveEdit?: WritingLiveEdit;
  baseUrl?: string;
}): Promise<PublishWritingCheckResult> {
  if (!input.planNodeId) return { blocked: false, skipped: false };

  let organizationId: string | null;
  let severity: string | null;
  try {
    organizationId = await input.reads.planNodeOrganization(input.planNodeId);
    if (!organizationId) return skipped(`plan node ${input.planNodeId} has no readable organization`);
    severity = await input.reads.writingSeverity(organizationId);
  } catch (error) {
    return skipped("the organization's writing-check setting could not be read", error);
  }
  // Warn and off never call the server: the publish is not slowed down.
  if (severity !== "block") return { blocked: false, skipped: false };

  if (!input.accessToken) return skipped("the signed-in access token is unavailable");
  try {
    const client = new BackendClient({
      baseUrl: (input.baseUrl ?? AIDREAM_PRODUCTION_URL).replace(/\/$/, ""),
      auth: { type: "token", token: input.accessToken },
      scope: { organization_id: organizationId },
      // The server's request model is extra="forbid": the organization rides the header only.
      sendScopeInBody: false,
    });
    const payload: unknown = await client.postJson(
      CMS_PUBLISH_CHECK_PATH,
      input.liveEdit ? { page_id: input.pageId, live_edit: input.liveEdit } : { page_id: input.pageId },
      AbortSignal.timeout(CHECK_TIMEOUT_MS),
    );
    const body = (payload ?? {}) as Record<string, unknown>;
    if (typeof body.allowed !== "boolean" || !isLift(body.lift)) {
      return skipped("aidream returned a malformed publish-check response");
    }
    if (body.allowed) return { blocked: false, skipped: false };
    const mustFix = Array.isArray(body.must_fix) ? body.must_fix.filter(isMustFix) : [];
    return { blocked: true, skipped: false, mustFix, lift: body.lift };
  } catch (error) {
    // Our own wiring defect (the request never left this process), kept apart
    // from an aidream outage so the log names the real cause.
    if (error instanceof OrganizationContextError) {
      return skipped(
        `the plan node's organization (${organizationId}) is not a usable organization context — a wiring defect, not an outage`,
        error,
      );
    }
    return skipped("aidream's publish check is unreachable or timed out", error);
  }
}

/** One short, plain line per must-fix item, then the three ways to lift the block. */
export function writingBlockMessage(mustFix: readonly WritingMustFix[]): string {
  const lines = mustFix.map((item) => `- ${item.field}: "${item.match}". ${item.fix_hint}`);
  return [
    `Not published: ${mustFix.length} writing item${mustFix.length === 1 ? "" : "s"} to fix.`,
    ...lines,
    "Or allow the words, turn off the rule, or set the check to warn in Brand voice settings.",
  ].join("\n");
}

/** The structured 422 every CMS publish refusal for writing returns. */
export function cmsWritingBlockedResponse(
  result: Extract<PublishWritingCheckResult, { blocked: true }>,
): NextResponse {
  return NextResponse.json(
    {
      error: writingBlockMessage(result.mustFix),
      code: "cms_writing_check_blocked",
      must_fix: result.mustFix,
      lift: result.lift,
    },
    { status: 422 },
  );
}

/** Mark a publish that went out after a fail-open writing check. */
export function withWritingCheckHeader<T extends Response>(
  response: T,
  result: PublishWritingCheckResult | null,
): T {
  if (result?.skipped) response.headers.set("X-Cms-Writing-Check", "skipped");
  return response;
}
