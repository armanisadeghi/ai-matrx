// features/hr/service.ts
//
// EVERY HR READ AND WRITE THE BROWSER MAKES. One typed function per shipped RPC.
//
// 🚨 THE `hr` SCHEMA IS NOT EXPOSED TO PostgREST (verified live 2026-08-26 —
// `authenticator`'s `pgrst.db_schemas` carries neither `hr` nor `esign`). So
// Direct browser reads against either an `hr.*` relation or the `hr` schema do not
// work and never will. Every door is a `public.hr_*` SECURITY DEFINER function
// called as `supabase.rpc(...)`. This is still the DIRECT lane — React → Supabase,
// no Next.js API route, no Python hop (CLAUDE.md § Data flow).
//
// 🚨 A REFUSAL IS DATA, NOT AN EXCEPTION. Nothing in this file throws when the
// server says no. Callers get `HrResult<T>` and render the refusal in place, because
// SPEC-EMPLOYEES §2's no-access state is "the persona's nearest legitimate surface
// with one sentence", never a permission wall and never a leak that the record
// exists. The shipped doors speak two refusal dialects and `callHr` flattens both:
//
//   • ENVELOPE — `hr_employee_profile`, `hr_employment_history`, `hr_pending_changes`
//     return `{granted:false, reason:'not_reachable'}` with NO error.
//   • RAISED — `hr_my_context`, `hr_directory_list`, `hr_org_chart`,
//     `hr_structure_list`, `hr_knob_index` `raise … errcode '42501'` when the caller
//     has no standing. supabase-js reports that as `error`, not as data.
//
// Anything else that comes back as an error is a genuine failure and becomes
// `{kind:"failed"}` with a sentence, never a bare Postgres code (§2 error state).

import { supabase } from "@/utils/supabase/client";
import { readAllRows } from "@/lib/supabase/readAllRows";
import {
  HR_SEPARATION_REASON_DIMENSION,
  type HrSeparationReasonCategory,
} from "./people/directory/offboarding/types";

import type {
  HrActivationSeedAck,
  HrAuditedPage,
  HrAuditedRow,
  HrDenied,
  HrDirectoryFilter,
  HrDirectoryPage,
  HrEmployeeInviteAcceptAck,
  HrEmployeeInviteAck,
  HrEmployeeProfile,
  HrEmploymentHistory,
  HrKnobIndex,
  HrLawAppliesAck,
  HrLawCitation,
  HrLawOptOut,
  HrLawPortal,
  HrLawRuleClass,
  HrLawRuleStatus,
  HrLawValidation,
  HrLawValidationFinding,
  HrMyContext,
  HrOrgConfigurability,
  HrOrgLawRule,
  HrOrgLawRuleDraft,
  HrOrgLawRuleSaveAck,
  HrOrgChart,
  HrPayGroupAssignmentAck,
  HrPendingChanges,
  HrPlatformLawRule,
  HrRefusalEnvelope,
  HrResult,
  HrStructure,
  HrWriteAck,
} from "./types";
import type { HrDirectorySort } from "./constants";

// ── The one transport ───────────────────────────────────────────────────────

/** Postgres `insufficient_privilege`. The raised dialect's refusal code. */
const PG_INSUFFICIENT_PRIVILEGE = "42501";

/**
 * 🚨 A CONSTRAINT VIOLATION IS BREAKAGE, AND THE USER MUST NOT READ SQL ABOUT IT.
 *
 * These are the integrity classes: the database refusing a row the FORM should have
 * refused at the keyboard. When one arrives, the honest thing to say is that this
 * surface let something through that it should have caught — not
 * `null value in column "job_title_id" of relation "position_assignment" violates
 * not-null constraint`, which is what a person hiring their first employee actually
 * saw (round 22).
 *
 * The raw text is not discarded; it goes to the console and the error capture, where
 * whoever has to fix the missing validation will look. §4.1: a refusal renders in
 * words. A CRASH renders in words too — different words, and never the DB's.
 */
const PG_INTEGRITY_CLASSES: Record<string, string> = {
  "23502": "a required field was left empty",
  "23503": "something it points at does not exist",
  "23505": "a record like this already exists",
  "23514": "a value outside what this field allows",
  "22P02": "a value in the wrong format",
};

/**
 * HR is authenticated-only. The server-rendered Redux identity can briefly be
 * newer than the browser's Supabase session (most often after a session expires
 * in another tab), so it is not sufficient proof that an RPC will carry a JWT.
 * Validate the browser session before the ONE context door opens; every other HR
 * read depends on that context and therefore cannot race ahead as `anon`.
 */
export async function validateHrBrowserSession(): Promise<HrResult<true>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return denied("no_authenticated_session", "Sign in again to open HR.");
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error?.name === "AuthSessionMissingError" || !user) {
    return denied("no_authenticated_session", "Sign in again to open HR.");
  }

  if (error) {
    return failed("Your HR session could not be validated.", error.name);
  }

  return { ok: true, data: true };
}

function denied(
  reason: string,
  detail?: string | null,
  auditId?: string | null,
  field?: string | null,
  door?: string | null,
  payload?: Record<string, unknown> | null,
): HrResult<never> {
  return {
    ok: false,
    kind: "denied",
    reason,
    detail: detail ?? null,
    auditId: auditId ?? null,
    // A write refusal names the offending control and, where one exists, where to go and fix it
    // (`location_without_jurisdiction` carries `/hr/settings/structure`). Dropping these here is
    // how "some fields could not be saved" gets rendered instead of the field.
    field: field ?? null,
    door: door ?? null,
    // Whole, because `rehire_required` carries `existing` and that IS §4.6's panel.
    payload: payload ?? {},
  };
}

function failed(
  message: string,
  code?: string | null,
  technical?: string | null,
): HrResult<never> {
  return {
    ok: false,
    kind: "failed",
    message,
    code: code ?? null,
    technical: technical?.trim() || null,
  };
}

/**
 * 🚨 THERE ARE **TWO** REFUSAL DIALECTS, AND ONLY CHECKING ONE OF THEM READS EVERY WRITE
 * REFUSAL AS A SUCCESS.
 *
 * The `public.hr_*` doors refuse in two shapes, deliberately:
 *
 * - **READ doors** answer `{ granted: false, reason, detail, audit_id }`. `granted` is the
 *   access verdict, and a read that was refused has no row to return.
 * - **WRITE doors** answer `{ ok: false, reason, detail, field?, door?, audit_id }` — the
 *   refusal-envelope law core C3 established: Postgres has no autonomous transactions, so a
 *   door that wrote its audit row and then RAISED would roll the audit back with the
 *   exception. Refusal is DATA; only breakage is an exception.
 *
 * This helper originally tested `granted === false` only. Against a write refusal —
 * `{ ok: false, reason: "location_without_jurisdiction" }` — that test is false, the payload
 * falls through as a success, and `callHr` returns `{ ok: true, data: { ok: false, … } }`.
 * A call site that checks its own `result.ok` then tells an HR admin that somebody was hired
 * when **nothing was written**. That is the worst failure this file can produce, and it is
 * silent.
 *
 * Both dialects are refusals. `ok === false` is checked FIRST because a write envelope also
 * carries `field` and `door`, which the caller needs in order to say which control was wrong
 * and where to go and fix it.
 */
function isRefusalEnvelope(value: unknown): value is HrRefusalEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { granted?: unknown; ok?: unknown };
  return v.ok === false || v.granted === false;
}

/**
 * Call one `public.hr_*` door and normalize both refusal dialects.
 *
 * `envelope: true` strips the `granted` flag off the success payload so callers
 * hold a clean shape; `envelope: false` (the raised dialect) passes the object
 * through as-is.
 *
 * The transport. Returns the door's payload as what it provably is — a non-null,
 * non-array object — and **asserts nothing about its fields**.
 *
 * 🚨 THIS FUNCTION USED TO END IN `return payload as T`, AND THAT CAST WAS THE BUG
 * FACTORY. The generated `Function` types cover the ARGUMENTS; every HR return is
 * `Json`, opaque to `supabase gen types`. So the old signature invited each wrapper
 * to name a hand-written type that TypeScript would then take on faith. A cast
 * cannot fail. Where a hand-written type disagreed with the shipped door, the
 * fields simply arrived `undefined` and the surface rendered a blank, a NaN, or a
 * zero — at runtime, only once real data existed, and only for whoever happened to
 * open that page. `HrAuditedPage` is the worked example: it declared `total`,
 * `limit` and `offset`, the doors send `row_count` and `next_cursor`, and the
 * Employee Relations queue read `pageData.total ?? rows.length` for weeks.
 *
 * Callers now take this `Record<string, unknown>` and MAP it field by field, so the
 * type each one declares is a statement about the wire that is actually true.
 */
