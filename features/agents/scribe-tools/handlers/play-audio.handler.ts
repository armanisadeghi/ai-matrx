/**
 * scribe_play_audio handler — cue + play a slice of the bound session's audio.
 *
 * Reuses the EXACT mechanism the inline `<audiocite>` chip uses: it publishes a
 * seek request on `scribeAudioBus`; the session player (mounted once at
 * ScribeScreen) seeks to the moment and auto-pauses at the end of the clip. No
 * custom audio code — the agent just gets to trigger the same seek+play a user
 * tap would, on its own initiative.
 *
 * The session is resolved from the issuing conversation (a studio session whose
 * assistant conversation — active pointer or roster entry — is this one), so the
 * model only supplies timestamps, never a session id.
 */

import { requestScribeAudioSeek } from "@/features/transcript-studio/state/scribeAudioBus";
import type { RootState } from "@/lib/redux/store";
import type { ScribeToolHandler, ScribeToolResultBase } from "./types";
import type { ScribePlayAudioArgs } from "../tools/schemas";

function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Find the studio session bound to this assistant conversation, if any. */
function resolveSessionIdForConversation(
  state: RootState,
  conversationId: string,
): string | undefined {
  const byId = state.transcriptStudio?.byId ?? {};
  for (const id of Object.keys(byId)) {
    const session = byId[id];
    if (!session) continue;
    if (session.assistantConversationId === conversationId) return session.id;
    if (
      (session.assistantConversations ?? []).some(
        (c) => c.conversationId === conversationId,
      )
    ) {
      return session.id;
    }
  }
  return undefined;
}

interface PlayAudioResult extends ScribeToolResultBase {
  start_seconds?: number;
  end_seconds?: number | null;
}

export const playAudioHandler: ScribeToolHandler<
  ScribePlayAudioArgs,
  PlayAudioResult
> = {
  name: "scribe_play_audio",
  async run(args, ctx) {
    const sessionId = resolveSessionIdForConversation(
      ctx.getState(),
      ctx.conversationId,
    );
    if (!sessionId) {
      return {
        ok: false,
        message:
          "No Scribe session is bound to this conversation, so there is no audio to play.",
      };
    }

    const start = Math.max(0, args.start_seconds);
    const end =
      args.end_seconds != null ? Math.max(start, args.end_seconds) : undefined;

    requestScribeAudioSeek({
      sessionId,
      sessionSeconds: start,
      endSeconds: end,
      autoplay: true,
    });

    return {
      ok: true,
      message:
        end != null
          ? `Playing the clip from ${formatClock(start)} to ${formatClock(end)}.`
          : `Playing from ${formatClock(start)}.`,
      start_seconds: start,
      end_seconds: end ?? null,
    };
  },
};
