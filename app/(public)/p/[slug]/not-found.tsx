"use client";

// The 404 boundary for /p/[slug] when the address is a SLUG (a uuid miss is
// gated inline by the page). The page serves only published, public apps, so a
// reader who can open an unpublished one is told exactly that; everyone else
// gets the canonical access answer.

import { useParams } from "next/navigation";
import { SlugAccessGate } from "@/features/access-gate/components/SlugAccessGate";

const TOKENS = ["app"] as const;

export default function PublicAppUnavailable() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";

  return (
    <div className="h-[calc(100dvh-var(--header-height,2.5rem))] bg-textured">
      <SlugAccessGate
        tokens={TOKENS}
        slug={slug}
        noun="app"
        fallbackHref="/"
        fallbackLabel="Home"
        publishFiltered
      />
    </div>
  );
}
