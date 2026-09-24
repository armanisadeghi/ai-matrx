"use client";

// The 404 boundary for /podcast/[slug]. The slug (or uuid) names an episode OR
// a show — the page tries the episode first, and so does the gate. It serves
// only published episodes, so a reader who can open an unpublished one is told
// exactly that; everyone else gets the canonical access answer.

import { useParams } from "next/navigation";
import { SlugAccessGate } from "@/features/access-gate/components/SlugAccessGate";

const TOKENS = ["pc_episode", "pc_show"] as const;

export default function PodcastUnavailable() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <SlugAccessGate
        tokens={TOKENS}
        slug={slug}
        noun="podcast"
        fallbackHref="/podcast"
        fallbackLabel="Podcasts"
        publishFiltered
      />
    </div>
  );
}
