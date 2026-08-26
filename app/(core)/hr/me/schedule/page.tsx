// `/hr/me/schedule` — owned by the **Scheduling** pillar spec, not by lane L1.
//
// 🚨 WHY THIS FILE EXISTS AT ALL. `resolveHrNav` renders this nav item for an
// employee persona TODAY, so without this route the shell draws a link to a
// 404 — the dead end the no-dead-ends law exists to prevent. What it renders is
// the REGISTERED promise (`hr.me.schedule` in `lib/coming-soon/registry.ts`),
// never a bare "coming soon" string.
//
// 🚨 WHAT THE OWNING LANE INHERITS, AND MUST NOT RE-DERIVE: `MeSurfaceShell`
// carries the persona resolution, the employer context, the identity header,
// and `employment_id` resolved through the server's AS-OF resolution — never
// through `hr.employee.current_employment_id`. Replace the placeholder body;
// keep the shell.

import PageHeader from "@/features/shell/components/header/PageHeader";
import {
  MePillarPlaceholder,
  MeSurfaceShell,
} from "@/features/hr/me/MeSurfaceShell";
import { COMING_SOON } from "@/lib/coming-soon/registry";

export const metadata = { title: "My schedule" };

const PROMISE = COMING_SOON["hr.me.schedule"];

export default function HrMeSchedulePage() {
  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-semibold">My schedule</h1>
      </PageHeader>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MeSurfaceShell operation="My schedule">
            {() => (
              <MePillarPlaceholder
                title={PROMISE.label}
                promise={PROMISE.promise}
                owner="Scheduling"
              />
            )}
          </MeSurfaceShell>
        </div>
      </div>
    </>
  );
}
