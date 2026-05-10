import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import { AgentAppPublicRenderer } from "@/features/agent-apps/components/AgentAppPublicRenderer";
import { getAgentAppIconsMetadata } from "@/features/agent-apps/utils/favicon-metadata";
import type { Metadata } from "next";

export const revalidate = 3600;

function isUUID(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

async function resolveAgentAppMetadata(slug: string): Promise<{
  name: string;
  tagline: string | null;
  description: string | null;
  preview_image_url: string | null;
  favicon_url: string | null;
} | null> {
  const supabase = (await createClient()) as unknown as any;
  const isId = isUUID(slug);
  const column = isId ? "id" : "slug";

  const { data } = await supabase
    .from("aga_apps")
    .select("name, tagline, description, preview_image_url, favicon_url")
    .eq(column, slug)
    .eq("status", "published")
    .eq("is_public", true)
    .maybeSingle();

  return (data as typeof data) ?? null;
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

  const { data: agentAppData } = await (
    supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: unknown;
        }>;
      };
    }
  )
    .rpc("get_aga_public_data", {
      p_slug: !isId ? slug : null,
      p_app_id: isId ? slug : null,
    })
    .maybeSingle();

  if (!agentAppData) {
    notFound();
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`[p/${slug}] resolved path=agent-app embed=${embed ?? ""}`);
  }

  const app = agentAppData as { id: string; slug: string; [key: string]: unknown };

  // Embed switch: `?embed=widget` forces the widget shell regardless of the
  // row's configured shell_kind. One row, two deployments (full page + iframe).
  if (embed === "widget") {
    const overridden = {
      ...(agentAppData as Record<string, unknown>),
      shell_kind: "widget",
    };
    return (
      <AgentAppPublicRenderer app={overridden as never} slug={app.slug} />
    );
  }

  return <AgentAppPublicRenderer app={agentAppData as never} slug={app.slug} />;
}
