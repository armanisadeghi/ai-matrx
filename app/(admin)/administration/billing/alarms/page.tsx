// Billing › Alarms: every spend alarm record (billing.spend_alarm), ringing first
// (features/admin/spend-alarms). Each row opens /administration/billing/alarms/<id>.
"use client";

import { Suspense } from "react";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { SpendAlarmsBoard } from "@/features/admin/spend-alarms/SpendAlarmsBoard";

export default function SpendAlarmsPage() {
  return (
    <>
      <RecordPageHeader
        backHref="/administration/billing"
        parents={[{ label: "Billing", href: "/administration/billing" }]}
        record={{ name: "Alarms" }}
      />
      <div className="flex h-full min-h-0 flex-col p-3">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-muted/50" />}>
          <SpendAlarmsBoard />
        </Suspense>
      </div>
    </>
  );
}
