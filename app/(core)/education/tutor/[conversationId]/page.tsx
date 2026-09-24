// /education/tutor/[conversationId] — a single AI Tutor conversation. Server
// shell: resolves async params, then renders the client conversation island
// (code-split) which loads the existing transcript. View-gated (the shareable
// read-only transcript); the live tutor itself is the owner's session.
//
// THE ROW IS THE GATE — the same decision /chat/[conversationId] makes. The
// conversation row is read here, as the viewer, BY ID (RLS decides; no
// organization is involved in reading one record). An empty or failed read is
// never guessed at: it renders <AccessGate>, which asks the platform whether
// the conversation is denied, deleted, missing, or the session is signed out.
// Without this the client island rendered a blank new tutor chat (missing) or
// an empty "Shared conversation — read-only" transcript (denied).
import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { toolMetadata } from "@/features/education/route-helpers";
import { EducationTutorClient } from "@/features/education/tutor/components/EducationTutorClient";

export const metadata: Metadata = toolMetadata("tutor");

interface TutorConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function TutorConversationPage({
  params,
}: TutorConversationPageProps) {
  const { conversationId } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("chat")
    .from("conversation")
    .select("id, initial_agent_id")
    .eq("id", conversationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error(
        `[education/tutor/${conversationId}] conversation read failed at SSR:`,
        error,
      );
    }
    return (
      <div className="flex h-full flex-col overflow-hidden bg-textured">
        <AccessGate
          token="conversation"
          id={conversationId}
          error={error ?? undefined}
          fallbackHref="/education/tutor"
          fallbackLabel="AI Tutor"
        />
      </div>
    );
  }

  return (
    <EducationTutorClient
      conversationId={conversationId}
      conversationAgentId={(data.initial_agent_id as string | null) ?? null}
    />
  );
}
