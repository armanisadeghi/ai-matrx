"use client";

// features/hr/people/profile/tabs/JobTab.tsx — SPEC-EMPLOYEES §2.3.3, §6
//
// THE TAB THAT MAKES EFFECTIVE DATING REAL. Five rules it lives by:
//
//  1. SPELLS ARE ROWS, NEVER EDITS. A rehire is a SECOND `hr.employment` row
//     with `spell_number = 2`. Both render, most recent first, with the service
//     dates that carry across (original hire · adjusted service · this hire).
//     A terminated spell renders READ-ONLY with its close dates.
//  2. EVERY HISTORY ROW CARRIES BOTH TIME AXES. The effective window (when the
//     fact was true) AND the system-time line — "Recorded 25 Aug 2026 by Dana
//     Ruiz", with the ACTOR TAXONOMY resolved. §6.4 is explicit that "Changed by
//     user" is insufficient: "a connected system did it" and "their manager did
//     it" are different answers.
//  3. A FUTURE-DATED ASSIGNMENT DOES NOT MOVE THE HEADER. It is a real row with
//     a future `effective_from`, it is PENDING (not a draft), and it lives in
//     the pending panel until its date arrives.
//  4. A LOCATION CHANGE IS A JURISDICTION CHANGE. The form states the new
//     jurisdiction and what it affects — OT rules, sick-leave floor, final-pay
//     deadline — BEFORE the user commits, not in a toast afterwards.
//  5. A TITLE CHANGE OFFERS THE TITLE'S DEFAULTS AS SUGGESTIONS. Never a silent
//     overwrite of FLSA status or pay basis.

import { useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, ExternalLink, Pencil } from "lucide-react";

import DataRowWindow from "@/components/official/matrx-data-table/DataRowWindow.dynamic";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { HrError, HrLoading } from "../../../shared/HrStates";
import { PendingChangesPanel } from "../../../shared/PendingChangesPanel";
import { hrStructureFocusHref, type HrOrgRef } from "../../../routes";
import type { HrEmployeeProfile } from "../../../types";
import { formatFullDate, formatRecordedAt } from "../../shared/HrStatusChip";
import { HrWorkerClassChip } from "../../shared/HrWorkerClassChip";
import { HrStructureDoor } from "../../doors/HrPersonDoor";
import { MoreSection } from "../MoreSection";
import {
  actorKindOf,
  actorKindWords,
  readBoolean,
  readNumber,
  readString,
  useHrEmploymentHistory,
} from "../useHrProfile";
import { ChangePositionForm } from "../ChangePositionForm";

type Row = Record<string, unknown>;

