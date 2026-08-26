/**
 * features/hr/time/exports/exportPresentation.ts — every export DECISION the surface makes, as pure
 * functions, so each one can be exercised from a non-browser client (L3-76 / acceptance target T-14).
 *
 * WHAT THIS FILE IS NOT
 * ---------------------
 * It is not a client for the export engine. That is `features/hr/exports/service.ts` (lane L13) and
 * this lane does not own it, does not wrap it and does not duplicate it — the nine frozen operations
 * E-18…E-26, the `X-Idempotency-Key` discipline, the §4.4 precondition classifier and the history
 * read all live there and are imported. **The payroll-export ENGINE is lane L13 / HRB-025** (R-L3
 * U-02 moved export generation onto the server lane); L3 builds the surfaces and no export RPC.
 *
 * What lives here is what the SURFACE must decide: which formats may be chosen and which must be
 * shown as unavailable-with-a-reason, which delivery states may still be acted on, and whether a run
 * that came back is actually a success. Each of those is a law with a money consequence, and each is
 * a pure function precisely so it can be proven without a browser.
 *
 * NO CLIENT COMPUTES HOURS OR MONEY. Every figure that passes through here is a **decimal string**
 * carried verbatim from the server. Parsing `total_amount` into a JS number to compare or re-format
 * it is a defect: binary floating point cannot represent 241880.12, and the one place that error is
 * unacceptable is the file payroll is about to pay people from.
 */

import type {
  ExportDeliveryState,
  ExportFormat,
  ExportFormatKey,
  PayrollExportHistoryRow,
} from "@/features/hr/exports/types";

// ---------------------------------------------------------------------------------------------
// The format registry — read, never hard-coded
// ---------------------------------------------------------------------------------------------

/**
 * 🚨 THE DEFAULT IS `generic_csv`, NOT QUICKBOOKS (R-L3 U-11, SPEC-CONTRACTS §4.3).
 *
 * This constant is **not a format list** — the list is `GET /hr/exports/formats` and hard-coding one
 * is the defect this whole module exists to avoid. It is the single key the picker prefers when the
 * server offers it, because `generic_csv` is the always-available floor: full line grain, our own
 * identifiers, no mapping required, and what an org uses on day one before any integration is
 * configured. The QuickBooks Online column list is not published by Intuit and is an open item, so
 * defaulting to it would default every org to a format that cannot be generated.
 */
export const PREFERRED_DEFAULT_FORMAT: ExportFormatKey = "generic_csv";

export interface FormatPartition {
  /** Selectable. Rendered as choices. */
  available: ExportFormat[];
  /**
   * 🚨 Rendered as **visibly unavailable with the reason** — never as a choice that fails at
   * generation, and never hidden. A format silently missing from the list is indistinguishable from
   * a format we never supported, and the org that asked for QuickBooks needs to see that we know.
   */
  unavailable: Array<{ format: ExportFormat; reason: string }>;
}

/**
 * Split the server's registry into what may be chosen and what may not, attaching a reason to every
 * unavailable row.
 *
 * The reason is the server's `notes` when it gave one. The fallback sentence is deliberately honest
 * rather than reassuring: we say the column list is not settled, because "coming soon" on a payroll
 * format is a promise about somebody's paycheque.
 */
export function partitionFormats(formats: ExportFormat[]): FormatPartition {
  const available: ExportFormat[] = [];
  const unavailable: Array<{ format: ExportFormat; reason: string }> = [];

  for (const format of formats) {
    if (format.available) {
      available.push(format);
      continue;
    }
    unavailable.push({
      format,
      reason:
        format.notes?.trim() ||
        "The column list for this format is not settled yet, so we cannot promise a file that " +
          "will import correctly. Use the generic CSV until it is.",
    });
  }

  return { available, unavailable };
}

/**
 * Which format the picker should land on.
 *
 * Preference order, and every step is deliberate:
 *   1. `generic_csv` when the server says it is available — the floor, and U-11's ruling.
 *   2. otherwise the first available format the server listed, because the server's order is the
 *      server's opinion and this client has no better one.
 *   3. otherwise `null` — **no silent fall-back onto an unavailable format.** A picker that
 *      pre-selects something that cannot be generated has turned a clear "not yet" into a failure
 *      at generation time, which is precisely what §4.3 forbids.
 */
export function defaultFormatKey(formats: ExportFormat[]): ExportFormatKey | null {
  const { available } = partitionFormats(formats);
  const preferred = available.find((f) => f.key === PREFERRED_DEFAULT_FORMAT);
  if (preferred) return preferred.key;
  return available[0]?.key ?? null;
}

/**
 * The identifiers this format needs mapped before anything can be generated.
 *
 * Rendered BEFORE the preview, as a heads-up, because `POST /hr/exports/payroll` answers
 * `400 hr_validation_error` with `details.unmapped[]` rather than emitting a file with blanks in the
 * identifier column — and **a payroll file with a missing employee id is worse than no file**: it
 * fails silently downstream, in someone else's system, after money moved.
 */
