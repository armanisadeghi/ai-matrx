// features/hr/people/identity/revealSsn.ts
//
// The break-glass read: a stored Social Security number, served ONCE, audited.
// SPEC-EMPLOYEES §1.3 · SPEC-ACCESS §4.5 (as amended: audit action `reveal_field`).
//
// 🚨 THIS IS THE ONE CONFIDENTIAL HR READ THAT IS NOT A `public.hr_*` RPC, and the
// reason is the key. `hr.reveal_ssn` is the GATE and the AUDIT — it checks the
// `ssn.reveal` capability, writes the `hr.access_audit` row with the justification,
// and hands back the last four plus a *decrypt ticket*. It cannot return the value:
// Postgres holds no key material on this platform, and the sealed bytes are opened
// in aidream by the one symmetric primitive the platform has. So the browser calls
// aidream, aidream calls the gate as the caller, and only then decrypts.
//
// 🚨 **NO `X-Idempotency-Key` ON THIS CALL, DELIBERATELY.** Every other mutating HR
// POST carries one. This endpoint is the documented exemption, and adding a key
// "for consistency" would be a security regression, not a tidy-up: a replayable
// record is a CACHE, and what it would cache is a decrypted government identifier.
// A reveal is also not idempotent by nature — the second one is a second act that
// must produce a second audit row, because "how many times was this looked at" is
// the question the audit log exists to answer. If a request is lost in flight the
// correct behaviour is that nothing was revealed and nothing was logged.
//
// 🚨 THE VALUE IS NEVER PERSISTED CLIENT-SIDE. It is returned here, held in React
// state by the one component that asked for it, and dropped when that component
// closes. It is never written to localStorage, never put in a URL, never logged,
// and never placed in a toast — a toast outlives the dialog and can be screenshotted
// by a passer-by.

/** What `POST /api/hr/identity/{employeeId}/ssn/reveal` can honestly come back as. */
export type HrSsnRevealOutcome =
  /** The value, once. Show it transiently and let it go. */
  | { kind: "revealed"; ssn: string; revealedAt: string | null; auditId: string | null }
  /**
   * 400 `hr_ssn_not_stored` — the reveal was AUTHORIZED and the audit row was
   * written; there is simply no number on file. This is a STATE, not an error: it
   * is the honest answer for a contractor who supplied only a W-9, and it must not
   * be rendered as a failure.
   */
  | { kind: "not_stored" }
  /**
   * 403 `hr_capability_denied` — the gate refused, and the refusal is itself
   * audited. Reachable even though the control is hidden without the capability,
   * because a hidden control is not a security boundary; the server is.
   */
  | { kind: "denied"; auditId: string | null }
  /**
   * 400 validation — the justification is shorter than
   * `hr.domain_wide.break_glass_justification_min_chars`. The floor is a knob, so
   * the numbers come from the server and are never hard-coded here.
   */
  | { kind: "justification_too_short"; minChars: number | null; suppliedChars: number | null }
  | { kind: "failed"; message: string };

type BackendFetch = (endpoint: string, options?: RequestInit) => Promise<Response>;

function readErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of ["code", "error", "detail", "error_code"]) {
    const value = record[key];
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      const nested = (value as Record<string, unknown>).code;
      if (typeof nested === "string") return nested;
    }
  }
  return null;
}

/**
 * The `details` bag, when there is one.
 *
 * 🚨 IT IS NOT ALWAYS AN OBJECT. FastAPI's own request-validation errors send
 * `details` as an ARRAY of per-field issues, while the HR service's own errors send
 * a flat object. An array is `typeof "object"`, so this narrows deliberately and
 * returns `{}` for the array shape rather than handing back something whose `.field`
 * is silently `undefined`.
 */
function readDetails(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const record = payload as Record<string, unknown>;
  const details = record.details ?? (record.detail as Record<string, unknown> | undefined)?.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};
  return details as Record<string, unknown>;
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readText(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Reveal one stored SSN.
 *
 * `purpose` is what this reveal is FOR and lands in the audit row; `justification`
 * is the free text the person typed and is audited verbatim. Neither is optional
 * and neither is defaulted here — a constant purpose would make the audit log
 * uniform and therefore useless.
 */
export async function revealHrSsn(args: {
  request: BackendFetch;
  employeeId: string;
  organizationId: string;
  purpose: string;
  justification: string;
}): Promise<HrSsnRevealOutcome> {
  let response: Response;
  try {
    response = await args.request(
      `/api/hr/identity/${args.employeeId}/ssn/reveal`,
      {
        method: "POST",
        // Deliberately NO idempotency key — see the file header for why that is a
        // security property here and not an omission.
        // 🚨 `X-Organization-Id` IS REQUIRED BY THE ROUTER, NOT OPTIONAL POLITENESS.
        // `aidream/api/routers/hr_employees.py` mounts the whole router with
        // `dependencies=[Depends(require_authenticated), Depends(require_organization_context)]`,
        // so every HR endpoint on it 422s without this header — before any of the body's
        // own validation runs, which is why omitting it surfaced as a generic
        // "validation_error" saying nothing about the request itself.
        // The body ALSO carries `organization_id`, and that is not duplication: the
        // service compares the two and answers 409 on a disagreement (§1.2).
        headers: {
          "Content-Type": "application/json",
          "X-Organization-Id": args.organizationId,
        },
        body: JSON.stringify({
          organization_id: args.organizationId,
          purpose: args.purpose,
          justification: args.justification,
        }),
      },
    );
  } catch (error) {
    return {
      kind: "failed",
      message:
        error instanceof Error && error.message.trim()
          ? `The number could not be shown. ${error.message.trim()}`
          : "The number could not be shown and the server did not say why.",
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const code = readErrorCode(payload);
  const details = readDetails(payload);

  if (response.status === 400 && code === "hr_ssn_not_stored") {
    return { kind: "not_stored" };
  }
  if (response.status === 403 && code === "hr_capability_denied") {
    return { kind: "denied", auditId: readText(details, "audit_id") };
  }
  if (response.status === 400 && details.field === "justification") {
    return {
      kind: "justification_too_short",
      minChars: readNumber(details, "min_chars"),
      suppliedChars: readNumber(details, "supplied_chars"),
    };
  }
  if (!response.ok) {
    return {
      kind: "failed",
      message: code
        ? `The number could not be shown (${code}).`
        : "The number could not be shown.",
    };
  }

  const record = (payload ?? {}) as Record<string, unknown>;
  const ssn = readText(record, "ssn");
  if (!ssn) {
    // A 200 with no value is a contract breach, not an empty state — say so rather
    // than rendering a blank where a government identifier belongs.
    return {
      kind: "failed",
      message: "The server allowed this read but returned no number.",
    };
  }
  return {
    kind: "revealed",
    ssn,
    revealedAt: readText(record, "revealed_at"),
    auditId: readText(record, "audit_id"),
  };
}
