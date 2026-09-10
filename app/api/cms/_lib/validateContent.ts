import { NextResponse } from "next/server";
import { BackendClient } from "@/lib/api/backend-client";
import { AIDREAM_PRODUCTION_URL, ENDPOINTS } from "@/lib/api/endpoints";
import { OrganizationContextError } from "@/lib/api/organization-context";

const VALIDATION_TIMEOUT_MS = 5_000;
const CONTENT_FIELDS = ["html", "css", "js"] as const;

type CmsContentField = (typeof CONTENT_FIELDS)[number];
type CmsFindingSeverity = "warning" | "block";

export interface CmsValidationFinding {
  rule_id: string;
  node_path: string;
  excerpt: string;
  severity: CmsFindingSeverity;
  fix_hint: string;
  field: CmsContentField;
}

type CmsGuardFinding = Omit<CmsValidationFinding, "field">;

interface CmsFieldValidationReport {
  blocked: boolean;
  violations: CmsGuardFinding[];
  warnings: CmsGuardFinding[];
  excepted: CmsGuardFinding[];
  profile: string;
}

interface CmsValidationResponse {
  allowed: boolean;
  report: Partial<Record<CmsContentField, CmsFieldValidationReport>>;
}

export interface CmsContentValidationResult {
  allowed: boolean;
  skipped: boolean;
  findings: CmsValidationFinding[];
}

export interface ValidateCmsContentInput {
  content: {
    html?: string | null;
    css?: string | null;
    js?: string | null;
  };
  siteId?: string | null;
  pageId?: string | null;
  /**
   * The organization the content belongs to — the CMS site's
   * `organization_id`, resolved by the caller from the row it is about to
   * write. REQUIRED (as an explicit `null` when the site has none) because
   * every identified request to aidream carries `X-Organization-Id`: the
   * fail-closed kernel refuses one that does not, before any networking.
   * Never resolved here — an org is always chosen by the caller, never by a
   * resolver underneath it.
   */
  organizationId: string | null;
  accessToken: string | null;
  baseUrl?: string;
}

function resolveValidationBaseUrl(baseUrl = AIDREAM_PRODUCTION_URL): string {
  return baseUrl.replace(/\/$/, "");
}

function isGuardFinding(value: unknown): value is CmsGuardFinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const finding = value as Record<string, unknown>;
  return (
    typeof finding.rule_id === "string" &&
    typeof finding.node_path === "string" &&
    typeof finding.excerpt === "string" &&
    (finding.severity === "warning" || finding.severity === "block") &&
    typeof finding.fix_hint === "string"
  );
}

function isFieldReport(value: unknown): value is CmsFieldValidationReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  return (
    typeof report.blocked === "boolean" &&
    typeof report.profile === "string" &&
    Array.isArray(report.violations) &&
    report.violations.every(isGuardFinding) &&
    Array.isArray(report.warnings) &&
    report.warnings.every(isGuardFinding) &&
    Array.isArray(report.excepted) &&
    report.excepted.every(isGuardFinding)
  );
}

function isValidationResponse(value: unknown): value is CmsValidationResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  if (
    typeof response.allowed !== "boolean" ||
    !response.report ||
    typeof response.report !== "object" ||
    Array.isArray(response.report)
  ) {
    return false;
  }
  const report = response.report as Record<string, unknown>;
  return CONTENT_FIELDS.every(
    (field) => report[field] === undefined || isFieldReport(report[field]),
  );
}

function skippedValidation(
  reason: string,
  cause?: unknown,
): CmsContentValidationResult {
  console.error(
    `[cms/validation] SKIPPED — ${reason}. CMS write is proceeding unvalidated by availability ruling.`,
    cause,
  );
  return { allowed: true, skipped: true, findings: [] };
}

/**
 * Calls aidream's canonical matrx-content-guard seam before a CMS content write.
 * A blocked report is authoritative. Transport/configuration failures fail open
 * loudly and are marked for the route response via `X-Cms-Validation: skipped`.
 */
export async function validateContent(
  input: ValidateCmsContentInput,
): Promise<CmsContentValidationResult> {
  const content = Object.fromEntries(
    CONTENT_FIELDS.flatMap((field) => {
      const value = input.content[field];
      return value === undefined ? [] : [[field, value]];
    }),
  );
  const hasContent = Object.values(content).some(
    (value) => value !== null && value !== "",
  );
  if (!hasContent) {
    return { allowed: true, skipped: false, findings: [] };
  }

  const validationBaseUrl = resolveValidationBaseUrl(input.baseUrl);
  if (!input.accessToken) {
    return skippedValidation(
      "the authenticated Supabase access token is unavailable",
    );
  }
  if (!input.organizationId) {
    return skippedValidation(
      "this CMS site carries no organization, and an identified call to " +
        "aidream must send X-Organization-Id — give the site an organization " +
        "to have its content guarded",
    );
  }

  try {
    const client = new BackendClient({
      baseUrl: validationBaseUrl,
      auth: { type: "token", token: input.accessToken },
      scope: { organization_id: input.organizationId },
      // aidream's `CmsValidationRequest` is `extra="forbid"`: the organization
      // travels in the header (which is what the admission gate reads) and
      // must NOT be merged into this body.
      sendScopeInBody: false,
    });
    const payload: unknown = await client.postJson(
      ENDPOINTS.cms.validate,
      {
        content,
        site_id: input.siteId ?? null,
        page_id: input.pageId ?? null,
      },
      AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
    );
    if (!isValidationResponse(payload)) {
      return skippedValidation(
        "aidream returned a malformed validation response",
      );
    }

    const findings = CONTENT_FIELDS.flatMap((field) =>
      (payload.report[field]?.violations ?? []).map((finding) => ({
        ...finding,
        field,
      })),
    );
    const reportBlocked = CONTENT_FIELDS.some(
      (field) => payload.report[field]?.blocked === true,
    );
    return {
      allowed: payload.allowed && !reportBlocked,
      skipped: false,
      findings,
    };
  } catch (error) {
    // An organization-context refusal is OUR configuration defect, not
    // aidream being down — it never left this process. Reporting it as
    // "unreachable" is how this guard stayed silently dead: every call threw
    // here and every CMS write proceeded unvalidated while the log blamed the
    // network. Name the real cause, keep the classes apart.
    if (error instanceof OrganizationContextError) {
      return skippedValidation(
        "the CMS content guard was called without a usable organization " +
          "context, so the request never left this server — this is a wiring " +
          "defect in the calling route, not an aidream outage",
        error,
      );
    }
    return skippedValidation("aidream is unreachable or timed out", error);
  }
}

/** The one structured rejection shape for every CMS content writer. */
export function cmsContentBlockedResponse(
  validation: CmsContentValidationResult,
): NextResponse | null {
  if (validation.allowed) return null;
  return NextResponse.json(
    {
      error: {
        code: "cms_content_blocked",
        findings: validation.findings,
      },
    },
    { status: 422 },
  );
}

/** Combine independently validated live/draft buffers without losing a skip. */
export function mergeCmsContentValidationResults(
  results: readonly CmsContentValidationResult[],
): CmsContentValidationResult {
  return {
    allowed: results.every((result) => result.allowed),
    skipped: results.some((result) => result.skipped),
    findings: results.flatMap((result) => result.findings),
  };
}

/** Mark any response produced after a fail-open validation attempt. */
export function withCmsValidationHeader<T extends Response>(
  response: T,
  validation: CmsContentValidationResult,
): T {
  if (validation.skipped) {
    response.headers.set("X-Cms-Validation", "skipped");
  }
  return response;
}