export function mappingRequirements(format: ExportFormat | null): string[] {
  return format?.requires_mapping ?? [];
}

// ---------------------------------------------------------------------------------------------
// The delivery-state machine — what may still be done to an export
// ---------------------------------------------------------------------------------------------

export const DELIVERY_STATE_LABEL: Record<ExportDeliveryState, string> = {
  generated: "Generated",
  sent: "Sent",
  acknowledged: "Acknowledged by payroll",
  failed: "Delivery failed",
  superseded: "Superseded",
};

export const DELIVERY_STATE_MEANING: Record<ExportDeliveryState, string> = {
  generated: "The file exists and has not been delivered yet.",
  sent: "The file went to the receiving system. We are waiting for them to confirm it.",
  acknowledged:
    "Payroll has taken this file. It can never be superseded, regenerated or re-sent — a re-export double-pays.",
  failed: "The receiving system rejected this file. The failure is recorded and a new version can be generated.",
  superseded: "A later version replaced this one. This file is retained forever as evidence of what was nearly sent.",
};

/** Whether a control is offered, and — when it is not — the sentence that says why. */
export interface ControlAvailability {
  offered: boolean;
  /**
   * 🚨 Never null when `offered` is false. §4.5's rule is that route 33 renders the supersede
   * control as **absent once acknowledged, with the reason** — an absent control with no explanation
   * teaches a payroll administrator that the product is broken rather than that the rule is real.
   */
  reason: string | null;
}

const OFFERED: ControlAvailability = { offered: true, reason: null };

/**
 * 🚨 THE ONE RULE THAT PREVENTS DOUBLE PAYMENT.
 *
 * An `acknowledged` export can never be superseded, regenerated or re-sent (SPEC-CONTRACTS §4.5,
 * SPEC-TIME §7.2). E-26 answers `409 hr_export_already_acknowledged`, and if that code ever reaches
 * a user it means this function returned the wrong answer — the control should have been absent,
 * with the reason stated in words, before the click.
 *
 * "Whether an acknowledged export can be superseded" is on SPEC-TIME §13's explicit list of things
 * that are **deliberately not a knob**. There is no org setting that changes this and there never
 * will be: a law with an override switch is a default.
 */
export function supersedeAvailability(row: PayrollExportHistoryRow): ControlAvailability {
  if (row.delivery_state === "acknowledged") {
    const ref = row.acknowledgement_ref ? ` (reference ${row.acknowledgement_ref})` : "";
    return {
      offered: false,
      reason:
        `Payroll accepted this file${ref}, so it can never be superseded, regenerated or re-sent — ` +
        `a second file would pay these hours twice. Corrections go on the next payroll run instead, ` +
        `as an adjustment tagged back to this period.`,
    };
  }
  if (row.delivery_state === "superseded") {
    return {
      offered: false,
      reason:
        "A later version already replaced this one. Supersede the current version instead; this " +
        "file is retained as evidence of what was nearly sent.",
    };
  }
  if (row.delivery_state === "sent") {
    return {
      offered: false,
      reason:
        "This file has gone to payroll and we are waiting for them to confirm or reject it. " +
        "Record their answer first — a supersede now would race their import.",
    };
  }
  // `generated` and `failed` are §4.5's two legal entrances to `superseded`.
  return OFFERED;
}

/** E-24. Only a delivered file can be acknowledged, and only once. */
export function acknowledgeAvailability(row: PayrollExportHistoryRow): ControlAvailability {
  if (row.delivery_state === "acknowledged") {
    return { offered: false, reason: "Already acknowledged. An acknowledgement is recorded once." };
  }
  if (row.delivery_state === "superseded") {
    return { offered: false, reason: "This version was replaced. Acknowledge the current version." };
  }
  if (row.delivery_state === "failed") {
    return {
      offered: false,
      reason:
        "This delivery failed. Generate a new version and acknowledge that one — acknowledging a " +
        "failed file would record that payroll took a file they rejected.",
    };
  }
  return OFFERED;
}

/**
 * E-25. A failure is a **record beside the retry door**, never a swallowed error and never a toast
 * that disappears. `failed` is a durable state on the row, and the failed artifact stays on disk
 * forever.
 */
export function failAvailability(row: PayrollExportHistoryRow): ControlAvailability {
  if (row.delivery_state === "acknowledged") {
    return {
      offered: false,
      reason:
        "Payroll already accepted this file. If something is wrong with it, the correction is an " +
        "adjustment on the next run — not a retroactive failure on a file that was paid.",
    };
  }
  if (row.delivery_state === "superseded") {
    return { offered: false, reason: "This version was replaced. Record the failure on the current version." };
  }
  if (row.delivery_state === "failed") {
    return { offered: false, reason: "The failure on this version is already recorded." };
  }
  return OFFERED;
}

// ---------------------------------------------------------------------------------------------
// Was the run actually a success? — FREEZE §4 D-13
// ---------------------------------------------------------------------------------------------

