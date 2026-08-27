// features/hr/people/relations/components/CaseSurface.tsx
//
// ROUTE 16 — one corrective action, or one incident/complaint.
//
// 🚨 THE VETO CAN FIRE WHILE THIS PAGE IS OPEN. Adding an `accused` party
// re-materialises `hr.incident.excluded_actor_ids` in the SAME transaction, so
// the person who just did it can be the person who just lost reach. When a
// refresh comes back denied, this surface REDIRECTS WITH A NEUTRAL MESSAGE —
// it never says "you were added as a respondent", because that sentence is the
// disclosure the veto exists to prevent.
//
// 🚨 A CASE UNDER LEGAL HOLD SHOWS THE HOLD AND ITS ORIGIN, AND ITS DELETE
// ACTION IS ABSENT. Not disabled with a tooltip — absent.
//
// 🚨 AN ANONYMOUS REPORT HAS NO REPORTER AND THIS PAGE RENDERS NO EMPTY
// "Reported by" SLOT. An empty slot where a name would be is a disclosure that
// a name exists.
//
// 🚨 A CASE WHOSE SUBJECT LEAVES THE ORG STAYS OPEN AND STAYS REACHABLE.
// Termination does not close a case, and nothing here may branch on the
// subject's employment status.

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Lock, Scale } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { hrRelationsHref } from "@/features/hr/routes";
import { HrPageState } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { useHrPersona } from "@/features/hr/shared/useHrPersona";
import { toast } from "@/lib/toast";

import { useHrRelationsCase } from "../hooks/useRelationsCases";
import type { HrCaseKind } from "../types";
import { CorrectiveActionPanel } from "./CorrectiveActionPanel";
import { IncidentPartiesPanel } from "./IncidentPartiesPanel";
import { IncidentStatePanel } from "./IncidentStatePanel";
import { OshaDeterminationPanel } from "./OshaDeterminationPanel";
import { RestrictedNotesPanel } from "./RestrictedNotesPanel";
import {
  HR_INCIDENT_KIND_LABELS,
  type HrIncidentKind,
} from "../types";

