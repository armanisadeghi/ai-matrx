import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { TemplateReadFailure } from "@/features/message-templates/components/TemplateReadFailure";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { TemplateViewPage } from "@/features/message-templates/components/TemplateViewPage";
import { publicLaneSelect } from "@/utils/permissions/publicLane";
import type { MessageTemplateDB } from "@/features/message-templates/types/message-templates-db";

interface PageProps {
  params: Promise<{ id: string }>;
}

const READ_TIMEOUT_MS = 8000;

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
  const base = supabase
    .schema("agent")
    .from("message_template")
    .select(userId ? "*" : publicLaneSelect("message_template"))
    .eq("id", id);
  // An archived template is in Trash: its page shows the access gate. Anon
  // holds no grant on deleted_at, and its RLS lane (pub_read) already hides
  // archived rows, so the filter is added only for a signed-in reader.
  // Bounded: a slow database answers with an honest error, never a 504.
  const templateResult = await (userId ? base.is("deleted_at", null) : base)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
    .maybeSingle();

  return {
    template: (templateResult.data as MessageTemplateDB | null) ?? null,
    // maybeSingle() answers "no row" with data null and NO error; an error
    // here is a failed read (timeout, network), not a missing template.
    readError: templateResult.error ? templateResult.error.message : null,
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
  const { template, readError, userId } = await loadTemplate(id);

  if (readError) {
    return (
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <TemplateReadFailure error={readError} />
      </div>
    );
  }

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