async function callHrRaw(
  fn: string,
  args: Record<string, unknown>,
  options: { envelope: boolean; whatFailed: string; write?: boolean },
): Promise<HrResult<Record<string, unknown>>> {
  /*
    🚨 THE TRANSPORT NEVER THROWS. IT RETURNS.
    `supabase.rpc` normally resolves with `{data, error}`, but it REJECTS on a
    network failure, an aborted request, or a response it cannot parse. A
    rejection here escapes every caller's `await`, so the `setSaving(false)` and
    the "did it work?" branch below it never run: the spinner sticks, the surface
    is left mid-write, and NOTHING is rendered to the person — the failure is
    silent by construction. Every other refusal on this path is data; a thrown
    one must be too, or it is the only failure mode the UI cannot show.
  */
  let data: unknown = null;
  let error: { code?: string; message?: string } | null = null;
  try {
    ({ data, error } = (await supabase.rpc(fn as never, args as never)) as {
      data: unknown;
      error: { code?: string; message?: string } | null;
    });
  } catch (thrown) {
    // Human sentence; the driver's own words ("TypeError: Failed to fetch")
    // go to `technical`, not onto the end of it.
    return failed(
      `${options.whatFailed} did not reach the server.`,
      null,
      thrown instanceof Error ? thrown.message : String(thrown),
    );
  }

  if (error) {
    if (error.code === PG_INSUFFICIENT_PRIVILEGE) {
      // The raised dialect's "no standing in this employer". Not an error state —
      // the surface renders the picker or the nearest legitimate place.
      return denied("no_standing", error.message ?? null);
    }
    const integrity = error.code ? PG_INTEGRITY_CLASSES[error.code] : undefined;
    if (integrity) {
      // Findable by whoever must add the missing validation; invisible to the person
      // who merely tried to do their job.
      console.error(
        `[hr] ${fn} rejected by a database constraint (${error.code}) — the surface should have caught this first:`,
        error.message,
      );

      /*
        🚨 A READ IS NOT A SAVE, AND THIS BRANCH USED TO CALL EVERY ONE OF THEM ONE.
        Opening `/hr/people/not-a-uuid/personal` — a READ, from a URL, with no form
        on the screen and nothing to write — announced itself as "This employee
        record could not be SAVED because of a value in the wrong format. This
        screen should have caught that before asking the server, so it is a defect
        in the form… nothing was changed." Every clause of that is false on a read:
        there was no form, no save, and "nothing was changed" implies something
        might have been. It also told somebody their data had been rejected when
        what was actually wrong was the address they typed.

        The write sentence below is correct and stays: a constraint the FORM should
        have caught is a defect in the form, and saying so is how it gets fixed.
      */
      if (options.write) {
        return failed(
          `${options.whatFailed} could not be saved because of ${integrity}. ` +
            "This screen should have caught that before asking the server, so it is a " +
            "defect in the form rather than something you did — the details are in the log.",
          error.code ?? null,
        );
      }

      /*
        On a READ, `22P02` has exactly one cause worth a sentence: the identifier in
        the URL is not a real record id. Say THAT, in the words a person can act on
        ("check the link"), instead of describing a value they never typed into a
        field they never saw.
      */
      if (error.code === "22P02") {
        return failed(
          `${options.whatFailed} could not be opened, because the address it was ` +
            "asked for is not a valid record id. Check the link you followed — " +
            "nothing here has been changed or lost.",
          error.code ?? null,
        );
      }

      return failed(
        `${options.whatFailed} could not be loaded because of ${integrity}. ` +
          "That is a defect in what this screen asked for rather than something you " +
          "did — the details are in the log.",
        error.code ?? null,
      );
    }

    /*
      🚨 A WRITE IS NOT "LOADED". This branch served both lanes and phrased every
      failure as a read, so a broken save announced itself as "Saving your change
      could not be loaded" — a sentence that tells somebody their write failed
      while describing it as a fetch. The verb comes from the caller's lane now.
    */
    return failed(
      `${options.whatFailed} ${options.write ? "did not go through" : "could not be loaded"}.`,
      error.code ?? null,
      error.message ?? null,
    );
  }

  const payload: unknown = data;

  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return failed(
      `${options.whatFailed} came back in a shape this app does not understand. ` +
        "Retry, and if it keeps happening the HR data door needs a look.",
      null,
    );
  }

  if (isRefusalEnvelope(payload)) {
    return denied(
      payload.reason,
      payload.detail,
      payload.audit_id,
      payload.field,
      payload.door,
      payload as unknown as Record<string, unknown>,
    );
  }

  if (options.envelope) {
    const { granted: _granted, ...rest } = payload as Record<
      string,
      unknown
    > & {
      granted?: boolean;
    };
    return { ok: true, data: rest };
  }
  return { ok: true, data: payload as Record<string, unknown> };
}

/**
 * The verified-aligned lane.
 *
 * 🚨 THIS IS STILL A CAST, AND IT IS ONLY LEGITIMATE WHERE THE HEADER ABOVE THE
 * CALL SITE RECORDS THAT THE TYPE WAS DIFFED AGAINST THE LIVE DOOR. Every use
 * below carries a `verified aligned <date>` note naming what was compared. Do not
 * reach for this for a new door: map it, and earn the annotation by checking.
 *
 * The diff that justified these was mechanical, not a reading — each door was
 * called against the sandbox employer with real rows and its top-level keys were
 * set-compared with the declared type's fields, in both directions.
 */
async function callHrAligned<T>(
  fn: string,
  args: Record<string, unknown>,
  options: { envelope: boolean; whatFailed: string },
): Promise<HrResult<T>> {
  const result = await callHrRaw(fn, args, options);
  return result.ok ? { ok: true, data: result.data as T } : result;
}

/**
 * Every write door's acknowledgement.
 *
 * `HrWriteAck` is `Record<string, unknown> & { ok?: true }` — deliberately an open
 * bag, because the ~28 writers each answer with their own fields and the surfaces
 * read them by name at the point of use. That makes it the one shape here that a
 * field-by-field mapper cannot improve: there is no field list to map to.
 *
 * So this does the only two things that are actually checkable — it confirms the
 * envelope's `ok` really is `true` rather than assuming it, and it hands back a
 * plain object. **Nothing is cast off the wire.**
 *
 * A body that comes back `ok: false` should already have been turned into a
 * refusal by `isRefusalEnvelope` upstream; if one ever slips past — a writer that
 * says `ok: false` with no `reason` — it is caught here rather than being reported
 * to the user as a success.
 */
function mapWriteAck(
  result: HrResult<Record<string, unknown>>,
  whatFailed: string,
): HrResult<HrWriteAck> {
  if (!result.ok) return result;
  const row = result.data;
  if ("ok" in row && row.ok !== true) {
    return failed(
      `${whatFailed} did not go through, and the server did not say why. ` +
        "Nothing was changed. Retry, and if it keeps happening the HR write door needs a look.",
      null,
    );
  }
  return { ok: true, data: { ...row } as HrWriteAck };
}

/** A write door: the transport, then the `ok` check. Never a cast. */
async function callHrWrite(
  fn: string,
  args: Record<string, unknown>,
  options: { envelope: boolean; whatFailed: string },
): Promise<HrResult<HrWriteAck>> {
  // The write lane, named as such, so a failure is phrased as a failed SAVE.
  return mapWriteAck(
    await callHrRaw(fn, args, { ...options, write: true }),
    options.whatFailed,
  );
}

// ── Read doors — LIVE ───────────────────────────────────────────────────────

/**
 * Which employers this person can do HR in, and the resolved active one.
 *
 * `p_organization_id` is a **uuid only** — the server does not resolve slugs. When
 * the caller holds a slug, `useHrContext` maps it through `employers[].slug` and
 * calls again. Passing null returns every employer plus, when there is exactly one,
 * that one as `active` — which is SPEC-UI-IA §1 rule 3 implemented server-side.
 *
 * An owner/admin sees an org whose module is OFF, because they are the one person
 * who can turn it on.
 */
export function fetchHrContext(
  organizationId?: string | null,
): Promise<HrResult<HrMyContext>> {
  // verified aligned 2026-08-27 — the door was called live against the sandbox
  // employer with real rows and its top-level keys were SET-COMPARED with the
  // declared type in both directions (declared-but-absent, present-but-undeclared).
  // Wire: {active, as_of, employers}. Exact match.
  // Nested `active` also carries `employer_profile_id`, which `HrActiveEmployer` does
  // not declare — present-but-undeclared, so unreadable rather than wrong.
  return callHrAligned<HrMyContext>(
    "hr_my_context",
    { p_organization_id: organizationId ?? null },
    { envelope: false, whatFailed: "Your HR employers" },
  );
}

/**
 * Route 10's one query. The scan is counted and paged from the same CTE, so `total`
 * is the size of the FULL result set — never "showing the first 100" (LAW 3).
 */
export function fetchHrDirectory(args: {
  organizationId: string;
  filter?: HrDirectoryFilter;
  limit?: number;
  offset?: number;
  sort?: HrDirectorySort;
  direction?: "asc" | "desc";
}): Promise<HrResult<HrDirectoryPage>> {
  // verified aligned 2026-08-27 — the door was called live against the sandbox
  // employer with real rows and its top-level keys were SET-COMPARED with the
  // declared type in both directions (declared-but-absent, present-but-undeclared).
  // Wire: {as_of, capabilities, columns, limit, offset, persona, rows, total}. Exact
  // match, and `HrDirectoryRow` matched its 23 row keys in both directions.
  // NOTE this door IS offset-paged — unlike the audited list doors, whose fifth
  // argument is `p_cursor`. `p_offset` is correct here and only here.
  return callHrAligned<HrDirectoryPage>(
    "hr_directory_list",
    {
      p_organization_id: args.organizationId,
      p_filter: args.filter ?? {},
      p_limit: args.limit ?? 50,
      p_offset: args.offset ?? 0,
      p_sort: args.sort ?? "display_name",
      p_direction: args.direction ?? "asc",
    },
    { envelope: false, whatFailed: "The employee directory" },
  );
}

/**
 * Route 11. `on` is the as-of date — effective dating is what makes history real.
 * `history_available: false` means the as-of control is ABSENT, not disabled.
 */
export function fetchHrOrgChart(args: {
  organizationId: string;
  on?: string | null;
}): Promise<HrResult<HrOrgChart>> {
  // verified aligned 2026-08-27 — the door was called live against the sandbox
  // employer with real rows and its top-level keys were SET-COMPARED with the
  // declared type in both directions (declared-but-absent, present-but-undeclared).
  // Wire: {as_of, cycles, dotted_lines, earliest_known_on, history_available, nodes,
  // persona, requested_on, unplaced}. Exact match; `HrOrgChartNode` matched too.
  return callHrAligned<HrOrgChart>(
    "hr_org_chart",
    { p_organization_id: args.organizationId, p_on: args.on ?? null },
    { envelope: false, whatFailed: "The org chart" },
  );
}

/**
 * Routes 13/14 and route 2. Returns `{granted:false, reason:'not_reachable'}` for a
 * record the viewer has no lane to — **which never distinguishes "does not exist"
 * from "you may not see it"**. Do not add a client-side check that recovers the
 * difference; that is the leak the envelope exists to prevent.
 */
