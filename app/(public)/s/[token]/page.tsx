import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { resolveShareToken } from "@/utils/permissions/shareLinks";
import { resolveShareLensMeta } from "@/features/sharing/lenses/metadata";
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

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const result = await resolve(token);
  if (!result.success) {
    return { title: "Shared link · AI Matrx", robots: { index: false } };
  }
  const meta = resolveShareLensMeta(result);
  return {
    title: `${meta.title} · AI Matrx`,
    description: meta.description,
    robots: { index: false }, // link-shared, not publicly indexable
    openGraph: {
      title: meta.title,
      description: meta.description,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
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
