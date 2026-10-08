// record-view: none — one agent / mandate's spend and every run
"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AgentSpendDetail } from "@/features/admin/agent-spend/AgentSpendDetail";
import { useSpendWindow } from "@/features/admin/agent-spend/useSpendWindow";

function Detail() {
  const params = useSearchParams();
  const [days, setDays] = useSpendWindow();
  return (
    <AgentSpendDetail
      orgId={null}
      seat="admin"
      agentId={params.get("agent")}
      mandateKey={params.get("mandate")}
      days={days}
      onDaysChange={setDays}
    />
  );
}

export default function AgentSpendDetailPage() {
  return (
    <div className="h-full overflow-y-auto px-4 pb-16 pt-4 sm:px-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-muted/50" />}>
        <Detail />
      </Suspense>
    </div>
  );
}
