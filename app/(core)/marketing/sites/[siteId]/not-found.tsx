"use client";

// The 404 boundary for /marketing/sites/[siteId] and every legacy section below it. Every notFound() in this segment (and below)
// lands here: the canonical access gate asks the platform which state this is
// (denied / deleted / never existed / signed out) and offers the way forward.

import { useParams } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export default function LegacySiteUnavailable() {
  const params = useParams();
  const id = typeof params?.siteId === "string" ? params.siteId : "";

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <AccessGate
        token="web_site"
        id={id}
        fallbackHref="/marketing/brands"
        fallbackLabel="Your brands"
      />
    </div>
  );
}
