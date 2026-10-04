// Billing › Plans & pricing — every plan's name, prices and listing, then its
// allowances. The same rows feed /pricing and every upgrade surface through
// billing.plan_catalog(); this page is where they are set.

import { PlanAllowancesPanel } from "@/features/admin/limits/components/PlanAllowancesPanel";
import { PlanDetailsPanel } from "@/features/admin/limits/components/PlanDetailsPanel";

export default function BillingPlansPage() {
  return (
    <div className="space-y-8 p-6">
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Plans &amp; pricing</h2>
        <PlanDetailsPanel />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Allowances</h2>
        <PlanAllowancesPanel />
      </section>
    </div>
  );
}
