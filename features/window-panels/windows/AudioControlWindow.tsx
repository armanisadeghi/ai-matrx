"use client";

/**
 * AudioControlWindow — the app-wide "Audio" panel.
 *
 * The single, live view of EVERY audio activity in the session — playback and
 * recording, in progress and in history — backed by the unified
 * `audioSessionRegistry` (features/audio/session). Three synced tabs:
 *
 *   1. Playback — now-playing transport (works for the chat read-aloud, the
 *      streaming auto-voice, the playback queue, and — later — podcasts / the
 *      voice agent), up-next, and replayable history.
 *   2. Recording — the live mic indicator + level (from `state.recordings`,
 *      the GlobalRecordingProvider mirror) and recording history.
 *   3. Devices — mic/speaker pickers, permission, test tones.
 *
 * All three read live Redux selectors, so switching tabs never loses state and
 * incoming audio appends in real time regardless of the active tab.
 *
 * This file is a leaf, loaded ONLY behind the lazy overlay boundary
 * (`lazyOverlay` in OverlayController). It imports NO TTS SDK — only SDK-free
 * hooks/selectors and the recording provider context.
 */

import { useState, useTransition, type ReactNode } from "react";
import {
  AudioLines,
  History,
  ChevronDown,
  ChevronRight,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Settings2,
  Square,
  StopCircle,
  Volume2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOverlayData } from "@/lib/redux/slices/overlaySlice";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGlobalRecordingOptional } from "@/providers/GlobalRecordingProvider";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AudioDevicesPanel } from "@/features/audio/components/devices/AudioDevicesPanel";
import { AudioLevelIndicator } from "@/features/audio/components/AudioLevelIndicator";
import { useAudioPlayback } from "@/features/audio/playback/useAudioPlayback";
import { useAudioSessions } from "@/features/audio/session/useAudioSessions";
import type {
  AudioSession,
  AudioSessionStatus,
} from "@/features/audio/session/types";

interface AudioControlWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const;

type AudioTab = "playback" | "recording" | "devices";

export default function AudioControlWindow({
  isOpen,
  onClose,
}: AudioControlWindowProps) {
  if (!isOpen) return null;
  return (
    <WindowPanel
      title="Audio"
      id="audio-control-default"
      overlayId="audioControlWindow"
      onClose={onClose}
      minWidth={340}
      minHeight={380}
      width={420}
      height={540}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <AudioControlBody />
    </WindowPanel>
  );
}

// ─── Body: three synced tabs (Playback / Recording / Devices) ──────────────────

