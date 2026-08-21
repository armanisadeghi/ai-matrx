import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { TemplateEditor } from "@/features/message-templates/components/TemplateEditor";
import type { MessageTemplateDB } from "@/features/message-templates/types/message-templates-db";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTemplatePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("message_template")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) notFound();

  return <TemplateEditor mode="edit" template={data as MessageTemplateDB} />;
}
