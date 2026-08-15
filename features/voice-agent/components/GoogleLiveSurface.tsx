"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Music2 } from "lucide-react";
import { VoiceControlCluster } from "./VoiceControlCluster";
import { VoiceErrorBanner } from "./VoiceErrorBanner";
import { VoiceOrb } from "./VoiceOrb";
import { VoiceStatusPill } from "./VoiceStatusPill";
import { useGoogleLiveSession } from "../hooks/useGoogleLiveSession";

const LIVE_MODELS = [
  ["gemini-3.1-flash-live-preview", "Gemini 3.1 Flash Live"],
  ["gemini-3.5-live-translate-preview", "Gemini 3.5 Live Translate"],
  ["gemini-2.5-flash-native-audio-preview-12-2025", "Gemini 2.5 Native Audio"],
  ["gemini-robotics-er-2-streaming-preview", "Gemini Robotics Streaming"],
] as const;

export function GoogleLiveSurface() {
  const [model, setModel] = useState<string>(LIVE_MODELS[0][0]);
  const [thinkingLevel, setThinkingLevel] = useState<
    "minimal" | "low" | "medium" | "high"
  >("minimal");
  const [turnCoverage, setTurnCoverage] = useState<
    "TURN_INCLUDES_ONLY_ACTIVITY" | "TURN_INCLUDES_ALL_INPUT"
  >("TURN_INCLUDES_ONLY_ACTIVITY");
  const [responseMode, setResponseMode] = useState<"AUDIO" | "TEXT">("AUDIO");
  const session = useGoogleLiveSession({
    model,
    thinkingLevel,
    turnCoverage,
    responseModalities:
      model === "gemini-robotics-er-2-streaming-preview"
        ? ["TEXT"]
        : [responseMode],
  });
  const active = session.status !== "idle" && session.status !== "error";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-3 pr-14">
        <Link
          href="/chat/voice/playground"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voice playground
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <select
            aria-label="Google Live model"
            value={model}
            disabled={active}
            onChange={(event) => setModel(event.target.value)}
            className="h-8 max-w-64 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-60"
          >
            {LIVE_MODELS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Thinking level"
            value={thinkingLevel}
            disabled={active}
            onChange={(event) =>
              setThinkingLevel(
                event.target.value as "minimal" | "low" | "medium" | "high",
              )
            }
            className="h-8 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-60"
          >
            <option value="minimal">Minimal thinking</option>
            <option value="low">Low thinking</option>
            <option value="medium">Medium thinking</option>
            <option value="high">High thinking</option>
          </select>
          <select
            aria-label="Turn coverage"
            value={turnCoverage}
            disabled={active}
            onChange={(event) =>
              setTurnCoverage(
                event.target.value as
                  "TURN_INCLUDES_ONLY_ACTIVITY" | "TURN_INCLUDES_ALL_INPUT",
              )
            }
            className="hidden h-8 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-60 sm:block"
          >
            <option value="TURN_INCLUDES_ONLY_ACTIVITY">Activity only</option>
            <option value="TURN_INCLUDES_ALL_INPUT">All input</option>
          </select>
          <select
            aria-label="Response modality"
            value={
              model === "gemini-robotics-er-2-streaming-preview"
                ? "TEXT"
                : responseMode
            }
            disabled={
              active || model === "gemini-robotics-er-2-streaming-preview"
            }
            onChange={(event) =>
              setResponseMode(event.target.value as "AUDIO" | "TEXT")
            }
            className="hidden h-8 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-60 md:block"
          >
            <option value="AUDIO">Audio response</option>
            <option value="TEXT">Text response</option>
          </select>
        </div>
        <Link
          href="/chat/voice/music"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Music2 className="h-4 w-4" />
          Music
        </Link>
      </header>

      <main className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <section className="relative flex min-h-[28rem] items-center justify-center overflow-hidden border-b border-border/40 lg:border-b-0 lg:border-r">
          <div className="flex flex-col items-center gap-5">
            <VoiceStatusPill
              status={session.status}
              micMuted={session.micMuted}
            />
            <div className="relative size-[260px]">
              <VoiceOrb status={session.status} />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <VoiceControlCluster
                  status={session.status}
                  micMuted={session.micMuted}
                  onToggleSession={session.toggle}
                  onToggleMute={session.toggleMute}
                />
              </div>
            </div>
            <p className="max-w-md px-6 text-center text-sm text-muted-foreground">
              Speak naturally. Audio is streamed at Google Live&apos;s native 16
              kHz input rate; responses play as 24 kHz PCM. Interrupted
              connections resume with the provider&apos;s session handle.
            </p>
            <div className="w-full max-w-md px-4">
              <VoiceErrorBanner
                error={
                  session.error
                    ? { code: "google-live", message: session.error }
                    : null
                }
              />
            </div>
          </div>
        </section>

        <aside
          className="min-h-0 overflow-y-auto p-4"
          aria-label="Live transcript"
        >
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Live transcript
          </h2>
          {session.turns.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Transcript updates will appear here while you speak and while
              Gemini responds.
            </p>
          ) : (
            <div className="space-y-3">
              {session.turns.map((turn) => (
                <article
                  key={turn.id}
                  className="rounded-lg border border-border/60 bg-card p-3"
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {turn.role === "user" ? "You" : "Gemini"}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {turn.text}
                  </p>
                </article>
              ))}
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