/** One unit the engine could not finish. Rendered individually; a count is not enough. */
export interface FailedUnit {
  workweek_id?: string;
  employment_id?: string;
  error?: string;
  message?: string;
}

/** The async run's envelope, as far as this surface reads it. */
export interface RunEnvelope {
  status?: string;
  result?: { failed_units?: FailedUnit[] } & Record<string, unknown>;
}

export type RunVerdict =
  | { kind: "succeeded" }
  /** 🚨 A REAL TERMINAL STATE. Never rendered under a success banner. */
  | { kind: "partial"; failedUnits: FailedUnit[]; sentence: string }
  | { kind: "failed" }
  | { kind: "running" };

/**
 * 🚨 `partial` IS A REAL TERMINAL STATE, NOT A ROUNDING OF `succeeded`
 * (SPEC-CONTRACTS §1.5, FREEZE §4 D-13).
 *
 * A recompute that finished 410 of 412 workweeks produced 410 correct answers **and 2 that must be
 * seen**. Collapsing that into either `succeeded` or `failed` loses exactly the information a
 * payroll administrator needs to act.
 *
 * D-13 goes further and this function implements the harder half: **a run reported complete with a
 * non-empty `failed_units` is not a success**, whatever the runtime spine's own status column ends
 * up admitting. So `failed_units` is checked BEFORE `status`, and a `status: "completed"` envelope
 * carrying failures still returns `partial`. The spine's vocabulary is allowed to be poorer than the
 * truth; the surface is not.
 */
export function classifyRun(envelope: RunEnvelope | null | undefined): RunVerdict {
  if (!envelope) return { kind: "running" };

  const failedUnits = envelope.result?.failed_units ?? [];
  const status = envelope.status;

  if (failedUnits.length > 0) {
    const n = failedUnits.length;
    return {
      kind: "partial",
      failedUnits,
      sentence:
        `${n} ${n === 1 ? "unit" : "units"} did not finish. This run is not a success — the rest of ` +
        `it completed, and ${n === 1 ? "this one needs" : "these need"} a human before payroll relies ` +
        `on the numbers.`,
    };
  }

  if (status === "partial") {
    // The spine said `partial` but handed us no units. Still not a success — and say what is missing
    // rather than inventing a clean result out of an incomplete report.
    return {
      kind: "partial",
      failedUnits: [],
      sentence:
        "The engine reported this run as partial but did not name which units failed. Treat the " +
        "numbers as unverified and re-run before exporting.",
    };
  }

  if (status === "completed" || status === "succeeded") return { kind: "succeeded" };
  if (status === "failed" || status === "error" || status === "cancelled") return { kind: "failed" };
  return { kind: "running" };
}

// ---------------------------------------------------------------------------------------------
// Money that is absent, and money that is zero
// ---------------------------------------------------------------------------------------------

/**
 * 🚨 MONEY IS **ABSENT** WHEN A CONTRIBUTING RULE IS ADVISORY — never a zero, never a dash, never a
 * guess (SPEC-TIME §0 law 4, SPEC-JURISDICTION §7.3 invariant 2).
 *
 * On the export lane the rule bites twice and the two are different, so both are built:
 *
 *  - **Generation refuses the WHOLE RUN.** `POST /hr/exports/payroll` answers
 *    `422 hr_advisory_rule_blocks_money`. An export refuses; it does not omit a line. E-19's preview
 *    named the blocking lines before anyone committed. (That path is `classifyPrecondition` in
 *    `features/hr/exports/errors.ts`.)
 *  - **On screen, a stored row's amount can legitimately be null** — a timesheet-shaped format
 *    carries no money column at all. This function tells the two apart from the surface's point of
 *    view: there is no amount to show, so **no amount is shown**, and the reason is said in words.
 *
 * The return value is deliberately a discriminated union with no numeric member on the absent
 * branch, so a caller cannot accidentally `?? 0` its way past the law.
 */
export type AmountDisplay =
  | { present: true; decimalString: string }
  | { present: false; sentence: string };

export function amountDisplay(
  row: Pick<PayrollExportHistoryRow, "total_amount" | "export_format">,
): AmountDisplay {
  if (typeof row.total_amount === "string" && row.total_amount.length > 0) {
    // Carried verbatim. Never parsed into a float — see this file's header.
    return { present: true, decimalString: row.total_amount };
  }
  return {
    present: false,
    sentence:
      "This file carries hours, not amounts. Nothing has been calculated as money here, so no " +
      "figure is shown — a zero would read as nothing owed.",
  };
}

/**
 * The export lane's one-way invariant, in the words the surface must say (SPEC-TIME §7.2, AR 1.6).
 * Rendered once on the export panel, always — an administrator who believes a paycheque comes back
 * from this integration will go looking for one.
 */
export const ONE_WAY_NOTICE =
  "Payroll exports go one way. Hours and earnings go out; no paycheque, no net pay and no tax " +
  "figure ever comes back.";