export function fetchHrEmployeeProfile(args: {
  employeeId: string;
  asOf?: string | null;
}): Promise<HrResult<HrEmployeeProfile>> {
  // verified aligned 2026-08-27 — the door was called live against the sandbox
  // employer with real rows and its top-level keys were SET-COMPARED with the
  // declared type in both directions (declared-but-absent, present-but-undeclared).
  // Wire: {as_of, capabilities, comp_visibility, granted, header, organization_id,
  // personal, tabs, viewer, worker_class_machinery}; `granted` is stripped by the
  // envelope. `HrProfileHeader` matched its 24 keys in both directions.
  // `personal.private_state` is correctly OPTIONAL: the door emits it only when there
  // is no `hr.employee_private` row ('not_collected'), so its absence is meaningful
  // and a required declaration would have been the lie.
  return callHrAligned<HrEmployeeProfile>(
    "hr_employee_profile",
    { p_employee_id: args.employeeId, p_as_of: args.asOf ?? null },
    { envelope: true, whatFailed: "This employee record" },
  );
}

/** The Job tab's spells, assignments, reporting lines, external ids and engagements. */
export function fetchHrEmploymentHistory(
  employeeId: string,
): Promise<HrResult<HrEmploymentHistory>> {
  // verified aligned 2026-08-27 — the door was called live against the sandbox
  // employer with real rows and its top-level keys were SET-COMPARED with the
  // declared type in both directions (declared-but-absent, present-but-undeclared).
  // Wire: {assignments, engagements, external_identities, reporting_lines, spells}
  // plus `granted`, which the envelope strips. Exact match.
  return callHrAligned<HrEmploymentHistory>(
    "hr_employment_history",
    { p_employee_id: employeeId },
    { envelope: true, whatFailed: "This person's employment history" },
  );
}

/** §6.2 — every future-dated row for one employment, plus what is still in flight. */
export function fetchHrPendingChanges(
  employmentId: string,
): Promise<HrResult<HrPendingChanges>> {
  // verified aligned 2026-08-27 — the door was called live against the sandbox
  // employer with real rows and its top-level keys were SET-COMPARED with the
  // declared type in both directions (declared-but-absent, present-but-undeclared).
  // Wire: {compensation, in_flight, positions, reporting_lines} plus `granted`, which
  // the envelope strips. Exact match. A subject with no live employment answers the
  // read dialect's {granted:false, reason} and becomes a refusal, not an empty panel.
  return callHrAligned<HrPendingChanges>(
    "hr_pending_changes",
    { p_employment_id: employmentId },
    { envelope: true, whatFailed: "Pending changes" },
  );
}

/** Route 69's three tables, plus everything the other settings routes reference. */
export function fetchHrStructure(
  organizationId: string,
): Promise<HrResult<HrStructure>> {
  // verified aligned 2026-08-27 — the door was called live against the sandbox
  // employer with real rows and its top-level keys were SET-COMPARED with the
  // declared type in both directions (declared-but-absent, present-but-undeclared).
  // Wire carries `employer_profile_id` and `tax_registrations`, which this type did NOT
  // declare until today — see `HrStructure`. Everything else matched.
  return callHrAligned<HrStructure>(
    "hr_structure_list",
    { p_organization_id: organizationId },
    {
      envelope: false,
      whatFailed: "This employer's departments, locations and job titles",
    },
  );
}

/**
 * Route 67. Every configuration key with its effective value AND its origin.
 * A key whose `origin` is `missing` is rendered as a hard error naming the key —
 * a silent fallback is how a knob becomes a constant.
 */
export function fetchHrKnobs(args: {
  organizationId: string;
  overriddenOnly?: boolean;
}): Promise<HrResult<HrKnobIndex>> {
  // verified aligned 2026-08-27 — the door was called live against the sandbox
  // employer with real rows and its top-level keys were SET-COMPARED with the
  // declared type in both directions (declared-but-absent, present-but-undeclared).
  // Wire: {keys, organization_id}. Exact match, and every one of the 21 key fields
  // matched the declared shape.
  return callHrAligned<HrKnobIndex>(
    "hr_knob_index",
    {
      p_organization_id: args.organizationId,
      p_overridden_only: args.overriddenOnly ?? false,
    },
    { envelope: false, whatFailed: "This employer's HR settings" },
  );
}

// ── The audited doors: mapped, because their declared shapes were fiction ────

/**
 * 🚨 MAPPED, NOT CAST — AND THE MAPPING IS WHY THE PAGER STOPS LYING.
 *
 * Diffed against the live doors on 2026-08-27 (`hr_confidential_list` with
 * `hr_employer_profile`, `hr_restricted_list` with `hr_incident`, both against the
 * sandbox employer). The envelope is:
 *
 *     { granted, rows, row_count, next_cursor, audit_id }
 *
 * `HrAuditedPage` declared `total`, `limit`, `offset` and `capabilities`. **Not one
 * of those exists on the wire.** Because the old transport cast the payload,
 * `page.total` was `undefined` everywhere and the Employee Relations sweep fell
 * back to `pageData.total ?? rows.length`.
 *
 * 🚨 `row_count` IS THIS PAGE'S SIZE, NOT THE RESULT SET'S. The doors do not
 * compute a grand total, so nothing here manufactures one — a fabricated count on
 * an audited queue is precisely the kind of confident wrong number this sweep
 * exists to kill. A surface that needs "N results" sweeps to exhaustion and counts
 * what it actually received.
 */
function mapAuditedPage<T>(raw: Record<string, unknown>): HrAuditedPage<T> {
  const rows = Array.isArray(raw.rows) ? (raw.rows as T[]) : [];
  return {
    rows,
    // Read from the wire, but never allowed to disagree with what we actually hold:
    // a count that exceeds the rows in hand would be a claim we cannot support.
    rowCount: typeof raw.row_count === "number" ? raw.row_count : rows.length,
    // `null` is the end-of-list signal. An empty string is not a cursor.
    nextCursor:
      typeof raw.next_cursor === "string" && raw.next_cursor
        ? raw.next_cursor
        : null,
    auditId: typeof raw.audit_id === "string" ? raw.audit_id : null,
  };
}

/**
 * The single-row audited doors. Verified live 2026-08-27:
 * `{ granted, row, basis, is_self_access, audit_id }`.
 *
 * `basis` and `is_self_access` were undeclared and therefore unreadable. The second
 * one is not cosmetic: a person opening their OWN confidential record is a
 * different audit event from a colleague opening it, and a surface that cannot tell
 * them apart cannot word the access log honestly.
 */
function mapAuditedRow<T>(raw: Record<string, unknown>): HrAuditedRow<T> {
  return {
    row: (raw.row ?? {}) as T,
    basis: typeof raw.basis === "string" ? raw.basis : null,
    isSelfAccess: raw.is_self_access === true,
    auditId: typeof raw.audit_id === "string" ? raw.audit_id : null,
  };
}

// ── Audited confidential / restricted doors — LIVE ──────────────────────────

/**
 * One Confidential-tier row through the audited door. `purpose` is recorded; a read
 * without a real purpose is an audit finding, so callers pass what they are doing
 * ("profile", "verification_letter"), never a constant.
 */
export async function fetchHrConfidential<T = Record<string, unknown>>(args: {
  token: string;
  id: string;
  purpose: string;
}): Promise<HrResult<HrAuditedRow<T>>> {
  const result = await callHrRaw(
    "hr_confidential_get",
    { p_token: args.token, p_id: args.id, p_purpose: args.purpose },
    { envelope: true, whatFailed: "That record" },
  );
  return result.ok ? { ok: true, data: mapAuditedRow<T>(result.data) } : result;
}

/**
 * The LIST half of the Confidential door (SPEC-EMPLOYEES §2.2 route 17).
 *
 * 🚨 THERE IS NO CLIENT-DIRECT SELECT ON A CONFIDENTIAL TABLE. `hr` is not in
 * PostgREST's exposed schema list, and even if it were, every read of this tier
 * must land in `hr.access_audit`. This door and `fetchHrConfidential` are the
 * only two ways a browser sees one of these rows.
 *
 * 🚨 THIS DOOR IS CURSOR-PAGED. Its fifth argument is `p_cursor text` — there is no
 * `p_offset`. Sending one did not page wrongly; PostgREST resolves `rpc()` by
 * argument NAMES, so it raised **PGRST202 "function not found"** and this call
 * failed outright every time it ran. Pass the previous page's `nextCursor`, or
 * `null` for the first page.
 */
export async function fetchHrConfidentialList<
  T = Record<string, unknown>,
>(args: {
  token: string;
  filter?: Record<string, unknown>;
  limit?: number;
  /** The previous page's `nextCursor`. `null`/omitted starts at the beginning. */
  cursor?: string | null;
  purpose: string;
}): Promise<HrResult<HrAuditedPage<T>>> {
  const result = await callHrRaw(
    "hr_confidential_list",
    {
      p_token: args.token,
      p_filter: args.filter ?? {},
      p_limit: args.limit ?? 100,
      p_cursor: args.cursor ?? null,
      p_purpose: args.purpose,
    },
    { envelope: true, whatFailed: "That list" },
  );
  return result.ok
    ? { ok: true, data: mapAuditedPage<T>(result.data) }
    : result;
}

/**
 * The LIST half of the Restricted door (SPEC-EMPLOYEES §2.2 route 15).
 *
 * 🚨 THE SUBJECT EXCLUSION APPLIES TO THE LIST ITSELF. `hr.incident_excluded()`
 * is evaluated per row on the server, after every allow lane, and it overrides
 * `incident.read`, `hr_owner` and break-glass. An excluded row is not in `rows`
 * AND its count is not in `total`. A result count that changes with the viewer
 * is CORRECT here — never "fix" it with a viewer-independent cache.
 *
 * Unlike `fetchHrRestricted` (one row) this door takes no `justification`: a
 * queue read is not a targeted read of a named person's file. The `purpose` is
 * still recorded.
 *
 * 🚨 THIS DOOR IS CURSOR-PAGED. Its fifth argument is `p_cursor text` — there is no
 * `p_offset`. Sending one did not page wrongly; PostgREST resolves `rpc()` by
 * argument NAMES, so it raised **PGRST202 "function not found"** and this call
 * failed outright every time it ran. Pass the previous page's `nextCursor`, or
 * `null` for the first page.
 */
