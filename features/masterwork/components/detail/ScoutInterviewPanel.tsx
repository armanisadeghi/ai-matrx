"use client";

// features/masterwork/components/detail/ScoutInterviewPanel.tsx
//
// The live interview Approach of Masterwork Distillation — "talk it out".
// A side panel hosting a real conversation with the Scout agent (same
// agent-execution + conversation infra as /chat, never a bespoke chat). The
// Scout reads the Rulebook + intake with its server-side tool and lands
// rule-shaped statements as DRAFT rules while the Expert talks; this panel
// watches the Rulebook row's version and tells the parent page to refresh,
// so drafts appear in the rule list beside the conversation as they land.
//
// Mirrors the AskTutor pattern (features/education/tutor/components/
// AskTutorButton.tsx + EducationTutorClient.tsx), minus grounding injection —
// the Scout grounds itself through its tool (rulebook_id variable).

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
import { useMandate } from "@/features/agents/mandates/useMandate";
import { supabase } from "@/utils/supabase/client";

const SOURCE_FEATURE = "masterwork" as const;
/**
 * Which agent conducts the interview is DB-managed via the `masterwork.scout`
 * Mandate (declared in aidream `mandates/client_mandates.py`, rebindable from
 * /administration/agents/mandates). No hardcoded agent id, no silent fallback —
 * if the Mandate can't resolve, the panel says so and refuses.
 */
const SCOUT_MANDATE_KEY = "masterwork.scout";
/** How often (ms) to check whether the Scout landed new draft rules. */
const RULEBOOK_WATCH_INTERVAL_MS = 5000;

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

export interface ScoutInterviewPanelProps {
  rulebookId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the Rulebook row changed on the server (new drafts landed). */
  onRulebookChanged: () => void;
  /**
   * Optional composer prefill for context-seeded entries ("What did it get
   * wrong?" from a Masterwork run). The Expert finishes the sentence and sends.
   */
  seedText?: string;
}

// The five elicitation moves (doc 15), phrased as things the EXPERT says.
// Struggling to articulate a rule is normal — these turn "I don't know" into
// a concrete next step the Expert chooses.
const ELICITATION_CHIPS = [
  {
    label: "Show me a draft to critique",
    message:
      "Write your best attempt at this task, and I'll tell you what's wrong with it.",
  },
  {
    label: "Draft my rule — I'll correct it",
    message:
      "Draft what you think my rule is here, and I'll correct it.",
  },
  {
    label: "Give me two options",
    message:
      "Give me two different versions to choose between — I'll pick one and tell you why.",
  },
  {
    label: "I have an example of good work",
    message:
      "I have an example of past work that came out exactly right. Here's what it was: ",
  },
] as const;

function InterviewConversation({
  rulebookId,
  agentId,
  seedText,
}: {
  rulebookId: string;
  agentId: string;
  seedText?: string;
}) {
  const surfaceKey = `masterwork-interview:${rulebookId}`;
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { conversationId } = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature: SOURCE_FEATURE,
    runtime: { variables: { rulebook_id: rulebookId } },
    config: { responseDensity: "compact" },
    // The panel can be closed/reopened while a reply streams — keep it alive.
    retainOnUnmount: true,
  });

  // "What did it get wrong?" entry: stage the run context in the composer so
  // the Expert only finishes the sentence. Keyed by the seed text so opening
  // feedback for a DIFFERENT run re-stages; a draft the Expert already typed
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

  // The elicitation menu as one-tap chips (doc 15: a menu, not a method — and
  // the EXPERT picks the move). Tapping stages the request in the composer;
  // the Expert still presses send, and can edit first. Never clobbers a draft
  // the Expert typed themselves.
  const lastChipRef = useRef<string | null>(null);
  const stageChip = (text: string) => {
    if (!conversationId) return;
    const existing = selectUserInputText(conversationId)(store.getState());
    if (existing.trim() && existing !== lastChipRef.current) return;
    dispatch(setUserInputText({ conversationId, text }));
    lastChipRef.current = text;
  };

  if (!conversationId) return <ChatRoomSkeleton />;
  return (
    <AgentConversationColumn
      conversationId={conversationId}
      surfaceKey={surfaceKey}
      constrainWidth
      edgeToEdgeScroll
      smartInputProps={{
        showSubmitOnEnterToggle: false,
        // rulebook_id is wired by this panel — the Expert must never see a UUID.
        variablesPanelStyle: "hidden",
        placeholder: "Answer in your own words — typing or rambling both work…",
      }}
      afterMessages={
        <div className="flex flex-wrap gap-1.5 px-1 pt-2">
          {ELICITATION_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => stageChip(chip.message)}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              title="Puts the request in the message box — you can edit it before sending."
            >
              {chip.label}
            </button>
          ))}
        </div>
      }
    />
  );
}

/** Resolve the Scout through its Mandate before any conversation exists. */
function MandateGatedConversation({
  rulebookId,
  seedText,
}: {
  rulebookId: string;
  seedText?: string;
}) {
  const { mandate, loading, error } = useMandate(SCOUT_MANDATE_KEY);
  if (loading) return <ChatRoomSkeleton />;
  if (error || !mandate?.agentId) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        The interviewer isn&apos;t available right now
        {error ? ` (${error})` : ""}. An administrator can bind one to the
        `masterwork.scout` Mandate.
      </div>
    );
  }
  return (
    <InterviewConversation
      rulebookId={rulebookId}
      agentId={mandate.agentId}
      seedText={seedText}
    />
  );
}

export function ScoutInterviewPanel({
  rulebookId,
  open,
  onOpenChange,
  onRulebookChanged,
  seedText,
}: ScoutInterviewPanelProps) {
  // Watch the Rulebook's version while the panel is open: the Scout writes
  // drafts server-side (through its tool), so the page has no local signal.
  // A 1-column poll of one row every 5s, only while interviewing.
  const lastVersionRef = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase
        .schema("platform")
        .from("rulebook")
        .select("version")
        .eq("id", rulebookId)
        .maybeSingle();
      if (cancelled || !data) return;
      if (lastVersionRef.current === null) {
        lastVersionRef.current = data.version;
      } else if (data.version !== lastVersionRef.current) {
        lastVersionRef.current = data.version;
        onRulebookChanged();
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), RULEBOOK_WATCH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, rulebookId, onRulebookChanged]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      {/* Non-modal on purpose: the Expert watches drafts land in the rule
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
            Rulebook for your approval.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          {open ? (
            <MandateGatedConversation rulebookId={rulebookId} seedText={seedText} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
