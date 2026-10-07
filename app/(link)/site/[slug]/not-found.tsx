"use client";

// The 404 boundary for /site/[slug] when the address is a link (a uuid miss is gated inline by the
// page). Only pages published to the web answer here, so a reader who can open the page is told it is
// not published; everyone else gets the canonical access answer.

import { useParams } from "next/navigation";
import { SlugAccessGate } from "@/features/access-gate/components/SlugAccessGate";

const TOKENS = ["document"] as const;

export default function PublishedSpaceUnavailable() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  return (
    <div className="h-dvh bg-textured">
      <SlugAccessGate
        tokens={TOKENS}
        slug={slug}
        noun="page"
        fallbackHref="/"
        fallbackLabel="Home"
        publishFiltered
      />
    </div>
  );
}