function AudioControlBody() {
  const isMobile = useIsMobile();
  // Initial tab comes from the overlay `data` (the Devices opener sets it);
  // `nonce` lets a fresh open re-sync the tab even while already mounted.
  const requestedTab = useAppSelector(
    (s) =>
      (selectOverlayData(s, "audioControlWindow") as
        | { tab?: AudioTab; nonce?: number }
        | null) ?? null,
  );
  const requestedKey = requestedTab?.tab
    ? `${requestedTab.tab}:${requestedTab.nonce ?? ""}`
    : null;
  const [tab, setTab] = useState<AudioTab>(
    requestedTab?.tab === "devices"
      ? "devices"
      : requestedTab?.tab === "recording"
        ? "recording"
        : "playback",
  );
  // Sync to an externally-requested tab (the Devices opener) by adjusting state
  // during render — the React-blessed alternative to a setState-in-effect — so a
  // fresh open re-selects the tab even while the window is already mounted.
  const [appliedKey, setAppliedKey] = useState<string | null>(requestedKey);
  if (requestedKey && requestedKey !== appliedKey && requestedTab?.tab) {
    setAppliedKey(requestedKey);
    setTab(requestedTab.tab);
  }

  // Mobile: stack sections (no tabs) per the mobile-first guidance.
  if (isMobile) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 space-y-4 text-foreground">
        <section className="space-y-1.5">
          <SectionLabel>Playback</SectionLabel>
          <PlaybackSurface />
        </section>
        <div className="h-px bg-border" />
        <section className="space-y-1.5">
          <SectionLabel>Recording</SectionLabel>
          <RecordingSurface />
        </section>
        <div className="h-px bg-border" />
        <section className="space-y-1.5">
          <SectionLabel>Devices</SectionLabel>
          <AudioDevicesPanel />
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 pt-2">
        <TabButton
          active={tab === "playback"}
          onClick={() => setTab("playback")}
          icon={<AudioLines />}
          label="Playback"
        />
        <TabButton
          active={tab === "recording"}
          onClick={() => setTab("recording")}
          icon={<Mic />}
          label="Recording"
        />
        <TabButton
          active={tab === "devices"}
          onClick={() => setTab("devices")}
          icon={<Settings2 />}
          label="Devices"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 text-foreground">
        {tab === "playback" && <PlaybackSurface />}
        {tab === "recording" && <RecordingSurface />}
        {tab === "devices" && <AudioDevicesPanel />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-1.5 text-xs font-medium transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Playback surface ──────────────────────────────────────────────────────────

function PlaybackSurface() {
  const { currentPlayback, pending, playbackHistory } = useAudioSessions();

  const isEmpty =
    !currentPlayback && pending.length === 0 && playbackHistory.length === 0;

  if (isEmpty) {
    return <EmptyState icon={<AudioLines />} text="No audio playing" />;
  }

  return (
    <div className="space-y-3">
      <NowPlaying currentPlayback={currentPlayback} />
      <SpeedControl />
      {pending.length > 0 && <UpNextList pending={pending} />}
      {playbackHistory.length > 0 && (
        <HistoryList history={playbackHistory} label="History" />
      )}
    </div>
  );
}

function NowPlaying({
  currentPlayback,
}: {
  currentPlayback: AudioSession | null;
}) {
  const { control } = useAudioSessions();
  const [isPending, startTransition] = useTransition();

  const status = currentPlayback?.status;
  const isPaused = status === "paused";
  const isActive = status === "active";
  const isLoading = status === "loading";
  const id = currentPlayback?.id;

  return (
    <section className="space-y-1.5">
      <SectionLabel>Now playing</SectionLabel>
      <div className="rounded-lg border border-border bg-card px-2.5 py-2">
        <div className="flex items-center gap-2">
          <SpeakerActivity active={isActive} />
          <span className="min-w-0 flex-1 truncate text-xs text-foreground">
            {currentPlayback
              ? sessionTitle(currentPlayback)
              : "Nothing playing right now"}
          </span>
          {status && <StatusChip status={status} />}
        </div>

        {currentPlayback && (
          <div className="mt-2 flex items-center gap-1">
            <TransportButton
              onClick={() =>
                startTransition(() => {
                  if (!id) return;
                  if (isPaused) control(id, "resume");
                  else control(id, "pause");
                })
              }
              disabled={(!isActive && !isPaused) || isPending}
              title={isPaused ? "Resume" : "Pause"}
              label={isPaused ? "Resume" : "Pause"}
              icon={isPaused ? <Play /> : <Pause />}
            />
            <TransportButton
              onClick={() => startTransition(() => id && control(id, "stop"))}
              disabled={(!isActive && !isPaused && !isLoading) || isPending}
              title="Stop"
              label="Stop"
              icon={<Square />}
              variant="destructive"
            />
          </div>
        )}
      </div>
    </section>
  );
}

function SpeedControl() {
  const { rate, setRate } = useAudioPlayback();
  return (
    <section className="space-y-1.5">
      <SectionLabel>Speed</SectionLabel>
      <div className="inline-flex w-full overflow-hidden rounded-lg border border-border bg-muted/40">
        {SPEED_OPTIONS.map((value, idx) => {
          const active = Math.abs(rate - value) < 0.01;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setRate(value)}
              className={cn(
                "flex-1 px-2 py-1 text-xs font-medium tabular-nums transition-colors",
                idx > 0 && "border-l border-border",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {value}×
            </button>
          );
        })}
      </div>
    </section>
  );
}

function UpNextList({ pending }: { pending: AudioSession[] }) {
  const { control } = useAudioSessions();
  const [isPending, startTransition] = useTransition();
  return (
    <section className="space-y-1.5">
      <SectionLabel>Up next ({pending.length})</SectionLabel>
      <ul className="space-y-1">
        {pending.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1"
          >
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">
              {sessionTitle(item)}
            </span>
            <RowIconButton
              onClick={() => startTransition(() => control(item.id, "playNow"))}
              disabled={isPending}
              title="Play now"
              label="Play now"
              icon={<Play />}
            />
            <RowIconButton
              onClick={() => control(item.id, "remove")}
              title="Remove from queue"
              label="Remove"
              icon={<X />}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function HistoryList({
  history,
  label,
}: {
  history: AudioSession[];
  label: string;
}) {
  const { control, can } = useAudioSessions();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  return (
    <section className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <History className="h-3 w-3" />
        {label} ({history.length})
      </button>
      {open && (
        <ul className="space-y-1">
          {history.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted-foreground">
                  {sessionTitle(item)}
                </p>
                {item.status === "error" && item.error && (
                  <p className="truncate text-[10px] text-destructive">
                    {item.error}
                  </p>
                )}
              </div>
              {can(item.id, "replay") && (
                <RowIconButton
                  onClick={() =>
                    startTransition(() => control(item.id, "replay"))
                  }
                  disabled={isPending}
                  title="Replay"
                  label="Replay"
                  icon={<RotateCcw />}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Recording surface ─────────────────────────────────────────────────────────

function RecordingSurface() {
  const isRecording = useAppSelector((s) => s.recordings.isRecording);
  const { recordingHistory } = useAudioSessions();

  const isEmpty = !isRecording && recordingHistory.length === 0;
  if (isEmpty) {
    return <EmptyState icon={<Mic />} text="Not recording" />;
  }

  return (
    <div className="space-y-3">
      {isRecording ? <ActiveRecording /> : <NotRecordingHint />}
      {recordingHistory.length > 0 && (
        <HistoryList history={recordingHistory} label="Recordings" />
      )}
    </div>
  );
}

function ActiveRecording() {
  const isPaused = useAppSelector((s) => s.recordings.isPaused);
  const durationSec = useAppSelector((s) => s.recordings.durationSec);
  const audioLevel = useAppSelector((s) => s.recordings.audioLevel);
  const contextLabel = useAppSelector((s) => {
    const c = s.recordings.context;
    if (!c) return null;
    if ("label" in c && c.label) return c.label;
    return null;
  });

  // All recordings (studio / voice-pad / field) run through this single
  // provider, so its `stop()` cleanly ends whatever `state.recordings` is
  // showing — no parallel recorder. When the provider is unavailable (e.g. a
  // surface outside the tree), the indicator stays read-only.
  const recording = useGlobalRecordingOptional();
  const canStop = !!recording?.isActive;

  return (
    <section className="space-y-1.5">
      <SectionLabel>Recording</SectionLabel>
      <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {!isPaused && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/70" />
            )}
            <span
              className={cn(
                "relative inline-flex h-2.5 w-2.5 rounded-full",
                isPaused ? "bg-amber-500" : "bg-red-500",
              )}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">
              {contextLabel ?? "Recording"}
              {isPaused && (
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                  (paused)
                </span>
              )}
            </p>
          </div>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {formatElapsed(durationSec)}
          </span>
          {canStop && (
            <button
              type="button"
              onClick={() => recording?.stop()}
              title="Stop recording"
              aria-label="Stop recording"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-600 transition-colors hover:bg-red-500/20 dark:text-red-400 [&_svg]:h-3.5 [&_svg]:w-3.5"
            >
              <StopCircle />
            </button>
          )}
        </div>
        {/* Mic-active visual feedback — live input level. */}
        {!isPaused && (
          <div className="mt-2">
            <AudioLevelIndicator
              level={audioLevel}
              barCount={9}
              color="blue"
              className="w-full"
            />
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Shared primitives ─────────────────────────────────────────────────────────

/**
 * Speaker-active feedback — an animated equalizer shown only while audio is
 * actually playing OUT. Honest indicator (tied to real status); true output
 * amplitude lands in a later wave for engines whose graph we control.
 */
function SpeakerActivity({ active }: { active: boolean }) {
  if (!active) {
    return <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  }
  return (
    <span
      className="inline-flex h-3.5 shrink-0 items-end gap-[2px]"
      aria-label="Playing"
    >
      <style>{EQ_KEYFRAMES}</style>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-green-500 dark:bg-green-400"
          style={{
            height: "100%",
            transformOrigin: "bottom",
            animation: `mtxEq 0.9s ease-in-out ${i * 0.12}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

const EQ_KEYFRAMES =
  "@keyframes mtxEq{0%,100%{transform:scaleY(0.3)}50%{transform:scaleY(1)}}";

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function StatusChip({ status }: { status: AudioSessionStatus }) {
  const map: Record<
    AudioSessionStatus,
    { label: string; className: string; spin?: boolean }
  > = {
    queued: {
      label: "Queued",
      className: "border-border bg-muted text-muted-foreground",
    },
    loading: {
      label: "Loading",
      className:
        "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      spin: true,
    },
    active: {
      label: "Playing",
      className:
        "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
    },
    paused: {
      label: "Paused",
      className:
        "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    done: {
      label: "Done",
      className: "border-border bg-muted text-muted-foreground",
    },
    error: {
      label: "Error",
      className: "border-destructive/30 bg-destructive/10 text-destructive",
    },
  };
  const chip = map[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
        chip.className,
      )}
    >
      {chip.spin && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
      {chip.label}
    </span>
  );
}

function TransportButton({
  onClick,
  disabled,
  title,
  label,
  icon,
  variant = "default",
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  label: string;
  icon: ReactNode;
  variant?: "default" | "destructive";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        "[&_svg]:h-3.5 [&_svg]:w-3.5",
        variant === "destructive"
          ? "border-border bg-background text-muted-foreground hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
          : "border-border bg-background text-foreground hover:bg-accent",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function RowIconButton({
  onClick,
  disabled,
  title,
  label,
  icon,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  label: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:h-3.5 [&_svg]:w-3.5"
    >
      {icon}
    </button>
  );
}

function NotRecordingHint() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground">
      <Mic className="h-4 w-4 shrink-0" />
      Not recording
    </div>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center [&_svg]:h-7 [&_svg]:w-7 [&_svg]:text-muted-foreground/60">
      {icon}
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

// ─── Utils ─────────────────────────────────────────────────────────────────────

function formatElapsed(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

function sessionTitle(session: AudioSession): string {
  if (session.label && session.label.trim()) return session.label;
  const text = (session.text ?? "").trim();
  if (!text) return "Untitled";
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}
