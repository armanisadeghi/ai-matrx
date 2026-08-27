// features/hr/people/relations/components/ReporterStatusView.tsx
//
// 🚨 WHAT THE **REPORTER** MAY SEE, AND ONLY THAT (SPEC-EMPLOYEES §2.2 route
// 16, §4.9b J).
//
//   State. Last updated. The declared next step.
//   **NOTHING FROM THE NOTES. EVER.**
//
// This is a SEPARATE SERVER DOOR (`hr_incident_status`), not a narrowed render
// of the case payload — deliberately. If the reporter's view were the case read
// with fields hidden, then every future field added to the case would leak to
// them by default, and the hiding would live in a component somebody could
// edit. A different door cannot leak a field it was never given.
//
// Somebody who reported a complaint has a real, legitimate need to know that
// their report did not vanish. That need is met by state and a next step — not
// by watching the investigation.

"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { fetchHrIncidentStatus } from "@/features/hr/service";

type IncidentStatus = {
  state?: string | null;
  state_label?: string | null;
  last_updated_at?: string | null;
  next_step?: string | null;
};

function formatWhen(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function ReporterStatusView({
  incidentId,
  fallback,
}: {
  incidentId: string;
  /**
   * Rendered when the status door also refuses — this person is not the
   * reporter either. It MUST be the caller's ordinary no-access state, so the
   * page reads identically whether the record is unreachable or does not
   * exist. Anything that distinguished the two here would be the leak.
   */
  fallback: ReactNode;
}) {
  const [status, setStatus] = useState<IncidentStatus | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await fetchHrIncidentStatus(incidentId);
      if (cancelled) return;
      // A refusal means this person is not the reporter either. Nothing renders
      // and the caller's no-access state stands — which reads the same whether
      // the record is unreachable or does not exist.
      setStatus(result.ok ? (result.data as IncidentStatus) : null);
      setChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [incidentId]);

  // Still asking. Render nothing rather than flashing the no-access state at
  // somebody who is about to be granted their own status page.
  if (!checked) return null;
  if (!status) return <>{fallback}</>;

  return (
    <div className="mx-auto w-full max-w-xl p-4 sm:p-6">
      <div className="space-y-3 rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-sm font-semibold text-foreground">Your report</h1>
          {status.state_label || status.state ? (
            <Badge variant="outline">
              {status.state_label ?? status.state}
            </Badge>
          ) : null}
        </div>

        {status.last_updated_at ? (
          <p className="text-sm text-muted-foreground">
            Last updated {formatWhen(status.last_updated_at)}.
          </p>
        ) : null}

        {status.next_step ? (
          <div>
            <p className="text-xs text-muted-foreground">What happens next</p>
            <p className="text-sm text-foreground">{status.next_step}</p>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          What was reported is being handled privately. You will not see the
          details of the investigation, and that protects everyone involved —
          including you.
        </p>
      </div>
    </div>
  );
}
