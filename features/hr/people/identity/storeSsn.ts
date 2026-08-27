// features/hr/people/identity/storeSsn.ts
//
// SSN intake — the write half of E-39 (SPEC-EMPLOYEES §2.3, SPEC-ACCESS §4.5).
//
// 🚨 THE RAW VALUE CROSSES THE WIRE EXACTLY ONCE AND IS NEVER HELD. It goes from the
// input straight into one request body and is cleared the moment the request
// settles — success or failure. It is never put in a URL, never in localStorage,
// never echoed back into the field, and never logged. Postgres never sees it either:
// `public.hr_ssn_store` takes the ALREADY-SEALED columns, because the key is
// aidream's and the database does not hold it.
//
// 🚨 THE ACKNOWLEDGEMENT CARRIES LAST FOUR ONLY. That is deliberate on the server's
// side and load-bearing on ours: it lets the panel switch to the last-4 + reveal
// door with no refetch, and there is no code path in this file that could render the
// submitted value back to the person who typed it.
//
// 🚨 TWO ENDPOINTS, NOT ONE, AND THEY ARE NOT VARIATIONS OF EACH OTHER.
//   • `POST /hr/identity/{employeeId}/ssn` seals and stores against a person.
//   • `POST /hr/identity/ssn/fingerprint` hashes a CANDIDATE and stores nothing.
// The duplicate scan runs at hire time, before any `hr.employee` row exists, so
// seal-and-store cannot serve it. That is why `hr_duplicate_scan` reported its
// `ssn_hmac` leg as `skipped` on every hire until the fingerprint call existed.

/** `POST /hr/identity/{employeeId}/ssn` — what the intake can honestly answer. */
export type HrSsnStoreOutcome =
  /**
   * Sealed. `created` distinguishes a first collection from a correction; a
   * correction replaces all four sealed columns and earns its own audit row, so
   * `auditId` differs on every submit even when nothing else does.
   */
  | { kind: "stored"; last4: string; created: boolean; auditId: string | null }
  /** 400 — not nine digits. The server describes the requirement and quotes nothing. */
  | { kind: "invalid_format"; message: string }
  /** 403 — no `identity.write` over this person, and the caller is not the subject. */
  | { kind: "denied"; message: string }
  | { kind: "failed"; message: string };

/** `POST /hr/identity/ssn/fingerprint` — the pre-hire probe. */
export type HrSsnFingerprintOutcome =
  | { kind: "fingerprinted"; ssnHmacHex: string }
  | { kind: "invalid_format"; message: string }
  | { kind: "denied"; message: string }
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

function readUserMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const value = (payload as Record<string, unknown>).user_message;
  return typeof value === "string" && value.trim() ? value : fallback;
}

function readText(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * The headers every call on this router needs.
 *
 * 🚨 `X-Organization-Id` IS REQUIRED BY THE ROUTER. `hr_employees.py` mounts the whole
 * router with `Depends(require_organization_context)`, so a call without it 422s
 * before its own body is validated — a refusal that says nothing about the request.
 * The body ALSO carries `organization_id` and that is not duplication: the service
 * compares the two and answers 409 on a disagreement (§1.2).
 */
function headersFor(organizationId: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Organization-Id": organizationId,
  };
}

/**
 * Seal and store one person's SSN.
 *
 * 🚨 NO `X-Idempotency-Key`, ON THE SAME REASONING AS THE REVEAL. A replayable
 * record is a cache, and this request body is a plaintext government identifier —
 * the one thing that must never be parked anywhere. Re-submitting is also
 * meaningfully a SECOND act: the server replaces the sealed columns and writes a
 * fresh audit row, and collapsing two corrections into one would erase the fact that
 * somebody changed it twice.
 */
export async function storeHrSsn(args: {
  request: BackendFetch;
  employeeId: string;
  organizationId: string;
  ssn: string;
}): Promise<HrSsnStoreOutcome> {
  let response: Response;
  try {
    response = await args.request(`/api/hr/identity/${args.employeeId}/ssn`, {
      method: "POST",
      headers: headersFor(args.organizationId),
      body: JSON.stringify({
        organization_id: args.organizationId,
        ssn: args.ssn,
      }),
    });
  } catch (error) {
    return {
      kind: "failed",
      message:
        error instanceof Error && error.message.trim()
          ? `The number could not be saved. ${error.message.trim()}`
          : "The number could not be saved and the server did not say why.",
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 403) {
    return {
      kind: "denied",
      message: readUserMessage(
        payload,
        "You do not have permission to record this person's Social Security number.",
      ),
    };
  }
  if (response.status === 400 || response.status === 422) {
    return {
      kind: "invalid_format",
      message: readUserMessage(
        payload,
        "A Social Security number is nine digits, like 123-45-6789.",
      ),
    };
  }
  if (!response.ok) {
    const code = readErrorCode(payload);
    return {
      kind: "failed",
      message: code
        ? `The number could not be saved (${code}).`
        : "The number could not be saved.",
    };
  }

  const record = (payload ?? {}) as Record<string, unknown>;
  const last4 = readText(record, "ssn_last4");
  if (!last4) {
    // A 200 with no hint is a contract breach, not an empty state. Say so rather
    // than switching the panel to a last-4 display with nothing to display.
    return {
      kind: "failed",
      message: "The server saved the number but returned no last four digits.",
    };
  }
  return {
    kind: "stored",
    last4,
    created: record.created === true,
    auditId: readText(record, "audit_id"),
  };
}

/**
 * Fingerprint a candidate's SSN for the pre-hire duplicate scan. Stores nothing.
 *
 * The returned hex goes **verbatim** into `hr_duplicate_scan`'s
 * `p_probe.ssn_hmac_hex`; the door does `decode(…, 'hex')` and compares the bytes to
 * `hr.employee_private.ssn_hmac`. The same derivation writes that column, so the two
 * are one fact in two shapes — which is exactly why the client must not transform,
 * re-case or re-encode what comes back.
 */
export async function fingerprintHrSsn(args: {
  request: BackendFetch;
  organizationId: string;
  ssn: string;
}): Promise<HrSsnFingerprintOutcome> {
  let response: Response;
  try {
    response = await args.request("/api/hr/identity/ssn/fingerprint", {
      method: "POST",
      headers: headersFor(args.organizationId),
      body: JSON.stringify({
        organization_id: args.organizationId,
        ssn: args.ssn,
      }),
    });
  } catch (error) {
    return {
      kind: "failed",
      message:
        error instanceof Error && error.message.trim()
          ? `The duplicate check could not run. ${error.message.trim()}`
          : "The duplicate check could not run and the server did not say why.",
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 403) {
    return {
      kind: "denied",
      message: readUserMessage(payload, "You do not have permission to run this check."),
    };
  }
  if (response.status === 400 || response.status === 422) {
    return {
      kind: "invalid_format",
      message: readUserMessage(
        payload,
        "A Social Security number is nine digits, like 123-45-6789.",
      ),
    };
  }
  if (!response.ok) {
    return { kind: "failed", message: "The duplicate check could not run." };
  }

  const hex = readText((payload ?? {}) as Record<string, unknown>, "ssn_hmac_hex");
  if (!hex) {
    return { kind: "failed", message: "The duplicate check returned no fingerprint." };
  }
  return { kind: "fingerprinted", ssnHmacHex: hex };
}