export async function fetchHrRestrictedList<T = Record<string, unknown>>(args: {
  token: string;
  filter?: Record<string, unknown>;
  limit?: number;
  /** The previous page's `nextCursor`. `null`/omitted starts at the beginning. */
  cursor?: string | null;
  purpose: string;
}): Promise<HrResult<HrAuditedPage<T>>> {
  const result = await callHrRaw(
    "hr_restricted_list",
    {
      p_token: args.token,
      p_filter: args.filter ?? {},
      p_limit: args.limit ?? 100,
      p_cursor: args.cursor ?? null,
      p_purpose: args.purpose,
    },
    { envelope: true, whatFailed: "That list" },
  );
  return result.ok
    ? { ok: true, data: mapAuditedPage<T>(result.data) }
    : result;
}

/** A Restricted-tier row. `justification` is REQUIRED and is shown in the subject's access log. */
export async function fetchHrRestricted<T = Record<string, unknown>>(args: {
  token: string;
  id: string;
  purpose: string;
  justification: string;
}): Promise<HrResult<HrAuditedRow<T>>> {
  const result = await callHrRaw(
    "hr_restricted_get",
    {
      p_token: args.token,
      p_id: args.id,
      p_purpose: args.purpose,
      p_justification: args.justification,
    },
    { envelope: true, whatFailed: "That record" },
  );
  return result.ok ? { ok: true, data: mapAuditedRow<T>(result.data) } : result;
}

/**
 * Break glass — the audited emergency door (§2.3.5). It notifies the org owner and
 * every `hr_owner` immediately and the surface must say when the grant expires.
 * This is a DOOR the user opens deliberately, never a toggle that quietly widens
 * what a page shows.
 */
export function hrBreakGlass(args: {
  token: string;
  id: string;
  purpose: string;
  justification: string;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_break_glass",
    {
      p_token: args.token,
      p_id: args.id,
      p_purpose: args.purpose,
      p_justification: args.justification,
    },
    { envelope: true, whatFailed: "The emergency access request" },
  );
}

/** Why this person can (or cannot) reach that record — the access-explain door. */
export function explainHrAccess(args: {
  userId: string;
  token: string;
  id: string;
}): Promise<HrResult<Record<string, unknown>>> {
  return callHrRaw(
    "hr_access_explain",
    { p_user: args.userId, p_token: args.token, p_id: args.id },
    { envelope: true, whatFailed: "The access explanation" },
  );
}

// ── Activation — LIVE ───────────────────────────────────────────────────────

/**
 * §2.4's three-step wizard, committed. Gated on org owner/admin — the ONE place org
 * standing confers HR standing — one-shot, audited, and refused once any `hr_owner`
 * assignment exists. `hr_my_context().active.can_activate` is the gate to render it.
 */
export function activateHrEmployer(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_activate_employer",
    { p_payload: payload },
    { envelope: true, whatFailed: "HR setup" },
  );
}

// ── Writes — SIGNATURES SHIPPING WITH THE L1 SERVER LANE ────────────────────
//
// 🚨 NOT LIVE YET (verified against `pg_proc` 2026-08-26). These are the agreed
// signatures; the server lane owner is shipping them. Every one returns the same
// envelope, so `HrResult` already covers them and no call site changes at cutover.
// A call made before the function exists comes back as `{kind:"failed"}` with
// Postgres's "could not find the function" — which is a real, visible error rather
// than a silent no-op, and that is the correct behaviour for a half-shipped lane.

export function createHrEmployee(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_employee_create",
    { p_payload: payload },
    {
      envelope: true,
      whatFailed: "Creating this employee",
    },
  );
}

export function updateHrEmployee(args: {
  employeeId: string;
  patch: Record<string, unknown>;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_employee_update",
    { p_employee_id: args.employeeId, p_patch: args.patch },
    { envelope: true, whatFailed: "Saving this change" },
  );
}

/** Self-service. The field policy is enforced HERE, never by the client alone (§7.1). */
export function updateHrSelf(args: {
  token: string;
  id: string;
  patch: Record<string, unknown>;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_self_update",
    { p_token: args.token, p_id: args.id, p_patch: args.patch },
    { envelope: true, whatFailed: "Saving your change" },
  );
}

/** §4.2 promotion / reclass / FTE change, and §4.3 transfer. Both write a NEW row. */
export function recordHrPositionChange(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_position_change",
    { p_payload: payload },
    {
      envelope: true,
      whatFailed: "This position change",
    },
  );
}

/** §4.4 pay change. Always the `pay_change` flow — no page approves a raise itself. */
export function upsertHrCompensation(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_compensation_upsert",
    { p_payload: payload },
    {
      envelope: true,
      whatFailed: "This compensation change",
    },
  );
}

/**
 * §6.2 — cancel a future-dated row before its effective date. Soft-deletes the
 * future row and re-opens the prior row's `effective_to` in ONE audited action.
 * It is never a delete of history, and the cancellation is itself a recorded event.
 */
export function cancelHrPendingChange(args: {
  kind: "position" | "compensation" | "reporting_line";
  id: string;
  reason: string;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_pending_change_cancel",
    { p_kind: args.kind, p_id: args.id, p_reason: args.reason },
    { envelope: true, whatFailed: "Cancelling this scheduled change" },
  );
}

/**
 * Record a separation — the sanctioned termination write (SPEC-EMPLOYEES §4.10).
 *
 * 🚨 TYPED AND MAPPED FIELD-BY-FIELD, NOT AN UNTYPED PAYLOAD BAG.
 * `hr_separation_record` takes a jsonb `p_payload`, and this used to forward an untyped
 * `Record<string, unknown>` verbatim. That is the exact cast-at-a-seam class that silently
 * dropped every field of the verification-request form until it was mapped key-by-key — an
 * `unknown` bag lets a misnamed client key sail through as a no-op the door never sees. The
 * door reads these keys (verified against `pg_proc`): `employment_id`, `separation_category`,
 * `reason_category_id`, `initiator`, `last_day_worked`, `termination_date`, `rehire_eligible`,
 * `rehire_eligible_note`, `notice_given_on`. They are named here, so a rename breaks the build
 * rather than the write.
 *
 * `last_day_worked` and `termination_date` are DIFFERENT fields and the door requires both —
 * final pay keys on one, benefits on the other.
 */
export function recordHrSeparation(args: {
  employmentId: string;
  separationCategory: string;
  reasonCategoryId: string;
  initiator: string;
  lastDayWorked: string;
  terminationDate: string;
  rehireEligible: boolean | null;
  rehireEligibleNote?: string | null;
  noticeGivenOn?: string | null;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_separation_record",
    {
      p_payload: {
        employment_id: args.employmentId,
        separation_category: args.separationCategory,
        reason_category_id: args.reasonCategoryId,
        initiator: args.initiator,
        last_day_worked: args.lastDayWorked,
        termination_date: args.terminationDate,
        rehire_eligible: args.rehireEligible,
        rehire_eligible_note: args.rehireEligibleNote ?? null,
        notice_given_on: args.noticeGivenOn ?? null,
      },
    },
    {
      envelope: true,
      whatFailed: "This separation",
    },
  );
}

/**
 * The offboarding reason menu — `platform.categories` on the `hr_separation_reason` dimension.
 *
 * 🚨 NOT AN `hr_*` DOOR, AND THAT IS LEGITIMATE. `hr.separation.reason_category_id` is a FK to
 * `platform.categories`, a `platform` table exposed to PostgREST (`hr` is not). The rows are
 * system rows in the globally-readable system org, so RLS grants every authenticated caller a
 * read — the same non-RPC pattern the leave and time reason menus use. `readAllRows` because
 * the list is treated as COMPLETE: a reason quietly missing from the menu is a separation
 * nobody can record.
 */
export async function fetchHrSeparationReasonCategories(): Promise<
  HrSeparationReasonCategory[]
> {
  const rows = await readAllRows<{
    id: string;
    slug: string | null;
    name: string | null;
    position: number | null;
  }>(
    ({ from, to }) =>
      supabase
        .schema("platform")
        .from("categories")
        .select("id, slug, name, position", { count: "exact" })
        .eq("dimension", HR_SEPARATION_REASON_DIMENSION)
        .is("deleted_at", null)
        .order("position", { ascending: true })
        .range(from, to),
    { label: "hr-separation-reason-categories" },
  );

  return rows
    .filter((r) => typeof r.slug === "string" && typeof r.name === "string")
    .map((r) => ({
      id: r.id,
      slug: r.slug as string,
      name: r.name as string,
      position: r.position,
    }));
}

export function upsertHrEngagement(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_engagement_upsert",
    { p_payload: payload },
    {
      envelope: true,
      whatFailed: "This engagement",
    },
  );
}

export function upsertHrEmergencyContact(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_emergency_contact_upsert",
    { p_payload: payload },
    {
      envelope: true,
      whatFailed: "This emergency contact",
    },
  );
}

export function upsertHrExternalIdentity(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_external_identity_upsert",
    { p_payload: payload },
    {
      envelope: true,
      whatFailed: "This external system id",
    },
  );
}

/** §4.1 — is this person already here? Asked BEFORE a create, never after. */
export function scanHrDuplicates(args: {
  organizationId: string;
  probe: Record<string, unknown>;
}): Promise<HrResult<Record<string, unknown>>> {
  return callHrRaw(
    "hr_duplicate_scan",
    { p_organization_id: args.organizationId, p_probe: args.probe },
    { envelope: true, whatFailed: "The duplicate check" },
  );
}

export function createHrIncident(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_incident_create",
    { p_payload: payload },
    {
      envelope: true,
      whatFailed: "This incident report",
    },
  );
}

export function issueHrCorrectiveAction(
  payload: Record<string, unknown>,
): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_corrective_action_issue",
    { p_payload: payload },
    {
      envelope: true,
      whatFailed: "This corrective action",
    },
  );
}

