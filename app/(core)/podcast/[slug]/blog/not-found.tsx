"use client";

// The 404 boundary for /podcast/[slug]/blog — an episode's published companion
// article. The gate resolves the episode by slug; a reader who can open the
// episode is told the post is not published, everyone else gets the canonical
// access answer about the episode.

import { useParams } from "next/navigation";
import { SlugAccessGate } from "@/features/access-gate/components/SlugAccessGate";

const TOKENS = ["pc_episode"] as const;

export default function PodcastBlogUnavailable() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <SlugAccessGate
        tokens={TOKENS}
        slug={slug}
        noun="blog post"
        fallbackHref={slug ? `/podcast/${encodeURIComponent(slug)}` : "/podcast"}
        fallbackLabel="The episode"
        publishFiltered
      />
    </div>
  );
}
