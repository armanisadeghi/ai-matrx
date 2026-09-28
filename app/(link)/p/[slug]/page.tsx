import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { AgentAppPublicRenderer } from "@/features/agent-apps/components/AgentAppPublicRenderer";
import { PUBLIC_AGENT_APP_SURFACE_NAME } from "@/features/surfaces/manifests/public-agent-app.manifest";
import { getAgentAppIconsMetadata } from "@/features/agent-apps/utils/favicon-metadata";
import type { Metadata } from "next";
import { NOT_INDEXED_ROBOTS } from "@/lib/seo/search-engine-indexed";
import { searchEngineRobots } from "@/lib/seo/search-engine-indexed.server";
import type { PublicAgentApp } from "@/features/agent-apps/types";
import { CanvasSideSheet } from "@/features/canvas/core/CanvasSideSheet";
import { MadeWithAiMatrx } from "@/components/matrx/MadeWithAiMatrx";

// A PUBLISHED APP IS A LINK SOMEBODY SENT (page-pass 2026-09-27). It lives in
// the `(link)` group, not `(public)`: a stranger opening a shared app gets the
// app and one slim attribution row — never the marketing site's Download /
// Discover header or its How-It-Works footer. The URL is unchanged.

export const revalidate = 3600;

function isUUID(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

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
  const isId = isUUID(slug);
  const column = isId ? "id" : "slug";

  // Canonical: app.definition uses visibility enum (not is_public bool).
  // make_resource_public sets visibility='public'; is_public is a bridge column
  // that the DB registry no longer populates for the 'app' resource type.
  const { data } = await supabase
    .schema("app")
    .from("definition")
    .select("name, tagline, description, preview_image_url, favicon_url")
    .is("deleted_at", null)
    .eq(column, slug)
    .eq("status", "published")
    .eq("visibility", "public")
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
  const isId = isUUID(slug);

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

  if (process.env.NODE_ENV !== "production") {
    console.log(`[p/${slug}] resolved path=agent-app embed=${embed ?? ""}`);
  }

  // The public RPC intentionally omits internal/admin-only fields
  // (app_kind, shared_context_policies, search_tsv, usage/cost aggregates)
  // that PublicAgentApp declares but the public renderer never reads.
  const app: PublicAgentApp = {
    id: rpcRow.id,
    slug: rpcRow.slug,
    name: rpcRow.name,
    tagline: rpcRow.tagline,
    description: rpcRow.description,
    category: rpcRow.category,
    tags: rpcRow.tags,
    agent_id: rpcRow.agent_id,
    agent_version_id: rpcRow.agent_version_id,
    use_latest: rpcRow.use_latest,
    // The app's JOB, plus the system-default Holder the RPC resolved for us.
    // A guest cannot read `mandate.definition` and has no bindings, so this IS
    // their whole resolution — see `features/agent-apps/lib/appHolder.ts`.
    // Ignored entirely while APP_MANDATE_CUTOVER is OFF.
    mandate_id: rpcRow.mandate_id,
    mandate_key: rpcRow.mandate_key,
    mandate_agent_id: rpcRow.mandate_agent_id,
    mandate_agent_version_id: rpcRow.mandate_agent_version_id,
    app_kind: "custom",
    shared_context_policies: null,
    search_tsv: null,
    component_code: rpcRow.component_code,
    component_language: rpcRow.component_language as PublicAgentApp["component_language"],
    allowed_imports: rpcRow.allowed_imports,
    variable_schema: rpcRow.variable_schema,
    layout_config: rpcRow.layout_config,
    styling_config: rpcRow.styling_config,
    shell_kind: rpcRow.shell_kind as PublicAgentApp["shell_kind"],
    shell_config: rpcRow.shell_config,
    slot_overrides: rpcRow.slot_overrides,
    slot_code: rpcRow.slot_code,
    preview_image_url: rpcRow.preview_image_url,
    favicon_url: rpcRow.favicon_url,
    total_executions: rpcRow.total_executions,
    success_rate: rpcRow.success_rate,
  };

  // Embed switch: `?embed=widget` forces the widget shell regardless of the
  // row's configured shell_kind. One row, two deployments (full page + iframe).
  if (embed === "widget") {
    return (
      <>
        <AgentAppPublicRenderer
          app={{ ...app, shell_kind: "widget" }}
          slug={app.slug}
          surfaceName={PUBLIC_AGENT_APP_SURFACE_NAME}
        />
        <CanvasSideSheet />
      </>
    );
  }

  // This route is the ONLY one that emits `matrx-public/p` — the anonymous
  // visitor surface. Authed agent-app routes inherit `matrx-user/agent-apps`.
  return (
    <>
      <main className="min-h-0 flex-1 overflow-x-hidden">
        <AgentAppPublicRenderer
          app={app}
          slug={app.slug}
          surfaceName={PUBLIC_AGENT_APP_SURFACE_NAME}
        />
      </main>
      <MadeWithAiMatrx publisherName={rpcRow.publisher_name} />
      {/* Agent output can open the canvas; `(link)` carries no canvas host of
          its own, so the app page mounts the lazy front door itself. */}
      <CanvasSideSheet />
    </>
  );
}
