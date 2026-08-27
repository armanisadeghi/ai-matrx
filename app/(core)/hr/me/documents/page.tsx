// `/hr/me/documents` — owned by the **Documents & Forms** pillar spec, not by lane L1.
//
// 🚨 WHY THIS FILE EXISTS AT ALL. `resolveHrNav` renders this nav item for an
// employee persona TODAY, so without this route the shell draws a link to a
// 404 — the dead end the no-dead-ends law exists to prevent. What it renders is
// the REGISTERED promise (`hr.me.documents` in `lib/coming-soon/registry.ts`),
// never a bare "coming soon" string.
//
// 🚨 WHAT THE OWNING LANE INHERITS, AND MUST NOT RE-DERIVE: `MeSurfaceShell`
// carries the persona resolution, the employer context, the identity header,
// and `employment_id` resolved through the server's AS-OF resolution — never
// through `hr.employee.current_employment_id`. Replace the placeholder body;
// keep the shell.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { MePillarSurface } from "@/features/hr/me/MeSurfaceShell";

export const metadata = { title: "My documents" };

export default function HrMeDocumentsPage() {
  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-semibold">My documents</h1>
      </PageHeader>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/*
            🚨 A CLIENT COMPONENT, NOT `MeSurfaceShell` DIRECTLY. This page is a
            Server Component (it exports `metadata`, which is server-only), and
            the shell's `children` is a render prop. Passing a function child
            from here is what crashed all four of these routes with "Functions
            are not valid as a child of Client Components".
          */}
          <MePillarSurface
            promiseKey="hr.me.documents"
            operation="My documents"
            owner="Documents & Forms"
          />
        </div>
      </div>
    </>
  );
}
