"use client";

// The 404 boundary for /shapes/[kind] and every sub-page under it. The page
// addresses the shape by its kind slug, so the canonical gate resolves the
// slug to the row first (access_gate_resolve_slug) and then says which it is:
// deleted, someone else's, or never existed.

import { useParams } from "next/navigation";
import { SlugAccessGate } from "@/features/access-gate/components/SlugAccessGate";

const TOKENS = ["content_ir_kind"] as const;

export default function ShapeKindUnavailable() {
  const params = useParams();
  const kind = typeof params?.kind === "string" ? params.kind : "";

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <SlugAccessGate
        tokens={TOKENS}
        slug={kind}
        noun="shape"
        fallbackHref="/shapes/all"
        fallbackLabel="All shapes"
      />
    </div>
  );
}
