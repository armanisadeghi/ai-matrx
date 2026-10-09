// record-view: none — an admin spend report
// Hard-cost reconciliation: vendor-reported vs recorded vs charged, per window and provider.
import { HardCostReconciliationTable } from "@/features/admin/hard-cost-reconciliation/HardCostReconciliationTable";

export const metadata = {
  title: "Hard-cost reconciliation | Administration",
  description: "Do the vendors' own charges, our ledger and the points we charged agree? Per window and provider.",
};

export default function HardCostReconciliationPage() {
  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <HardCostReconciliationTable />
    </div>
  );
}
