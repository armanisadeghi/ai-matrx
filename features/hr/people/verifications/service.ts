// features/hr/people/verifications/service.ts
//
// ROUTE 17's reads, and the ONE call in this whole lane that is NOT a Supabase
// RPC.
//
// 🚨 GENERATION IS AN AIDREAM CALL, NOT AN RPC. `POST
// /api/hr/verification-letters/{letterId}/generate` (operation
// `hr_verification_letters_generate`) assembles the letter from `hr.employment`
// + `hr.position_as_of` + (with consent) `hr.compensation_as_of`, all resolved
// AS OF the letter's stated as-of date, freezes that assertion into `snapshot`,
// and renders a PDF into `files.files`. Rendering bytes is server work; a
// SECURITY DEFINER function cannot do it. This is the CLAUDE.md exception —
// compute goes to Python — not a DB read wearing an HTTP hat.
//
// ⚠️ WHY `useBackendApi().fetch` AND NOT `callApi`. `callApi` is compile-time
// bound to `keyof paths` from `types/python-generated/api-types.ts`, and the HR
// endpoints are not in that generated contract yet (checked 2026-08-26 — there
// is no `/api/hr/*` path in the file). Reaching it through `callApi` today
// would need a cast, and silencing a type error is the opposite of fixing one.
// `useBackendApi().fetch` is the sanctioned door for a not-yet-generated
// endpoint, and it is the ONLY transport here that surfaces the HTTP STATUS —
// which this surface needs, because 403 and 409 are two different STATES, not
// two errors. FOLLOW-UP: regenerate the python types once the endpoint ships,
// then move this to `callApi` and delete this note.

import {
  fetchHrConfidential,
  fetchHrConfidentialList,
} from "@/features/hr/service";
import type { HrAuditedPage, HrAuditedRow, HrResult } from "@/features/hr/types";

import {
  HR_VERIFICATION_ALREADY_DELIVERED,
  HR_VERIFICATION_CONSENT_MISSING,
  type HrVerificationLetterRow,
} from "./types";

export const HR_VERIFICATION_TOKEN = "hr_verification_letter_request";

/**
 * 🚨 `organizationId` IS REQUIRED, AND OMITTING IT DID NOT MEAN "EVERY EMPLOYER" —
 * IT MEANT "WHICHEVER ONE THE VIEWER HAPPENS TO WORK FOR FIRST".
 *
 * `hr._door_list` resolves the employer in three steps, verified live in its body:
 *
 *     v_org := nullif(p_filter ->> 'organization_id','')::uuid;
 *     if v_org is null then
 *       select em.organization_id into v_org
 *         from hr.employment em where em.id = any(hr.employments_of(v_uid)) limit 1;
 *     end if;
 *     if v_org is null then raise …
 *
 * That middle fallback is a `limit 1` with **no ORDER BY**. So a call with no
 * `organization_id` was silently scoped to an arbitrary one of the VIEWER's own
 * employments — not to the employer whose page they are looking at. For an HR
 * admin who is employed by one company and administers another, this queue showed
 * the wrong company's cases or, as observed live on 2026-08-27, none at all:
 * `row_count: 0` with **`granted: true`**, so it did not even look like a refusal.
 * The surface rendered its "nothing here" empty state over a real, existing row.
 *
 * The organization is now always passed explicitly. Both call sites already held
 * it and already guarded on it — they simply never sent it.
 */
export function fetchHrVerificationLetters(args: {
  organizationId: string;
  state?: string | null;
  subjectEmploymentId?: string | null;
  limit?: number;
  cursor?: string | null;
}): Promise<HrResult<HrAuditedPage<HrVerificationLetterRow>>> {
  const filter: Record<string, unknown> = { organization_id: args.organizationId };
  if (args.state) filter.state = args.state;
  // 🚨 THE COLUMN IS `employment_id`. `hr.verification_letter_request` has no
  // `subject_employee_id` — verified live 2026-08-27 from the row's own keys — so
  // filtering by that name narrowed nothing and a per-person view would have shown
  // the whole employer's queue.
  if (args.subjectEmploymentId) filter.employment_id = args.subjectEmploymentId;

  return fetchHrConfidentialList<HrVerificationLetterRow>({
    token: HR_VERIFICATION_TOKEN,
    filter,
    limit: args.limit ?? 100,
    cursor: args.cursor ?? null,
    purpose: "verification_letter_queue",
  });
}

