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

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IntelligenceIndicator } from "@/features/mandates/feature-intelligence/IntelligenceIndicator";
import { AgentCredit } from "../AgentCredit";
import { AGENT_ICON_NAME } from "@/components/icons/domain-icons";
import {
  ExternalLink,
  MessagesSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { VoiceRelayBar } from "@/features/voice-agent/relay/VoiceRelayBar";
import { InterviewOpening } from "../../record/InterviewOpening";
import {
  INTERVIEW_HISTORY_MS,
  INTERVIEW_OPENING_MS,
  INTERVIEW_RESUME_MS,
} from "../../record/openingRates";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import {
  setDisplayDescriptionOverride,
  setDisplayIconNameOverride,
  setDisplayNameOverride,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectPrimaryRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { useMandate } from "@/features/mandates/useMandate";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useConversationResume } from "@/features/agents/hooks/useConversationResume";
import { supabase } from "@/utils/supabase/client";
import {
  associateInterviewWhenPersisted,
  listRulebookInterviews,
  type RulebookInterview,
} from "@/features/masterwork/record/service";
import { MASTERWORK_RULEBOOK_SURFACE_NAME } from "@/features/surfaces/manifests/masterwork-rulebook.manifest";
import {
  missingRequiredVariables,
  missingVariablesMessage,
} from "@/features/mandates/service";
import { RULEBOOK_DOCUMENT_VARIABLE } from "@/features/masterwork/agent-context/rulebookDocument";
import { useRulebookDocument } from "@/features/masterwork/agent-context/useRulebookDocument";
import { declareBlankSlateInterview } from "@/features/masterwork/record/blankSlateLane";
import { InterviewChooser } from "@/features/masterwork/record/InterviewChooser";
import {
  InterviewStartScreen,
  type InterviewChoice,
} from "@/features/masterwork/record/InterviewStartScreen";
import {
  blankSlateScopeOverride,
  buildInterviewLaunchVariables,
  contextModeOption,
} from "@/features/masterwork/record/interviewModes";
import { RecordingOriginProvider } from "@/features/audio/RecordingOriginProvider";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const SOURCE_FEATURE = "masterwork" as const;
/**
 * Which agent conducts the interview is DB-managed via the `masterwork.scout`
 * Mandate (declared in aidream `mandates/client_mandates.py`, rebindable from
 * /administration/mandates). No hardcoded agent id, no silent fallback —
 * if the Mandate can't resolve, the panel says so and refuses.
 */
const SCOUT_MANDATE_KEY = MANDATE_KEYS.masterwork__scout;
/** How often (ms) to check whether the Scout landed new draft rules. */
const RULEBOOK_WATCH_INTERVAL_MS = 5000;

export interface ScoutInterviewPanelProps {
  rulebookId: string;
  /** The Rulebook's name — used to give each interview an honest title. */
  rulebookName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the Rulebook row changed on the server (new drafts landed). */
  onRulebookChanged: () => void;
  /**
   * Optional composer prefill for context-seeded entries ("What did it get
   * wrong?" from a Masterwork run). The Expert finishes the sentence and sends.
   */
  seedText?: string;
  /**
   * Resume THIS conversation immediately (the Conversations section's
   * Continue) instead of showing the chooser.
   */
  initialConversationId?: string;
  /**
   * Bump to skip the chooser straight into a fresh interview ("New
   * interview"). Each distinct value remounts the content, so a second "New
   * interview" can never revive the first one's conversation.
   */
  startNewNonce?: number;
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
    message: "Draft what you think my rule is here, and I'll correct it.",
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
  // Hardest-Case Debrief (Approach #11) — Critical Decision Method over ONE
  // recent war story. The chip only invites the story; the multi-pass CDM
  // probing (what did you notice first? what would a competent novice have
  // done wrong? when did you know?) is the SCOUT'S job, held in its DB
  // instructions — never more chips, never prose in code.
  {
    label: "Walk me through a hard case",
    message:
      "I want to tell you about one recent case that was genuinely hard — walk me through it like a debrief and pull the rules out of what I did. The case was: ",
  },
  // Vacation Trigger (Approach #15) — succession framing surfaces the
  // unwritten knowledge that only exists in the Expert's head.
  {
    label: "If I left for two weeks…",
    message:
      "Imagine I'm out for two weeks starting tomorrow. Ask me what my stand-in would need to know that isn't written anywhere — what breaks when I'm gone.",
  },
] as const;

/**
 * A FRESH interview. Mints a conversation through the canonical launcher and —
 * before anything else can go wrong — records the canonical
 * `conversation --(interview)--> rulebook` association so the Expert can always
 * find their way back to what they said. Also replaces the auto-generated
 * "Auto: expertise_interviewer" title with one a human recognizes.
 */
function InterviewConversation({
  rulebookId,
  rulebookName,
  rulebookDocument,
  expertName,
  choice,
  agentId,
  seedText,
  freshSessionKey,
}: {
  rulebookId: string;
  rulebookName: string;
  /** The Rulebook itself, already loaded — see ScoutInterviewContent. */
  rulebookDocument: string;
  /** The Expert's own name — half of everything a blank-slate session gets. */
  expertName: string;
  /** What the Expert picked on the start screen (mode, probes, closing, voice). */
  choice: InterviewChoice;
  agentId: string;
  seedText?: string;
  freshSessionKey: number;
}) {
  const surfaceKey = `masterwork-interview:${rulebookId}`;
  const dispatch = useAppDispatch();
  const store = useAppStore();

  // 🚨 DECLARE THE MODE TO THE PAGE, not just to the launch. The lane's
  // `<SurfaceRuntimeProvider>` republishes its scope EVERY turn, so an empty
  // scope at launch buys one turn of silence and nothing more — the whole
  // rendered Rulebook came straight back as `content` on turn two (found live
  // 2026-09-15). The register in `record/blankSlateLane.ts` is what the lane
  // reads; this declaration is live for exactly as long as the interview is.
  useEffect(() => {
    if (choice.mode !== "blank_slate") return undefined;
    return declareBlankSlateInterview(rulebookId);
  }, [choice.mode, rulebookId]);

  // 🚨 N8 — THE OPENING SAYS HOW LONG IT HAS BEEN (cold walk 13, 2026-09-20).
  // "Start the interview" showed a bare skeleton for 60 seconds. The wait
  // begins the moment this component mounts, which is the moment the Expert
  // pressed the button.
  const openingStartedAt = useRef(Date.now()).current;

  const { conversationId } = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature: SOURCE_FEATURE,
    // surfaceName is the binding handoff — launch resolves this surface's
    // agent bindings + value mappings (skipping it silently resolves NONE).
    runtime: {
      surfaceName: MASTERWORK_RULEBOOK_SURFACE_NAME,
      // NAMED VARIABLES, never prose in the human's turn (THE USER-INPUT LAW).
      //
      // 🚨 THE MODE RIDES HERE (Arman, 2026-09-15). `interview_context_mode`,
      // `interview_probes`, `interview_closing_surprises` and `expert_goal` are
      // offered by the `masterwork.scout_interview` provision and substituted
      // into the Scout's own instructions; the prose for every mode and every
      // probe lives in its `agent.definition` row, never here.
      //
      // 🚨 In `blank_slate` mode `rulebook_document` is ABSENT from this map —
      // not empty, absent — because "the agent has no context to begin with" is
      // a promise this screen makes. `buildInterviewLaunchVariables` is the one
      // place that decides, and `interviewModes.test.ts` proves it.
      //
      // 🚨 `rulebook_document` is THE CURE for disease D4 in `primed` mode.
      // Until 2026-08-19
      // the Scout received only `rulebook_id` and its own prompt said "Before
      // saying anything, call rulebook action=read" — so its intake answers,
      // its existing rules, and the Expert's open review feedback all arrived
      // as a tool result the model had chosen to fetch. Arman: "this agent
      // should never have even started without getting the rules in place."
      // The document is loaded BEFORE this component mounts; the interview
      // refuses when it is absent. The `rulebook` tool stays for RE-reads —
      // the Scout WRITES rules mid-conversation and variables substitute once,
      // at conversation start.
      // 🚨 THE SECOND DOOR (found live 2026-09-15, fixed the same session). A
      // launch that names a surface and passes no scope ADOPTS everything the
      // mounted provider publishes — for this surface that is the Rulebook's
      // name, description and full rule set. A blank-slate interview therefore
      // opened by reciting the Rulebook's description back to the Expert, one
      // second after the card promised her it knew nothing about her. An
      // explicit scope beats adoption, so blank slate passes an empty one and
      // keeps the surface NAME (dropping that resolves NO bindings at all).
      ...blankSlateScopeOverride(choice.mode),
      variables: buildInterviewLaunchVariables({
        rulebookId,
        expertName,
        rulebookName,
        mode: choice.mode,
        probes: choice.probes,
        closingSurprises: choice.closingSurprises,
        rulebookDocument,
      }),
    },
    config: { responseDensity: "compact" },
    // "Start a new interview" must NEVER revive the previous conversation the
    // surface was focused on — that is how a fresh start silently continues an
    // old one.
    preferFresh: true,
    freshSessionKey,
    // The panel can be closed/reopened while a reply streams — keep it alive.
    retainOnUnmount: true,
  });

  // A launcher mints a client-only id before the Expert says anything. That
  // untouched draft is intentionally not persisted and must not start the
  // association watchdog. The first request is the durable-intent boundary:
  // start the module-level waiter then, so it still survives panel closure.
  const turnStarted = useAppSelector((state) =>
    conversationId
      ? Boolean(selectPrimaryRequest(conversationId)(state))
      : false,
  );

  // THE ASSOCIATION — the whole point of this change. Handed to a module-level
  // job so it survives the Expert closing this panel mid-turn (see
  // `associateInterviewWhenPersisted`); it cannot be written at mint time
  // because `assoc_add` needs the conversation row to exist.
  const linkedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !conversationId ||
      !turnStarted ||
      linkedRef.current === conversationId
    ) {
      return;
    }
    linkedRef.current = conversationId;
    associateInterviewWhenPersisted({
      rulebookId,
      conversationId,
      rulebookName,
      turnStarted,
    });
  }, [conversationId, rulebookId, rulebookName, turnStarted]);

  if (!conversationId) {
    return (
      <InterviewOpening
        doing="Setting up your interviewer…"
        startedAt={openingStartedAt}
        usualMs={INTERVIEW_OPENING_MS}
      />
    );
  }
  return (
    <InterviewColumn
      conversationId={conversationId}
      surfaceKey={surfaceKey}
      seedText={seedText}
      rulebookId={rulebookId}
      rulebookName={rulebookName}
      agentId={agentId}
      voiceOn={choice.voiceOn}
    />
  );
}

