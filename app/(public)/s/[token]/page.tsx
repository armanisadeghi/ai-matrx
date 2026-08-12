import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { resolveShareToken } from "@/utils/permissions/shareLinks";
import { SharedResourceView } from "./SharedResourceView";
import { ShareLinkError } from "./ShareLinkError";

// Public, anonymous share-link viewer. The token is the authorization; the
// anon-callable `resolve_share_token` RPC returns the resource content with no
// sign-in. One route renders any registered shareable resource type.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

async function resolve(token: string) {
  const supabase = await createClient();
  return resolveShareToken(token, supabase as never);
}

function resourceTitle(
  resource: Record<string, unknown> | undefined,
): string | null {
  if (!resource) return null;
  for (const k of ["label", "title", "name", "display_label"]) {
    const v = resource[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function aiVisibilityMeta(resource: Record<string, unknown> | undefined): {
  title: string;
  description: string;
} | null {
  const value = resource?.["result"];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const report = value as Record<string, unknown>;
  if (report.result_kind !== "ai_visibility.analyze") return null;
  const brand =
    typeof report.brand_name === "string" ? report.brand_name : "this brand";
  const query =
    typeof report.query === "string" ? report.query : "a real buyer question";
  return {
    title: `${brand} AI Visibility Report`,
    description: `See how ChatGPT, Claude, Gemini, and Perplexity answer “${query}” — including brand position, mentions, citations, and decision signals.`,
  };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const result = await resolve(token);
  if (!result.success) {
    return { title: "Shared link · AI Matrx", robots: { index: false } };
  }
  const reportMeta = aiVisibilityMeta(result.resource);
  if (reportMeta) {
    return {
      title: `${reportMeta.title} · AI Matrx`,
      description: reportMeta.description,
      robots: { index: false },
      openGraph: {
        title: reportMeta.title,
        description: reportMeta.description,
        type: "article",
      },
      twitter: {
        card: "summary_large_image",
        title: reportMeta.title,
        description: reportMeta.description,
      },
    };
  }
  const title =
    resourceTitle(result.resource) ?? result.displayLabel ?? "Shared item";
  return {
    title: `${title} · AI Matrx`,
    description: `A ${result.displayLabel ?? "resource"} shared with you on AI Matrx.`,
    robots: { index: false }, // link-shared, not publicly indexable
    openGraph: {
      title,
      description: `A ${result.displayLabel ?? "resource"} shared with you on AI Matrx.`,
    },
  };
}

export default async function SharedTokenPage({ params }: PageProps) {
  const { token } = await params;
  const result = await resolve(token);

  if (!result.success) {
    return <ShareLinkError message={result.message} />;
  }

  return <SharedResourceView result={result} token={token} />;
}
