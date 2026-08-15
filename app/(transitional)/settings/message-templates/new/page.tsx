import { TemplateEditor } from "@/features/message-templates/components/TemplateEditor";
import { createClient } from "@/utils/supabase/server";
import type { MessageTemplateEditorSource } from "@/features/message-templates/types/message-templates-db";

interface PageProps {
  searchParams: Promise<{ from?: string }>;
}

export default async function NewTemplatePage({ searchParams }: PageProps) {
  const { from } = await searchParams;

  let sourceTemplate: MessageTemplateEditorSource | null = null;

  if (from) {
    const supabase = await createClient();
    const { data } = await supabase
      .schema("agent")
      .from("message_template")
      .select("*")
      .eq("id", from)
      .single();

    if (data) {
      sourceTemplate = {
        ...data,
        id: "",
        label: `${data.label ?? "Template"} (Copy)`,
        visibility: "internal",
      };
    }
  }

  return <TemplateEditor mode="create" template={sourceTemplate} />;
}