/**
 * Raise a verification-letter request.
 *
 * 🚨 MAPPED FIELD BY FIELD, BECAUSE THE BAG LIED. This took
 * `Record<string, unknown>` and forwarded whatever it was handed. The caller sent
 * `subject_employment_id`; the door reads `employment_id`. Nothing checked, nothing
 * errored, and `v_employment` came back null on every call — so `v_org` was null, the
 * door answered `not_reachable`, and NO ROW HAS EVER BEEN CREATED FROM THIS FORM. An
 * untyped payload at an RPC seam is a cast wearing a different hat: it compiles, and it
 * proves nothing about the names on the other side.
 *
 * The door reads exactly six keys — anything else was being sent into a void:
 * `includes_compensation` is DERIVED there from the kind (the door decides what a kind
 * implies, not the form), and `subject_name_asserted` / `as_of_date` are not columns on
 * this request at all.
 */
export function createHrVerificationRequest(args: {
  employmentId: string | null;
  requestSource: string;
  verificationKind: string;
  requesterName: string | null;
  requesterOrganization: string | null;
  requesterEmail: string | null;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_verification_request_create",
    {
      p_payload: {
        employment_id: args.employmentId,
        request_source: args.requestSource,
        verification_kind: args.verificationKind,
        requester_name: args.requesterName,
        requester_organization: args.requesterOrganization,
        requester_email: args.requesterEmail,
      },
    },
    {
      envelope: true,
      whatFailed: "This verification request",
    },
  );
}

// ── Employee relations — the case-working doors (SPEC-EMPLOYEES §2.2 route 16)
//
// Same NOT-LIVE caveat as the block above. Every one of these is a write to a
// RESTRICTED-tier record, so every one is audited server-side and every one
// re-runs the veto: a call that succeeded a minute ago can legitimately refuse
// now, because adding an `accused` party re-materializes the exclusion set in
// the SAME transaction and the new respondent loses reach immediately —
// including when the new respondent is the caller.

/** Advance one incident: `intake → investigating → action_pending → resolved → closed`; `referred` from any state. */
export function advanceHrIncident(args: {
  incidentId: string;
  toState: string;
  /** REQUIRED to reach `resolved`. The server refuses without it. */
  resolutionSummary?: string | null;
  /** REQUIRED to reach `closed`. Starts the retention clock. */
  resolvedAt?: string | null;
  referralNote?: string | null;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_incident_advance",
    {
      p_incident_id: args.incidentId,
      p_to_state: args.toState,
      p_resolution_summary: args.resolutionSummary ?? null,
      p_resolved_at: args.resolvedAt ?? null,
      p_referral_note: args.referralNote ?? null,
    },
    { envelope: true, whatFailed: "Advancing this case" },
  );
}

/**
 * Add one party to an incident. Either `employmentId` or `externalName` is
 * required — a witness who does not work here is still a witness.
 *
 * 🚨 Adding an `accused` party re-materializes `hr.incident.excluded_actor_ids`
 * in the SAME transaction. If the caller is the person just accused, THIS CALL
 * SUCCEEDS AND THEIR NEXT READ REFUSES. The surface must handle that by
 * redirecting with a neutral message, never by explaining what happened.
 */
export function addHrIncidentParty(args: {
  incidentId: string;
  role: string;
  employmentId?: string | null;
  externalName?: string | null;
  note?: string | null;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_incident_party_add",
    {
      p_incident_id: args.incidentId,
      p_role: args.role,
      p_employment_id: args.employmentId ?? null,
      p_external_name: args.externalName ?? null,
      p_note: args.note ?? null,
    },
    { envelope: true, whatFailed: "Adding this party" },
  );
}

/** A restricted note. Reachable through its OWN owner lane only — no org admin can read one. */
export function addHrRestrictedNote(args: {
  targetToken: string;
  targetId: string;
  noteKind: string;
  body: string;
  redactedSummary?: string | null;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_restricted_note_add",
    {
      p_target_token: args.targetToken,
      p_target_id: args.targetId,
      p_note_kind: args.noteKind,
      p_body: args.body,
      p_redacted_summary: args.redactedSummary ?? null,
    },
    { envelope: true, whatFailed: "Saving this note" },
  );
}

/**
 * OSHA recordability. 🚨 A HUMAN DECISION WITH A RULES ASSIST, NEVER AUTO-SET.
 * `oshaPrivacyCase` suppresses the name in the 300-log rendering.
 */
export function setHrOshaDetermination(args: {
  incidentId: string;
  recordable: boolean;
  privacyCase: boolean;
  basis: string;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_incident_osha_set",
    {
      p_incident_id: args.incidentId,
      p_osha_recordable: args.recordable,
      p_osha_privacy_case: args.privacyCase,
      p_basis: args.basis,
    },
    { envelope: true, whatFailed: "Recording the OSHA determination" },
  );
}

/**
 * Record how a corrective action was acknowledged — or that it was REFUSED.
 *
 * 🚨 A REFUSAL TO ACKNOWLEDGE IS A VALID OUTCOME, recorded as such, never a
 * stuck flow. And `employeeStatement` is THE EMPLOYEE'S OWN WORDS: the issuer
 * can never edit it, which is why it only ever travels on the subject's own
 * call and never on an issuer's patch.
 */
export function acknowledgeHrCorrectiveAction(args: {
  correctiveActionId: string;
  kind: "esign" | "wet_signature" | "verbal_witnessed" | "refused";
  witnessEmploymentId?: string | null;
  signedFileId?: string | null;
  employeeStatement?: string | null;
  refusalNote?: string | null;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_corrective_action_acknowledge",
    {
      p_corrective_action_id: args.correctiveActionId,
      p_kind: args.kind,
      p_witness_employment_id: args.witnessEmploymentId ?? null,
      p_signed_file_id: args.signedFileId ?? null,
      p_employee_statement: args.employeeStatement ?? null,
      p_refusal_note: args.refusalNote ?? null,
    },
    { envelope: true, whatFailed: "Recording the acknowledgment" },
  );
}

/** Close the loop: `resolved | escalated | expired | rescinded | led_to_separation`. */
export function recordHrCorrectiveActionOutcome(args: {
  correctiveActionId: string;
  outcome: string;
  note?: string | null;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_corrective_action_outcome",
    {
      p_corrective_action_id: args.correctiveActionId,
      p_outcome: args.outcome,
      p_note: args.note ?? null,
    },
    { envelope: true, whatFailed: "Recording this outcome" },
  );
}

/**
 * What the REPORTER may see: state, last-updated, and the declared next step.
 * **Nothing from the notes, ever.** This is a separate door precisely so the
 * notes cannot leak through a widened case read.
 */
export function fetchHrIncidentStatus(
  incidentId: string,
): Promise<HrResult<Record<string, unknown>>> {
  return callHrRaw(
    "hr_incident_status",
    { p_incident_id: incidentId },
    { envelope: true, whatFailed: "The status of your report" },
  );
}

// ── Verification letters (SPEC-EMPLOYEES §4.9) ──────────────────────────────
//
// Generation is NOT here — it is `POST /api/hr/verification-letters/{id}/generate`
// on aidream, because a letter is a rendered PDF frozen into `files.files`.
// See `features/hr/people/verifications/service.ts`.

/**
 * Verification letters about ME that are waiting on my consent, plus the ones I recently
 * decided so the outcome is visible.
 *
 * 🚨 THIS IS THE SUBJECT'S ONLY READ PATH, AND UNTIL hr_l1_54 IT DID NOT EXIST.
 * Five verification doors shipped and every one was a write or the generation call, so
 * `awaiting_consent` was a state only HR could see: the person whose pay was about to be
 * disclosed had nothing to read and nowhere to answer.
 *
 * Scoped by LOGIN LINKAGE inside the door, never by `hr._l1_self_employment(uid, org, today)`
 * — a letter is about me whether or not I am employed today, so a PRE-START hire sees their
 * own ask (hr_l1_52's identity law). It spans employers on purpose: "letters about me" is not
 * an employer-scoped question, so this takes no organization argument.
 */
export function fetchHrMyVerificationConsents(): Promise<
  HrResult<{
    consent_expiry_days: number;
    requests: HrMyVerificationConsent[];
  }>
> {
  return callHrAligned(
    "hr_my_verification_consents",
    {},
    { envelope: true, whatFailed: "Requests waiting on your consent" },
  );
}

/** One row of {@link fetchHrMyVerificationConsents} — what is disclosed, and to whom. */
export type HrMyVerificationConsent = {
  id: string;
  state: string;
  verification_kind: string;
  includes_compensation: boolean;
  /** WHO receives it. The subject is deciding about a named recipient, not an abstraction. */
  requester_name: string | null;
  requester_organization: string | null;
  requester_email: string | null;
  request_source: string;
  employer_name: string;
  requested_at: string;
  /** The clock the knob `hr.employees.verification_consent_expiry_days` sets. */
  expires_at: string;
  employee_consent_at: string | null;
  decided: boolean;
  granted: boolean;
};

/**
 * The subject grants or withholds consent. A withheld consent is itself the record.
 *
 * 🚨 THE DOOR IS `hr_verification_consent`, AND ITS FIRST ARGUMENT IS `p_id`.
 * This called `hr_verification_consent_set` with `p_letter_id` — a function that has
 * never existed, under an argument name the real one does not take. PostgREST resolves
 * `rpc()` by NAME, so every call was PGRST202: consent could not be recorded through
 * the product at all. Verified against `pg_proc`:
 *   hr_verification_consent(p_id uuid, p_granted boolean, p_note text DEFAULT NULL)
 *
 * 🚨 ITS ANSWER IS `consent_granted`, NOT `granted` (hr_l1_55).
 * `granted` is the envelope's word for "you were permitted" — {@link isRefusal} returns true
 * on `granted === false`. The door used to return `granted` meaning "the subject agreed", so
 * a DECLINE (a successful decision) was read as a permission refusal and the subject was told
 * "Recording your decision is not available to you here." over a decision that had just been
 * recorded. Nothing in an HR response may reuse `granted` for a domain fact.
 */