/**
 * CONTINUE an interview the Expert already had. Never mints a conversation —
 * it rehydrates the existing one through the canonical resume sequence
 * (`useConversationResume`), which also re-surfaces an unanswered tool prompt
 * and reconnects a turn the server may still be running.
 */
function ResumedInterviewConversation({
  rulebookId,
  rulebookName,
  agentId,
  conversationId,
  voiceOn,
  onBack,
}: {
  rulebookId: string;
  rulebookName: string;
  agentId: string;
  conversationId: string;
  /** The hands-free voice bar, per `masterwork.interview.voice_default_on`. */
  voiceOn: boolean;
  onBack: () => void;
}) {
  const surfaceKey = `masterwork-interview:${rulebookId}`;
  // N8: "Continue this one" sat on a motionless skeleton for 53 seconds.
  const resumeStartedAt = useRef(Date.now()).current;
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
          We couldn&apos;t reopen that conversation here — nothing is lost, it
          opens in full on its own page.
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
  if (isResuming) {
    return (
      <InterviewOpening
        doing="Bringing your conversation back…"
        startedAt={resumeStartedAt}
        usualMs={INTERVIEW_RESUME_MS}
      />
    );
  }
  return (
    <InterviewColumn
      conversationId={conversationId}
      surfaceKey={surfaceKey}
      rulebookId={rulebookId}
      rulebookName={rulebookName}
      agentId={agentId}
      voiceOn={voiceOn}
    />
  );
}

