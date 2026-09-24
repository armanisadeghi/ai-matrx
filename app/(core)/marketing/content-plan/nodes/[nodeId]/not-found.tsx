"use client";

// The 404 boundary for /marketing/content-plan/nodes/[nodeId]. Every notFound() in this segment (and below)
// lands here: the canonical access gate asks the platform which state this is
// (denied / deleted / never existed / signed out) and offers the way forward.

import { useParams } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export default function PlanNodeUnavailable() {
  const params = useParams();
  const id = typeof params?.nodeId === "string" ? params.nodeId : "";

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <AccessGate
        token="plan_node"
        id={id}
        fallbackHref="/marketing"
        fallbackLabel="Marketing"
      />
    </div>
  );
}
