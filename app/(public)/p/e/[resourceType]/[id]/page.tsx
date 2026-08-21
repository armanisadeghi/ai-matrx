import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { getShareableResource } from "@/utils/permissions/registry";
import { PUBLIC_LANE_TYPES } from "@/utils/permissions/publicLane";
import { isFullUuid } from "@/utils/supabase-search";
import { loadPublicResource } from "../../loadPublicResource";
import { PublicResourceView } from "./PublicResourceView";

/**
 * `/p/e/[resourceType]/[id]` — the id-addressed, INDEXABLE public viewer for
 * `visibility='public'` resources (P7 two-lane model). No token; the resource's
 * own visibility + anon RLS (`pub_read`) is the authorization. This is the SEO /
 * community-library lane P6-C browses into. The token lane (`/s/[token]`,
 * noindex) is separate — keep both.
 *
 * A private / missing / unregistered resource 404s (loadPublicResource → null).
 */
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ resourceType: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { resourceType, id } = await params;
  const resource = await loadPublicResource(resourceType, id);
  if (!resource) {
    const entry = getShareableResource(resourceType);
    return {
      title: `${entry?.displayLabel ?? "Public resource"} · AI Matrx`,
      robots: { index: false },
    };
  }
  const description =
    resource.description ?? `A ${resource.displayLabel.toLowerCase()} shared publicly on AI Matrx.`;
  const canonical = `/p/e/${resource.resourceType}/${resource.resourceId}`;
  return {
    title: `${resource.title} · AI Matrx`,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title: resource.title,
      description,
      url: canonical,
      type: "article",
    },
    twitter: { card: "summary", title: resource.title, description },
  };
}

export default async function PublicResourcePage({ params }: PageProps) {
  const { resourceType, id } = await params;
  const resource = await loadPublicResource(resourceType, id);
  if (!resource) {
    const entry = getShareableResource(resourceType);
    if (entry && PUBLIC_LANE_TYPES.has(entry.resourceType) && isFullUuid(id)) {
      return (
        <div className="h-[calc(100dvh-var(--header-height,2.5rem))] bg-textured">
          <AccessGate
            token={entry.resourceType}
            id={id}
            fallbackHref="/"
            fallbackLabel="Home"
          />
        </div>
      );
    }
    notFound();
  }
  return <PublicResourceView resource={resource} />;
}
