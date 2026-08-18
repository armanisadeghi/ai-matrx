"use client";

// features/masterwork/conduct/ConductorPanel.tsx
//
// THE ONE CANONICAL MASTERWORK SYSTEM (Arman, 2026-08-18).
//
//   "This rulebook thing is one of many methods to extract an expert's
//    knowledge… We need ONE system to build all of this. The only thing that
//    ever makes a Masterwork is our one single canonical Masterwork system.
//    And all we do is we go to that system and we attach what we already have."
//
// So: not a form, not a modal, not a progress box. A real streaming
// CONVERSATION with the Conductor — the same agent-execution + conversation
// infra as /chat and the Scout, never a bespoke chat. Arman must be able to
// talk to it, interrupt it, argue with it, and read its reasoning as it goes:
// "Everything should just stream anyway. I'm sick of you hiding everything and
// not letting me just talk to the agent."
//
// WHAT IT DOES (its instructions live in the DB behind the Mandate
// `masterwork.conductor`, never in this file — no prompt in code, ever):
// reads what is ATTACHED, reads the live node-type registry so it knows what
// the platform can really do, then walks the method input by input asking where
// each one actually comes from — saying out loud for every gap whether it can
// supply it itself, must ask the Expert, or should delegate it to a specialist.
// Anything unresolved becomes a real Plan step, never an invented text box.
// It emits through `workflow_author`, and it is allowed to REFUSE.
//
// ATTACHMENTS, NOT A HARDCODED INPUT. A Rulebook is ONE attachable kind among
// many. "Make a Masterwork" from a Rulebook opens this with that Rulebook
// attached; opening it with nothing attached is a supported, normal start.
//
// Mirrors ScoutInterviewPanel deliberately — the interview and the build are
// two conversations on the same machinery, and forking that machinery is how
// they drift apart.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, Wand2, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { ChatRoomSkeleton } from "@/features/agents/components/chat/ChatRoomSkeleton";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useConversationResume } from "@/features/agents/hooks/useConversationResume";
import { useMandate } from "@/features/agents/mandates/useMandate";
import { selectPrimaryRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { RecordingOriginProvider } from "@/features/audio/RecordingOriginProvider";
import { VoiceRelayBar } from "@/features/voice-agent/relay/VoiceRelayBar";
import { MASTERWORK_RULEBOOK_SURFACE_NAME } from "@/features/surfaces/manifests/masterwork-rulebook.manifest";
import {
  associateConductorWhenPersisted,
  attachmentsVariable,
  listConductorSessions,
  type ConductorSession,
  type MasterworkAttachment,
} from "./service";

const SOURCE_FEATURE = "masterwork" as const;

/**
 * Which agent conducts a Masterwork build is DB-managed via the
 * `masterwork.conductor` Mandate (declared in aidream
 * `mandates/client_mandates.py`, rebindable at
 * /administration/agents/mandates). No hardcoded agent id and NO SILENT
 * FALLBACK — if the Mandate can't resolve, this refuses and says so.
 */
const CONDUCTOR_MANDATE_KEY = "masterwork.conductor";

/**
 * The moves the Expert can make without knowing what to type. Each one stages
 * a request in the composer — the Expert still presses send and can edit it
 * first. They are things the EXPERT says; the Conductor's own probing logic
 * lives in its DB definition, never as more chips here.
 */
const CONDUCTOR_CHIPS = [
  {
    label: "Where does each piece come from?",
    message:
      "Go through my method piece by piece and tell me, for every bit of information it needs, where that information is actually going to come from.",
  },
  {
    label: "What can't you do yet?",
    message:
      "Be blunt: what does my method need that this platform genuinely cannot do today?",
  },
  {
    label: "Show me the steps",
    message:
      "Lay out the steps of the system you'd build, in order, and tell me which rule each step comes from.",
  },
  {
    label: "Build it",
    message:
      "We've worked through enough. Build it — and leave the unresolved pieces as open steps rather than pretending.",
  },
] as const;

/** The toolbar entry — "Make a Masterwork". */
export function ConductorButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button size="sm" className={className} onClick={onClick}>
      <Wand2 className="mr-1 h-4 w-4" />
      Make a Masterwork
    </Button>
  );
}

/**
 * A FRESH session. Mints a conversation through the canonical launcher and
 * records the canonical `conversation --(conducting)--> rulebook` edge once the
 * first turn makes the conversation real.
 */