export function setHrVerificationConsent(args: {
  letterId: string;
  granted: boolean;
  note?: string | null;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_verification_consent",
    {
      p_id: args.letterId,
      p_granted: args.granted,
      p_note: args.note ?? null,
    },
    { envelope: true, whatFailed: "Recording your consent decision" },
  );
}

/**
 * Deny a request with a basis. A request for someone who never worked here ends HERE.
 *
 * 🚨 THE ARGUMENTS ARE `p_id` AND `p_basis`, AND THERE IS NO NOTE.
 * This posted `p_letter_id`/`p_denial_basis`/`p_note` — PGRST202 on every call. The
 * note had nowhere to land in the door, so it is not accepted here either rather than
 * being taken from the user and dropped. Verified against `pg_proc`:
 *   hr_verification_deny(p_id uuid, p_basis text)
 */
export function denyHrVerification(args: {
  letterId: string;
  denialBasis: string;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_verification_deny",
    {
      p_id: args.letterId,
      p_basis: args.denialBasis,
    },
    { envelope: true, whatFailed: "Denying this request" },
  );
}

/**
 * Record delivery: `token_link | email | mail | in_person`.
 *
 * 🚨 THE ARGUMENTS ARE `p_id` AND `p_method`, PLUS A `p_payload` JSONB.
 * This posted `p_letter_id`/`p_recipient` — PGRST202 on every call. The door reads
 * exactly one key out of the payload, `outsider_token_ref`; it has no notion of a
 * "recipient", so that parameter is gone rather than posted into nothing. Verified
 * against `pg_proc`:
 *   hr_verification_deliver(p_id uuid, p_method text, p_payload jsonb DEFAULT '{}')
 */
export function deliverHrVerification(args: {
  letterId: string;
  method: string;
  outsiderTokenRef?: string | null;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_verification_deliver",
    {
      p_id: args.letterId,
      p_method: args.method,
      p_payload: args.outsiderTokenRef
        ? { outsider_token_ref: args.outsiderTokenRef }
        : {},
    },
    { envelope: true, whatFailed: "Recording the delivery" },
  );
}

// ── Route 3 — my own compensation (SPEC-EMPLOYEES §2.1) ─────────────────────

/**
 * The caller's OWN pay: the current stack as of today, plus the full history.
 *
 * ⚠️ WHY A SEPARATE DOOR AND NOT `hr_confidential_list('hr_compensation', …)`.
 * That door filters by `organization_id` only, so reading one person's pay
 * through it records a WHOLE-ORG audited list read against the caller — for a
 * viewer who is entitled to exactly one row. That corrupts the audit trail this
 * tier exists to produce, and the subject's own access log would show them
 * apparently reading everybody's pay. A self-scoped door is the honest shape.
 *
 * 🚨 IT RETURNS EVERY CONCURRENT COMPONENT SEPARATELY. Base, shift differential
 * and any allowance each keep their own window. Nothing sums them, here or
 * anywhere downstream — a summed figure is not true on any day and somebody
 * will quote it in a wage claim.
 *
 * A person with NO compensation row (a volunteer) gets a refusal, and the nav
 * item is ABSENT for them — never an empty pay page.
 */
export function fetchHrMyCompensation(args: {
  employmentId: string;
  asOf?: string | null;
}): Promise<
  HrResult<{
    as_of: string;
    /** Concurrent components in force on `as_of`. Never summed. */
    current: Record<string, unknown>[];
    /** Every row, `effective_from desc`, including approved-but-future ones. */
    history: Record<string, unknown>[];
    currency: string | null;
  }>
> {
  // verified aligned 2026-08-27 — the door SHIPPED and was called live. Success envelope
  // is {granted, as_of, current, history, currency, audit_id}; `granted` is stripped by
  // the envelope and `audit_id` is the one field it sends that this type does not name.
  // Both refusal arms were exercised against real employments: `not_self` (this is the
  // self lane only — somebody else's pay is a different, audited read about a different
  // person) and `no_record`, which is exactly the volunteer case the header describes:
  // no pay record means a refusal and an ABSENT nav item, never an empty pay page.
  // VOLATILE and it audits, so F1's class stays closed.
  return callHrAligned(
    "hr_my_compensation",
    { p_employment_id: args.employmentId, p_as_of: args.asOf ?? null },
    { envelope: true, whatFailed: "Your pay record" },
  );
}

/**
 * Is this CRM party an employee here? (SPEC-UI-IA §6, `PartyRecordPage`.)
 *
 * `hr.employee` is 1:1 with `crm.party`, but the directory door filters by
 * NAME, not by party id — searching the directory for a uuid would silently
 * match nothing and the card would render "not an employee" for somebody who
 * is. So the seam gets its own door rather than a lookup that looks right and
 * is wrong.
 *
 * Returns DIRECTORY-TIER FIELDS ONLY. Nothing confidential may reach a CRM
 * surface; that is a separate, audited read on a different page. A refusal —
 * or a party who is not an employee — renders the card as ABSENT.
 */
export function fetchHrEmployeeByParty(args: {
  organizationId: string;
  partyId: string;
}): Promise<
  HrResult<{
    employee_id: string | null;
    /** Added to the door by `hr_l1_24` — directory tier, like the rest of this payload. */
    employee_number: string | null;
    display_name: string | null;
    directory_status: string | null;
    job_title: string | null;
    department: string | null;
    manager_employee_id: string | null;
    manager_name: string | null;
    hire_date: string | null;
  }>
> {
  // verified aligned 2026-08-27, RE-VERIFIED after `hr_l1_24` widened the door — called
  // live against the probe org's party for EMP-00002 and it returned exactly
  // {employee_id, employee_number, display_name, directory_status, job_title, department,
  // manager_employee_id, manager_name, hire_date} plus `granted`, which the envelope
  // strips: a field-for-field match with the type below, in both directions.
  //
  // 🚨 THE NOT-AN-EMPLOYEE BRANCH SENDS THE SAME KEYS, ALL NULL — which is what lets the
  // card test `employee_id` alone and trust the rest. `hr_l1_24` added the new key to
  // BOTH branches for exactly that reason.
  //
  // Directory tier only, as §4.5 requires — nothing confidential reaches a CRM surface,
  // and the migration asserts that no confidential column ever enters this door.
  return callHrAligned(
    "hr_employee_by_party",
    { p_organization_id: args.organizationId, p_party_id: args.partyId },
    { envelope: true, whatFailed: "This person's employee record" },
  );
}

// ── The member ⇄ employee seam (SPEC-UI-IA §6, MemberManagement) ────────────

/**
 * Which org members have an `hr.employee` here.
 *
 * A member and an employee are related but DISTINCT, and `hr.employee` is not
 * PostgREST-reachable, so this is the only way the members list can draw the
 * seam. Until this door ships, the seam renders ABSENT rather than a broken
 * link — which is the correct fallback under §1.3 anyway.
 */
export function fetchHrMemberEmployeeLinks(args: {
  organizationId: string;
  userIds: string[];
}): Promise<
  HrResult<{
    links: {
      user_id: string;
      employee_id: string | null;
      display_name: string | null;
      directory_status: string | null;
      /** true when someone explicitly marked this member as not an employee. */
      marked_not_employee: boolean;
    }[];
    can_link: boolean;
  }>
> {
  // verified aligned 2026-08-27 — the door SHIPPED and was called live with real user ids.
  // Envelope {granted, links, can_link}; each link is exactly {user_id, employee_id,
  // display_name, directory_status, marked_not_employee}.
  //
  // 🚨 `marked_not_employee` IS FALSE FOR EVERYONE, BY DESIGN, UNTIL ITS STORE SHIPS.
  // Nothing records the "this member is deliberately not an employee" decision yet, so the
  // door answers the only honest thing it can. The seam's "Not an employee" branch is
  // therefore DOCUMENTED-UNREACHABLE, not broken — do not "fix" it by inferring the flag
  // from a null `employee_id`, which would state a decision nobody made.
  return callHrAligned(
    "hr_member_employee_links",
    { p_organization_id: args.organizationId, p_user_ids: args.userIds },
    { envelope: true, whatFailed: "The employee links for these members" },
  );
}

/**
 * Headcount + module state for one org, cheap enough for an org-settings card
 * and an org-workspace strip that are NOT inside the HR shell.
 *
 * Deliberately not `hr_directory_list` with `limit: 0`: those surfaces must
 * render for an owner/admin who holds no HR capability at all, and a directory
 * read would refuse for them.
 */
export function fetchHrOrgSummary(organizationId: string): Promise<
  HrResult<{
    organization_id: string;
    module_enabled: boolean;
    is_activated: boolean;
    headcount: number;
    prehire_count: number;
    pending_approvals: number;
    can_enable: boolean;
  }>
> {
  // verified aligned 2026-08-27: called live against the sandbox employer; the door returns
  // exactly {organization_id, module_enabled, is_activated, headcount, prehire_count,
  // pending_approvals, can_enable} — set-compared with the type above, both directions.
  return callHrAligned(
    "hr_org_summary",
    { p_organization_id: organizationId },
    { envelope: true, whatFailed: "This organization's HR summary" },
  );
}

/**
 * Switch the HR module on (or off) for one organization.
 *
 * 🚨 THE WRITER THAT DID NOT EXIST, AND THE DEAD END IT LEFT. `hr._l1_module_enabled` has always
 * read `iam.organizations.settings->hr->module_enabled`, and **nothing in the codebase ever wrote
 * that key** — so the flag could only ever be its fallback ("an employer profile exists"), while
 * the activation wizard that creates the profile sits BEHIND the flag. A closed loop: HR could not
 * be turned on through the product by anybody, and `/hr`'s "Turn on HR" pointed at an org-settings
 * card that rendered nothing. The G2 verifier measured that card in the DOM: zero links, zero
 * buttons.
 *
 * Gated server-side on org owner/admin — the same single named place where org standing confers
 * HR standing (SPEC-ACCESS §1.1, adopted from SPEC-EMPLOYEES D-1). Turning the module on is the
 * act that precedes there being any HR role to hold, which is why it is not itself an HR setting.
 *
 * Switching OFF retains every record: §1.3's absent-not-disabled applies to modules, and an org
 * that switches HR off and back on finds its people where it left them.
 */
