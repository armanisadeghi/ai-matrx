"use client";

/**
 * ExportRunList — the export history for a pay period (SPEC-UI-IA row 33), on `MatrxDataTable`.
 *
 * WHAT THIS SURFACE IS FOR. A payroll administrator standing in front of this table is answering
 * one of three questions: *did this period already go out?* · *what happened to the file I sent?* ·
 * *can I safely send a corrected one?* Every decision below serves those three and nothing else.
 *
 * ═══ THE FOUR RULES THIS COMPONENT EXISTS TO KEEP ══════════════════════════════════════════════
 *
 * 1. 🚨 **A REFUSAL IS NOT AN EMPTY TABLE.** `public.hr_payroll_export_list` answers
 *    `{granted:false, reason, capability}` when the reader lacks `payroll.read`. Rendering that as
 *    "no exports yet" tells a payroll administrator their access is fine when it is not, and the
 *    period silently never gets exported. The denial is rendered BY NAME, with the capability in
 *    it, and the table is not drawn at all.
 *
 * 2. 🚨 **AN ACKNOWLEDGED ROW'S SUPERSEDE CONTROL IS VISIBLY UNAVAILABLE, WITH THE REASON IN
 *    WORDS.** §4.5 answers `409 hr_export_already_acknowledged`, and there are exactly two wrong
 *    ways to handle that: an enabled button that 409s (the user learns the rule from a failure),
 *    and a silently missing button (the user learns nothing and assumes a bug). Both are the same
 *    mistake — discovering a payroll rule from the UI's behaviour instead of from its words. So
 *    every state that cannot supersede renders the entry DISABLED with its own `disabledReason`,
 *    and there are four different reasons because there are four different situations.
 *
 * 3. 🚨 **NO CLIENT COMPUTES MONEY OR HOURS.** `total_hours` and `total_amount` arrive as DECIMAL
 *    STRINGS and are displayed as decimal strings. Sorting a column is a comparison, not a
 *    computation, and it is done on a zero-PADDED STRING key ({@link decimalSortKey}) rather than
 *    by parsing to a float — binary floating point cannot represent 241880.12, and the one place
 *    that error is unacceptable is the file payroll is about to pay people from. `total_amount:
 *    null` renders as "—" and never as 0: a format that carries no money column is not a format
 *    whose money is zero.
 *
 * 4. **EVERY COLUMN SORTS AND FILTERS** (repo law for `MatrxDataTable`), including the two decimal
 *    columns and the artifact column, which filters on whether a file exists at all.
 *
 * ═══ WHERE THE FILE LIVES ══════════════════════════════════════════════════════════════════════
 * The row's side panel is the artifact's home. Clicking a row opens the canonical
 * `MatrxDataTable` detail panel, which fetches the E-23 URL envelope on demand and renders
 * `<ExportArtifactDownload>` — the one component that knows the durable-vs-expiring rule. The
 * envelope is deliberately NOT fetched for every row up front: it mints signed URLs, and minting
 * 25 of them to draw a table is a cost with no reader.
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileWarning,
  Layers,
  Loader2,
  MoreVertical,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { toast } from "@/lib/toast";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { formatLocalDate } from "@/features/hr/time/shared/format";

import { useExportHistory } from "../hooks/useExportHistory";
import { useExportRun } from "../hooks/useExportRun";
import { useIntentKeys } from "../hooks/useIntentKey";
import {
  acknowledgeExport,
  failExport,
  getExportArtifact,
  supersedeExport,
} from "../service";
import { toExportFailure, type ExportFailure } from "../errors";
import type {
  ExportDeliveryState,
  ExportEnvelope,
  PayrollExportHistoryRow,
} from "../types";
import { ExportAcknowledgeDialog } from "./ExportAcknowledgeDialog";
import { ExportArtifactDownload } from "./ExportArtifactDownload";
import { ExportFailDialog } from "./ExportFailDialog";
import { ExportPreconditionAlert } from "./ExportPreconditionAlert";
import { ExportSupersedeDialog } from "./ExportSupersedeDialog";
import { HrIdentityDoor, PayPeriodDoor } from "./HrIdentityDoor";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §4.5 — the state machine, as data. One place, so no cell and no menu re-derives it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const DELIVERY_STATES: ExportDeliveryState[] = [
  "generated",
  "sent",
  "acknowledged",
  "failed",
  "superseded",
];

/** How each state is spelled for a human. Never the raw token in a data cell. */
const STATE_LABEL: Record<ExportDeliveryState, string> = {
  generated: "Built, not sent",
  sent: "Sent to payroll",
  acknowledged: "Payroll accepted it",
  failed: "Failed",
  superseded: "Replaced",
};