/**
 * The conversation column itself — identical for a fresh and a resumed
 * interview, so the two can never drift apart. Owns the composer seeding and
 * the elicitation chips.
 */
function InterviewColumn({
  conversationId,
  surfaceKey,
  seedText,
  rulebookId,
  rulebookName,
  agentId,
  voiceOn,
}: {
  conversationId: string;
  surfaceKey: string;
  seedText?: string;
  rulebookId: string;
  rulebookName: string;
  /** The Scout (mandate-resolved) — the voice layer's primary agent. */
  agentId: string;
  /**
   * Whether this interview offers the HANDS-FREE voice relay beside the
   * composer (`masterwork.interview.voice_default_on`). The composer's own
   * dictation microphone is always there either way — this control never
   * takes away the Expert's ability to answer out loud, it decides whether
   * the spoken back-and-forth bar is offered too.
   */
  voiceOn: boolean;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  // 🚨 WHO IS IN THE ROOM, AND WHAT DO I DO NOW (jobs-bar-2026-09-16, item 24).
  //
  // An Expert chose an interviewer, chose how it should dig, pressed "Start the
  // interview" — and landed on the generic agent hero: a wireframe glyph over
  // "Ready to run", and underneath it, as the one instruction on the screen,
  // "Fill in any variables below and type a message to start."
  //
  // There are no variables below. This panel wires every one of them
  // (`rulebook_id`, the mode, the probes, the document) precisely so the Expert
  // never sees one, and `variablesPanelStyle: "hidden"` removes the collection
  // UI — so the sentence pointed at something that does not exist on the page,
  // and nothing anywhere said what this conversation was, who was asking, or
  // that she should just start talking. The whole promise of the screen before
  // it — an interviewer who asks YOU questions — evaporated into a blank box.
  //
  // Same mechanism the Conductor lane adopted for the identical defect: the
  // hero is display state, so the surface that knows what the conversation is
  // for says so.
  //
  // The dispatch does not wait for the instance row any more: the slice keeps a
  // write that arrives before the row and replays it when the row lands (D326,
  // fixed 2026-09-16). This surface had to gate on the row's existence until
  // then, which was a local workaround for a defect every setter in that slice
  // shared.
  useEffect(() => {
    dispatch(
      setDisplayNameOverride({ conversationId, value: "Your interviewer" }),
    );
    dispatch(
      setDisplayDescriptionOverride({
        conversationId,
        value:
          "Start anywhere — the thing you decided today, the call you keep having " +
          "to explain, the one people get wrong. I ask from there, one question " +
          "at a time, and you can talk instead of typing. Or press one of the " +
          "openers below and I'll take it from there.",
      }),
    );
    dispatch(
      setDisplayIconNameOverride({ conversationId, value: AGENT_ICON_NAME }),
    );
  }, [conversationId, dispatch]);

  // "What did it get wrong?" entry: stage the run context in the composer so
  // the Expert only finishes the sentence. Keyed by the seed text so opening
  // feedback for a DIFFERENT run re-stages; a draft the Expert already typed
  // (anything that isn't just a previous seed) is never clobbered.
  const seededForRef = useRef<string | null>(null);
  const lastSeedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seedText || seededForRef.current === seedText) return;
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
    const existing = selectUserInputText(conversationId)(store.getState());
    if (existing.trim() && existing !== lastChipRef.current) return;
    dispatch(setUserInputText({ conversationId, text }));
    lastChipRef.current = text;
  };

  // THE AUDIO ORIGIN. The Expert dictates most of an interview through the
  // composer's mic; the shared recorder already persisted that audio, but the
  // transcript row had no idea what it belonged to. Declaring the origin here
  // stamps every recording started anywhere inside this column — no prop
  // threading through the shared mic chain, and no other ProTextarea in the
  // platform is affected. See features/audio/recordingOrigin.ts.
  return (
    <RecordingOriginProvider
      origin={{
        surface: "masterwork.interview",
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
        /* The reader here is the Expert being interviewed about her own
           judgment — never a builder. Tool cards, raw result grids and
           bound-variable chips do not belong in front of her; an admin with
           creator mode on still sees all of it. */
        audience="expert"
        constrainWidth
        edgeToEdgeScroll
        smartInputProps={{
          showSubmitOnEnterToggle: false,
          // `rulebook_id` is wired by this panel, so there is nothing here for
          // the Expert to fill in. This hides the COLLECTION UI and nothing else
          // — it never suppressed the message display, which rendered the same
          // value back as "Rulebook id: 56d96d67-…" on the first bubble. Keeping
          // ids away from the Expert is not a per-surface setting: the display
          // rule lives in `features/agents/utils/variable-display-lines.ts` and
          // applies to every surface at once.
          variablesPanelStyle: "hidden",
          placeholder:
            "Answer in your own words — typing or rambling both work…",
          // Voice is a composer action, not a second section above a column that
          // already owns the full available height. Keeping it in the pinned
          // toolbar leaves the textarea reachable at every panel size.
          extraRightControls: voiceOn ? (
            <VoiceRelayBar
              primaryAgentId={agentId}
              conversationId={conversationId}
              surfaceKey={surfaceKey}
              sourceFeature={SOURCE_FEATURE}
              questionPacing="one_at_a_time"
              variant="toolbar"
            />
          ) : undefined,
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
    </RecordingOriginProvider>
  );
}

/**
 * Resolve the Scout through its Mandate, then decide WHICH interview the
 * Expert is in: a prior one they continue, or a new one. Never silently mints
 * a new conversation when prior ones exist — that was the defect.
 *
 * THE ONE IMPLEMENTATION of the interview experience — the "Interview me"
 * sheet on the Rulebook page AND the full-page route
 * `/masterwork/[id]/interview` both render exactly this component, so the two
 * entry points can never drift apart.
 *
 * `initialConversationId` deep-links straight into resuming one conversation
 * (the Conversations section's Continue, or ?conversation= on the route);
 * `startNew` skips the chooser into a fresh interview.
 */
export function ScoutInterviewContent({
  rulebookId,
  rulebookName,
  seedText,
  initialConversationId,
  startNew: startNewProp,
}: {
  rulebookId: string;
  rulebookName: string;
  seedText?: string;
  /** Resume this conversation immediately, skipping the chooser. */
  initialConversationId?: string;
  /** Skip the chooser straight into a fresh interview. */
  startNew?: boolean;
}) {
  const { mandate, loading, error } = useMandate(SCOUT_MANDATE_KEY);
  // The Expert's own name — with the Rulebook's name it is ALL a blank-slate
  // session is given. Never their email: an address is an identifier, not the
  // way a person is addressed by someone interviewing them.
  const expertName = useAppSelector(
    (s) =>
      s.userProfile?.userMetadata?.fullName ??
      s.userProfile?.userMetadata?.name ??
      "The expert",
  );
  // THE DOCUMENT COMES FIRST — loaded before any conversation is minted, so
  // the Scout's first turn already holds the intake answers, the rules so far,
  // and the Expert's open review feedback (disease D4).
  const rulebookDoc = useRulebookDocument(rulebookId);
  const [interviews, setInterviews] = useState<RulebookInterview[] | null>(
    null,
  );
  // THE START SCREEN is its own step (Arman, 2026-09-15): a fresh interview
  // goes `configure` → `new`, so the Expert sees which interviewer they are
  // about to get and can change it, BEFORE a conversation is minted. Resuming
  // never re-asks — the mode was bound at that conversation's first turn and
  // variables substitute once, at start.
  const [choice, setChoice] = useState<
    | { mode: "choose" }
    | { mode: "configure"; key: number }
    | { mode: "new"; key: number; picked: InterviewChoice }
    | { mode: "resume"; conversationId: string }
  >(
    initialConversationId
      ? { mode: "resume", conversationId: initialConversationId }
      : startNewProp
        ? { mode: "configure", key: 0 }
        : { mode: "choose" },
  );
  const [freshKey, setFreshKey] = useState(0);
  // N8: this gate is what a deep-linked `?interview=1` arrival lands on while
  // the Mandate, the Rulebook document and the interview history come back. It
  // used to be a bare skeleton, which is why walk 13 read an arrival that was
  // working as "no panel".
  const panelStartedAt = useRef(Date.now()).current;

  // A NEW deep-link target while already open (the Expert clicked Continue on
  // a different conversation) must actually switch conversations.
  const lastTargetRef = useRef(initialConversationId);
  useEffect(() => {
    if (!initialConversationId) return;
    if (lastTargetRef.current === initialConversationId) return;
    lastTargetRef.current = initialConversationId;
    setChoice({ mode: "resume", conversationId: initialConversationId });
  }, [initialConversationId]);

  // 🚨 THE HISTORY READ IS ASKED ONCE THE ORGANIZATION EXISTS, AND ITS FAILURE
  // IS NEVER READ AS "no interviews" (cold walk 12, D9).
  //
  // Reloading `/masterwork/<id>?interview=1` four turns into an interview
  // landed the Expert back on "Before we start", with no offer to carry on,
  // while every one of her turns sat kept server-side. The chooser that says
  // "Pick up where you left off" was already written — it simply never
  // rendered, because `listRulebookInterviews` answered `[]`.
  //
  // Two causes, both closed here. (1) The read is org-required and this panel
  // opens on deep-link ARRIVAL, so on a reload it raced the boot that selects
  // the organization and was refused before it ever reached the network;
  // `useOrganizationRequired` is the platform's one reading of that state, so
  // we hold the skeleton instead of racing it. (2) A refused read came back as
  // an empty array, which is a real and different answer; it now throws
  // (`InterviewHistoryUnavailable`) and we say so with a way to try again.
  //
  // The auto-jump to "Before we start" therefore fires on a CONFIRMED empty
  // history and nothing else.
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  // 🚨 AND THE READ ITSELF CAN FAIL — the FOURTH state (R37). `organizationRequired`
  // alone cannot see it: under a failed organization read it is false and
  // `canLoad` is false, so this panel held its skeleton forever. `organizationState`
  // names all four, and the shared notice renders the two terminal answers.
  const { canLoad, organizationState, retry } = useOrganizationRequired();
  useEffect(() => {
    if (!canLoad) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listRulebookInterviews(rulebookId);
        if (cancelled) return;
        setHistoryError(null);
        setInterviews(rows);
        // No history → straight into a new interview, exactly as before.
        if (rows.length === 0) {
          setChoice((prev) =>
            prev.mode === "choose" ? { mode: "configure", key: 0 } : prev,
          );
        }
      } catch (err) {
        if (cancelled) return;
        setInterviews([]);
        setHistoryError(
          err instanceof Error
            ? err.message
            : "We couldn't check whether this Rulebook already has an interview going.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rulebookId, canLoad, historyAttempt]);

  const startNew = useCallback(() => {
    const key = freshKey + 1;
    setFreshKey(key);
    setChoice({ mode: "configure", key });
  }, [freshKey]);

  if (loading || rulebookDoc.loading || interviews === null) {
    // No organization yet is a HOLD, not an empty history — the skeleton stays
    // until the boot settles, and only a boot that settles with no
    // organization at all says so.
    if (organizationState === "required" || organizationState === "unavailable") {
      return (
        <OrganizationContextNotice
          state={organizationState}
          what="interviews"
          description="Choose which organization this interview belongs to, at the top of the page, and it will pick up from here."
          onRetry={retry}
          compact
          className="px-4 py-6"
        />
      );
    }
    return (
      <InterviewOpening
        doing="Opening your interview…"
        startedAt={panelStartedAt}
        usualMs={INTERVIEW_HISTORY_MS}
      />
    );
  }

  // A history we could not READ never renders as a history that is EMPTY.
  if (historyError) {
    return (
      <div className="space-y-3 px-4 py-6 text-sm">
        <p className="text-foreground">
          {historyError} If one is already going, starting a new one here would
          leave it behind — so nothing has been started.
          <ErrorAlchemyMenu error={historyError} />
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setHistoryError(null);
            setInterviews(null);
            setHistoryAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (error || !mandate?.agentId) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        The interviewer isn&apos;t available right now
        {error ? ` (${error})` : ""}. An administrator can bind one to the
        `masterwork.scout` Mandate.
        <ErrorAlchemyMenu />
      </div>
    );
  }

  // A Rulebook we could not open at all is a refusal in BOTH modes — without
  // it we cannot even name what the Expert is building.
  if (rulebookDoc.error) {
    return (
      <div className="space-y-3 px-4 py-6 text-sm">
        <p className="text-foreground">{rulebookDoc.error} <ErrorAlchemyMenu error={rulebookDoc.error} /></p>
        <Button size="sm" variant="outline" onClick={rulebookDoc.reload}>
          Try again
        </Button>
      </div>
    );
  }

  if (choice.mode === "choose") {
    return (
      <InterviewChooser
        interviews={interviews}
        onContinue={(conversationId) =>
          setChoice({ mode: "resume", conversationId })
        }
        onStartNew={startNew}
      />
    );
  }

  if (choice.mode === "resume") {
    return (
      <ResumedInterviewConversation
        rulebookId={rulebookId}
        rulebookName={rulebookName}
        agentId={mandate.agentId}
        conversationId={choice.conversationId}
        // A resumed interview keeps the surface's current voice setting; the
        // context mode and probes were bound at that conversation's first turn
        // and cannot be changed mid-conversation (variables substitute once).
        voiceOn
        onBack={() => setChoice({ mode: "choose" })}
      />
    );
  }

  if (choice.mode === "configure") {
    const key = choice.key;
    return (
      <InterviewStartScreen
        rulebookId={rulebookId}
        rulebookOrganizationId={rulebookDoc.organizationId}
        onBack={interviews.length > 0 ? () => setChoice({ mode: "choose" }) : undefined}
        onStart={(picked) => setChoice({ mode: "new", key, picked })}
      />
    );
  }

  // THE RUN REFUSES RATHER THAN STARTING BLIND — but only about what THIS mode
  // actually promises. In `primed` that is still disease D4's cure: the whole
  // Rulebook, bound before turn 1. In `blank_slate` the missing document is the
  // POINT, so the check runs against the payload the mode really sends.
  const launchVariables = buildInterviewLaunchVariablesSafely({
    rulebookId,
    expertName,
    rulebookName,
    mode: choice.picked.mode,
    probes: choice.picked.probes,
    closingSurprises: choice.picked.closingSurprises,
    rulebookDocument: rulebookDoc.document,
  });
  const missing = launchVariables
    ? missingRequiredVariables(mandate.contract, launchVariables)
    : [RULEBOOK_DOCUMENT_VARIABLE];
  if (missing.length > 0) {
    const mode = contextModeOption(choice.picked.mode);
    return (
      <div className="space-y-3 px-4 py-6 text-sm">
        <p className="text-foreground">
          {missingVariablesMessage(SCOUT_MANDATE_KEY, missing)}
        </p>
        <p className="text-muted-foreground">
          You chose &ldquo;{mode.title}&rdquo;, and we could not give the
          interviewer everything that mode needs — so we stopped rather than
          starting a session that would quietly be something else.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={rulebookDoc.reload}>
            Try again
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setChoice({ mode: "configure", key: choice.key })}
          >
            Choose a different interviewer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <InterviewConversation
      rulebookId={rulebookId}
      rulebookName={rulebookName}
      rulebookDocument={rulebookDoc.document ?? ""}
      expertName={expertName}
      choice={choice.picked}
      agentId={mandate.agentId}
      seedText={seedText}
      freshSessionKey={choice.key}
    />
  );
}

/**
 * `buildInterviewLaunchVariables` THROWS when a primed interview has no
 * document — that throw is the contract for a caller that should have refused.
 * Here we want the refusal SCREEN, so the throw becomes `null` and the caller
 * above renders it.
 */
function buildInterviewLaunchVariablesSafely(
  input: Parameters<typeof buildInterviewLaunchVariables>[0],
): ReturnType<typeof buildInterviewLaunchVariables> | null {
  try {
    return buildInterviewLaunchVariables(input);
  } catch {
    return null;
  }
}

export function ScoutInterviewPanel({
  rulebookId,
  rulebookName,
  open,
  onOpenChange,
  onRulebookChanged,
  seedText,
  initialConversationId,
  startNewNonce,
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
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      position="right"
      defaultSize={42}
      minSize={30}
      maxSize={80}
      expandButtonLabel="Interview"
      initialFocus
      title={
        <span className="inline-flex min-w-0 items-center gap-2">
          <MessagesSquare className="h-4 w-4 text-primary" aria-hidden />
          <span className="truncate">Interview</span>
          <AgentCredit mandate={MANDATE_KEYS.masterwork__scout} agent="masterwork_scout" />
          <IntelligenceIndicator
            feature="masterwork"
            mandateKeys={[MANDATE_KEYS.masterwork__scout]}
            context={{ rulebookId }}
            label="The interviewer"
          />
        </span>
      }
      headerActions={
        // THE DOOR LAW — the interview has its own URL.
        <Link
          href={`/masterwork/${rulebookId}/interview${
            initialConversationId
              ? `?conversation=${initialConversationId}`
              : ""
          }`}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-normal text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Open the interview as its own page"
           target="_blank"
           rel="noopener noreferrer"
         >
          <ExternalLink className="h-3 w-3" />
          Full page
        </Link>
      }
      contentClassName="flex h-full min-h-0 flex-col overflow-hidden p-0"
    >
      {open ? (
        <ScoutInterviewContent
          // Remount when the target changes so Continue-on-another-row and
          // repeated "New interview" both actually switch conversations.
          key={`${initialConversationId ?? "-"}:${startNewNonce ?? 0}`}
          rulebookId={rulebookId}
          rulebookName={rulebookName}
          seedText={seedText}
          initialConversationId={initialConversationId}
          startNew={(startNewNonce ?? 0) > 0}
        />
      ) : null}
    </MatrxDynamicPanelHost>
  );
}