export function enableHrModule(args: {
  organizationId: string;
  enabled: boolean;
}): Promise<
  HrResult<{
    organization_id: string;
    module_enabled: boolean;
    is_activated: boolean;
    records_retained: boolean;
    next: "activation_wizard" | "module_off";
  }>
> {
  // verified aligned 2026-08-27 from `pg_proc.prosrc` rather than by calling it, because
  // calling it would flip a real organization's module. The success envelope builds
  // {ok, organization_id, module_enabled, is_activated, records_retained, next}; `ok` is the
  // only field it sends that this type does not name, and no caller needs it.
  return callHrAligned(
    "hr_module_set_enabled",
    { p_organization_id: args.organizationId, p_enabled: args.enabled },
    { envelope: false, whatFailed: "Switching HR on for this organization" },
  );
}

/** Route 69's writes — departments, locations, job titles, and the rest of §2.4. */
export function upsertHrStructure(args: {
  kind: string;
  payload: Record<string, unknown>;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_structure_upsert",
    { p_kind: args.kind, p_payload: args.payload },
    { envelope: true, whatFailed: "Saving this" },
  );
}

// ── Pay-group assignment and the activation seeds ───────────────────────────
//
// Both doors are LIVE (`pg_proc`, 2026-08-26) and both used to have ZERO callers
// anywhere in the browser, which is what the G2 D15 re-run recorded as N6 and N7.
// A shipped door nothing calls is indistinguishable from a door that does not
// exist, so these two wrappers are the whole fix on this side of the wire.
//
// Their envelopes are narrowed FIELD BY FIELD below rather than cast. `callHr`
// asserts its payload to `T`, which is fine for a shape a panel only forwards —
// it is NOT fine for numbers a wizard prints as "what was created", because a
// missing key would render `undefined` as a count.

