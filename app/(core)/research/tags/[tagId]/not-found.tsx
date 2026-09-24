"use client";

// The 404 boundary for /research/tags/[tagId] — the short link that resolves a
// tag to its topic-scoped route. When the tag can't be read (malformed id,
// deleted, someone else's), the canonical access gate says which it is.

import { useParams } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export default function ResearchTagUnavailable() {
  const params = useParams();
  const id = typeof params?.tagId === "string" ? params.tagId : "";

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <AccessGate
        token="research_tag"
        id={id}
        fallbackHref="/research/topics"
        fallbackLabel="Your research topics"
      />
    </div>
  );
}
