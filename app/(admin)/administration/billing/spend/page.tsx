// app/(admin)/administration/billing/spend/page.tsx
//
// THE PLATFORM SPEND DASHBOARD. Arman, 2026-09-11: "a dashboard where I can
// easily and quickly see where money is being spent".
//
// GATING (protected-resources, the single path of resistance):
//   1. the `(admin)` layout admits any Matrx admin,
//   2. this server component raises the bar to Super Admin with
//      `checkIsSuperAdmin` and says so in plain words if the visitor is not,
//   3. the two RPCs behind the page re-check `public.is_super_admin()` inside
//      the function, so a lower-level admin who reaches the client bundle still
//      gets a refusal from the database rather than a number.
// The UI gate is a courtesy; the database gate is the authorization.

import { ShieldAlert } from "lucide-react";

import { createClient } from "@/utils/supabase/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import { SpendDashboard } from "@/features/admin/spend/SpendDashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Platform spend | Billing | Administration",
  description:
    "What the platform spent today, yesterday, this week and this month across every organization — with the cost sources that record nothing named out loud.",
};

export default async function PlatformSpendPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allowed = user ? await checkIsSuperAdmin(supabase, user.id) : false;

  if (!allowed) {
    return (
      <div className="p-4">
        <div className="flex max-w-xl items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="text-sm text-destructive">
            <div className="font-medium">
              Platform spend is Super Admin only.
            </div>
            <p className="mt-1 text-xs">
              This page reads every organization&apos;s costs, so it sits above
              the normal admin bar. Your account is an admin but not a Super
              Admin. A Super Admin can raise your level from Administration
              &rarr; Users &rarr; Admins.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <SpendDashboard />;
}
