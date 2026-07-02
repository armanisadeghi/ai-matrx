import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import { AgentAppPublicRenderer } from "@/features/agent-apps/components/AgentAppPublicRenderer";
import { getAgentAppIconsMetadata } from "@/features/agent-apps/utils/favicon-metadata";
import type { Metadata } from "next";
import type { PublicAgentApp } from "@/features/agent-apps/types";

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
  if (!agentAppMeta) return { title: "App Not Found" };
  return {
    title: `${agentAppMeta.name} | AI Matrx Apps`,
    description:
      agentAppMeta.tagline ||
      agentAppMeta.description ||
      `Try ${agentAppMeta.name} — An AI-powered app`,
    icons: getAgentAppIconsMetadata(agentAppMeta.favicon_url),
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
    notFound();
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`[p/${slug}] resolved path=agent-app embed=${embed ?? ""}`);
  }

  // The public RPC intentionally omits internal/admin-only fields
  // (app_kind, shared_context_slots, search_tsv, usage/cost aggregates)
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
    app_kind: "custom",
    shared_context_slots: null,
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
      <AgentAppPublicRenderer app={{ ...app, shell_kind: "widget" }} slug={app.slug} />
    );
  }

  return <AgentAppPublicRenderer app={app} slug={app.slug} />;
}
