import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { AppletHostMount } from "@/features/applets-host/AppletHostMount";
import { getAgentAppIconsMetadata } from "@/features/agent-apps/utils/favicon-metadata";
import type { Metadata } from "next";
import { NOT_INDEXED_ROBOTS } from "@/lib/seo/search-engine-indexed";
import { searchEngineRobots } from "@/lib/seo/search-engine-indexed.server";
import { MadeWithAiMatrx } from "@/components/matrx/MadeWithAiMatrx";
import { isUuidShape } from "@ai-matrx/kit/uuid";

// A PUBLISHED APP IS A LINK SOMEBODY SENT (page-pass 2026-09-27). It lives in
// the `(link)` group, not `(public)`: a stranger opening a shared app gets the
// app and one slim attribution row — never the marketing site's Download /
// Discover header or its How-It-Works footer. The URL is unchanged.

export const revalidate = 3600;

type AgentAppMetadata = {
  name: string;
  tagline: string | null;
  description: string | null;
  preview_image_url: string | null;
  favicon_url: string | null;
};

async function resolveAgentAppMetadata(
  slug: string,
): Promise<AgentAppMetadata | null> {
  const supabase = await createClient();
  const isId = isUuidShape(slug);
  const column = isId ? "id" : "slug";

  // Canonical: an app is anonymous-readable only when published to the web
  // (`published_to_web`, the one anonymous lane — access ladder); is_public is a
  // bridge column the DB registry no longer populates for the 'app' resource type.
  const { data } = await supabase
    .schema("app")
    .from("definition")
    .select("name, tagline, description, preview_image_url, favicon_url")
    .is("deleted_at", null)
    .eq(column, slug)
    .eq("status", "published")
    .eq("published_to_web", true)
    .maybeSingle();

  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const agentAppMeta = await resolveAgentAppMetadata(slug);
  if (!agentAppMeta) return { title: "App | AI Matrx", robots: NOT_INDEXED_ROBOTS };
  return {
    title: `${agentAppMeta.name} | AI Matrx Apps`,
    // THE INDEXED SWITCH (access ladder T-12): apps default to not indexed.
    robots: await searchEngineRobots([{ type: "app", key: slug }]),
    description:
      agentAppMeta.tagline ||
      agentAppMeta.description ||
      `Try ${agentAppMeta.name} — An AI-powered app`,
    icons: getAgentAppIconsMetadata(agentAppMeta.favicon_url, agentAppMeta.name),
    openGraph: {
      title: agentAppMeta.name,
      description:
        agentAppMeta.tagline ||
        agentAppMeta.description ||
        `Try ${agentAppMeta.name}`,
      images: agentAppMeta.preview_image_url
        ? [agentAppMeta.preview_image_url]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: agentAppMeta.name,
      description:
        agentAppMeta.tagline ||
        agentAppMeta.description ||
        `Try ${agentAppMeta.name}`,
      images: agentAppMeta.preview_image_url
        ? [agentAppMeta.preview_image_url]
        : [],
    },
  };
}

export default async function PublicAppPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { slug } = await params;
  const { embed } = await searchParams;
  const supabase = await createClient();
  const isId = isUuidShape(slug);

  const { data: rpcRows } = await supabase.rpc("get_aga_public_data", {
    p_slug: !isId ? slug : undefined,
    p_app_id: isId ? slug : undefined,
  });
  const rpcRow = rpcRows?.[0];

  if (!rpcRow) {
    if (isId) {
      return (
        <div className="h-dvh bg-textured">
          <AccessGate token="app" id={slug} fallbackHref="/" fallbackLabel="Home" />
        </div>
      );
    }
    notFound();
  }

  // The published Applet runs through the ONE Applet host — the same frame as /apps/<slug> — for a
  // signed-in viewer and a guest alike (a guest's jobs ride the guest lane; it has no data reach).
  // `?embed=widget` is the same Applet without the attribution row.
  const applet = <AppletHostMount appletId={rpcRow.id} slug={rpcRow.slug} />;
  if (embed === "widget") return applet;

  return (
    <>
      <main className="min-h-0 flex-1 overflow-x-hidden">{applet}</main>
      <MadeWithAiMatrx publisherName={rpcRow.publisher_name} />
    </>
  );
}
