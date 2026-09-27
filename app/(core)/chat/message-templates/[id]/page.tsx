import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { TemplateViewPage } from "@/features/message-templates/components/TemplateViewPage";
import { publicLaneSelect } from "@/utils/permissions/publicLane";
import type { MessageTemplateDB } from "@/features/message-templates/types/message-templates-db";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** One read per request, shared by the tab title and the page. */
const loadTemplate = cache(async (id: string) => {
  const supabase = await createClient();
  const userResult = await getClaimsUser(supabase);
  const userId = userResult.data.user?.id ?? null;

  // A signed-out visitor runs this query as `anon`, which holds only a COLUMN
  // grant on agent.message_template (8 columns — see
  // lib/security/public-exposure.ts#ANON_COLUMN_SURFACE), never a table grant.
  // `select("*")` asked for every column and got refused (42501) for the
  // whole request, so a signed-out visitor saw the access gate even for a
  // genuinely public template. Name the columns anon can read; a signed-in
  // caller still gets the full row.
  const templateResult = await supabase
    .schema("agent")
    .from("message_template")
    .select(userId ? "*" : publicLaneSelect("message_template"))
    .eq("id", id)
    .maybeSingle();

  return {
    template: (templateResult.data as MessageTemplateDB | null) ?? null,
    userId,
  };
});

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const { template } = await loadTemplate(id);
  return createDynamicRouteMetadata("/chat", {
    title: template?.label || "Message template",
    description: "A saved message template.",
    letter: "MT",
  });
}

export default async function TemplateDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { template, userId } = await loadTemplate(id);

  // An empty or refused read shows the canonical access gate, which says
  // which of denied / deleted / never existed / signed out it is.
  if (!template) {
    return (
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <AccessGate
          token="message_template"
          id={id}
          fallbackHref="/chat/message-templates"
          fallbackLabel="Message templates"
        />
      </div>
    );
  }

  return (
    <TemplateViewPage
      template={template}
      canEdit={template.created_by === userId}
    />
  );
}
