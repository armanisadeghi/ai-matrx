import { NextResponse } from "next/server";
import { createAuthenticatedClient } from "@/lib/api/backend-client";
import { BACKEND_URLS, ENDPOINTS } from "@/lib/api/endpoints";

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
  accessToken: string | null;
}

function resolveValidationBaseUrl(): string | null {
  const baseUrl =
    process.env.AIDREAM_API_URL ??
    BACKEND_URLS.production ??
    process.env.NEXT_PUBLIC_BACKEND_URL;
  return baseUrl ? baseUrl.replace(/\/$/, "") : null;
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

  const validationBaseUrl = resolveValidationBaseUrl();
  if (!validationBaseUrl) {
    return skippedValidation(
      "aidream URL is not configured (AIDREAM_API_URL / NEXT_PUBLIC_BACKEND_URL_PROD)",
    );
  }
  if (!input.accessToken) {
    return skippedValidation(
      "the authenticated Supabase access token is unavailable",
    );
  }

  try {
    const client = createAuthenticatedClient(
      input.accessToken,
      validationBaseUrl,
    );
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
