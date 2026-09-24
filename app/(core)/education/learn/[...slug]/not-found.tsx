"use client";

// The 404 boundary for /education/learn/[...slug]. The page serves only
// PUBLISHED docs, addressed by their slug path — so the gate resolves the slug
// to the row, tells a reader who can open an unpublished doc that it is not
// published, and otherwise answers the access question canonically.

import { useParams } from "next/navigation";
import { SlugAccessGate } from "@/features/access-gate/components/SlugAccessGate";

const TOKENS = ["learn_doc"] as const;

export default function LearnDocUnavailable() {
  const params = useParams();
  const raw = params?.slug;
  const slug = Array.isArray(raw) ? raw.join("/") : typeof raw === "string" ? raw : "";

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <SlugAccessGate
        tokens={TOKENS}
        slug={slug}
        noun="study guide"
        fallbackHref="/education/learn"
        fallbackLabel="All study guides"
        publishFiltered
      />
    </div>
  );
}
