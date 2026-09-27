import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { TemplateEditor } from "@/features/message-templates/components/TemplateEditor";
import type { MessageTemplateDB } from "@/features/message-templates/types/message-templates-db";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTemplatePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // A signed-out visitor runs as `anon`, which holds only a COLUMN grant on
  // agent.message_template (never `*` — see
  // lib/security/public-exposure.ts#ANON_COLUMN_SURFACE), and editing a
  // template is a signed-in-only action anyway: gate before the `*` read so
  // a signed-out visitor gets the same not-found result without a 42501
  // round trip.
  const userResult = await getClaimsUser(supabase);
  if (!userResult.data.user?.id) notFound();

  const { data, error } = await supabase
    .schema("agent")
    .from("message_template")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) notFound();

  return <TemplateEditor mode="edit" template={data as MessageTemplateDB} />;
}
