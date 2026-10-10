// `/hr/me/time-off` — UI-IA route 8, owned by the **Leave & PTO** pillar spec
// (`common-docs/systems/human-resources/projects/hr-domain/specs/SPEC-LEAVE.md` §4.1, §5).
//
// 🚨 WHAT THIS ROUTE INHERITS AND MUST NOT RE-DERIVE: `MeSurfaceShell` (mounted
// inside `MyTimeOffSurface`) carries the persona resolution, the employer
// context, the identity header, and `employment_id` resolved through the
// server's AS-OF resolution — never through `hr.employee.current_employment_id`.
// Every figure on this page is entitlement, so it resolves as of the date of the
// fact.
//
// 🚨 A CLIENT COMPONENT, NOT `MeSurfaceShell` DIRECTLY. This page is a Server
// Component (it exports `metadata`, which is server-only) and the shell's
// `children` is a render prop. Passing a function child from here is what
// crashed all four `/hr/me/*` routes with "Functions are not valid as a child of
// Client Components". The composition lives in `MyTimeOffSurface`.

import { hrHref, hrMeHref } from "@/features/hr/routes";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { MyTimeOffSurface } from "@/features/hr/leave/components/MyTimeOffSurface";

export const metadata = { title: "My time off" };

export default async function HrMeTimeOffPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const org = (await searchParams).org;
  return (
    <>
      <RecordPageHeader
        backHref={hrMeHref(org)}
        parents={[
          { label: "HR", href: hrHref(org) },
          { label: "My info", href: hrMeHref(org) },
        ]}
        record={{ name: "My time off" }}
      />
      <div className="flex h-full flex-col overflow-hidden pt-[var(--shell-header-h)]">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MyTimeOffSurface />
        </div>
      </div>
    </>
  );
}