/** Anything numeric on the wire that is genuinely a number. Never coerced from a string. */
function readCount(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readText(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function readTextArray(row: Record<string, unknown>, key: string): string[] {
  const value = row[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Route 70's other half — put ONE employment into a pay group, or take it out of
 * one by passing `payGroupId: null`.
 *
 * 🚨 `hr.pay_period` IS GENERATED FROM A PAY GROUP'S CALENDAR. An employment with
 * no pay group can never have a pay period, which means no timesheet, no
 * attestation, no approval, no lock and no export for that person. This is not a
 * cosmetic field.
 *
 * The refusals, read out of the shipped body: `not_reachable` (no such live
 * employment), `forbidden` (the `hr._l1_write_gate` verdict), `validation` with
 * `field: 'pay_group_id'` (the group was deleted), and
 * `pay_group_other_employer` — a group hangs off an employer of record, and
 * attaching across employers would cut this person's periods against another
 * company's calendar.
 */
export async function setHrEmploymentPayGroup(args: {
  employmentId: string;
  payGroupId: string | null;
}): Promise<HrResult<HrPayGroupAssignmentAck>> {
  const result = await callHrRaw(
    "hr_employment_set_pay_group",
    { p_employment_id: args.employmentId, p_pay_group_id: args.payGroupId },
    { envelope: true, whatFailed: "This person's pay group", write: true },
  );
  if (!result.ok) return result;

  const row = result.data;
  return {
    ok: true,
    data: {
      employmentId: readText(row, "employment_id"),
      payGroupId: readText(row, "pay_group_id"),
      payGroupName: readText(row, "pay_group_name"),
      previousPayGroupId: readText(row, "previous_pay_group_id"),
      // The door always answers `false`. It is read rather than assumed so the
      // day the server learns how to re-cut, the surface stops lying by omission.
      existingPeriodsRecut: row.existing_periods_recut === true,
      auditId: readText(row, "audit_id"),
    },
  };
}

/**
 * The activation seeds — earning codes, deduction codes, and the employer's
 * default holiday calendar with the year's federal holidays.
 *
 * 🚨 A FRESHLY ACTIVATED EMPLOYER CANNOT COMPUTE HOURS UNTIL THIS RUNS.
 * `hr.work_interval.earning_code_id` is `NOT NULL`, so an employer with zero
 * earning codes has nothing to write hours against.
 *
 * IDEMPOTENT: every insert is `on conflict do nothing` and the holiday calendar
 * is only built when the employer has none, so a second call creates nothing and
 * honestly reports zeros. Callers render the returned counts — never a constant,
 * and never the list the seed *would* have created.
 *
 * Refuses `not_activated` when the org has no employer profile (seeds belong to
 * an employer of record), and `forbidden` from `hr._l1_settings_gate`.
 */
export async function seedHrActivation(
  organizationId: string,
): Promise<HrResult<HrActivationSeedAck>> {
  const result = await callHrRaw(
    "hr_activation_seed",
    { p_organization_id: organizationId },
    { envelope: true, whatFailed: "The starting codes and calendars", write: true },
  );
  if (!result.ok) return result;

  const row = result.data;
  return {
    ok: true,
    data: {
      earningCodesCreated: readCount(row, "earning_codes_created"),
      deductionCodesCreated: readCount(row, "deduction_codes_created"),
      holidayCalendarId: readText(row, "holiday_calendar_id"),
      holidaysCreated: readCount(row, "holidays_created"),
      tipCodesSeededNotEnabled: readTextArray(
        row,
        "tip_codes_seeded_not_enabled",
      ),
      categoriesDimensions: readText(row, "categories_dimensions"),
      auditId: readText(row, "audit_id"),
    },
  };
}

/**
 * Issue a platform login invitation to an employee who does not have one.
 *
 * 🚨 AN EMPLOYEE IS NOT REQUIRED TO HAVE A LOGIN, AND THIS IS NOT HOW ONE IS
 * CREATED SILENTLY. The invite is delegated to `iam.inv_create` — the platform's
 * single invitation primitive — and the link only becomes a login when the
 * person themselves accepts it while signed in as that email address. Nobody
 * gains a login because HR clicked a button.
 *
 * The `token` comes back to the ISSUING ADMIN on purpose. The platform's own
 * invite route never exposes it, because it relies on email delivery; where mail
 * is not configured that leaves no way to hand somebody the link at all. The
 * token is single-use, expiring, and only ever returned to a caller who has
 * already passed the `identity.write` gate — the same caller who could read the
 * person's whole record anyway.
 *
 * Refusals, read from the shipped body: `not_reachable` (no such employee),
 * `already_has_login` (with a `door` to their profile), `validation` on `email`
 * (nothing to send to — the employee has no work email and none was typed),
 * `org_role_required_for_login`, and `invite_failed` carrying the platform's own
 * reason.
 */
export async function inviteHrEmployeeLogin(args: {
  employeeId: string;
  email?: string | null;
}): Promise<HrResult<HrEmployeeInviteAck>> {
  const result = await callHrRaw(
    "hr_employee_invite",
    {
      p_employee_id: args.employeeId,
      p_email: args.email?.trim() ? args.email.trim() : null,
    },
    { envelope: true, whatFailed: "The login invitation", write: true },
  );
  if (!result.ok) return result;

  const row = result.data;
  return {
    ok: true,
    data: {
      employeeId: readText(row, "employee_id"),
      displayName: readText(row, "display_name"),
      invitationId: readText(row, "invitation_id"),
      email: readText(row, "email"),
      expiresAt: readText(row, "expires_at"),
      token: readText(row, "token"),
      acceptPath: readText(row, "accept_path"),
      notice: readText(row, "notice"),
    },
  };
}

/**
 * Accept an employee login invitation and link the account to the HR record.
 *
 * Runs as the person who is signed in — never as an administrator — because the
 * whole point is that the account doing the accepting is the account that gets
 * linked. `hr.employee.login_user_id` is set here, which fires
 * `_zzz_derive_grants` and gives the person their own access for the first time.
 *
 * `hr_linked: false` is a SUCCESS, not a failure: the platform invitation was a
 * plain organization invite with no employee attached to it. The membership is
 * real, there is simply no HR record to link, and the caller should send the
 * person to the ordinary destination rather than to `/hr/me`.
 */
export async function acceptHrEmployeeInvite(
  token: string,
): Promise<HrResult<HrEmployeeInviteAcceptAck>> {
  const result = await callHrRaw(
    "hr_invite_accept",
    { p_token: token },
    { envelope: true, whatFailed: "This invitation", write: true },
  );
  if (!result.ok) return result;

  const row = result.data;
  return {
    ok: true,
    data: {
      hrLinked: row.hr_linked === true,
      employeeId: readText(row, "employee_id"),
      organizationId: readText(row, "organization_id"),
      loginUserId: readText(row, "login_user_id"),
      grantsRederived: row.grants_rederived === true,
      door: readText(row, "door"),
    },
  };
}

/** Set an org override on one configuration key (§10 / D13). */
export function setHrKnob(args: {
  organizationId: string;
  feature: string;
  key: string;
  value: unknown;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_knob_set",
    {
      p_organization_id: args.organizationId,
      p_feature: args.feature,
      p_key: args.key,
      p_value: args.value,
    },
    { envelope: true, whatFailed: "Saving this setting" },
  );
}

/** Clear an override — which REMOVES the key, never writes a null. */
export function clearHrKnob(args: {
  organizationId: string;
  feature: string;
  key: string;
}): Promise<HrResult<HrWriteAck>> {
  return callHrWrite(
    "hr_knob_clear",
    {
      p_organization_id: args.organizationId,
      p_feature: args.feature,
      p_key: args.key,
    },
    { envelope: true, whatFailed: "Clearing this override" },
  );
}

// ── The law portal (D25) — three doors, all MAPPED off the wire ─────────────
//
// 🚨 A REFUSAL FROM THE SAVE DOOR CARRIES THE ANSWER, NOT JUST A "NO".
// `unlawful_configuration` returns `validation.violations[]`, each with a sentence
// written for an HR admin, the citation behind it, and how many employees it
// affects. `callHrRaw` puts the whole envelope on `HrDenied.payload`, and
// `readHrLawValidation` below is how a surface gets at it without a cast. Never
// clamp a value the server refused — a refusal is a refusal.

function readNumber(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readObject(
  row: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = row[key];
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readRows(row: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = row[key];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
}

function mapHrLawCitation(value: unknown): HrLawCitation | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    authority: readText(row, "authority"),
    title: readText(row, "title"),
    url: readText(row, "url"),
    confidence: readText(row, "confidence"),
    retrieved_at: readText(row, "retrieved_at"),
    verified_at: readText(row, "verified_at"),
  };
}

/**
 * Anything that is not exactly `active` is reported as `advisory`.
 * Calling unverified law binding is the dangerous direction; the other way round
 * only under-claims.
 */
function mapHrLawStatus(row: Record<string, unknown>): HrLawRuleStatus {
  return readText(row, "status") === "active" ? "active" : "advisory";
}

function mapHrOrgConfigurable(row: Record<string, unknown>): HrOrgConfigurability {
  const value = readText(row, "org_configurable");
  return value === "more_generous_only" || value === "within_bounds" ? value : "no";
}

function mapHrLawRuleClass(row: Record<string, unknown>): HrLawRuleClass {
  return {
    id: readText(row, "id") ?? "",
    slug: readText(row, "slug") ?? "",
    label: readText(row, "label") ?? readText(row, "slug") ?? "",
    description: readText(row, "description"),
    org_configurable: mapHrOrgConfigurable(row),
    produces_money: row.produces_money === true,
    parameter_schema: readObject(row, "parameter_schema"),
  };
}

function mapHrPlatformLawRule(row: Record<string, unknown>): HrPlatformLawRule {
  return {
    id: readText(row, "id") ?? "",
    rule_class: readText(row, "rule_class") ?? "",
    rule_class_label: readText(row, "rule_class_label") ?? readText(row, "rule_class") ?? "",
    produces_money: row.produces_money === true,
    org_configurable: mapHrOrgConfigurable(row),
    jurisdiction_key: readText(row, "jurisdiction_key") ?? "",
    jurisdiction_name: readText(row, "jurisdiction_name"),
    jurisdiction_level: readText(row, "jurisdiction_level"),
    effective_from: readText(row, "effective_from"),
    effective_to: readText(row, "effective_to"),
    status: mapHrLawStatus(row),
    basis: readText(row, "basis"),
    citation: mapHrLawCitation(row.citation),
    parameters: readObject(row, "parameters") ?? {},
    applicability: row.applicability ?? null,
    unverified_keys: readTextArray(row, "unverified_keys"),
    version: readNumber(row, "version"),
    applies_to_org: row.applies_to_org === true,
    opted_out: row.opted_out === true,
  };
}

/** One D26 removal decision, mapped. `decided_by` is a user id, never a name. */
function mapHrLawOptOut(row: Record<string, unknown>): HrLawOptOut {
  return {
    rule_class: readText(row, "rule_class") ?? "",
    jurisdiction_key: readText(row, "jurisdiction_key") ?? "",
    reason: readText(row, "reason"),
    decided_at: readText(row, "decided_at"),
    decided_by: readText(row, "decided_by"),
  };
}

function mapHrOrgLawRule(row: Record<string, unknown>): HrOrgLawRule {
  return {
    id: readText(row, "id") ?? "",
    rule_class: readText(row, "rule_class") ?? "",
    rule_class_label: readText(row, "rule_class_label") ?? readText(row, "rule_class") ?? "",
    jurisdiction_key: readText(row, "jurisdiction_key") ?? "",
    jurisdiction_name: readText(row, "jurisdiction_name"),
    effective_from: readText(row, "effective_from"),
    effective_to: readText(row, "effective_to"),
    status: mapHrLawStatus(row),
    basis: readText(row, "basis"),
    citation: mapHrLawCitation(row.citation),
    parameters: readObject(row, "parameters") ?? {},
    applicability: row.applicability ?? null,
    version: readNumber(row, "version"),
  };
}

function mapHrLawFinding(row: Record<string, unknown>): HrLawValidationFinding {
  return {
    code: readText(row, "code"),
    message:
      readText(row, "message") ??
      "The server refused this configuration and did not phrase a reason.",
    field: readText(row, "field"),
    jurisdiction_key: readText(row, "jurisdiction_key"),
    jurisdiction_name: readText(row, "jurisdiction_name"),
    citation: mapHrLawCitation(row.citation),
    affected_employees: readNumber(row, "affected_employees"),
    configured: row.configured ?? null,
    required: row.required ?? null,
  };
}

function mapHrLawValidation(value: unknown): HrLawValidation | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    ok: typeof row.ok === "boolean" ? row.ok : null,
    violations: readRows(row, "violations").map(mapHrLawFinding),
    warnings: readRows(row, "warnings").map(mapHrLawFinding),
  };
}

/**
 * The validation block off a refusal envelope, mapped.
 *
 * `HrDenied.payload` is the whole envelope, which is where `unlawful_configuration`
 * and `warnings_unacknowledged` keep everything the person needs to read.
 */
export function readHrLawValidation(denied: HrDenied): HrLawValidation | null {
  return mapHrLawValidation(denied.payload?.validation);
}

/**
 * The org law portal (route `/hr/compliance/laws`).
 *
 * Refuses with `not_an_hr_admin` for anybody without HR-admin standing in this
 * employer — rendered in place as the no-access state, never a permission wall.
 */
export async function fetchHrLawPortal(
  organizationId: string,
): Promise<HrResult<HrLawPortal>> {
  const result = await callHrRaw(
    "hr_law_portal_data",
    { p_organization_id: organizationId },
    { envelope: true, whatFailed: "The law portal" },
  );
  if (!result.ok) return result;
  const row = result.data;
  return {
    ok: true,
    data: {
      org_jurisdiction_keys: readTextArray(row, "org_jurisdiction_keys"),
      chain_keys: readTextArray(row, "chain_keys"),
      classes: readRows(row, "classes").map(mapHrLawRuleClass),
      platform_rules: readRows(row, "platform_rules").map(mapHrPlatformLawRule),
      org_rules: readRows(row, "org_rules").map(mapHrOrgLawRule),
      opt_outs: readRows(row, "opt_outs").map(mapHrLawOptOut),
    },
  };
}

/**
 * D26 — the organization decides whether ONE platform rule applies to it.
 *
 * 🚨 REMOVAL IS REAL, NOT COSMETIC. `applies: false` writes an
 * `hr.jurisdiction_rule_org_decision` row and the resolver then excludes the rule
 * with a traced `opted_out_by_org` outcome — the platform stops enforcing that law
 * for this employer. So the caller must have made the consequence explicit BEFORE
 * this door is opened; nothing downstream will ask again.
 *
 * Keyed by (rule class × jurisdiction), never by rule id, so amending the platform
 * rule later cannot silently re-apply a law the organization removed.
 *
 * Refuses with `not_an_hr_admin` · `unknown_rule_class` · `unknown_jurisdiction`.
 */
export async function setHrPlatformLawRuleApplies(args: {
  organizationId: string;
  ruleClass: string;
  jurisdictionKey: string;
  applies: boolean;
  /** The org's own words for WHY. Optional, and never invented on their behalf. */
  reason?: string | null;
}): Promise<HrResult<HrLawAppliesAck>> {
  const result = await callHrRaw(
    "hr_org_jurisdiction_rule_set_applies",
    {
      p_organization_id: args.organizationId,
      p_rule_class: args.ruleClass,
      p_jurisdiction_key: args.jurisdictionKey,
      p_applies: args.applies,
      p_reason: args.reason ?? null,
    },
    {
      envelope: true,
      whatFailed: args.applies ? "Restoring this rule" : "Removing this rule",
      write: true,
    },
  );
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      decision: readText(result.data, "decision") === "opted_out" ? "opted_out" : "applies",
      rule_class: readText(result.data, "rule_class"),
      jurisdiction_key: readText(result.data, "jurisdiction_key"),
    },
  };
}

/**
 * Add or edit ONE of this organization's own rules.
 *
 * `acceptWarnings` is only ever set by an explicit human "Save anyway" after the
 * warnings have been read on screen — never pre-set, never remembered.
 */
export async function saveHrOrgLawRule(args: {
  organizationId: string;
  draft: HrOrgLawRuleDraft;
  acceptWarnings?: boolean;
}): Promise<HrResult<HrOrgLawRuleSaveAck>> {
  const result = await callHrRaw(
    "hr_org_jurisdiction_rule_save",
    {
      p_organization_id: args.organizationId,
      p_payload: {
        ...(args.draft.id ? { id: args.draft.id } : {}),
        rule_class: args.draft.rule_class,
        jurisdiction_key: args.draft.jurisdiction_key,
        effective_from: args.draft.effective_from ?? null,
        effective_to: args.draft.effective_to ?? null,
        parameters: args.draft.parameters,
        basis: args.draft.basis ?? null,
      },
      p_accept_warnings: args.acceptWarnings === true,
    },
    { envelope: true, whatFailed: "Saving this rule", write: true },
  );
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      rule_id: readText(result.data, "rule_id"),
      version: readNumber(result.data, "version"),
      validation: mapHrLawValidation(result.data.validation),
    },
  };
}

/** Retire one org rule. The statutory baseline underneath it is what takes over. */
export async function retireHrOrgLawRule(args: {
  organizationId: string;
  ruleId: string;
}): Promise<HrResult<{ rule_id: string | null }>> {
  const result = await callHrRaw(
    "hr_org_jurisdiction_rule_deactivate",
    { p_organization_id: args.organizationId, p_rule_id: args.ruleId },
    { envelope: true, whatFailed: "Retiring this rule", write: true },
  );
  if (!result.ok) return result;
  return { ok: true, data: { rule_id: readText(result.data, "rule_id") } };
}
