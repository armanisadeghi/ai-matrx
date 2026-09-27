import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { TemplateViewPage } from "@/features/message-templates/components/TemplateViewPage";
import type { MessageTemplateDB } from "@/features/message-templates/types/message-templates-db";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** One read per request, shared by the tab title and the page. */
const loadTemplate = cache(async (id: string) => {
  const supabase = await createClient();
  const [templateResult, userResult] = await Promise.all([
    supabase
      .schema("agent")
      .from("message_template")
      .select("*")
      .eq("id", id)
      .maybeSingle(),
    getClaimsUser(supabase),
  ]);
  return {
    template: (templateResult.data as MessageTemplateDB | null) ?? null,
    userId: userResult.data.user?.id ?? null,
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