function formatWhen(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function CaseSurface({
  caseId,
  hintedKind,
}: {
  caseId: string;
  hintedKind: HrCaseKind | null;
}) {
  const router = useRouter();
  const { orgRef } = useHrContext();
  const { can } = useHrPersona();
  const [wasReachable, setWasReachable] = useState(false);

  const { detail, caseKind, isLoading, error, denied, refresh } =
    useHrRelationsCase({
      caseId,
      hintedKind,
      // Recorded and shown to the subject in their own access log — so it says
      // what is actually being done, never a constant.
      justification: "Working this employee-relations case",
    });

  useEffect(() => {
    if (detail) setWasReachable(true);
  }, [detail]);

  // Lost reach mid-session. Neutral message, no explanation, and back to the
  // list — which will simply no longer contain the case.
  useEffect(() => {
    if (denied && wasReachable) {
      toast.message("This case is no longer available to you.");
      router.replace(hrRelationsHref(orgRef));
    }
  }, [denied, wasReachable, router, orgRef]);

  function lostReach() {
    toast.message("This case is no longer available to you.");
    router.replace(hrRelationsHref(orgRef));
  }

  const incident = detail?.incident;
  const action = detail?.corrective_action;
  const underLegalHold = Boolean(
    incident?.legal_hold_id ?? action?.legal_hold_id,
  );
  const holdOrigin = incident?.legal_hold_origin ?? action?.legal_hold_origin;

  const canInvestigate =
    can("incident.investigate") ||
    can("incident.read") ||
    detail?.viewer_role === "investigator";

  return (
    <HrPageState
      loading={isLoading}
      error={error && error.kind === "failed" ? error : null}
      granted={denied ? false : undefined}
      operation="This case"
      variant="panel"
      onRetry={refresh}
      noAccessSentence="This part of HR isn't yours here."
    >
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground">
              {caseKind === "incident"
                ? (HR_INCIDENT_KIND_LABELS[
                    incident?.incident_kind as HrIncidentKind
                  ] ?? "Incident")
                : "Corrective action"}
            </h1>
            {incident?.osha_recordable ? (
              <Badge variant="secondary" className="gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" />
                OSHA recordable
              </Badge>
            ) : null}
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {incident?.subject_name || action?.subject_name ? (
              <div>
                <dt className="text-xs text-muted-foreground">Subject</dt>
                <dd className="font-medium text-foreground">
                  {incident?.subject_name ?? action?.subject_name}
                </dd>
              </div>
            ) : null}

            {/* An anonymous report has NO reporter and renders NO slot. */}
            {incident && !incident.reported_anonymously && incident.reporter_name ? (
              <div>
                <dt className="text-xs text-muted-foreground">Reported by</dt>
                <dd className="font-medium text-foreground">
                  {incident.reporter_name}
                </dd>
              </div>
            ) : null}

            {incident?.occurred_at ? (
              <div>
                <dt className="text-xs text-muted-foreground">Occurred</dt>
                <dd className="text-foreground">
                  {formatWhen(incident.occurred_at)}
                </dd>
              </div>
            ) : null}

            {incident?.establishment_name ? (
              <div>
                <dt className="text-xs text-muted-foreground">Establishment</dt>
                <dd className="text-foreground">
                  {incident.establishment_name}
                </dd>
              </div>
            ) : null}
          </dl>

          {incident?.reported_anonymously ? (
            <p className="text-xs text-muted-foreground">
              Reported anonymously. No link to the reporter exists on this
              record.
            </p>
          ) : null}
        </header>

        {underLegalHold ? (
          // The hold, its origin, and NO delete action anywhere on this page.
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-4">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                This case is under a legal hold.
              </p>
              <p className="text-xs text-muted-foreground">
                {holdOrigin
                  ? `Placed by ${holdOrigin}. Nothing on this record can be disposed of while the hold stands.`
                  : "Nothing on this record can be disposed of while the hold stands."}
              </p>
            </div>
          </div>
        ) : null}

        {incident?.summary || incident?.redacted_summary || action?.summary ? (
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">
              {caseKind === "incident" ? "What happened" : "Summary"}
            </h2>
            <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">
              {incident?.summary ?? incident?.redacted_summary ?? action?.summary}
            </p>
          </section>
        ) : null}

        {incident ? (
          <>
            <IncidentStatePanel
              incident={incident}
              canWrite={canInvestigate}
              onChanged={refresh}
            />
            <IncidentPartiesPanel
              incidentId={incident.id}
              parties={detail?.parties}
              canWrite={canInvestigate}
              onChanged={refresh}
              onLostReach={lostReach}
            />
            <OshaDeterminationPanel
              incident={incident}
              canWrite={canInvestigate}
              onChanged={refresh}
            />
          </>
        ) : null}

        {action ? (
          <CorrectiveActionPanel
            action={action}
            viewerRole={detail?.viewer_role ?? null}
            onChanged={refresh}
          />
        ) : null}

        <RestrictedNotesPanel
          notes={detail?.restricted_notes}
          targetToken={caseKind === "incident" ? "hr_incident" : "hr_corrective_action"}
          targetId={caseId}
          canWrite={canInvestigate}
          onChanged={refresh}
        />

        {detail?.attachments?.length ? (
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Scale className="h-3.5 w-3.5 text-muted-foreground" />
              Evidence
            </h2>
            <ul className="mt-2 space-y-1">
              {detail.attachments.map((file) => (
                <li key={file.file_id} className="text-sm text-foreground">
                  {/* Evidence is a FILE and a file opens — Open, new tab and
                      peek, from the registry. A named record with no door is
                      exactly the dead end the law forbids, and on an
                      investigation file it is also a piece of evidence nobody
                      can reach. */}
                  <EntityRef
                    token="file"
                    id={file.file_id}
                    name={file.name ?? file.file_id}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </HrPageState>
  );
}
