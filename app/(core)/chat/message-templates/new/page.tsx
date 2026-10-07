import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { TemplateViewPage } from "@/features/message-templates/components/TemplateViewPage";
import type { MessageTemplateDB, MessageTemplateEditorSource } from "@/features/message-templates/types/message-templates-db";

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
          .is("deleted_at", null)
          .single()
      : { data: null };

    if (data) {
      sourceTemplate = {
        ...data,
        id: "",
        label: `${data.label ?? "Template"} (Copy)`,
        published_to_web: false,
      };
    }
  }

  // The ONE template editor, opened in create mode on a blank (or duplicated) starting point.
  const start = {
    id: "",
    label: sourceTemplate?.label ?? "",
    content: sourceTemplate?.content ?? "",
    role: sourceTemplate?.role ?? "user",
    tags: sourceTemplate?.tags ?? [],
    metadata: sourceTemplate?.metadata ?? null,
    published_to_web: false,
    organization_id: null,
    version: 1,
    updated_at: null,
  } as unknown as MessageTemplateDB;
  return <TemplateViewPage template={start} canEdit create />;
}