export function JobTab({
  profile,
  org,
  assignmentParam,
  className,
}: {
  profile: HrEmployeeProfile;
  org: HrOrgRef;
  /** `?assignment=<id>` — the new-tab-able form of the in-place row window. */
  assignmentParam?: string | null;
  className?: string;
}) {
  const history = useHrEmploymentHistory(profile.header.employee_id);
  const [openAssignment, setOpenAssignment] = useState<string | null>(
    assignmentParam ?? null,
  );
  const [changing, setChanging] = useState<null | "position" | "transfer">(null);

  const canWrite = profile.capabilities.includes("identity.write");
  const employmentId = profile.header.employment_id;

  if (history.isLoading) return <HrLoading variant="panel" rows={6} />;
  if (history.error) {
    return (
      <HrError
        operation="This person's employment history"
        error={history.error}
        onRetry={history.refresh}
      />
    );
  }
  // A refusal on the history is NOT a refusal on the tab — the tab is in
  // `profile.tabs`, so something here is theirs. Say what is missing, in words.
  if (history.denied || !history.history) {
    return (
      <div className="p-3 sm:p-4">
        <p className="text-sm text-muted-foreground">
          The employment history for this person isn&apos;t available to you.
        </p>
      </div>
    );
  }

  const spells = [...history.history.spells].sort((a, b) => {
    const left = readNumber(a, "spell_number") ?? 0;
    const right = readNumber(b, "spell_number") ?? 0;
    return right - left;
  });

  // 🚨 `effective_from desc`. The most recent fact is the one a reader wants
  // first, and a list that starts at the beginning of time buries it.
  const assignments = [...history.history.assignments].sort((a, b) =>
    (readString(b, "effective_from") ?? "").localeCompare(
      readString(a, "effective_from") ?? "",
    ),
  );

  const openRow = openAssignment
    ? assignments.find((row) => readString(row, "id") === openAssignment)
    : null;

  return (
    <div className={cn("space-y-6 p-3 sm:p-4", className)}>
      {/* ── Pending changes (§6.2). ONE panel, and it owns cancel. ──────── */}
      {employmentId ? (
        <PendingChangesPanel
          employmentId={employmentId}
          onCancelled={history.refresh}
        />
      ) : null}

      {/* ── Actions ────────────────────────────────────────────────────── */}
      {canWrite && employmentId ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={changing === "position" ? "secondary" : "outline"}
            className="min-h-11 sm:min-h-9"
            onClick={() =>
              setChanging(changing === "position" ? null : "position")
            }
          >
            <Pencil className="mr-2 h-4 w-4" aria-hidden />
            Change position
          </Button>
          <Button
            type="button"
            size="sm"
            variant={changing === "transfer" ? "secondary" : "outline"}
            className="min-h-11 sm:min-h-9"
            onClick={() =>
              setChanging(changing === "transfer" ? null : "transfer")
            }
          >
            <ArrowRightLeft className="mr-2 h-4 w-4" aria-hidden />
            Transfer
          </Button>
        </div>
      ) : null}

      {changing && employmentId ? (
        <ChangePositionForm
          kind={changing}
          employmentId={employmentId}
          organizationId={profile.organization_id}
          currentAssignment={assignments[0] ?? null}
          onDone={() => {
            setChanging(null);
            history.refresh();
          }}
          onCancel={() => setChanging(null)}
        />
      ) : null}

      {/* ── Employment spells ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          {spells.length > 1 ? "Employment spells" : "Employment"}
        </h3>
        {spells.length > 1 ? (
          <p className="text-xs text-muted-foreground">
            This person has worked here more than once. Each spell is its own
            record — a rehire is never an edit of the old one.
          </p>
        ) : null}
        <ul className="space-y-2">
          {spells.map((spell, index) => (
            <SpellRow key={readString(spell, "id") ?? index} spell={spell} />
          ))}
        </ul>
      </section>

      {/* ── Assignment history ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          Position history
        </h3>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No position has been recorded on this employment yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((row, index) => (
              <AssignmentRow
                key={readString(row, "id") ?? index}
                row={row}
                org={org}
                employeeId={profile.header.employee_id}
                onOpen={() => setOpenAssignment(readString(row, "id"))}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ── Reporting lines (dotted / functional / project / interim) ───── */}
      <ReportingLines lines={history.history.reporting_lines} />

      {/* ── External ids ───────────────────────────────────────────────── */}
      <ExternalIdentities rows={history.history.external_identities} />

      {/* ── The engagement, and the marketplace of record. HERE, not the
             directory — a colleague's row broadcasting "Upwork" is the lesser
             status Arman's Q3 ruling forbids. ──────────────────────────── */}
      <Engagements
        rows={history.history.engagements}
        workerClass={profile.header.worker_class}
      />

      <MoreSection custom={profile.personal.custom ?? null} tabLabel="Job" />

      {/* The in-place row window; new-tab-able as ?assignment=<id>. */}
      {openRow ? (
        <DataRowWindow
          isOpen
          onClose={() => setOpenAssignment(null)}
          title="Position assignment"
          row={openRow}
          windowId={`hr-assignment-${openAssignment}`}
        />
      ) : null}
    </div>
  );
}

// ── Rows ────────────────────────────────────────────────────────────────────

