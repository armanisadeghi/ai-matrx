import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { ChatNewClient } from "@/features/agents/components/chat/ChatNewClient";
import { ChatRunHeader } from "@/features/agents/components/chat/ChatRunHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import {
  DEFAULT_NEW_CHAT_AGENT_ID,
  PRIMARY_QUICK_ACTIONS,
  SECONDARY_QUICK_ACTIONS,
} from "@/features/agents/components/chat/chat-quick-actions.config";
import { WorkspaceConversionNudge } from "@/features/auth/components/conversion/WorkspaceConversionNudge";
import { ArrowUp, ArrowUpRight, Mic, Plus } from "lucide-react";

/**
 * Single-column SSR lookup for the default agent's display name so the chat
 * picker bar has a real label on first paint (instead of the bare placeholder
 * or a "loading" flicker). The lazy `AgentListDropdown` still defers its full
 * fetch until the user actually clicks the picker.
 */
async function resolveDefaultAgentName(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("name")
    .is("deleted_at", null)
    .eq("id", DEFAULT_NEW_CHAT_AGENT_ID)
    .maybeSingle();
  if (error || !data) return null;
  return (data.name as string | null) ?? null;
}

export default async function NewChatPage() {
  const defaultAgentName = await resolveDefaultAgentName();
  return (
    <>
      <PageHeader>
        <ChatRunHeader
          activeAgentId={DEFAULT_NEW_CHAT_AGENT_ID}
          initialAgentName={defaultAgentName ?? undefined}
        />
      </PageHeader>
      <Suspense fallback={<NewChatLandingFallback />}>
        <ChatNewClient />
      </Suspense>
      {/* Polite inline conversion card for guests who hit the send gate.
          Renders nothing for authed users and for guests with zero attempts. */}
      <WorkspaceConversionNudge
        featureName="Chat"
        threshold={1}
        heading="Save your chat in 30 seconds"
        description="Your messages, agents, files, and history all sync the moment you create a free account. No credit card required."
      />
    </>
  );
}

function NewChatLandingFallback() {
  return (
    <div className="h-full overflow-hidden bg-textured">
      <div className="min-h-full flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl flex flex-col items-center gap-7">
          <header className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-[clamp(1.75rem,1.4rem+1.6vw,2.75rem)] font-semibold text-foreground tracking-tight">
              Hello
            </h1>
            <p className="text-[clamp(1rem,0.95rem+0.4vw,1.25rem)] text-muted-foreground">
              How can I help you today?
            </p>
          </header>

          <section
            aria-label="Suggested agents loading"
            className="flex flex-wrap items-center justify-center gap-2"
          >
            {PRIMARY_QUICK_ACTIONS.map((action) => (
              <div
                key={action.id}
                className="group inline-flex h-10 items-center gap-1.5 rounded-full border border-border/80 bg-card px-4 text-sm text-foreground/90 shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_1px_2px_0_rgba(0,0,0,0.06)]"
              >
                <span>{action.label}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/60" />
              </div>
            ))}
          </section>

          <div
            data-chat-new-input-shell="true"
            className="w-full rounded-[28px] border border-border bg-card p-2.5 shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08)]"
          >
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-1.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground/70">
                <Plus className="h-5 w-5" />
              </div>
              <div className="min-h-9 px-2 py-1 text-base leading-7 text-muted-foreground/60">
                Ask anything
              </div>
              <div className="flex items-center gap-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground/70">
                  <Mic className="h-4 w-4" />
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground/20 text-background">
                  <ArrowUp className="h-5 w-5" />
                </div>
              </div>
            </div>
          </div>

          <section
            aria-label="More actions loading"
            className="flex flex-wrap items-center justify-center gap-2"
          >
            {SECONDARY_QUICK_ACTIONS.map((action) => (
              <div
                key={action.id}
                className="inline-flex rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground shadow-[0_1px_0_0_rgba(255,255,255,0.5)_inset,0_1px_1px_0_rgba(0,0,0,0.04)]"
              >
                {action.label}
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
