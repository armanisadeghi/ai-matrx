import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { TemplateEditor } from "@/features/message-templates/components/TemplateEditor";
import type { MessageTemplateEditorSource } from "@/features/message-templates/types/message-templates-db";

interface PageProps {
  searchParams: Promise<{ from?: string }>;
}

export default async function NewTemplatePage({ searchParams }: PageProps) {
  const { from } = await searchParams;
  let sourceTemplate: MessageTemplateEditorSource | null = null;

  if (from) {
    const supabase = await createClient();

    // "Duplicate from" is a signed-in-only creation action, and the `*` this
    // read used includes `metadata`, which `anon` holds no grant on (see
    // lib/security/public-exposure.ts#ANON_COLUMN_SURFACE) — a signed-out
    // visitor got a silent 42501 and no prefill. Gate on auth first so
    // there is no doomed round trip.
    const userResult = await getClaimsUser(supabase);
    const { data } = userResult.data.user?.id
      ? await supabase
          .schema("agent")
          .from("message_template")
          .select("*")
          .eq("id", from)
          .single()
      : { data: null };

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
