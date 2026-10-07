// app/(link)/site/[slug]/page.tsx — a Spaces page published to the web (Notion "Publish").
//
// A link somebody sent, so it lives in `(link)`: the page and one attribution row, no marketing chrome.
// The ONE read is `content.space_public_view` (published_to_web, the platform's only anonymous lane):
// a page not on the web answers exactly like one that never existed. Sub-pages answer only when their
// page published them ("Include sub-pages"). Search engines are told the creator's choice (T-12).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { PublicSpace } from "@/features/spaces/public/PublicSpace";
import {
  publicCoverImage,
  publicDescription,
  readPublicView,
} from "@/features/spaces/public/public-view";
import "@blocknote/shadcn/style.css";
import "@/features/spaces/spaces.css";
import { isUuidShape } from "@ai-matrx/kit/uuid";
import { NOT_INDEXED_ROBOTS, robotsFor } from "@/lib/seo/search-engine-indexed";
import { createClient } from "@/utils/supabase/server";

const loadView = cache(async (key: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("content")
    .rpc("space_public_view", { p_key: key });
  if (error)
    throw new Error(
      `content.space_public_view failed for "${key}": ${error.message}`,
    );
  return readPublicView(data);
});

function origin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://aimatrx.com";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const view = await loadView(decodeURIComponent(slug));
  if (!view) return { title: "Page | AI Matrx", robots: NOT_INDEXED_ROBOTS };
  const title = view.title || "Untitled";
  const description = publicDescription(view) || undefined;
  const image = publicCoverImage(view, origin());
  const images = image ? [image] : [];
  return {
    title,
    description,
    robots: robotsFor(view.indexed),
    alternates: { canonical: `/site/${view.slug ?? view.id}` },
    openGraph: { title, description, images, type: "article" },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images,
    },
  };
}

export default async function PublishedSpacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const key = decodeURIComponent(slug);
  const view = await loadView(key);
  if (!view) {
    if (isUuidShape(key)) {
      return (
        <div className="h-dvh bg-textured">
          <AccessGate
            token="document"
            id={key}
            fallbackHref="/"
            fallbackLabel="Home"
          />
        </div>
      );
    }
    notFound();
  }
  return <PublicSpace view={view} />;
}
