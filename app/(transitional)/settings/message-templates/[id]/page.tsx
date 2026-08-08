import { createClient } from "@/utils/supabase/server";
import { TemplateViewPage } from "@/features/content-templates/components/TemplateViewPage";
import { ContentTemplateDB } from "@/features/content-templates/types/content-templates-db";
import { notFound } from "next/navigation";

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ mode?: "view" | "edit" }>;
}

export default async function TemplateDetailPage({ params, searchParams }: PageProps) {
    const { id } = await params;
    const { mode } = await searchParams;

    const supabase = await createClient();

    const [templateResult, userResult] = await Promise.all([
        supabase.from("content_template").select("*").eq("id", id).single(),
        supabase.auth.getUser(),
    ]);

    if (templateResult.error || !templateResult.data) {
        notFound();
    }

    const template = templateResult.data as ContentTemplateDB;
    const userId = userResult.data.user?.id;
    const canEdit = template.user_id === userId;

    return (
        <TemplateViewPage
            template={template}
            canEdit={canEdit}
            defaultMode={mode === "edit" && canEdit ? "edit" : "view"}
        />
    );
}
