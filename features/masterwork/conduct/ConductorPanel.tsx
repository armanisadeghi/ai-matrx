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
import { AgentCredit } from "../components/AgentCredit";
import {
  BookOpen,
  BrainCircuit,
  ExternalLink,
  Plus,
  Workflow,
} from "lucide-react";
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
  missingRequiredVariables,
  missingVariablesMessage,
} from "@/features/agents/mandates/service";
import { RULEBOOK_DOCUMENT_VARIABLE } from "@/features/masterwork/agent-context/rulebookDocument";
import { useRulebookDocument } from "@/features/masterwork/agent-context/useRulebookDocument";
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

/**
 * A FRESH session. Mints a conversation through the canonical launcher and
 * records the canonical `conversation --(conducting)--> rulebook` edge once the
 * first turn makes the conversation real.
 */
function NewConductorSession({
  rulebookId,
  rulebookName,
  attachments,
  rulebookDocument,
  agentId,
  freshSessionKey,
}: {
  rulebookId: string;
  rulebookName: string;
  attachments: MasterworkAttachment[];
  /** The Rulebook itself, already loaded — see ConductorContent. */
  rulebookDocument: string;
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
      // This purpose-built agent already receives the complete Rulebook below
      // as a required named variable. An explicit empty scope prevents the
      // mounted Rulebook surface from also injecting the same rendered document
      // plus 20+ projections as ad-hoc context. The surface name still resolves
      // the Conductor binding; only automatic scope adoption is suppressed.
      applicationScope: {},
      // NAMED VARIABLES, never prose in the human's turn (THE USER-INPUT LAW).
      //
      // 🚨 `rulebook_document` is THE CURE for disease D4. Until 2026-08-19
      // this passed only IDS and the agent's own prompt told it to "read it
      // first with the rulebook tool" — so the rules arrived (when they
      // arrived) as a tool result the model had chosen to fetch, and got
      // skimmed. Arman: "the rules should just be variables that are directly
      // fed into him… this agent should never have even started without
      // getting the rules in place." The document is loaded by
      // `ConductorContent` BEFORE this component mounts; the run refuses when
      // it is absent. The `rulebook` tool stays for RE-reads after writes
      // (variables substitute once, at conversation start).
      //
      // `attachments` is the general channel; `rulebook_id` is the convenience
      // the `rulebook` tool reads. Adding a second attachable kind changes the
      // list, not this component.
      variables: {
        rulebook_id: rulebookId,
        attachments: attachmentsVariable(attachments),
        [RULEBOOK_DOCUMENT_VARIABLE]: rulebookDocument,
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
          contextRailPresentation: "overflow-only",
          contextRailAttachedItems: [
            {
              id: rulebookId,
              icon: BookOpen,
              label: rulebookName,
              word: "Rulebook",
              detail: "Included",
              hint: "The complete Rulebook is included with every turn.",
              onOpen: () =>
                window.open(
                  `/masterwork/${rulebookId}`,
                  "_blank",
                  "noopener,noreferrer",
                ),
            },
          ],
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
          <div className="mx-auto flex max-w-xl flex-wrap justify-center gap-1.5 px-4 pt-2">
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
  // THE DOCUMENT COMES FIRST. Loaded here, before any conversation is minted,
  // so the Conductor's first turn already holds the rules (disease D4).
  const rulebookDoc = useRulebookDocument(rulebookId);
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

  if (loading || rulebookDoc.loading || sessions === null)
    return <ChatRoomSkeleton />;
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

  // THE RUN REFUSES RATHER THAN STARTING BLIND (disease D4). Two independent
  // reasons, both fatal: the Rulebook itself would not load, or the Mandate
  // declares a required variable this surface did not supply. This object must
  // stay identical to what `NewConductorSession` actually binds — the check is
  // worthless if it tests a different set.
  const sessionAttachments = attachments ?? [
    { entityToken: "rulebook", id: rulebookId, name: rulebookName },
  ];
  const launchVariables = {
    rulebook_id: rulebookId,
    attachments: attachmentsVariable(sessionAttachments),
    [RULEBOOK_DOCUMENT_VARIABLE]: rulebookDoc.document ?? "",
  };
  const missing = missingRequiredVariables(mandate.contract, launchVariables);
  if (rulebookDoc.error || missing.length > 0) {
    return (
      <div className="space-y-3 px-4 py-6 text-sm">
        <p className="text-foreground">
          {rulebookDoc.error ??
            missingVariablesMessage(CONDUCTOR_MANDATE_KEY, missing)}
        </p>
        <p className="text-muted-foreground">
          Starting without your rules would mean building a system from
          guesswork, so we stopped instead.
        </p>
        <Button size="sm" variant="outline" onClick={rulebookDoc.reload}>
          Try again
        </Button>
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
      attachments={sessionAttachments}
      rulebookDocument={rulebookDoc.document ?? ""}
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
          <BrainCircuit className="h-4 w-4 text-primary" aria-hidden />
          <span className="truncate">Build it with me</span>
          <AgentCredit
            mandate="masterwork.conductor"
            agent="masterwork_conductor"
          />
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
          className="inline-flex h-6 items-center text-xs leading-none text-muted-foreground hover:text-foreground"
        >
          Full page
        </Link>
      }
      // THE SCROLL CHAIN. `flex-1 min-h-0` inside the conversation column only
      // bounds anything if EVERY ancestor is a full-height flex column — without
      // this the panel body sits at height:auto, the message list collapses to
      // nothing, and the composer floats at the top of an empty panel while the
      // run streams invisibly behind it.
      contentClassName="flex h-full min-h-0 flex-col overflow-hidden p-0"
    >
      {open ? (
        <ConductorContent
          // Remount when the target changes so Continue-on-another-row and a
          // repeated "start a new one" both actually switch conversations.
          key={`${initialConversationId ?? "-"}:${startNew ? "new" : ""}`}
          rulebookId={rulebookId}
          rulebookName={rulebookName}
          attachments={attachments}
          initialConversationId={initialConversationId}
          startNew={startNew}
        />
      ) : null}
    </MatrxDynamicPanelHost>
  );
}
