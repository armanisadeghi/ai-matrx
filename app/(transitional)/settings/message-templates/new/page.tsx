import { TemplateEditor } from "@/features/message-templates/components/TemplateEditor";
import { createClient } from "@/utils/supabase/server";
import { MessageTemplateDB } from "@/features/message-templates/types/message-templates-db";

interface PageProps {
    searchParams: Promise<{ from?: string }>;
}

export default async function NewTemplatePage({ searchParams }: PageProps) {
    const { from } = await searchParams;

    let sourceTemplate: MessageTemplateDB | null = null;

    if (from) {
        const supabase = await createClient();
        const { data } = await supabase
            .schema("agent").from("message_template")
            .select("*")
            .eq("id", from)
            .single();

        if (data) {
            sourceTemplate = {
                ...(data as MessageTemplateDB),
                id: "",
                label: `${(data as MessageTemplateDB).label} (Copy)`,
                visibility: "internal",
                created_at: "",
                updated_at: null,
                created_by: null,
            };
        }
    }

    return <TemplateEditor mode="create" template={sourceTemplate} />;
}
