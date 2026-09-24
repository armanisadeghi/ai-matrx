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

import { AudioLines, Headphones } from "lucide-react";
import { toast } from "@/lib/toast";
import { primeAudioOutput } from "@/features/audio/unlock";
import { openListenSummaryWindowAction } from "@/features/overlays/openers/listenSummaryWindow";
import { LISTENING_HOME_SURFACE } from "@/features/audio/service/listeningConfig";
import {
  ensureSurfaceConfig,
  selectSurfaceConfigEntry,
} from "@/features/surfaces/redux/surfaceConfigSlice";
import { registerAction } from "../registry";
import { getErrorMessage } from "../utils";
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
  const text = ctx.content;
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
