import { createClient } from "@/utils/supabase/server";
import { TemplateEditor } from "@/features/content-templates/components/TemplateEditor";
import { ContentTemplateDB } from "@/features/content-templates/types/content-templates-db";
import { notFound } from "next/navigation";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function EditTemplatePage({ params }: PageProps) {
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("content_template")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !data) {
        notFound();
    }

    return <TemplateEditor mode="edit" template={data as ContentTemplateDB} />;
}
