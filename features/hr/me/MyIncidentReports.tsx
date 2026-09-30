// features/hr/me/MyIncidentReports.tsx
//
// THE EMPLOYEE'S OWN END OF EMPLOYEE RELATIONS (SPEC-EMPLOYEES §4.9b).
//
// 🚨 UNTIL THIS FILE, AN ORDINARY EMPLOYEE COULD NOT FILE A COMPLAINT AT ALL.
// The only "Report an incident" control in the product sat on route 15's
// toolbar behind `can("incident.read") || can("incident.investigate")` — and
// route 15 is ABSENT for employees and managers by §2.2, so the two conditions
// could never both be true for the person the intake lane was built for. The
// door was never the problem: `public.hr_incident_create` says so in its own
// body — *"an ordinary employee CAN report; the capability gates INVESTIGATION,
// not intake. Fall back to the reporter lane when the caller has an employment
// in this employer."* The employee lane has been live and unreachable.
//
// 🚨 WHY IT LIVES ON `/hr/me` — AND THAT THIS IS A DECISION, NOT A CITATION.
// The spec is SILENT on where an employee reports from. §4.9b's flowchart names
// the channel ("Employee or manager in-app") and the knob
// `hr.relations.incident_intake_channels` ships `["in_app"]`, but SPEC-UI-IA's
// route table has no employee-facing intake route among its ~96, and
// SPEC-DOMAIN-WIDE's employee home is a closed list of eight cards with nothing
// like this on it. Of the homes the spec DOES name, `/hr/me` is the one that
// fits: it is the surface for the employee's own HR business, it is present for
// every persona with an employer (`hr-nav` `me` has no `requires`), and these
// records are the person's own — they filed them. It is composed here the same
// way `MyVerificationConsents` is, as a panel above the profile, for the same
// reason that panel gives. Raised for the amendment queue as a real spec gap;
// the route table should name this surface rather than leave it inferred.
//
// 🚨 WHAT THE REPORTER MAY SEE OF THEIR OWN REPORT, AND ONLY THAT.
// `hr_my_incident_reports` and `hr_incident_status` are SEPARATE DOORS from the
// case read, and they ship state, its label, the declared next step and the
// dates. No summary, no parties, no notes, ever. Filing a report does not make
// somebody an investigator — SPEC-ACCESS §5 says that in as many words — and a
// door that was never given a field cannot leak it.
//
// 🚨 A REPORT FILED ANONYMOUSLY NEVER APPEARS HERE. §4.9b A2: an anonymous
// report creates no employment linkage, so no future join can re-identify the
// reporter — including this one. Somebody who reports anonymously is choosing
// not to be able to check on it, and the form says so before they choose.

"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquareWarning, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchHrMyIncidentReports } from "@/features/hr/service";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { NewIncidentDialog } from "@/features/hr/people/relations/components/NewIncidentDialog";
import {
  HR_INCIDENT_KIND_LABELS,
  type HrIncidentKind,
} from "@/features/hr/people/relations/types";

type MyReport = {
  incident_id: string;
  incident_kind: string;
  state: string;
  state_label: string | null;
  next_step: string | null;
  reported_at: string | null;
  updated_at: string | null;
};

function formatWhen(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export function MyIncidentReports() {
  const { active, isLoading: contextLoading } = useHrContext();
  const organizationId = active?.organization_id ?? null;
  const employmentId = active?.employment_id ?? null;

  const [reports, setReports] = useState<MyReport[] | null>(null);
  const [filing, setFiling] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      const result = await fetchHrMyIncidentReports(organizationId);
      if (cancelled) return;
      // A refusal or a failure leaves this NULL, never `[]`. The panel then says
      // nothing about reports rather than telling somebody they have none.
      setReports(
        result.ok && Array.isArray(result.data.rows)
          ? (result.data.rows as MyReport[])
          : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, reloadToken]);

  // 🚨 NO EMPLOYMENT IN THIS EMPLOYER, NO PANEL — because the door refuses that
  // caller by construction (`hr._l1_self_employment` is the reporter lane's
  // whole condition), and offering a form that cannot submit is the defect this
  // file exists to fix, wearing a different hat.
  if (contextLoading || !organizationId || !employmentId) return null;

  const hasReports = reports !== null && reports.length > 0;

  return (
    <section className="mx-auto w-full max-w-4xl px-4 pt-4 sm:px-6">
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <MessageSquareWarning className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              Report something to HR
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              An injury, a near miss, a safety problem, or a complaint about how
              someone has been treated — including by a manager.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="min-h-11 shrink-0 sm:min-h-9"
            onClick={() => setFiling(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Make a report
          </Button>
        </div>

        {hasReports ? (
          <ul className="space-y-2 border-t border-border pt-3">
            {reports.map((report) => (
              <li
                key={report.incident_id}
                className="space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {HR_INCIDENT_KIND_LABELS[
                      report.incident_kind as HrIncidentKind
                    ] ?? report.incident_kind}
                  </span>
                  {/* The door ships the LABEL beside the enum (hr_l1_75), so
                      nobody is ever shown the word `action_pending`. */}
                  <Badge variant="outline" className="text-xs">
                    {report.state_label ?? report.state}
                  </Badge>
                  {report.reported_at ? (
                    <span className="text-xs text-muted-foreground">
                      Filed {formatWhen(report.reported_at)}
                    </span>
                  ) : null}
                </div>
                {report.next_step ? (
                  <p className="text-sm text-foreground">{report.next_step}</p>
                ) : null}
              </li>
            ))}
            <li className="pt-1 text-xs text-muted-foreground">
              What was reported is being handled privately. You will not see the
              details of the investigation, and that protects everyone involved
              — including you.
            </li>
          </ul>
        ) : null}
      </div>

      {filing ? (
        <NewIncidentDialog
          onClose={() => setFiling(false)}
          onCreated={() => {
            setFiling(false);
            refresh();
          }}
        />
      ) : null}
    </section>
  );
}
