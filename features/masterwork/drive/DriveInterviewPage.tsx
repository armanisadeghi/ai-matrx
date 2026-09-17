"use client";

// features/masterwork/drive/DriveInterviewPage.tsx
//
// INTERVIEW ME WHILE I DRIVE.
//
// Arman, 2026-09-17: "No one has come to me and said, hey, we need to build a
// really amazing interview while you drive page. So it's a little mobile page
// that is specifically for extracting knowledge and expertise from someone
// while they're driving somewhere. So it's net zero time."
//
// ONE THING YOU TOUCH. The page is a single full-bleed control. You tap it
// once at the kerb and never look at the phone again: the interviewer talks,
// you talk back, and everything you say lands on the Rulebook as an interview
// exactly like the one you would have had at your desk.
//
// WHAT THIS PAGE DOES NOT DO — on purpose:
//   • It does not invent an interviewer. The interviewer is whatever the
//     `masterwork.drive.interviewer_mandate_key` setting names (default: the
//     same Scout the "Talk it through" lane uses), resolved by Mandate. No
//     agent id, no instructions, no persona in this file — those are the
//     owner's to write, and swapping the interviewer is a settings change.
//   • It does not build a second voice stack. Voice in and voice out are the
//     existing Communicator relay (`features/voice-agent/relay/`), the same
//     one already mounted in the Scout panel and the Conductor.
//   • It does not build a second way to save. The conversation is an ordinary
//     execution-system conversation, associated to the Rulebook by the same
//     `associateInterviewWhenPersisted` every interview uses, so it appears in
//     "Your words" with its timestamps like any other.
//   • It shows no transcript. There is nothing to read while moving.
//
// THE HONEST LIMIT (say it, never paper over it): this is mobile web. iOS
// suspends a backgrounded tab's audio pipeline, so if the driver leaves the
// browser or the screen locks, capture stops — the page detects that it lost
// the session, says so out loud when it comes back, and RESUMES the same
// conversation rather than losing it (`driveSession.ts`). A native app in
// `aidream/mobile/` would add true background audio, a lock-screen control,
// CarPlay and Siri hand-off; that directory is an empty reserved layout today.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, MicOff, Square, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useMandate } from "@/features/mandates/useMandate";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useConversationResume } from "@/features/agents/hooks/useConversationResume";
import { selectPrimaryRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { primeAudioOutput } from "@/features/audio/unlock";
import { useVoiceRelaySession } from "@/features/voice-agent/relay/useVoiceRelaySession";
import { VOICE_COMMUNICATOR_MANDATE_KEY } from "@/features/voice-agent/relay/useVoiceRelaySession";
import { selectVoiceLatestUserTurn } from "@/features/voice-agent/state/selectors";
import { MASTERWORK_RULEBOOK_SURFACE_NAME } from "@/features/surfaces/manifests/masterwork-rulebook.manifest";
import { useRulebookDocument } from "@/features/masterwork/agent-context/useRulebookDocument";
import { useRulebookSourceCount } from "@/features/masterwork/sourceLinks";
import { useInterviewSettings } from "@/features/masterwork/record/useInterviewSettings";
import {
  blankSlateScopeOverride,
  buildInterviewLaunchVariables,
  resolveContextMode,
  type InterviewContextMode,
  type InterviewProbe,
} from "@/features/masterwork/record/interviewModes";
import {
  associateInterviewWhenPersisted,
  listRulebookInterviews,
} from "@/features/masterwork/record/service";
import { RecordingOriginProvider } from "@/features/audio/RecordingOriginProvider";
import {
  clearDriveMemory,
  describeIdle,
  driveLauncherFreshness,
  readDriveMemory,
  resolveDriveSession,
  writeDriveMemory,
  type DriveSessionResolution,
} from "./driveSession";
import { matchDriveVoiceCommand } from "./voiceCommands";
import { useDriveSettings, type DriveSettingsValues } from "./useDriveSettings";

const SOURCE_FEATURE = "masterwork" as const;

/** How long to wait before a dropped session is retried, and the ceiling. */
const RECONNECT_BASE_MS = 1500;
const RECONNECT_MAX_MS = 15_000;

export interface DriveInterviewPageProps {
  rulebookId: string;
  rulebookName: string;
  rulebookOrganizationId: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// The shell — everything that must be answered before a single word is spoken
// ═══════════════════════════════════════════════════════════════════════════

export function DriveInterviewPage({
  rulebookId,
  rulebookName,
  rulebookOrganizationId,
}: DriveInterviewPageProps) {
  const driveSettings = useDriveSettings(rulebookId, rulebookOrganizationId);
  const interviewSettings = useInterviewSettings(
    rulebookId,
    rulebookOrganizationId,
  );
  const sources = useRulebookSourceCount(rulebookId, rulebookOrganizationId);
  const document = useRulebookDocument(rulebookId);
  const expertName = useAppSelector(
    (s) =>
      s.userProfile?.userMetadata?.fullName ??
      s.userProfile?.userMetadata?.name ??
      "The expert",
  );

  // Which interviewer conducts a drive is a SETTING, never a literal here.
  const interviewerKey =
    driveSettings.state === "ready" ? driveSettings.interviewerMandateKey : "";
  const interviewer = useMandate(interviewerKey);
  const communicator = useMandate(VOICE_COMMUNICATOR_MANDATE_KEY);

  // ── Resume: is there a drive on this Rulebook that is still warm? ────────
  const [resolution, setResolution] = useState<DriveSessionResolution | null>(
    null,
  );
  useEffect(() => {
    if (driveSettings.state !== "ready") return undefined;
    let live = true;
    const remembered = readDriveMemory(rulebookId);
    void (async () => {
      let candidate = null as
        | { conversationId: string; lastActiveAtMs: number }
        | null;
      try {
        const interviews = await listRulebookInterviews(rulebookId);
        const newest = interviews
          .map((i) => ({
            conversationId: i.conversationId,
            lastActiveAtMs: Date.parse(i.updatedAt ?? i.createdAt),
          }))
          .filter((i) => Number.isFinite(i.lastActiveAtMs))
          .sort((a, b) => b.lastActiveAtMs - a.lastActiveAtMs)[0];
        candidate = newest ?? null;
      } catch {
        // The Rulebook's interview list is the SECOND answer, not the only
        // one. A failure here still leaves this device's memory, and a fresh
        // interview is always a valid outcome — it is never a reason to
        // refuse to let someone talk.
        candidate = null;
      }
      if (!live) return;
      setResolution(
        resolveDriveSession({
          rulebookId,
          remembered,
          rulebookCandidate: candidate,
          nowMs: Date.now(),
          resumeWindowMinutes: driveSettings.resumeWindowMinutes,
        }),
      );
    })();
    return () => {
      live = false;
    };
  }, [rulebookId, driveSettings]);

  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState<{ turns: number } | null>(null);

  const failure =
    driveSettings.state === "failed"
      ? { reason: driveSettings.reason, retry: driveSettings.retry }
      : interviewSettings.state === "failed"
        ? { reason: interviewSettings.reason, retry: interviewSettings.retry }
        : sources.state === "failed"
          ? { reason: sources.reason, retry: sources.retry }
          : document.error
            ? { reason: document.error, retry: document.reload }
            : null;

  if (failure) {
    return (
      <DriveShell>
        <DriveMessage
          headline="We can't start yet"
          body="We couldn't read your interview settings, so we don't know which interviewer you asked for — and starting one you didn't choose would be worse than waiting."
          detail={failure.reason}
        >
          <DriveBigButton onClick={failure.retry} tone="neutral">
            <RotateCw className="h-8 w-8" />
            Try again
          </DriveBigButton>
        </DriveMessage>
      </DriveShell>
    );
  }

  if (interviewer.error || (interviewerKey && interviewer.absent)) {
    return (
      <DriveShell>
        <DriveMessage
          headline="No interviewer is ready"
          body={`Nobody is bound to conduct a driving interview yet, so there is no one to talk to. An administrator binds an agent to "${interviewerKey}" and this page works.`}
          detail={interviewer.error ?? undefined}
        />
      </DriveShell>
    );
  }
  if (communicator.error || !communicator.mandate) {
    if (!communicator.loading) {
      return (
        <DriveShell>
          <DriveMessage
            headline="The voice layer is unavailable"
            body="This page can only work out loud, and the voice layer has no Communicator bound — so there is nothing honest to offer here."
            detail={communicator.error ?? undefined}
          />
        </DriveShell>
      );
    }
  }

  const hasSources = sources.state === "ready" ? sources.count > 0 : null;
  const ready =
    driveSettings.state === "ready" &&
    interviewSettings.state === "ready" &&
    hasSources !== null &&
    !document.loading &&
    !interviewer.loading &&
    interviewer.mandate !== null &&
    !communicator.loading &&
    communicator.mandate !== null &&
    resolution !== null;

  if (!ready) {
    return (
      <DriveShell>
        <DriveMessage
          headline="Getting ready"
          body={
            interviewer.organizationPending
              ? "Setting up your workspace."
              : "One moment — loading your rulebook and your settings."
          }
        />
      </DriveShell>
    );
  }

  if (finished) {
    return (
      <DriveShell>
        <DriveMessage
          headline="Saved"
          body={`Everything you said is on "${rulebookName}" now, with the time you said it — the same as any other interview.`}
        >
          <div className="flex w-full flex-col gap-4">
            <DriveBigButton
              onClick={() => {
                setFinished(null);
                setStarted(false);
              }}
              tone="go"
            >
              <Mic className="h-8 w-8" />
              Talk some more
            </DriveBigButton>
            <Button
              asChild
              variant="outline"
              className="h-14 w-full border-white/25 bg-transparent text-lg text-white hover:bg-white/10"
            >
              <Link href={`/masterwork/${rulebookId}/record`}>
                Read back what I said
              </Link>
            </Button>
          </div>
        </DriveMessage>
      </DriveShell>
    );
  }

  if (!started) {
    const resuming = resolution.kind === "resume";
    return (
      <DriveShell>
        <div className="flex h-full w-full flex-col items-center justify-center gap-10 px-6">
          <div className="text-center">
            <p className="text-3xl leading-tight font-semibold text-white">
              {resuming ? "Pick up where you left off" : "Talk it through"}
            </p>
            <p className="mt-3 text-xl leading-snug text-white/70">
              {resuming
                ? `You were talking about ${rulebookName} ${describeIdle(resolution.idleMs)}.`
                : rulebookName}
            </p>
          </div>
          <DriveBigButton
            tone="go"
            onClick={() => {
              // 🚨 SYNCHRONOUS, inside the tap — iOS plays silence otherwise
              // (features/audio/unlock.ts). Never move this behind an await.
              primeAudioOutput();
              setStarted(true);
            }}
          >
            <Mic className="h-12 w-12" />
            {resuming ? "Carry on" : "Start"}
          </DriveBigButton>
          <p className="max-w-xs text-center text-lg leading-snug text-white/60">
            Tap once. After that you can put the phone down and just talk —
            say &ldquo;pause&rdquo; any time, and &ldquo;I&apos;m done&rdquo;
            when you arrive.
          </p>
        </div>
      </DriveShell>
    );
  }

  const mode: InterviewContextMode = resolveContextMode(
    interviewSettings.state === "ready" ? interviewSettings.contextMode : "auto",
    hasSources,
  );

  return (
    <DriveLiveSession
      key={
        resolution.kind === "resume" ? resolution.conversationId : "fresh-drive"
      }
      rulebookId={rulebookId}
      rulebookName={rulebookName}
      expertName={expertName}
      interviewerAgentId={interviewer.mandate!.agentId}
      communicatorAgentId={communicator.mandate!.agentId}
      resumeConversationId={
        resolution.kind === "resume" ? resolution.conversationId : undefined
      }
      mode={mode}
      probes={
        interviewSettings.state === "ready"
          ? interviewSettings.probes
          : (["adaptive"] as InterviewProbe[])
      }
      closingSurprises={
        interviewSettings.state === "ready"
          ? interviewSettings.closingSurprises
          : true
      }
      rulebookDocument={document.document}
      drive={driveSettings}
      onFinished={(turns) => setFinished({ turns })}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The live session
// ═══════════════════════════════════════════════════════════════════════════

function DriveLiveSession(props: {
  rulebookId: string;
  rulebookName: string;
  expertName: string;
  interviewerAgentId: string;
  communicatorAgentId: string;
  resumeConversationId?: string;
  mode: InterviewContextMode;
  probes: InterviewProbe[];
  closingSurprises: boolean;
  rulebookDocument: string | null;
  drive: DriveSettingsValues;
  onFinished: (turns: number) => void;
}) {
  const {
    rulebookId,
    rulebookName,
    expertName,
    interviewerAgentId,
    communicatorAgentId,
    resumeConversationId,
    mode,
    probes,
    closingSurprises,
    rulebookDocument,
    drive,
    onFinished,
  } = props;

  const surfaceKey = `masterwork-drive:${rulebookId}`;

  // Resuming rehydrates the conversation through the canonical sequence, so
  // the interviewer picks up holding everything already said — the point of
  // resuming at all. A fresh drive skips it.
  const resume = useConversationResume({
    // Hooks are not conditional: a fresh drive mounts it disabled with a null
    // id, which is its documented no-op.
    conversationId: resumeConversationId ?? null,
    agentId: interviewerAgentId,
    surfaceKey,
    enabled: Boolean(resumeConversationId),
    messageLimit: 50,
  });

  const { conversationId } = useAgentLauncher(interviewerAgentId, {
    surfaceKey,
    sourceFeature: SOURCE_FEATURE,
    conversationId: resumeConversationId,
    runtime: {
      surfaceName: MASTERWORK_RULEBOOK_SURFACE_NAME,
      ...blankSlateScopeOverride(mode),
      variables: buildInterviewLaunchVariables({
        rulebookId,
        expertName,
        rulebookName,
        mode,
        probes,
        closingSurprises,
        rulebookDocument,
      }),
    },
    config: { responseDensity: "compact" },
    // 🚨 A FRESH DRIVE NEVER ADOPTS WHATEVER THE APP LAST FOCUSED.
    //
    // Found live, 2026-09-17, on the first run of this page: a drive started
    // on a brand-new Rulebook silently continued the conversation the "Talk it
    // through" sheet had opened seconds earlier, because the managed launcher
    // resolves `focusedConversationId ?? mint()` when no id is handed in. In a
    // car that is invisible — the driver is told nothing, and her words join a
    // conversation she is not looking at. The Scout panel carries the same two
    // lines for the same reason ("Start a new interview must NEVER revive the
    // previous conversation"). When we ARE resuming, the pin is explicit above
    // and these are inert.
    ...driveLauncherFreshness(resumeConversationId),
    retainOnUnmount: true,
  });

  const relay = useVoiceRelaySession({
    communicatorAgentId,
    primaryAgentId: interviewerAgentId,
    conversationId: conversationId ?? undefined,
    surfaceKey,
    sourceFeature: SOURCE_FEATURE,
    questionPacing: "one_at_a_time",
  });

  // ── THE ASSOCIATION — this is what makes a drive land on the Rulebook ────
  const dispatch = useAppDispatch();
  const turnStarted = useAppSelector((state) =>
    conversationId ? Boolean(selectPrimaryRequest(conversationId)(state)) : false,
  );
  const linkedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId || !turnStarted || linkedRef.current === conversationId) {
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

  // ── Remember the drive so a reload, a tunnel or a lock screen resumes ────
  useEffect(() => {
    if (!conversationId || !turnStarted) return;
    writeDriveMemory({
      rulebookId,
      conversationId,
      startedAtMs: Date.now(),
      lastActiveAtMs: Date.now(),
    });
  }, [conversationId, rulebookId, turnStarted]);

  // ── Start the microphone once, as soon as the session can carry it ───────
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!conversationId) return;
    if (relay.status !== "idle") return;
    autoStartedRef.current = true;
    relay.toggle();
  }, [conversationId, relay]);

  // ── Kick the interview off so the interviewer speaks first ───────────────
  // Hands-free means the Expert must never have to start the conversation.
  // A RESUMED drive is not kicked off: the interviewer already asked
  // something, and repeating an opener would be the page talking over itself.
  const kickedRef = useRef(false);
  useEffect(() => {
    if (kickedRef.current) return;
    if (resumeConversationId) return;
    if (!conversationId) return;
    if (relay.status === "idle" || relay.status === "error") return;
    kickedRef.current = true;
    // THE USER-INPUT LAW: this is not machine content smuggled as a human
    // turn — it is the sentence the Expert would otherwise have to say to
    // begin, sent on her behalf because her hands are on the wheel.
    relay.sendToPrimary(
      "I'm driving, so let's do this out loud. Ask me your first question.",
    );
  }, [conversationId, relay, resumeConversationId]);

  // ── Voice commands: pause / resume / end, deterministic, no agent needed ─
  const latestUserTurn = useAppSelector((s) =>
    selectVoiceLatestUserTurn(s, relay.instanceId),
  );
  const handledTurnRef = useRef<string | null>(null);
  const [pausedByVoice, setPausedByVoice] = useState(false);
  const endRef = useRef(false);

  const endSession = useCallback(() => {
    if (endRef.current) return;
    endRef.current = true;
    clearDriveMemory(rulebookId);
    void relay.stop();
    onFinished(0);
  }, [onFinished, relay, rulebookId]);

  useEffect(() => {
    if (!latestUserTurn) return;
    if (latestUserTurn.status !== "completed") return;
    if (handledTurnRef.current === latestUserTurn.id) return;
    handledTurnRef.current = latestUserTurn.id;

    // Every spoken turn is proof the drive is alive — keep the resume window
    // measured from the last thing said, not from when it started.
    if (conversationId) {
      writeDriveMemory({
        rulebookId,
        conversationId,
        startedAtMs: Date.now(),
        lastActiveAtMs: Date.now(),
      });
    }

    const command = matchDriveVoiceCommand(latestUserTurn.text, {
      enabled: drive.voiceCommands,
    });
    if (!command) return;
    if (command === "pause" && !relay.micMuted) {
      setPausedByVoice(true);
      relay.toggleMute();
    } else if (command === "resume" && relay.micMuted) {
      setPausedByVoice(false);
      relay.toggleMute();
    } else if (command === "end") {
      endSession();
    }
  }, [
    latestUserTurn,
    relay,
    drive.voiceCommands,
    conversationId,
    rulebookId,
    endSession,
  ]);

  // ── Reconnect. A tunnel is not the end of an interview. ─────────────────
  const [reconnecting, setReconnecting] = useState(false);
  const attemptsRef = useRef(0);
  useEffect(() => {
    if (!drive.autoReconnect) return undefined;
    if (endRef.current) return undefined;
    if (!autoStartedRef.current) return undefined;
    const dropped = relay.status === "error";
    if (!dropped) {
      attemptsRef.current = 0;
      setReconnecting(false);
      return undefined;
    }
    setReconnecting(true);
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** attemptsRef.current,
      RECONNECT_MAX_MS,
    );
    attemptsRef.current += 1;
    const timer = setTimeout(() => {
      if (endRef.current) return;
      relay.toggle();
    }, delay);
    return () => clearTimeout(timer);
  }, [relay.status, relay, drive.autoReconnect]);

  // ── The one line of state, said out loud rather than read ────────────────
  const spokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!drive.spokenStatus) return;
    const line = reconnecting
      ? "I lost the connection. I'm not hearing you right now — hold that thought."
      : null;
    if (line === spokenRef.current) return;
    spokenRef.current = line;
    if (!line) return;
    // The app-wide speaker, never a second TTS path (tts-audio-system skill).
    void import("@/features/audio/service/speak").then(({ speak }) => {
      speak({ text: line, label: "Drive status", processMarkdown: false });
    });
  }, [reconnecting, drive.spokenStatus]);

  const status = describeStatus({
    reconnecting,
    muted: relay.micMuted,
    pausedByVoice,
    brainBusy: relay.brainBusy,
    voiceStatus: relay.status,
    resuming: resume.isResuming,
  });

  return (
    <RecordingOriginProvider
      origin={{
        surface: "masterwork.drive",
        conversationId: conversationId ?? undefined,
        entityToken: "rulebook",
        entityId: rulebookId,
        label: rulebookName,
        href: `/masterwork/${rulebookId}`,
      }}
    >
      <DriveShell>
        <div className="flex h-full w-full flex-col items-center justify-between px-6 py-10">
          <p className="text-center text-lg text-white/50">{rulebookName}</p>

          <div className="flex flex-col items-center gap-8">
            <DriveOrb tone={status.tone} />
            <p className="max-w-sm text-center text-3xl leading-tight font-semibold text-white">
              {status.headline}
            </p>
            {status.detail ? (
              <p className="max-w-sm text-center text-xl leading-snug text-white/60">
                {status.detail}
              </p>
            ) : null}
          </div>

          <div className="flex w-full max-w-sm flex-col gap-4 pb-safe">
            <DriveBigButton
              tone={relay.micMuted ? "go" : "neutral"}
              onClick={() => {
                primeAudioOutput();
                setPausedByVoice(false);
                relay.toggleMute();
              }}
            >
              {relay.micMuted ? (
                <>
                  <Mic className="h-8 w-8" />
                  Carry on
                </>
              ) : (
                <>
                  <MicOff className="h-8 w-8" />
                  Pause
                </>
              )}
            </DriveBigButton>
            <Button
              onClick={endSession}
              className="h-16 w-full rounded-2xl bg-white/10 text-xl font-semibold text-white hover:bg-white/20"
            >
              <Square className="mr-3 h-6 w-6" />
              I&apos;m done
            </Button>
          </div>
        </div>
      </DriveShell>
    </RecordingOriginProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Status — one sentence, never a spinner, never a lie
// ═══════════════════════════════════════════════════════════════════════════

export type DriveTone = "go" | "listening" | "speaking" | "waiting" | "trouble";

export function describeStatus(input: {
  reconnecting: boolean;
  muted: boolean;
  pausedByVoice: boolean;
  brainBusy: boolean;
  voiceStatus: string;
  resuming: boolean;
}): { headline: string; detail?: string; tone: DriveTone } {
  if (input.reconnecting) {
    return {
      headline: "Reconnecting",
      detail:
        "I'm not hearing you right now. Nothing you already said is lost — I'll pick up where we were.",
      tone: "trouble",
    };
  }
  if (input.resuming) {
    return {
      headline: "Catching up",
      detail: "Reading back what you already told me.",
      tone: "waiting",
    };
  }
  if (input.muted) {
    return {
      headline: "Paused",
      detail: input.pausedByVoice
        ? "Say “carry on” when you're ready."
        : "Tap Carry on, or just say it.",
      tone: "waiting",
    };
  }
  switch (input.voiceStatus) {
    case "idle":
      return { headline: "Starting", tone: "waiting" };
    case "requesting-mic":
      return {
        headline: "Allow the microphone",
        detail: "Your phone is asking — say yes and we're off.",
        tone: "waiting",
      };
    case "connecting":
      return { headline: "Connecting", tone: "waiting" };
    case "speaking":
    case "interrupting":
      return { headline: "Listen", tone: "speaking" };
    case "thinking":
      return { headline: "Thinking", tone: "waiting" };
    case "error":
      return {
        headline: "Something broke",
        detail: "Tap Carry on to try again.",
        tone: "trouble",
      };
    default:
      break;
  }
  if (input.brainBusy) return { headline: "Thinking", tone: "waiting" };
  return { headline: "I'm listening", tone: "listening" };
}

// ═══════════════════════════════════════════════════════════════════════════
// Chrome — large, high contrast, dark, 44px+ everywhere
// ═══════════════════════════════════════════════════════════════════════════

function DriveShell({ children }: { children: React.ReactNode }) {
  return (
    // Deliberately NOT a semantic token surface: this screen is read through a
    // windscreen reflection in daylight, so it is near-black with white type
    // in both themes. `matrx-touch-targets` floors every control inside it.
    <div className="matrx-touch-targets h-full w-full overflow-hidden bg-[#050505] text-white">
      {children}
    </div>
  );
}

function DriveBigButton({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: "go" | "neutral";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full min-h-[88px] flex-col items-center justify-center gap-2",
        "rounded-3xl text-2xl font-semibold tracking-tight",
        "transition-transform active:scale-[0.98]",
        tone === "go"
          ? "bg-emerald-400 text-black"
          : "bg-white/12 text-white hover:bg-white/20",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function DriveOrb({ tone }: { tone: DriveTone }) {
  const color =
    tone === "listening"
      ? "bg-emerald-400"
      : tone === "speaking"
        ? "bg-sky-400"
        : tone === "trouble"
          ? "bg-amber-400"
          : "bg-white/30";
  return (
    <div className="relative flex h-40 w-40 items-center justify-center">
      <div
        className={`absolute inset-0 rounded-full ${color} opacity-20 ${
          tone === "listening" || tone === "speaking" ? "animate-ping" : ""
        }`}
      />
      <div className={`h-24 w-24 rounded-full ${color}`} />
    </div>
  );
}

function DriveMessage({
  headline,
  body,
  detail,
  children,
}: {
  headline: string;
  body: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-3xl leading-tight font-semibold text-white">
        {headline}
      </p>
      <p className="max-w-sm text-xl leading-snug text-white/70">{body}</p>
      {detail ? (
        <p className="max-w-sm text-base break-words text-white/40">{detail}</p>
      ) : null}
      {children ? (
        <div className="w-full max-w-sm pt-4">{children}</div>
      ) : null}
    </div>
  );
}

