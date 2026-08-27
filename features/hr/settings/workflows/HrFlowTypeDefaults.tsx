// features/hr/settings/workflows/HrFlowTypeDefaults.tsx
//
// ROUTE 78's FIXED HALF: the flow types SPEC-EMPLOYEES §1.5 consumes ALWAYS appear
// here — even when this employer has never overridden one — showing the platform
// default routing.
//
// 🚨 WHY THIS IS A DECLARED LIST AND NOT A READ. `hr.workflow_flow_type` is live and
// carries 23 rows, but the `hr` schema is not exposed to PostgREST and no
// `hr_workflow_flow_type_list` RPC exists — there is no way for a browser to read it.
// §1.5's six are spec-fixed rather than data, so declaring them is honest; the
// remaining seventeen are NOT declared here, because inventing a list of rows we
// cannot read would be worse than admitting we cannot read them. The panel says so.
//
// A LIST OF FLOWS WITH NO ROUTING IS THE BUG THIS FIXES. Before, an org that had
// never touched approvals saw an empty page and concluded nothing needed approval —
// while `pay_change` was quietly routing to the manager's manager the whole time.

"use client";

import { GitBranch, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/** SPEC-EMPLOYEES §1.5's flow types, with the routing that applies when nobody overrides it. */
const SPEC_FLOW_TYPES = [
  {
    key: "profile_edit_request",
    label: "Profile edit request",
    target: "Employee record",
    used: "Self-service edits to a field the employee may propose but not set, and legal name changes.",
    defaultRouting: "HR — whoever holds identity.write for that person's population.",
  },
  {
    key: "address_change",
    label: "Address change",
    target: "Employee record",
    used: "Its own flow, separate from other profile edits.",
    defaultRouting:
      "HR. It is separate because moving address can move jurisdiction, and jurisdiction changes what is lawful for that person.",
  },
  {
    key: "pay_change",
    label: "Pay change",
    target: "Position assignment",
    used: "Every compensation change, without exception.",
    defaultRouting:
      "The initiator's manager, then HR. No page approves a raise on its own — this flow is the only path.",
  },
  {
    key: "position_change",
    label: "Position change",
    target: "Position assignment",
    used: "Promotion, reclassification, FTE change and transfer.",
    defaultRouting:
      "The receiving manager, then HR — and only when the initiator is a manager rather than HR.",
  },
  {
    key: "termination",
    label: "Termination",
    target: "Employment spell",
    used: "Every separation, including the end of a contractor engagement.",
    defaultRouting: "HR. It hands off to offboarding once decided.",
  },
  {
    key: "corrective_action_ack",
    label: "Corrective action acknowledgment",
    target: "Corrective action",
    used: "The employee's acknowledgment of a corrective action.",
    defaultRouting:
      "The employee themselves. It is an acknowledgment, not an approval — declining to sign is recorded, never blocked.",
  },
];

export function HrFlowTypeDefaults() {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-start gap-3 border-b border-border p-4">
        <GitBranch className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-foreground">
            What needs approval here
          </h2>
          <p className="text-sm text-muted-foreground">
            These flows are running for this employer right now, whether or not anyone
            has configured them. What you see beside each one is where it routes when
            nobody has said otherwise.
          </p>
        </div>
      </header>
      <ul className="divide-y divide-border">
        {SPEC_FLOW_TYPES.map((flow) => (
          <li key={flow.key} className="space-y-1.5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{flow.label}</p>
                <p className="font-mono text-[0.6875rem] text-muted-foreground">
                  {flow.key} · {flow.target}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                Platform default
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{flow.used}</p>
            <p className="text-sm text-foreground">{flow.defaultRouting}</p>
          </li>
        ))}
      </ul>
      <div className="flex items-start gap-2 border-t border-border p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Other parts of HR — hiring, time, scheduling, leave, training — run their own
          approval flows on the same engine. They are not listed here yet because there
          is no read path to the flow registry from a browser; these six are the ones
          this part of the product declares and can therefore state honestly.
        </p>
      </div>
    </section>
  );
}
