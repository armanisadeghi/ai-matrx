import { createClient } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';
import { PromptAppPublicRendererDirect } from '@/features/prompt-apps/components/PromptAppPublicRendererDirect';
import { getPromptAppIconsMetadata } from '@/features/prompt-apps/utils/favicon-metadata';
import type { Metadata } from 'next';
import { graveyardDb } from "@/utils/supabase/graveyardDb";

export const revalidate = 3600; // Revalidate every hour

// Helper to check if string is a valid UUID
function isUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

export async function generateMetadata({
    params
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const supabase = await createClient();

    // Determine if we're searching by ID or slug
    const isId = isUUID(slug);
    const column = isId ? 'id' : 'slug';

    const { data: app } = await graveyardDb(supabase)
        .from("prompt_apps")
        .select('name, tagline, description, preview_image_url, favicon_url')
        .eq(column, slug)
        .eq('status', 'published')
        .single();

    if (!app) {
        return {
            title: 'App Not Found',
        };
    }

    return {
        title: `${app.name} | AI Matrx Apps (Demo)`,
        description: app.tagline || app.description || `Try ${app.name} - An AI-powered app`,
        icons: getPromptAppIconsMetadata(app.favicon_url, 'demo'),
        openGraph: {
            title: app.name,
            description: app.tagline || app.description || `Try ${app.name}`,
            images: app.preview_image_url ? [app.preview_image_url] : [],
        },
        twitter: {
            card: 'summary_large_image',
            title: app.name,
            description: app.tagline || app.description || `Try ${app.name}`,
            images: app.preview_image_url ? [app.preview_image_url] : [],
        },
    };
}

export default async function PromptAppDemoPage({
    params
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const supabase = await createClient();

    // Determine if we're searching by ID or slug
    const isId = isUUID(slug);

    // OPTIMIZATION: Fetch app + prompt in a single optimized query
    const { data: appWithPromptRaw, error } = await supabase
        .rpc('get_published_app_with_prompt', {
            p_slug: !isId ? slug : null,
            p_app_id: isId ? slug : null
        })
        .single();

    if (error || !appWithPromptRaw) {
        notFound();
    }

    // Transform database response to match PromptApp type
    const appWithPrompt = appWithPromptRaw as any;
    const app = {
        ...appWithPrompt,
        prompt: {
            messages: appWithPrompt.prompt_messages,
            settings: appWithPrompt.prompt_settings,
            variable_defaults: appWithPrompt.prompt_variable_defaults
        }
    };

    // Remove the raw fields (keep the data clean)
    delete app.prompt_messages;
    delete app.prompt_settings;
    delete app.prompt_variable_defaults;

    return (
        <PromptAppPublicRendererDirect
            app={app}
            slug={app.slug}
        />
    );
}

