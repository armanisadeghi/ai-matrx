import { createClient } from "@/utils/supabase/server";
import { TemplateViewPage } from "@/features/message-templates/components/TemplateViewPage";
import { MessageTemplateDB } from "@/features/message-templates/types/message-templates-db";
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
        supabase.schema("agent").from("message_template").select("*").eq("id", id).single(),
        supabase.auth.getUser(),
    ]);

    if (templateResult.error || !templateResult.data) {
        notFound();
    }

    const template = templateResult.data as MessageTemplateDB;
    const userId = userResult.data.user?.id;
    const canEdit = template.created_by === userId;

    return (
        <TemplateViewPage
            template={template}
            canEdit={canEdit}
            defaultMode={mode === "edit" && canEdit ? "edit" : "view"}
        />
    );
}