const STATE_BADGE: Record<
  ExportDeliveryState,
  "neutral" | "info" | "success" | "destructive" | "outline"
> = {
  generated: "neutral",
  sent: "info",
  acknowledged: "success",
  failed: "destructive",
  superseded: "outline",
};

const CAN_DOWNLOAD: ReadonlySet<string> = new Set([
  "generated",
  "sent",
  "acknowledged",
]);
const CAN_ACKNOWLEDGE: ReadonlySet<string> = new Set(["generated", "sent"]);
const CAN_FAIL: ReadonlySet<string> = new Set(["generated", "sent"]);
/** 🚨 §4.5: generated | failed, and nothing else. `acknowledged` can NEVER be superseded. */
const CAN_SUPERSEDE: ReadonlySet<string> = new Set(["generated", "failed"]);

/**
 * 🚨 WHY THE SUPERSEDE CONTROL IS DISABLED, IN THE USER'S OWN LANGUAGE — per state, because the
 * situations are genuinely different and one generic sentence would be wrong three times out of
 * four. This is rule 2 at the top of the file, made concrete.
 */
const SUPERSEDE_BLOCKED_BECAUSE: Record<string, string> = {
  acknowledged:
    "Your payroll system has already taken this file. Replacing it would leave the same hours in payroll twice and people would be paid twice, so an acknowledged export can never be replaced. Record an adjustment instead — it lands in the next export, tagged back to this period.",
  sent: "This file has gone to payroll but nobody has told us what happened to it. Record the acknowledgement or record a failure first, so the replacement does not become a second live file.",
  superseded:
    "This version has already been replaced by a newer one. Replace the newest version instead.",
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Decimal display + sorting, WITHOUT ever producing a float (rule 3).
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A lexicographically-orderable key for a decimal STRING.
 *
 * Pure string manipulation: the integer part is left-padded and the fraction right-padded to fixed
 * widths, so plain string comparison orders the column correctly no matter what scale the server
 * sends. No `Number()`, no `parseFloat`, no arithmetic — the column can be sorted without any value
 * ever passing through binary floating point.
 *
 * (`localeCompare(…, {numeric:true})`, which the table would otherwise use, compares digit RUNS:
 * it reads "9.5" and "9.45" as 9 vs 9 then 5 vs 45 and puts 9.5 first. Correct today only because
 * every figure in this lane happens to arrive at two decimal places.)
 */
export function decimalSortKey(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const negative = value.trim().startsWith("-");
  const bare = value.trim().replace(/^[+-]/, "");
  const [whole = "0", fraction = ""] = bare.split(".");
  const key = `${whole.padStart(18, "0")}.${fraction.padEnd(8, "0")}`;
  // A negative amount (a clawback line) must sort below every positive one. Inverting the digits
  // is overkill for a payroll total; prefixing the sign class is enough for a single-column sort.
  return `${negative ? "0" : "1"}${key}`;
}

/** The server's own figure, verbatim. `null` is "—" and is NOT zero. */
function decimalText(value: string | null | undefined): string {
  return value == null || value === "" ? "—" : value;
}

function formatGeneratedAt(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString();
}

/** `generic_csv` → `Generic csv`. Headings and filter options only — never a data cell. */
function formatToken(token: string): string {
  const spaced = token.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The artifact section inside the row's detail panel.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the E-23 envelope for ONE export, on demand, when its row is opened.
 *
 * 🚨 Nothing here persists a URL. `<ExportArtifactDownload>` owns the durable-vs-expiring rule and
 * is the only component in this lane that touches the envelope's members.
 */
function ExportArtifactSection({
  row,
  mockCase,
}: {
  row: PayrollExportHistoryRow;
  mockCase?: HrFixtureCase;
}) {
  const [envelope, setEnvelope] = useState<ExportEnvelope | null>(null);
  const [failure, setFailure] = useState<ExportFailure | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setFailure(null);
    getExportArtifact(row.export_id, { mockCase })
      .then((next) => {
        if (!cancelled) setEnvelope(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setEnvelope(null);
        setFailure(toExportFailure(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row.export_id, mockCase]);

  if (!row.artifact_file_id) {
    return (
      <p className="text-xs text-muted-foreground">
        This version has no file. That is expected for a replaced draft that was
        never built, and it is why the file column can be empty on a real row
        rather than showing a broken link.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Getting a fresh link for this file…
      </div>
    );
  }

  if (failure) return <ExportPreconditionAlert failure={failure} />;
  if (!envelope) return null;

  return (
    <ExportArtifactDownload
      envelope={envelope}
      filenameHint={`payroll-export-v${row.export_version}.${row.export_format}`}
    />
  );
}

/** The full record behind one row — everything the nine columns cannot hold. */
function ExportRunDetail({
  row,
  mockCase,
}: {
  row: PayrollExportHistoryRow;
  mockCase?: HrFixtureCase;
}) {
  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATE_BADGE[row.delivery_state]}>
          {STATE_LABEL[row.delivery_state]}
        </Badge>
        <span className="text-xs text-muted-foreground">
          Version {row.export_version} · {formatToken(row.export_format)}
        </span>
        {row.includes_pii ? (
          <Badge variant="warning">Contains personal data</Badge>
        ) : null}
      </div>

      {/* 🚨 The failure record, visible — this is the `export-failed` state's evidence. */}
      {row.failure_reason ? (
        <Alert variant="destructive">
          <FileWarning className="h-4 w-4" aria-hidden />
          <AlertTitle>What went wrong with this version</AlertTitle>
          <AlertDescription>
            <p>{row.failure_reason}</p>
            <p className="mt-2 text-xs">
              This is kept with the export permanently, so the next person can
              see that this attempt did not land and does not send the same
              period twice.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Pay period</dt>
        <dd>
          <PayPeriodDoor
            payPeriodId={row.pay_period_id}
            label={`${formatLocalDate(row.period_start_on)} – ${formatLocalDate(row.period_end_on, { year: true })}`}
          />
        </dd>

        <dt className="text-muted-foreground">Lines</dt>
        <dd className="text-foreground">{row.line_count}</dd>

        <dt className="text-muted-foreground">Total hours</dt>
        <dd className="font-mono text-foreground">
          {decimalText(row.total_hours)}
        </dd>

        <dt className="text-muted-foreground">Total amount</dt>
        <dd className="font-mono text-foreground">
          {decimalText(row.total_amount)}
        </dd>

        <dt className="text-muted-foreground">Built</dt>
        <dd className="text-foreground">
          {formatGeneratedAt(row.generated_at)}
        </dd>

        {row.sent_at ? (
          <>
            <dt className="text-muted-foreground">Sent</dt>
            <dd className="text-foreground">{formatGeneratedAt(row.sent_at)}</dd>
          </>
        ) : null}

        {row.acknowledgement_ref ? (
          <>
            <dt className="text-muted-foreground">Payroll&apos;s reference</dt>
            <dd className="font-mono text-foreground">
              {row.acknowledgement_ref}
            </dd>
          </>
        ) : null}

        {row.supersedes_export_id ? (
          <>
            <dt className="text-muted-foreground">Replaces</dt>
            <dd className="font-mono text-foreground">
              version before this one ({row.supersedes_export_id})
            </dd>
          </>
        ) : null}
      </dl>

      {row.includes_adjustment_ids.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Carries {row.includes_adjustment_ids.length} post-lock adjustment
          {row.includes_adjustment_ids.length === 1 ? "" : "s"} tagged back to
          this period.
        </p>
      ) : null}

      {/*
        §4.4 — disputes travel to the export as EVIDENCE. The export never resolves them, so this
        section states what it is: a note that someone disagrees, riding along with the file.
      */}
      {row.disputes_carried.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-foreground">
            Carried into this file with a dispute noted
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Exporting does not settle a dispute. These hours went out as they
            stood, and the disagreement is still open.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {row.disputes_carried.map((dispute) => (
              <li key={dispute.employment_id}>
                <HrIdentityDoor
                  kind="employment"
                  id={dispute.employment_id}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-medium text-foreground">The file</p>
        <ExportArtifactSection row={row} mockCase={mockCase} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The list
// ─────────────────────────────────────────────────────────────────────────────────────────────

type PendingDialog =
  | { kind: "acknowledge" | "fail" | "supersede"; row: PayrollExportHistoryRow }
  | null;

export function ExportRunList({
  payPeriodId,
  mockCase,
  refreshToken,
}: {
  /** The period whose exports these are, or `null` for every export in the org. */
  payPeriodId: string | null;
  /** Which §6.4 fixture case to render. Ignored unless `NEXT_PUBLIC_HR_MOCK=1`. */
  mockCase?: HrFixtureCase;
  /** Bump to re-read the history — a sibling surface generated a new export. */
  refreshToken?: number;
}) {
  // 🚨 THE EMPLOYER COMES FROM THE HR CONTEXT, NOT FROM THE REDUX ACTIVE ORG. Every other feature
  // scopes to the user's selected organization; HR does not. SPEC-UI-IA §1 resolves the active
  // employer from `?org=` FIRST, and HR is strictly single-employer — so the Redux selection would
  // show one employer's payroll exports on a page opened for another. That is not a scoping bug,
  // it is two employers' pay data merged on one screen. `useExportHistory` resolves it once.
  const history = useExportHistory(payPeriodId, { mockCase });
  const organizationId = history.organizationId;
  const intentKeys = useIntentKeys();
  const [dialog, setDialog] = useState<PendingDialog>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<ExportFailure | null>(null);

  const reload = history.reload;
  // A supersede answers 202, so the surface follows the RUNTIME SPINE and re-reads the durable
  // history when the run settles — the run is a server row, not a browser session.
  const run = useExportRun({ onSettled: () => reload() });

  useEffect(() => {
    if (refreshToken === undefined) return;
    reload();
  }, [refreshToken, reload]);

  const rows = history.result?.granted ? history.result.exports : [];

  /**
   * One mutation path, so every action gets the same idempotency + failure discipline.
   *
   * The resolved organization id is handed to the callback rather than read from the closure: every
   * §3 body carries `organization_id` explicitly, and the platform's rule is that no resolver
   * anywhere may pick one silently. Passing it makes the guard above the only place scope is
   * decided.
   */
  const runMutation = async (
    row: PayrollExportHistoryRow,
    verb: "acknowledge" | "fail" | "supersede",
    payload: string,
    call: (idempotencyKey: string, orgId: string) => Promise<void>,
  ) => {
    if (!organizationId) return;
    setBusyId(row.export_id);
    setFailure(null);
    try {
      // 🚨 ONE key per intent, reused across every retry of that intent (§1.4). The payload is
      // part of the intent's identity: acknowledging with a different reference is a different
      // statement about the world, not a retry.
      await call(
        intentKeys.forIntent(verb, row.export_id, payload),
        organizationId,
      );
      reload();
    } catch (err: unknown) {
      const next = toExportFailure(err);
      setFailure(next);
      // Scream, never swallow — a mutation that quietly does nothing reads as "it worked".
      toast.error(next.userMessage);
      throw err;
    } finally {
      setBusyId(null);
    }
  };

  const onAcknowledge = async (
    row: PayrollExportHistoryRow,
    acknowledgementRef: string,
  ) => {
    await runMutation(
      row,
      "acknowledge",
      acknowledgementRef,
      async (key, orgId) => {
        await acknowledgeExport(
          row.export_id,
          {
            organization_id: orgId,
            acknowledgement_ref: acknowledgementRef,
          },
          key,
          { mockCase },
        );
        toast.success(`Version ${row.export_version} is recorded as accepted.`);
      },
    );
  };

  const onFail = async (row: PayrollExportHistoryRow, reason: string) => {
    await runMutation(row, "fail", reason, async (key, orgId) => {
      await failExport(
        row.export_id,
        { organization_id: orgId, failure_reason: reason },
        key,
        { mockCase },
      );
      toast.success(`The failure is on version ${row.export_version}'s record.`);
    });
  };

  const onSupersede = async (row: PayrollExportHistoryRow, reason: string) => {
    await runMutation(row, "supersede", reason, async (key, orgId) => {
      const accepted = await supersedeExport(
        row.export_id,
        { organization_id: orgId, reason },
        key,
        { mockCase },
      );
      run.follow(accepted);
    });
  };

  const menuFor = (
    row: PayrollExportHistoryRow,
    openDetail: () => void,
  ): ItemMenuConfig => ({
    sections: [
      {
        id: "file",
        items: [
          {
            id: "download",
            label: "Open the file and its checksum",
            icon: Download,
            disabled: !CAN_DOWNLOAD.has(row.delivery_state) || !row.artifact_file_id,
            disabledReason: !row.artifact_file_id
              ? "This version was never built into a file."
              : "A replaced version's file is kept as a record but is not offered for download.",
            onSelect: openDetail,
          },
        ],
      },
      {
        id: "state",
        label: "What payroll did with it",
        items: [
          {
            id: "acknowledge",
            label: "Record that payroll accepted it",
            icon: CheckCircle2,
            disabled: !CAN_ACKNOWLEDGE.has(row.delivery_state),
            disabledReason:
              row.delivery_state === "acknowledged"
                ? "Already recorded as accepted."
                : "Only a file that has been built or sent can be marked accepted.",
            onSelect: () => setDialog({ kind: "acknowledge", row }),
          },
          {
            id: "fail",
            label: "Record that it failed",
            icon: AlertTriangle,
            disabled: !CAN_FAIL.has(row.delivery_state),
            disabledReason:
              row.delivery_state === "failed"
                ? "This version's failure is already recorded."
                : "Only a file that has been built or sent can be marked failed.",
            onSelect: () => setDialog({ kind: "fail", row }),
          },
        ],
      },
      {
        id: "replace",
        items: [
          {
            id: "supersede",
            label: "Replace it with a new file",
            icon: Layers,
            // 🚨 RULE 2. Never silently absent, never enabled-then-409: disabled, with the reason.
            disabled: !CAN_SUPERSEDE.has(row.delivery_state),
            disabledReason: SUPERSEDE_BLOCKED_BECAUSE[row.delivery_state],
            onSelect: () => setDialog({ kind: "supersede", row }),
          },
        ],
      },
    ],
  });

  const columns: MatrxColumnDef<PayrollExportHistoryRow>[] = [
    // On the org-wide list an export without its period names nothing a person can act on, so the
    // period leads — and it is a real door (`PayPeriodDoor`), not a bare id.
    ...(payPeriodId === null
      ? [
          {
            id: "pay_period",
            accessorFn: (row: PayrollExportHistoryRow) =>
              `${row.period_start_on} – ${row.period_end_on}`,
            header: "Pay period",
            filter: "text" as const,
            cell: (row: PayrollExportHistoryRow) => (
              <PayPeriodDoor
                payPeriodId={row.pay_period_id}
                // The `?org=` reference travels with the link — HR resolves the employer from
                // the URL before anything else, so a door that drops it lands the reader in a
                // different employer's period.
                orgRef={history.orgRef}
                label={`${formatLocalDate(row.period_start_on)} – ${formatLocalDate(row.period_end_on, { year: true })}`}
              />
            ),
          },
        ]
      : []),
    {
      accessorKey: "export_version",
      header: "Version",
      filter: "number",
      align: "right",
      width: 90,
      cell: (row) => (
        <span className="font-medium text-foreground">
          v{row.export_version}
        </span>
      ),
    },
    {
      accessorKey: "export_format",
      header: "Format",
      filter: "select",
      cell: (row) => (
        <span className="text-foreground">{formatToken(row.export_format)}</span>
      ),
    },
    {
      accessorKey: "delivery_state",
      header: "Delivery",
      filter: "select",
      // Every state is offered even when this period has never reached one — a filter that only
      // lists what happens to be on screen cannot be used to ask "has anything failed?".
      filterOptions: DELIVERY_STATES.map((state) => ({
        value: state,
        label: STATE_LABEL[state],
      })),
      cell: (row) => (
        <Badge variant={STATE_BADGE[row.delivery_state]}>
          {STATE_LABEL[row.delivery_state]}
        </Badge>
      ),
    },
    {
      accessorKey: "line_count",
      header: "Lines",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums text-foreground">{row.line_count}</span>
      ),
    },
    {
      id: "total_hours",
      // 🚨 A padded STRING key, never a float (rule 3).
      accessorFn: (row) => decimalSortKey(row.total_hours),
      header: "Total hours",
      filter: "text",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-foreground">
          {decimalText(row.total_hours)}
        </span>
      ),
    },
    // 🚨 THE MONEY COLUMN IS CONDITIONAL, BECAUSE A FIELD THE VIEWER CANNOT ACCESS IS ABSENT FROM
    // THE DOM (SPEC-UI-IA §4.2, binding on every HR surface — see
    // `features/hr/shared/useVisibleFields.ts`). Not disabled, not masked, not "••••", and above
    // all not a header over blank cells: a heading with nothing under it tells the viewer what
    // exists and taunts them with it. The rule's own mechanical test is `name in source` — the
    // reader returns ONLY the keys this viewer may see — so an absent key means no column at all.
    // A key that is PRESENT and null is the other fact entirely (you may see amounts; this format
    // carries none) and renders as "—", never as 0.
    ...(rows.some((row) => "total_amount" in row)
      ? [
          {
            id: "total_amount",
            accessorFn: (row: PayrollExportHistoryRow) =>
              decimalSortKey(row.total_amount),
            header: "Total amount",
            filter: "text" as const,
            align: "right" as const,
            cell: (row: PayrollExportHistoryRow) => (
              <span className="font-mono text-foreground">
                {decimalText(row.total_amount)}
              </span>
            ),
          },
        ]
      : []),
    {
      accessorKey: "generated_at",
      header: "Built",
      filter: "text",
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatGeneratedAt(row.generated_at)}
        </span>
      ),
    },
    {
      accessorKey: "acknowledgement_ref",
      header: "Payroll's reference",
      filter: "text",
      mobileHidden: true,
      cell: (row) =>
        row.acknowledgement_ref ? (
          <span className="font-mono text-xs text-foreground">
            {row.acknowledgement_ref}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "artifact",
      accessorFn: (row) => row.artifact_file_id !== null,
      header: "File",
      filter: "boolean",
      mobileHidden: true,
      cell: (row) =>
        row.artifact_file_id ? (
          <span
            className="font-mono text-xs text-muted-foreground"
            title={row.artifact_sha256 ?? undefined}
          >
            {row.artifact_sha256 ? row.artifact_sha256.slice(0, 10) : "attached"}
          </span>
        ) : (
          <span className="text-muted-foreground">No file</span>
        ),
    },
  ];

  // ── The named refusal. RULE 1: this is not an empty table. ──────────────────────────────────
  if (history.result && !history.result.granted) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" aria-hidden />
        <AlertTitle>You cannot see payroll exports for this employer</AlertTitle>
        <AlertDescription>
          <p>{history.result.reason}</p>
          {history.result.capability ? (
            <p className="mt-2">
              You need the{" "}
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                {history.result.capability}
              </span>{" "}
              permission. Ask whoever administers HR for this employer to add
              it to your access role.
            </p>
          ) : null}
          <p className="mt-2 text-xs">
            This is a permissions answer, not an empty list — there may well be
            exports here that you are not allowed to see.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (history.awaitingOrganization) {
    return (
      <Alert>
        <ShieldAlert className="h-4 w-4" aria-hidden />
        <AlertTitle>Pick an employer first</AlertTitle>
        <AlertDescription>
          Payroll exports belong to one employer. Choose one in the organization
          picker and this list will fill in.
        </AlertDescription>
      </Alert>
    );
  }

  // The newest row's failure is a PAGE state (SPEC-UI-IA row 33 `export-failed`), not a detail
  // buried in a side panel: it is the reason this period has not gone out.
  const newestFailed =
    rows.length > 0 && rows[0].delivery_state === "failed" ? rows[0] : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {history.failure ? (
        <ExportPreconditionAlert failure={history.failure} />
      ) : null}
      {failure ? <ExportPreconditionAlert failure={failure} /> : null}

      {newestFailed ? (
        <Alert variant="destructive">
          <FileWarning className="h-4 w-4" aria-hidden />
          <AlertTitle>
            The most recent export for this period failed
          </AlertTitle>
          <AlertDescription>
            <p>
              {newestFailed.failure_reason ??
                "No reason was recorded with this failure."}
            </p>
            <p className="mt-2">
              Nothing was paid from version {newestFailed.export_version}.
              Building a replacement is safe, and both files are kept.
            </p>
            <Button
              size="sm"
              className="mt-3"
              disabled={busyId === newestFailed.export_id}
              onClick={() =>
                setDialog({ kind: "supersede", row: newestFailed })
              }
            >
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
              Build a replacement
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {run.phase === "not_observable" ? (
        <Alert>
          <Loader2 className="h-4 w-4" aria-hidden />
          <AlertTitle>The replacement was accepted</AlertTitle>
          <AlertDescription>
            This environment serves HR from fixtures, so there is no run to
            watch. On a real server the new version appears in this list when
            the run finishes.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="min-h-0 flex-1">
        <MatrxDataTable<PayrollExportHistoryRow>
          data={rows}
          columns={columns}
          getRowId={(row) => row.export_id}
          isLoading={history.isLoading}
          zebra
          pageSize={25}
          detail={{
            enabled: true,
            title: (row) => `Version ${row.export_version}`,
            description: (row) => STATE_LABEL[row.delivery_state],
            render: (row) => <ExportRunDetail row={row} mockCase={mockCase} />,
          }}
          window={{ enabled: false }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search this period's exports…",
            actions: (
              <Button size="sm" variant="outline" onClick={() => reload()}>
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                Refresh
              </Button>
            ),
          }}
          emptyState={{
            icon: <Layers className="h-6 w-6" aria-hidden />,
            title: "This period has never been exported",
            description:
              "Nothing has been built for payroll yet. Preview the file first — looking costs nothing and creates no record.",
          }}
          rowActions={(row, controls) => (
            <ItemMenu align="end" config={menuFor(row, controls.openDetail)}>
              <button
                type="button"
                aria-label={`Actions for version ${row.export_version}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                {busyId === row.export_id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <MoreVertical className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
            </ItemMenu>
          )}
        />
      </div>

      {dialog?.kind === "acknowledge" ? (
        <ExportAcknowledgeDialog
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null);
          }}
          exportVersion={dialog.row.export_version}
          onConfirm={(ref) => onAcknowledge(dialog.row, ref)}
        />
      ) : null}

      {dialog?.kind === "fail" ? (
        <ExportFailDialog
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null);
          }}
          exportVersion={dialog.row.export_version}
          onConfirm={(reason) => onFail(dialog.row, reason)}
        />
      ) : null}

      {dialog?.kind === "supersede" ? (
        <ExportSupersedeDialog
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null);
          }}
          exportVersion={dialog.row.export_version}
          onConfirm={(reason) => onSupersede(dialog.row, reason)}
        />
      ) : null}
    </div>
  );
}
