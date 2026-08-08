import { TemplateEditor } from "@/features/content-templates/components/TemplateEditor";
import { createClient } from "@/utils/supabase/server";
import { ContentTemplateDB } from "@/features/content-templates/types/content-templates-db";

interface PageProps {
    searchParams: Promise<{ from?: string }>;
}

export default async function NewTemplatePage({ searchParams }: PageProps) {
    const { from } = await searchParams;

    let sourceTemplate: ContentTemplateDB | null = null;

    if (from) {
        const supabase = await createClient();
        const { data } = await supabase
            .from("content_template")
            .select("*")
            .eq("id", from)
            .single();

        if (data) {
            sourceTemplate = {
                ...(data as ContentTemplateDB),
                id: "",
                label: `${(data as ContentTemplateDB).label} (Copy)`,
                is_public: false,
                created_at: "",
                updated_at: null,
                user_id: null,
            };
        }
    }

    return <TemplateEditor mode="create" template={sourceTemplate} />;
}