function NewConductorSession({
  rulebookId,
  rulebookName,
  attachments,
  agentId,
  freshSessionKey,
}: {
  rulebookId: string;
  rulebookName: string;
  attachments: MasterworkAttachment[];
  agentId: string;
  freshSessionKey: number;
}) {
  const surfaceKey = `masterwork-conduct:${rulebookId}`;
  const { conversationId } = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature: SOURCE_FEATURE,
    // surfaceName is the binding handoff — launch resolves this surface's
    // agent bindings + value mappings (skipping it silently resolves NONE).
    runtime: {
      surfaceName: MASTERWORK_RULEBOOK_SURFACE_NAME,
      // NAMED VARIABLES, never prose in the human's turn (THE USER-INPUT LAW).
      // `attachments` is the general channel; `rulebook_id` is the convenience
      // the `rulebook` tool reads. Adding a second attachable kind changes the
      // list, not this component.
      variables: {
        rulebook_id: rulebookId,
        attachments: attachmentsVariable(attachments),
      },
    },
    config: { responseDensity: "compact" },
    preferFresh: true,
    freshSessionKey,
    // The panel can be closed/reopened while the Conductor is mid-analysis.
    retainOnUnmount: true,
  });

  const turnStarted = useAppSelector((state) =>
    conversationId
      ? Boolean(selectPrimaryRequest(conversationId)(state))
      : false,
  );

  const linkedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId || !turnStarted || linkedRef.current === conversationId)
      return;
    linkedRef.current = conversationId;
    associateConductorWhenPersisted({
      rulebookId,
      conversationId,
      rulebookName,
      turnStarted,
    });
  }, [conversationId, rulebookId, rulebookName, turnStarted]);

  if (!conversationId) return <ChatRoomSkeleton />;
  return (
    <ConductorColumn
      conversationId={conversationId}
      surfaceKey={surfaceKey}
      rulebookId={rulebookId}
      rulebookName={rulebookName}
      agentId={agentId}
    />
  );
}

/**
 * CONTINUE a session the Expert already started. Never mints a conversation —
 * it rehydrates the existing one through the canonical resume sequence, which
 * also reconnects a turn the server may still be running.
 */
