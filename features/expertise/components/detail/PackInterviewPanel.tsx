"use client";

// features/expertise/components/detail/PackInterviewPanel.tsx
//
// The live interview lane of the Expert Distillation System — "talk it out".
// A side panel hosting a real conversation with the Expertise Interviewer
// agent (same agent-execution + conversation infra as /chat, never a bespoke
// chat). The agent reads the pack + intake with its `expertise_pack` tool and
// lands rule-shaped statements as DRAFT rules while the expert talks; this
// panel watches the pack row's version and tells the parent page to refresh,
// so drafts appear in the rule list beside the conversation as they land.
//
// Mirrors the AskTutor pattern (features/education/tutor/components/
// AskTutorButton.tsx + EducationTutorClient.tsx), minus grounding injection —
// the interviewer grounds itself through its tool (pack_id variable).

import { useEffect, useRef } from "react";
import { MessageCircleQuestion, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { ChatRoomSkeleton } from "@/features/agents/components/chat/ChatRoomSkeleton";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { supabase } from "@/utils/supabase/client";
import { EXPERTISE_INTERVIEWER_AGENT_ID } from "../../agents";

const SOURCE_FEATURE = "expertise" as const;
/** How often (ms) to check whether the interviewer landed new draft rules. */
const PACK_WATCH_INTERVAL_MS = 5000;

/** The toolbar entry — "Interview me": talk it out, rules get drafted live. */
export function InterviewButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button size="sm" variant="outline" className={className} onClick={onClick}>
      <MessageCircleQuestion className="mr-1 h-4 w-4" />
      Interview me
    </Button>
  );
}

export interface PackInterviewPanelProps {
  packId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the pack row changed on the server (new drafts landed). */
  onPackChanged: () => void;
  /**
   * Optional composer prefill for context-seeded entries ("What did it get
   * wrong?" from a desk run). The expert finishes the sentence and sends.
   */
  seedText?: string;
}

function InterviewConversation({
  packId,
  seedText,
}: {
  packId: string;
  seedText?: string;
}) {
  const surfaceKey = `expertise-interview:${packId}`;
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { conversationId } = useAgentLauncher(EXPERTISE_INTERVIEWER_AGENT_ID, {
    surfaceKey,
    sourceFeature: SOURCE_FEATURE,
    runtime: { variables: { pack_id: packId } },
    config: { responseDensity: "compact" },
    // The panel can be closed/reopened while a reply streams — keep it alive.
    retainOnUnmount: true,
  });

  // "What did it get wrong?" entry: stage the run context in the composer so
  // the expert only finishes the sentence. Keyed by the seed text so opening
  // feedback for a DIFFERENT run re-stages; a draft the expert already typed
  // (anything that isn't just a previous seed) is never clobbered.
  const seededForRef = useRef<string | null>(null);
  const lastSeedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId || !seedText || seededForRef.current === seedText)
      return;
    const existing = selectUserInputText(conversationId)(store.getState());
    if (!existing.trim() || existing === lastSeedRef.current) {
      dispatch(setUserInputText({ conversationId, text: seedText }));
      lastSeedRef.current = seedText;
    }
    seededForRef.current = seedText;
  }, [conversationId, seedText, dispatch, store]);

  if (!conversationId) return <ChatRoomSkeleton />;
  return (
    <AgentConversationColumn
      conversationId={conversationId}
      surfaceKey={surfaceKey}
      constrainWidth
      edgeToEdgeScroll
      smartInputProps={{
        showSubmitOnEnterToggle: false,
        // pack_id is wired by this panel — the expert must never see a UUID.
        variablesPanelStyle: "hidden",
        placeholder: "Answer in your own words — typing or rambling both work…",
      }}
    />
  );
}

export function PackInterviewPanel({
  packId,
  open,
  onOpenChange,
  onPackChanged,
  seedText,
}: PackInterviewPanelProps) {
  // Watch the pack's version while the panel is open: the interviewer writes
  // drafts server-side (through its tool), so the page has no local signal.
  // A 1-column poll of one row every 5s, only while interviewing.
  const lastVersionRef = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase
        .schema("platform")
        .from("expertise_pack")
        .select("version")
        .eq("id", packId)
        .maybeSingle();
      if (cancelled || !data) return;
      if (lastVersionRef.current === null) {
        lastVersionRef.current = data.version;
      } else if (data.version !== lastVersionRef.current) {
        lastVersionRef.current = data.version;
        onPackChanged();
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), PACK_WATCH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, packId, onPackChanged]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      {/* Non-modal on purpose: the expert watches drafts land in the rule
          list BESIDE the conversation — dimming and freezing the page would
          sever the loop's primary feedback (vision doc 02). */}
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader className="space-y-1 border-b border-border px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <MessagesSquare className="h-4 w-4 text-primary" aria-hidden />
            Interview
          </SheetTitle>
          <SheetDescription className="text-xs">
            Talk through how you work — rules you mention are drafted into your
            rulebook for your approval.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          {open ? (
            <InterviewConversation packId={packId} seedText={seedText} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
