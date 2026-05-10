import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import { PromptAppPublicRendererFastAPI } from "@/features/prompt-apps/components/PromptAppPublicRendererFastAPI";
import { getPromptAppIconsMetadata } from "@/features/prompt-apps/utils/favicon-metadata";
import { AgentAppPublicRenderer } from "@/features/agent-apps/components/AgentAppPublicRenderer";
import { getAgentAppIconsMetadata } from "@/features/agent-apps/utils/favicon-metadata";
import { BACKEND_URLS, ENDPOINTS } from "@/lib/api/endpoints";
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

async function resolvePromptAppMetadata(slug: string): Promise<{
  name: string;
  tagline: string | null;
  description: string | null;
  preview_image_url: string | null;
  favicon_url: string | null;
} | null> {
  const supabase = await createClient();
  const isId = isUUID(slug);
  const column = isId ? "id" : "slug";

  const { data } = await supabase
    .from("prompt_apps")
    .select("name, tagline, description, preview_image_url, favicon_url")
    .eq(column, slug)
    .eq("status", "published")
    .maybeSingle();

  return data ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  const agentAppMeta = await resolveAgentAppMetadata(slug);
  if (agentAppMeta) {
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

  const promptAppMeta = await resolvePromptAppMetadata(slug);
  if (promptAppMeta) {
    return {
      title: `${promptAppMeta.name} | AI Matrx Apps`,
      description:
        promptAppMeta.tagline ||
        promptAppMeta.description ||
        `Try ${promptAppMeta.name} - An AI-powered app`,
      icons: getPromptAppIconsMetadata(promptAppMeta.favicon_url),
      openGraph: {
        title: promptAppMeta.name,
        description:
          promptAppMeta.tagline ||
          promptAppMeta.description ||
          `Try ${promptAppMeta.name}`,
        images: promptAppMeta.preview_image_url
          ? [promptAppMeta.preview_image_url]
          : [],
      },
      twitter: {
        card: "summary_large_image",
        title: promptAppMeta.name,
        description:
          promptAppMeta.tagline ||
          promptAppMeta.description ||
          `Try ${promptAppMeta.name}`,
        images: promptAppMeta.preview_image_url
          ? [promptAppMeta.preview_image_url]
          : [],
      },
    };
  }

  return { title: "App Not Found" };
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

  if (agentAppData) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[p/${slug}] resolved path=agent-app embed=${embed ?? ""}`);
    }
    const app = agentAppData as {
      id: string;
      slug: string;
      [key: string]: unknown;
    };
    // Embed switch: `?embed=widget` forces the widget shell regardless of
    // the row's configured shell_kind. Lets a single app expose both a
    // full-page deployment and a compact iframe deployment from the same
    // record. The renderer then strips chrome via the widget shell itself.
    const isWidgetEmbed = embed === "widget";
    if (isWidgetEmbed) {
      const overridden = {
        ...(agentAppData as Record<string, unknown>),
        shell_kind: "widget",
      };
      return (
        <AgentAppPublicRenderer app={overridden as never} slug={app.slug} />
      );
    }
    return (
      <AgentAppPublicRenderer app={agentAppData as never} slug={app.slug} />
    );
  }

  const { data: promptAppData, error: promptError } = await supabase
    .rpc("get_prompt_app_public_data", {
      p_slug: !isId ? slug : null,
      p_app_id: isId ? slug : null,
    })
    .single();

  if (promptError || !promptAppData) {
    notFound();
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`[p/${slug}] resolved path=prompt-app`);
  }

  const app = promptAppData as never as { id: string; slug: string };

  const warmUrl = `${BACKEND_URLS.production}${ENDPOINTS.ai.appWarm(app.id)}`;
  fetch(warmUrl, { method: "POST" }).catch(() => {});

  return <PromptAppPublicRendererFastAPI app={app as never} slug={app.slug} />;
}
