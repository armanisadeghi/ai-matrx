"use client";

// The 404 boundary for /shapes/id/[id] — the resolver that turns a shape's id
// into its kind route. When the shape can't be read (deleted, someone else's,
// never existed), the canonical access gate says which.

import { useParams } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export default function ShapeIdUnavailable() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <AccessGate
        token="content_ir_kind"
        id={id}
        fallbackHref="/shapes/all"
        fallbackLabel="All shapes"
      />
    </div>
  );
}
