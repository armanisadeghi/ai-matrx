"use client";

// The 404 boundary for /education/subjects/quick-math/[id].
//
// It used to assert "Math Problem Not Found" over a read that equally means
// denied, deleted, never existed, or signed out. The access gate asks the
// platform which of those it actually is and offers the way forward.

import { useParams } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export default function QuickMathProblemUnavailable() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <AccessGate
        token="math_problem"
        id={id}
        fallbackHref="/education/subjects/quick-math"
        fallbackLabel="Quick Math"
      />
    </div>
  );
}
