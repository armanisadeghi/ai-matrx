import { NextResponse } from "next/server";
import { BackendClient } from "@/lib/api/backend-client";
import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";
import { BackendApiError } from "@/lib/api/errors";
import { OrganizationContextError } from "@/lib/api/organization-context";

/**
 * The publish writing check for text the CMS editor puts live (OpenSEO Wave 2 item 6).
 *
 * An organization that set `brand_voice.writing_check_severity` to `block` gets a
 * block: before the route writes text live for a page that realizes a plan node
 * (an SEO page), aidream's `POST /cms/publish-check` runs the same gate its own
 * publish seam runs, on the text going live.
 *
 * Cost under warn or off is ONE read: the severity, through `platform.knob_resolve`,
 * in the CMS site's organization (already loaded by the route's access lookup).
 * The server is called only at block. A page outside the plan costs nothing.
 *
 * STAND-IN, LOUDLY: the path below is `ENDPOINTS.cms.publishCheck` in
 * `@ai-matrx/agents` (aidream b1b9c6a2fa, "Unreleased" in its CHANGELOG). Replace
 * this constant with that entry when this app adopts the release; the parity test
 * `publishWritingCheck.parity.test.ts` fails if the two ever differ.
 */
export const CMS_PUBLISH_CHECK_PATH = "/cms/publish-check";

/** What the person sees when the organization is at block and the check could not run. */
export const WRITING_CHECK_DID_NOT_RUN = "Writing check didn't run";

const CHECK_TIMEOUT_MS = 8_000;
const WRITING_FEATURE = "brand_voice";
const SEVERITY_KEY = "writing_check_severity";
const SEVERITIES = ["warn", "block", "off"] as const;
type Severity = (typeof SEVERITIES)[number];

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
  /** Go ahead. `notice` is set when the person must be told something. */
  | { kind: "allowed"; notice: string | null }
  /** Must-fix writing items: stop, show the list. */
  | { kind: "blocked"; mustFix: WritingMustFix[]; lift: WritingLift; notes: string[] }
  /** The server says this person may not publish this page (403/404): stop. */
  | { kind: "refused"; status: 403 | 404; message: string };

/** The one Supabase read the check needs, injectable for tests. */
export interface PublishWritingCheckReads {
  writingSeverity: (organizationId: string) => Promise<unknown>;
}

