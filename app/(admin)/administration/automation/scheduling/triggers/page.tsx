// Scheduling admin › Triggers — every workflow trigger on the platform (schedule,
// event, webhook) that starts AI work by itself, with cost, flags and
// Pause / Resume / Archive. features/scheduling/components/triggers/TriggersManager.tsx
"use client";

import { TriggersManager } from "@/features/scheduling/components/triggers/TriggersManager";

export default function AdminTriggersPage() {
  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <TriggersManager orgId={null} seat="admin" />
    </div>
  );
}