export function fetchHrVerificationLetter(
  letterId: string,
): Promise<HrResult<HrAuditedRow<HrVerificationLetterRow>>> {
  return fetchHrConfidential<HrVerificationLetterRow>({
    token: HR_VERIFICATION_TOKEN,
    id: letterId,
    purpose: "verification_letter",
  });
}

/** What generation can come back as. Two of the four are STATES, not errors. */
export type HrGenerateOutcome =
  | { kind: "generated"; letterFileId: string | null; letterId: string | null }
  /** 403 `hr_verification_consent_missing` — render the awaiting-consent state. */
  | { kind: "awaiting_consent" }
  /**
   * 409 `hr_verification_letter_delivered` — a delivered letter is an assertion
   * the org is held to. Render the create-a-new-request path; never an edit.
   */
  | { kind: "already_delivered" }
  | { kind: "failed"; message: string };

type BackendFetch = (
  endpoint: string,
  options?: RequestInit,
) => Promise<Response>;

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
 * Generate the letter.
 *
 * 🚨 THE CONSENT GATE IS CHECKED HERE **AND** IN THE UI **AND** BY A TABLE
 * CHECK. Three places on purpose (§4.9 validation): a client that forgets, a
 * server that trusts the client, and a database that catches both. Never remove
 * one because "the other two cover it".
 *
 * Pass `post` from `useBackendApi().fetch` — see the file header for why the
 * transport is not `callApi`.
 */
export async function generateHrVerificationLetter(args: {
  request: BackendFetch;
  letterId: string;
  organizationId: string;
  includesCompensation: boolean;
  recipient: string | null;
}): Promise<HrGenerateOutcome> {
  let response: Response;
  try {
    response = await args.request(
      `/api/hr/verification-letters/${args.letterId}/generate`,
      {
        method: "POST",
        // 🚨 `X-Organization-Id` IS REQUIRED BY THE ROUTER, NOT OPTIONAL POLITENESS.
        // `aidream/api/routers/hr_employees.py` mounts the whole router with
        // `dependencies=[Depends(require_authenticated), Depends(require_organization_context)]`,
        // so every HR endpoint on it 422s without this header, before any of the body's
        // own validation runs. This call had the same omission as the SSN reveal and was
        // found by the same live test — it had never been exercised against the server.
        // The body ALSO carries `organization_id`, and that is not duplication: the
        // service compares the two and answers 409 on a disagreement (§1.2).
        headers: {
          "Content-Type": "application/json",
          "X-Organization-Id": args.organizationId,
        },
        body: JSON.stringify({
          organization_id: args.organizationId,
          includes_compensation: args.includesCompensation,
          recipient: args.recipient,
        }),
      },
    );
  } catch (error) {
    return {
      kind: "failed",
      message:
        error instanceof Error && error.message.trim()
          ? `The letter could not be generated. ${error.message.trim()}`
          : "The letter could not be generated and the server did not say why.",
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 403 && readErrorCode(payload) === HR_VERIFICATION_CONSENT_MISSING) {
    // NOT an error toast. This is the awaiting-consent state.
    return { kind: "awaiting_consent" };
  }

  if (
    response.status === 409 &&
    readErrorCode(payload) === HR_VERIFICATION_ALREADY_DELIVERED
  ) {
    return { kind: "already_delivered" };
  }

  if (!response.ok) {
    const code = readErrorCode(payload);
    return {
      kind: "failed",
      message: code
        ? `The letter could not be generated (${code}).`
        : "The letter could not be generated.",
    };
  }

  const record = (payload ?? {}) as Record<string, unknown>;
  return {
    kind: "generated",
    letterFileId:
      typeof record.letter_file_id === "string" ? record.letter_file_id : null,
    letterId: typeof record.id === "string" ? record.id : args.letterId,
  };
}