function SpellRow({ spell }: { spell: Row }) {
  const status = readString(spell, "status");
  const terminated = status === "terminated";
  const hireDate = readString(spell, "hire_date");
  const originalHire = readString(spell, "original_hire_date");
  const adjustedService = readString(spell, "adjusted_service_date");
  const lastDay = readString(spell, "last_day_worked");
  const terminationDate = readString(spell, "termination_date");
  const spellNumber = readNumber(spell, "spell_number");

  return (
    <li
      className={cn(
        "rounded-lg border border-border p-3",
        terminated ? "bg-muted/30" : "bg-card",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">
          {spellNumber ? `Spell ${spellNumber}` : "Employment"}
        </span>
        {status ? (
          <Badge variant="outline" className="text-[0.6875rem] font-normal">
            {status.replace(/_/g, " ")}
          </Badge>
        ) : null}
        {readBoolean(spell, "is_rehire") ? (
          <Badge variant="secondary" className="text-[0.6875rem] font-normal">
            Rehire
          </Badge>
        ) : null}
        {terminated ? (
          <span className="text-[0.6875rem] text-muted-foreground">
            Read-only — a closed spell is history.
          </span>
        ) : null}
      </div>

      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
        <Fact label="Hired" value={formatFullDate(hireDate)} />
        {originalHire && originalHire !== hireDate ? (
          <Fact
            label="Originally hired"
            value={formatFullDate(originalHire)}
            hint="Carried from the first spell."
          />
        ) : null}
        {adjustedService ? (
          <Fact
            label="Adjusted service date"
            value={formatFullDate(adjustedService)}
            hint="What benefits and accruals count from."
          />
        ) : null}
        {lastDay ? <Fact label="Last day worked" value={formatFullDate(lastDay)} /> : null}
        {terminationDate ? (
          <Fact
            label="Termination date"
            value={formatFullDate(terminationDate)}
            hint="Benefits and final pay key on different dates — this is not the last day worked."
          />
        ) : null}
      </dl>
    </li>
  );
}

function AssignmentRow({
  row,
  org,
  employeeId,
  onOpen,
}: {
  row: Row;
  org: HrOrgRef;
  employeeId: string;
  onOpen: () => void;
}) {
  const effectiveFrom = readString(row, "effective_from");
  const effectiveTo = readString(row, "effective_to");
  const isFuture = Boolean(
    effectiveFrom && effectiveFrom > new Date().toISOString().slice(0, 10),
  );
  const workflowInstanceId =
    readString(row, "approval_request_id") ?? readString(row, "wf_instance_id");
  const assignmentId = readString(row, "id");

  return (
    <li className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {readString(row, "job_title") ?? "Position"}
            </span>
            {readBoolean(row, "is_primary") ? (
              <Badge variant="secondary" className="text-[0.6875rem] font-normal">
                Primary
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[0.6875rem] font-normal">
                Secondary
              </Badge>
            )}
            <HrWorkerClassChip workerClass={readString(row, "worker_class")} />
            {isFuture ? (
              <Badge className="text-[0.6875rem] font-normal">
                Starts {formatFullDate(effectiveFrom)}
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <HrStructureDoor
              id={readString(row, "department_id")}
              label={readString(row, "department")}
              href={hrStructureFocusHref(readString(row, "department_id") ?? "", org)}
            />
            <HrStructureDoor
              id={readString(row, "location_id")}
              label={readString(row, "location")}
              href={hrStructureFocusHref(readString(row, "location_id") ?? "", org)}
            />
          </div>

          <div className="text-xs text-muted-foreground">
            {formatFullDate(effectiveFrom)} —{" "}
            {effectiveTo ? formatFullDate(effectiveTo) : "present"}
          </div>

          <ClassificationLine row={row} />

          {readString(row, "change_reason") ? (
            <div className="text-xs text-foreground">
              Reason: {readString(row, "change_reason")}
            </div>
          ) : null}

          {/* 🚨 BOTH TIME AXES, ON EVERY ROW (§6.4). */}
          <SystemTimeLine row={row} />

          {workflowInstanceId ? (
            <Link
              href={`/hr/tasks/${workflowInstanceId}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-primary"
            >
              See who approved this
              <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11 sm:min-h-8"
            onClick={onOpen}
          >
            Open
          </Button>
          {assignmentId ? (
            <Button asChild size="sm" variant="ghost" className="min-h-11 sm:min-h-8">
              <Link
                href={`/hr/people/${employeeId}/job?assignment=${assignmentId}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open this assignment in a new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** The four classification axes, plus FTE and the EEO-1 category's origin. */
function ClassificationLine({ row }: { row: Row }) {
  const bits = [
    readString(row, "flsa_status"),
    readString(row, "pay_basis"),
    readString(row, "schedule_class"),
  ].filter(Boolean) as string[];
  const fte = readNumber(row, "fte");
  const eeo = readString(row, "eeo1_job_category");

  if (bits.length === 0 && fte === null && !eeo) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {bits.map((bit) => (
        <span key={bit}>{bit.replace(/_/g, " ")}</span>
      ))}
      {fte !== null ? <span>FTE {fte}</span> : null}
      {eeo ? (
        <span title="Recorded when this assignment was written. Re-mapping the job title later does not rewrite it.">
          EEO-1: {eeo}
        </span>
      ) : null}
    </div>
  );
}

/**
 * 🚨 SYSTEM TIME, WITH THE ACTOR TAXONOMY RESOLVED (§6.4).
 *
 * "Recorded 25 Aug 2026 by Dana Ruiz (HR)". Never "Changed by user" — the
 * question an auditor asks is not only WHEN we learned it but WHAT KIND of
 * actor recorded it, because an integration writing a position change and a
 * manager writing one carry different weight.
 */
function SystemTimeLine({ row }: { row: Row }) {
  const recordedAt =
    readString(row, "recorded_at") ?? readString(row, "created_at");
  const actorName =
    readString(row, "recorded_by_name") ?? readString(row, "created_by_name");
  const kindWords = actorKindWords(actorKindOf(row));

  if (!recordedAt && !actorName) return null;

  return (
    <div className="text-[0.6875rem] text-muted-foreground">
      Recorded {formatRecordedAt(recordedAt)}
      {actorName ? ` by ${actorName}` : ""}
      {kindWords ? ` (${kindWords})` : actorName ? "" : ""}
      {!actorName && !kindWords ? " — the actor was not recorded on this row" : ""}
    </div>
  );
}

function ReportingLines({ lines }: { lines: Row[] }) {
  if (lines.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">
        Other reporting lines
      </h3>
      <p className="text-xs text-muted-foreground">
        Dotted, functional, project and interim lines. The org chart draws the
        primary line solid and these dashed.
      </p>
      <ul className="space-y-1.5">
        {lines.map((line, index) => (
          <li
            key={readString(line, "id") ?? index}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <span className="font-medium text-foreground">
              {readString(line, "line_kind")?.replace(/_/g, " ") ?? "Line"}
            </span>
            {readString(line, "manager_name") ? (
              <span className="text-muted-foreground">
                {" "}
                — {readString(line, "manager_name")}
              </span>
            ) : null}
            {readString(line, "scope_note") ? (
              <span className="block text-xs text-muted-foreground">
                {readString(line, "scope_note")}
              </span>
            ) : null}
            <span className="block text-xs text-muted-foreground">
              {formatFullDate(readString(line, "effective_from"))} —{" "}
              {readString(line, "effective_to")
                ? formatFullDate(readString(line, "effective_to"))
                : "present"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ExternalIdentities({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">
        Ids in other systems
      </h3>
      <ul className="space-y-1.5">
        {rows.map((row, index) => {
          const url = readString(row, "url");
          const systemKey = readString(row, "system_key") ?? "System";
          const externalId = readString(row, "external_id") ?? "";
          return (
            <li
              key={readString(row, "id") ?? index}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <span className="font-medium text-foreground">{systemKey}</span>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-primary underline underline-offset-2"
                >
                  {externalId}
                </a>
              ) : (
                // Not a door, deliberately: this is SOMEBODY ELSE'S id in
                // SOMEBODY ELSE'S system. We hold no route for it and inventing
                // one would open the wrong record. When the row carries a URL
                // (above) it IS a door. `matrx/no-bare-id-text` flags this on
                // the variable name; the rule is right about our ids and does
                // not apply to a foreign one.
                <span className="font-mono text-xs text-muted-foreground">
                  {externalId}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The contractor engagement — and the ONLY place the marketplace of record
 * appears (§4.7 + Arman's Q3 ruling).
 */
function Engagements({
  rows,
  workerClass,
}: {
  rows: Row[];
  workerClass: string | null;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">
        {workerClass === "contractor" ? "Engagement" : "Engagements"}
      </h3>
      <ul className="space-y-1.5">
        {rows.map((row, index) => {
          const platform = readString(row, "platform_of_record");
          const platformUrl = readString(row, "platform_url");
          const platformId = readString(row, "platform_external_id");
          return (
            <li
              key={readString(row, "id") ?? index}
              className="space-y-1 rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">
                  {formatFullDate(readString(row, "starts_on"))} —{" "}
                  {readString(row, "ends_on")
                    ? formatFullDate(readString(row, "ends_on"))
                    : "open"}
                </span>
                {readString(row, "status") ? (
                  <Badge variant="outline" className="text-[0.6875rem] font-normal">
                    {readString(row, "status")}
                  </Badge>
                ) : null}
                {readBoolean(row, "auto_renew") ? (
                  <Badge variant="secondary" className="text-[0.6875rem] font-normal">
                    Auto-renews
                  </Badge>
                ) : null}
              </div>
              {platform ? (
                <div className="text-xs text-muted-foreground">
                  Engaged through{" "}
                  {platformUrl ? (
                    <a
                      href={platformUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2"
                    >
                      {platform}
                    </a>
                  ) : (
                    platform
                  )}
                  {platformId ? ` · ${platformId}` : ""}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Fact({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  if (!value) return null;
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
      {hint ? (
        <dd className="text-[0.6875rem] leading-snug text-muted-foreground">
          {hint}
        </dd>
      ) : null}
    </div>
  );
}
