// features/rich-document/actions/handlers/listen.ts
//
// The "summarize for listening" family — formerly chat-only. Both open the
// floating Listen panel (the summary text + audio transport in one window).
// The live variant is stream-to-stream: the summary agent's tokens are spoken
// as they arrive, so audio starts before the text finishes.
//
// The writer is the platform's `spoken_summary` role on the listening home
// surface (mandate-backed, so it resolves for every user). It is resolved at
// CLICK time through the surface-config cache, so no surface pays for the
// lookup until someone listens — and a click that finds no bound agent says
// so instead of doing nothing.

import { AudioLines, Headphones, Loader2, Pause, Play, Settings2, Volume2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { primeAudioOutput } from "@/features/audio/unlock";
import { openListenSummaryWindowAction } from "@/features/overlays/openers/listenSummaryWindow";
import { LISTENING_HOME_SURFACE } from "@/features/audio/service/listeningConfig";
import {
  ensureSurfaceConfig,
  selectSurfaceConfigEntry,
} from "@/features/surfaces/redux/surfaceConfigSlice";
import { registerAction } from "../provider";
import { getErrorMessage, contentForDestination } from "../utils";
import type { RichDocumentActionContext } from "../../types";

/** The effective `spoken_summary` agent, or null when none is bound. */
async function resolveSpokenSummaryAgent(
  ctx: RichDocumentActionContext,
): Promise<{ agentId: string; label: string | null } | null> {
  await ctx.dispatch(ensureSurfaceConfig({ surfaceName: LISTENING_HOME_SURFACE }));
  const role = selectSurfaceConfigEntry(ctx.getState(), LISTENING_HOME_SURFACE)
    ?.resolved?.roles?.spoken_summary;
  const agentId = role?.effective?.[0]?.agentId ?? null;
  if (!agentId) return null;
  return { agentId, label: role?.role?.label ?? null };
}

async function openListen(
  ctx: RichDocumentActionContext,
  autoPlay: boolean,
): Promise<void> {
  const text = contentForDestination(ctx);
  if (!text.trim()) return;
  // This click is the ONLY user gesture before speech starts (the audio itself
  // begins from a websocket callback) — unlock iOS/WebKit output now, before
  // the first await leaves the gesture.
  primeAudioOutput();
  ctx.onClose();
  try {
    const agent = await resolveSpokenSummaryAgent(ctx);
    if (!agent) {
      toast.error("No listening summary agent is set up", {
        description:
          "Choose one for the spoken-summary role in your agent settings, then try again.",
      });
      return;
    }
    ctx.dispatch(
      openListenSummaryWindowAction({
        agentId: agent.agentId,
        agentName: agent.label,
        sourceText: text,
        style: "Extremely Concise Summary",
        autoPlay,
      }),
    );
  } catch (error) {
    toast.error(getErrorMessage(error, "Could not start the listening summary"));
  }
}

registerAction({
  id: "summarize-and-listen",
  label: "Summarize & listen",
  icon: AudioLines,
  iconColor: "text-violet-500 dark:text-violet-400",
  category: "listen",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 0,
  visible: (ctx) => ctx.content.trim().length > 0,
  run: (ctx) => openListen(ctx, true),
});

registerAction({
  id: "summarize-for-listening",
  label: "Summarize without playing",
  icon: Headphones,
  iconColor: "text-violet-500 dark:text-violet-400",
  category: "listen",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 1,
  visible: (ctx) => ctx.content.trim().length > 0,
  run: (ctx) => openListen(ctx, false),
});

// ── Read aloud — the speaker, as a registry toggle ──────────────────────────
// Plays the content (or the reader's selection inside this chat turn) through
// the ONE playback queue; while this content's utterance is the current item,
// the same button pauses and resumes it. State comes from the queue itself.

type SpeechStatus = "playing" | "paused" | "queued" | "starting" | null;

async function playbackModule() {
  return import("@/features/audio/playback/playbackQueue");
}

// Filled when a renderer first subscribes (the bar mounting) — the queue
// module is never loaded by a page that shows no read-aloud button.
let playbackApi: Awaited<ReturnType<typeof playbackModule>> | null = null;
/** Queue items whose failure was already announced (one toast per failure). */
const announcedSpeechErrors = new Set<string>();
/**
 * The utterance each button last started, keyed by the button's content — so
 * a SELECTION read (whose text is not the whole reply) still drives this
 * button's spinner / Pause / Play and its error toast. Module scope, so a bar
 * that remounts re-finds audio still playing in the persistent queue.
 */
const itemForContent = new Map<string, string>();

function speechItem(ctx: RichDocumentActionContext) {
  if (!playbackApi) return null;
  const snap = playbackApi.getPlaybackSnapshot();
  const text = contentForDestination(ctx);
  const ownId = itemForContent.get(text);
  const own = ownId ? snap.items.find((i) => i.id === ownId) : undefined;
  if (own) return own;
  // Audio of this same content started elsewhere (the right-click menu).
  return (
    snap.items.find((i) => i.id === snap.currentId && i.text === text) ?? null
  );
}

function speechStatus(ctx: RichDocumentActionContext): SpeechStatus {
  const item = speechItem(ctx);
  if (!item) return null;
  if (item.status === "playing") return "playing";
  if (item.status === "paused") return "paused";
  if (item.status === "queued") return "queued";
  if (item.status === "loading") return "starting";
  return null;
}

/** A selection inside THIS chat turn reads just the selection. */
function selectedText(ctx: RichDocumentActionContext): string | null {
  if (typeof window === "undefined" || ctx.extensions?.type !== "chat-message") {
    return null;
  }
  const sel = window.getSelection();
  const text = sel && !sel.isCollapsed ? sel.toString().trim() : "";
  if (!text) return null;
  const node = sel?.anchorNode ?? null;
  const el = node instanceof Element ? node : (node?.parentElement ?? null);
  const mid = el?.closest?.("[data-message-id]")?.getAttribute("data-message-id");
  return mid && ctx.extensions.groupMessageIds.includes(mid) ? text : null;
}

registerAction({
  id: "tts-play",
  label: (ctx) => {
    const status = speechStatus(ctx);
    return status === "playing"
      ? "Pause reading"
      : status === "paused"
        ? "Resume reading"
        : status === "queued"
          ? "Waiting for other audio — click to cancel"
          : status === "starting"
            ? "Starting… click to cancel"
            : "Read aloud (reads your selection when text is selected)";
  },
  icon: Volume2,
  iconColor: "text-primary",
  category: "listen",
  supportedSources: "*",
  renderSlot: "primary",
  order: -1,
  preserveSelection: true,
  visible: (ctx) => ctx.content.trim().length > 0,
  stateIcon: (ctx) => {
    const status = speechStatus(ctx);
    if (status === "playing") return { icon: Pause };
    if (status === "paused") return { icon: Play };
    if (status === "queued" || status === "starting") {
      return { icon: Loader2, spin: true };
    }
    return null;
  },
  active: (ctx) => {
    const status = speechStatus(ctx);
    return status === "playing" || status === "paused";
  },
  subscribe: (onChange, ctx) => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void playbackModule().then((m) => {
      playbackApi = m;
      if (cancelled) return;
      unsubscribe = m.subscribePlayback((snap) => {
        // A failed utterance of THIS content is said, once, with its reason
        // (no organization selected, no voice access…) — never a button that
        // silently does nothing.
        for (const item of snap.items) {
          if (
            item.status === "error" &&
            (item.id === itemForContent.get(contentForDestination(ctx)) ||
              item.text === contentForDestination(ctx)) &&
            !announcedSpeechErrors.has(item.id)
          ) {
            announcedSpeechErrors.add(item.id);
            toast.error("Could not read this aloud", {
              description: item.error ?? "The audio could not start.",
            });
          }
        }
        onChange();
      });
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  },
  run: async (ctx) => {
    // The click is the gesture iOS needs — unlock output before any await.
    primeAudioOutput();
    const api = await playbackModule();
    playbackApi = api;
    const status = speechStatus(ctx);
    if (status === "playing") return api.pausePlayback();
    if (status === "paused") return api.resumePlayback();
    if (status === "queued" || status === "starting") {
      const item = speechItem(ctx);
      if (item) return api.removePlaybackItem(item.id);
      return;
    }
    const { speak } = await import("@/features/audio/service/speak");
    // A selection plays as its own utterance; either way this button owns it.
    const { id } = speak({
      text: selectedText(ctx) ?? contentForDestination(ctx),
      label: "Read aloud",
    });
    itemForContent.set(contentForDestination(ctx), id);
  },
});

// ── Voice settings — the door to the voice this button speaks in ─────────────
// Read-aloud has one icon on the bar, so its settings door lives here in the
// overflow/Listen menu, never as a second icon. It opens the Voices screen at
// the exact row that governs read-aloud.

registerAction({
  id: "tts-voice-settings",
  label: "Read-aloud voice settings",
  icon: Settings2,
  category: "listen",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 2,
  visible: (ctx) => ctx.content.trim().length > 0,
  run: async (ctx) => {
    ctx.onClose();
    const [{ openOverlay }, { VOICE_SETTING_DOORS }] = await Promise.all([
      import("@/lib/redux/slices/overlaySlice"),
      import("@/features/settings/tabs/voices/voiceSettingDoors"),
    ]);
    const door = VOICE_SETTING_DOORS.readAloud;
    ctx.dispatch(
      openOverlay({
        overlayId: "userPreferencesWindow",
        data: { initialTabId: door.tabId, initialControlId: door.controlId },
      }),
    );
  },
});