interface PlatformRpcClient {
  schema: (name: string) => {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
}

/** Reads through the signed-in person's main-database client (membership applies). */
export function supabaseWritingReads(mainSupabase: unknown): PublishWritingCheckReads {
  const db = mainSupabase as PlatformRpcClient;
  return {
    async writingSeverity(organizationId) {
      const { data, error } = await db.schema("platform").rpc("knob_resolve", {
        p_feature: WRITING_FEATURE,
        p_key: SEVERITY_KEY,
        p_organization_id: organizationId,
      });
      if (error) throw new Error(`${WRITING_FEATURE}.${SEVERITY_KEY}: ${error.message}`);
      return data;
    },
  };
}

/** Same rule as the server: case is forgiven (and said); anything else is loud and read as warn. */
export function normalizeSeverity(raw: unknown): Severity {
  if (typeof raw === "string") {
    const value = raw.trim().toLowerCase();
    if ((SEVERITIES as readonly string[]).includes(value)) {
      if (value !== raw) {
        console.warn(`[cms/writing-check] ${WRITING_FEATURE}.${SEVERITY_KEY} = ${JSON.stringify(raw)} read as "${value}".`);
      }
      return value as Severity;
    }
  }
  console.error(
    `[cms/writing-check] ${WRITING_FEATURE}.${SEVERITY_KEY} = ${JSON.stringify(raw)} is not one of ` +
      `${SEVERITIES.join(", ")} — read as warn. Fix the setting.`,
  );
  return "warn";
}

/** At block the check could not run: logged, and the person is told. */
function didNotRun(reason: string, cause?: unknown): PublishWritingCheckResult {
  console.error(`[cms/writing-check] ${WRITING_CHECK_DID_NOT_RUN} — ${reason}. The write proceeds.`, cause);
  return { kind: "allowed", notice: WRITING_CHECK_DID_NOT_RUN };
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
  title?: string | null;
  excerpt?: string | null;
}

const LIVE_EDIT_COLUMNS = ["html_content", "meta_title", "meta_description", "title", "excerpt"] as const;

/** The judged live columns present in a row update, or null when it writes none. */
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
  /** `client_pages.plan_node_id`; a page outside the plan is never checked. */
  planNodeId: string | null | undefined;
  /** The CMS site's organization — where the severity is read. */
  organizationId: string | null | undefined;
  accessToken: string | null;
  reads: PublishWritingCheckReads;
  /** A save that writes live columns of a published page (`{}` = judge the live text as it is). */
  liveEdit?: WritingLiveEdit;
  baseUrl?: string;
}): Promise<PublishWritingCheckResult> {
  if (!input.planNodeId) return { kind: "allowed", notice: null };
  if (!input.organizationId) {
    console.error(
      `[cms/writing-check] page ${input.pageId} realizes a plan node but its CMS site has no organization — ` +
        "the writing check cannot be read. Give the site an organization.",
    );
    return { kind: "allowed", notice: null };
  }

  let severity: Severity;
  try {
    severity = normalizeSeverity(await input.reads.writingSeverity(input.organizationId));
  } catch (error) {
    console.error(
      "[cms/writing-check] the writing-check setting could not be read — nobody is known to have chosen block; the write proceeds.",
      error,
    );
    return { kind: "allowed", notice: null };
  }
  // Warn and off never call the server: nothing slows down.
  if (severity !== "block") return { kind: "allowed", notice: null };

  if (!input.accessToken) return didNotRun("the signed-in access token is unavailable");
  try {
    const client = new BackendClient({
      baseUrl: (input.baseUrl ?? AIDREAM_PRODUCTION_URL).replace(/\/$/, ""),
      auth: { type: "token", token: input.accessToken },
      scope: { organization_id: input.organizationId },
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
      return didNotRun("aidream returned a malformed publish-check response");
    }
    const notes = Array.isArray(body.settings_problems)
      ? body.settings_problems.filter((n): n is string => typeof n === "string")
      : [];
    if (body.allowed) {
      return { kind: "allowed", notice: typeof body.notice === "string" ? body.notice : null };
    }
    const mustFix = Array.isArray(body.must_fix) ? body.must_fix.filter(isMustFix) : [];
    return { kind: "blocked", mustFix, lift: body.lift, notes };
  } catch (error) {
    if (error instanceof BackendApiError) {
      if (error.status === 403) {
        return { kind: "refused", status: 403, message: "You can't publish this page." };
      }
      if (error.status === 404) {
        return { kind: "refused", status: 404, message: "This page wasn't found." };
      }
      if (error.status === 401) {
        return didNotRun("aidream refused the sign-in (401) — the session may have expired", error);
      }
    }
    // Our own wiring defect (the request never left this process), kept apart
    // from an aidream outage so the log names the real cause.
    if (error instanceof OrganizationContextError) {
      return didNotRun(
        `the site's organization (${input.organizationId}) is not a usable organization context — a wiring defect, not an outage`,
        error,
      );
    }
    return didNotRun("aidream's publish check is unreachable or timed out", error);
  }
}

/** A must-fix hint as the editor shows it: at most 60 characters on the line. */
export const HINT_MAX = 60;

/** One short line per must-fix item, then where the three ways to lift it live. */
export function writingBlockMessage(mustFix: readonly WritingMustFix[]): string {
  const lines = mustFix.map((item) => `- ${item.field}: "${item.match}". ${item.fix_hint}`);
  return [
    `Not published: ${mustFix.length} writing item${mustFix.length === 1 ? "" : "s"} to fix.`,
    ...lines,
    "Or change your Brand voice settings.",
  ].join("\n");
}

/** The response for a write the writing gate stops: 422 must-fix, or the server's 403/404. */
export function cmsWritingStopResponse(
  result: Exclude<PublishWritingCheckResult, { kind: "allowed" }>,
): NextResponse {
  if (result.kind === "refused") {
    return NextResponse.json(
      { error: result.message, code: "cms_writing_check_refused" },
      { status: result.status },
    );
  }
  return NextResponse.json(
    {
      error: writingBlockMessage(result.mustFix),
      code: "cms_writing_check_blocked",
      must_fix: result.mustFix,
      lift: result.lift,
      settings_problems: result.notes,
    },
    { status: 422 },
  );
}

/** The notices a successful write must carry to the person (shown by the CMS client). */
export function writingNotices(result: PublishWritingCheckResult | null): string[] {
  return result?.kind === "allowed" && result.notice ? [result.notice] : [];
}
