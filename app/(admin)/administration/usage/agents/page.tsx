// record-view: none — an admin spend report
// AI spend health: every agent and mandate with spend, most expensive first, with the
// spend-rule red flags (features/admin/agent-spend). Visibility only.
"use client";

import { Suspense } from "react";
import { AgentSpendBoard } from "@/features/admin/agent-spend/AgentSpendBoard";
import { useSpendWindow } from "@/features/admin/agent-spend/useSpendWindow";

function Board() {
  const [days, setDays] = useSpendWindow();
  return <AgentSpendBoard orgId={null} seat="admin" days={days} onDaysChange={setDays} />;
}

export default function AgentSpendHealthPage() {
  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-muted/50" />}>
        <Board />
      </Suspense>
    </div>
  );
}