function ResumedConductorSession({
  rulebookId,
  rulebookName,
  agentId,
  conversationId,
  onBack,
}: {
  rulebookId: string;
  rulebookName: string;
  agentId: string;
  conversationId: string;
  onBack: () => void;
}) {
  const surfaceKey = `masterwork-conduct:${rulebookId}`;
  const { isResuming, error } = useConversationResume({
    conversationId,
    agentId,
    surfaceKey,
    messageLimit: 50,
  });

  if (error) {
    return (
      <div className="space-y-3 px-4 py-6 text-sm">
        <p className="text-muted-foreground">
          We couldn&apos;t reopen that session here — nothing is lost, it opens
          in full on its own page.
        </p>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link
              href={`/chat/${conversationId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              Open the conversation
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    );
  }
  if (isResuming) return <ChatRoomSkeleton />;
  return (
    <ConductorColumn
      conversationId={conversationId}
      surfaceKey={surfaceKey}
      rulebookId={rulebookId}
      rulebookName={rulebookName}
      agentId={agentId}
    />
  );
}

/**
 * The conversation column itself — identical for a fresh and a resumed
 * session, so the two can never drift apart.
 */
function ConductorColumn({
  conversationId,
  surfaceKey,
  rulebookId,
  rulebookName,
  agentId,
}: {
  conversationId: string;
  surfaceKey: string;
  rulebookId: string;
  rulebookName: string;
  agentId: string;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const lastChipRef = useRef<string | null>(null);
  const stageChip = (text: string) => {
    const existing = selectUserInputText(conversationId)(store.getState());
    if (existing.trim() && existing !== lastChipRef.current) return;
    dispatch(setUserInputText({ conversationId, text }));
    lastChipRef.current = text;
  };

  return (
    <RecordingOriginProvider
      origin={{
        surface: "masterwork.conduct",
        conversationId,
        entityToken: "rulebook",
        entityId: rulebookId,
        label: rulebookName,
        href: `/masterwork/${rulebookId}`,
      }}
    >
      <AgentConversationColumn
        conversationId={conversationId}
        surfaceKey={surfaceKey}
        constrainWidth
        edgeToEdgeScroll
        smartInputProps={{
          showSubmitOnEnterToggle: false,
          // Attachments are wired by this panel — there is nothing here for
          // the Expert to fill in.
          variablesPanelStyle: "hidden",
          placeholder:
            "Argue with it, answer its questions, or tell it to build…",
          extraRightControls: (
            <VoiceRelayBar
              primaryAgentId={agentId}
              conversationId={conversationId}
              surfaceKey={surfaceKey}
              sourceFeature={SOURCE_FEATURE}
              questionPacing="one_at_a_time"
              variant="toolbar"
            />
          ),
        }}
        afterMessages={
          <div className="flex flex-wrap gap-1.5 px-1 pt-2">
            {CONDUCTOR_CHIPS.map((chip) => (
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
    </RecordingOriginProvider>
  );
}

/** Pick up a build session already in progress, or start a new one. */
function SessionChooser({
  sessions,
  onContinue,
  onStartNew,
}: {
  sessions: ConductorSession[];
  onContinue: (conversationId: string) => void;
  onStartNew: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto px-4 py-4">
      <p className="text-sm text-muted-foreground">
        You&apos;ve started building this before. Pick up where you left off, or
        start fresh.
      </p>
      <ul className="space-y-1.5">
        {sessions.map((s) => (
          <li
            key={s.conversationId}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
          >
            <Workflow
              className="h-3.5 w-3.5 shrink-0 text-primary"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">
                {s.title ?? "Building"}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(s.updatedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                · {s.messageCount} message{s.messageCount === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              size="sm"
              className="h-7 shrink-0"
              onClick={() => onContinue(s.conversationId)}
            >
              Continue
            </Button>
            {/* THE DOOR LAW — every session opens in full, too. */}
            <Button
              asChild
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              title="Open the full conversation in a new tab"
            >
              <Link
                href={`/chat/${s.conversationId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="sr-only">Open in a new tab</span>
              </Link>
            </Button>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="outline" className="h-9" onClick={onStartNew}>
        <Plus className="mr-1 h-4 w-4" />
        Start a new one
      </Button>
    </div>
  );
}

export interface ConductorContentProps {
  rulebookId: string;
  rulebookName: string;
  /**
   * Everything on the table. Defaults to the Rulebook itself — the ONLY place
   * that default lives, so a second attachable kind is a change here and
   * nowhere else.
   */
  attachments?: MasterworkAttachment[];
  /** Resume this session immediately, skipping the chooser. */
  initialConversationId?: string;
  /** Skip the chooser straight into a fresh session. */
  startNew?: boolean;
}

/**
 * THE ONE IMPLEMENTATION of the Conductor experience — the panel on the
 * Rulebook page AND the full-page route `/masterwork/[id]/conduct` both render
 * exactly this, so the two entry points can never drift apart.
 */
export function ConductorContent({
  rulebookId,
  rulebookName,
  attachments,
  initialConversationId,
  startNew: startNewProp,
}: ConductorContentProps) {
  const { mandate, loading, error } = useMandate(CONDUCTOR_MANDATE_KEY);
  const [sessions, setSessions] = useState<ConductorSession[] | null>(null);
  const [choice, setChoice] = useState<
    | { mode: "choose" }
    | { mode: "new"; key: number }
    | { mode: "resume"; conversationId: string }
  >(
    initialConversationId
      ? { mode: "resume", conversationId: initialConversationId }
      : startNewProp
        ? { mode: "new", key: 0 }
        : { mode: "choose" },
  );
  const [freshKey, setFreshKey] = useState(0);

  const lastTargetRef = useRef(initialConversationId);
  useEffect(() => {
    if (!initialConversationId) return;
    if (lastTargetRef.current === initialConversationId) return;
    lastTargetRef.current = initialConversationId;
    setChoice({ mode: "resume", conversationId: initialConversationId });
  }, [initialConversationId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await listConductorSessions(rulebookId);
      if (cancelled) return;
      setSessions(rows);
      if (rows.length === 0) {
        setChoice((prev) =>
          prev.mode === "choose" ? { mode: "new", key: 0 } : prev,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rulebookId]);

  const startNew = useCallback(() => {
    const key = freshKey + 1;
    setFreshKey(key);
    setChoice({ mode: "new", key });
  }, [freshKey]);

  if (loading || sessions === null) return <ChatRoomSkeleton />;
  // NO SILENT FALLBACK. A Mandate resolves or the run refuses.
  if (error || !mandate?.agentId) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        The Masterwork system isn&apos;t available right now
        {error ? ` (${error})` : ""}. An administrator can bind an agent to the
        `masterwork.conductor` Mandate.
      </div>
    );
  }

  if (choice.mode === "choose") {
    return (
      <SessionChooser
        sessions={sessions}
        onContinue={(conversationId) =>
          setChoice({ mode: "resume", conversationId })
        }
        onStartNew={startNew}
      />
    );
  }

  if (choice.mode === "resume") {
    return (
      <ResumedConductorSession
        rulebookId={rulebookId}
        rulebookName={rulebookName}
        agentId={mandate.agentId}
        conversationId={choice.conversationId}
        onBack={() => setChoice({ mode: "choose" })}
      />
    );
  }

  return (
    <NewConductorSession
      rulebookId={rulebookId}
      rulebookName={rulebookName}
      attachments={
        attachments ?? [
          { entityToken: "rulebook", id: rulebookId, name: rulebookName },
        ]
      }
      agentId={mandate.agentId}
      freshSessionKey={choice.key}
    />
  );
}

export interface ConductorPanelProps extends ConductorContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The Conductor as a side panel — the Rulebook stays visible behind it. */
export function ConductorPanel({
  open,
  onOpenChange,
  rulebookId,
  rulebookName,
  attachments,
  initialConversationId,
  startNew,
}: ConductorPanelProps) {
  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      position="right"
      defaultSize={44}
      minSize={30}
      maxSize={80}
      expandButtonLabel="Masterwork"
      initialFocus
      title={
        <span className="inline-flex min-w-0 items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" aria-hidden />
          <span className="truncate">Make a Masterwork</span>
        </span>
      }
      headerActions={
        // THE DOOR LAW — the build has its own URL.
        <Link
          href={`/masterwork/${rulebookId}/conduct${
            initialConversationId
              ? `?conversation=${initialConversationId}`
              : ""
          }`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Full page
        </Link>
      }
    >
      <ConductorContent
        rulebookId={rulebookId}
        rulebookName={rulebookName}
        attachments={attachments}
        initialConversationId={initialConversationId}
        startNew={startNew}
      />
    </MatrxDynamicPanelHost>
  );
}
