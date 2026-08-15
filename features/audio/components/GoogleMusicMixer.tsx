"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CirclePause,
  CirclePlay,
  Plus,
  RotateCcw,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { beginPlaybackSession } from "@/features/audio/session/audioSessionRegistry";
import type { PlaybackSessionHandle } from "@/features/audio/session/types";
import { createStreamingPcmPlayer } from "@/features/audio/streamingPcmPlayer";
import {
  createGoogleRealtimeClient,
  type GoogleRealtimeConnectionState,
} from "@/features/voice-agent/transport/googleRealtimeClient";

interface PromptChannel {
  id: string;
  text: string;
  weight: number;
}

function walkRecords(
  value: unknown,
  visitor: (record: Record<string, unknown>) => void,
): void {
  if (Array.isArray(value)) {
    for (const child of value) walkRecords(child, visitor);
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    visitor(record);
    for (const child of Object.values(record)) walkRecords(child, visitor);
  }
}

export function GoogleMusicMixer() {
  const [channels, setChannels] = useState<PromptChannel[]>([
    { id: crypto.randomUUID(), text: "warm analog synthwave", weight: 1 },
    { id: crypto.randomUUID(), text: "driving acoustic drums", weight: 0.65 },
  ]);
  const [connection, setConnection] =
    useState<GoogleRealtimeConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ReturnType<
    typeof createGoogleRealtimeClient
  > | null>(null);
  const [player, setPlayer] = useState(() =>
    createStreamingPcmPlayer({ sampleRate: 48_000, channels: 2 }),
  );
  const sessionRef = useRef<PlaybackSessionHandle | null>(null);
  const active = client != null;
  const validPrompts = useMemo(
    () =>
      channels
        .filter((channel) => channel.text.trim() && channel.weight !== 0)
        .map((channel) => ({
          text: channel.text.trim(),
          weight: channel.weight,
        })),
    [channels],
  );

  const sendPrompts = useCallback(
    (target = client) => {
      if (!target || validPrompts.length === 0) return;
      target.send({ type: "weighted_prompts", prompts: validPrompts });
    },
    [client, validPrompts],
  );

  useEffect(() => {
    if (!client) return;
    const timer = setTimeout(() => sendPrompts(client), 120);
    return () => clearTimeout(timer);
  }, [client, sendPrompts]);

  useEffect(() => () => player.destroy(), [player]);
  useEffect(() => () => client?.close(), [client]);
  useEffect(
    () => () => {
      sessionRef.current?.end();
      sessionRef.current = null;
    },
    [],
  );

  const start = useCallback(() => {
    if (validPrompts.length === 0) {
      setError("Add at least one prompt with a non-zero weight.");
      return;
    }
    setError(null);
    const next = createGoogleRealtimeClient("music", {
      model: "lyria-realtime-exp",
    });
    const session = beginPlaybackSession({
      source: "music-realtime",
      label: "Lyria realtime music",
      controls: {
        stop: () => {
          next.send({ type: "control", action: "stop" });
          next.close();
          player.pause();
          player.destroy();
          setPlayer(
            createStreamingPcmPlayer({ sampleRate: 48_000, channels: 2 }),
          );
          setClient((current) => (current === next ? null : current));
          setConnection("idle");
          sessionRef.current?.end();
          sessionRef.current = null;
        },
        pause: () => {
          next.send({ type: "control", action: "pause" });
          player.pause();
          sessionRef.current?.update({ status: "paused" });
        },
        resume: () => {
          next.send({ type: "control", action: "play" });
          player.play();
          sessionRef.current?.update({ status: "active" });
        },
      },
    });
    sessionRef.current = session;
    session.update({ status: "active" });
    player.play();
    next.onState((state, detail) => {
      setConnection(state);
      if (state === "ready") {
        next.send({ type: "weighted_prompts", prompts: validPrompts });
        next.send({ type: "control", action: "play" });
      }
      if (state === "error") setError(detail ?? "Music session failed.");
    });
    next.onEvent((wire) => {
      if (wire.type !== "provider_event") return;
      walkRecords(wire.event, (record) => {
        if (typeof record.data !== "string" || record.data.length < 16) return;
        const mime = record.mime_type ?? record.mimeType;
        if (
          mime == null ||
          (typeof mime === "string" && mime.startsWith("audio/"))
        ) {
          player.enqueueBase64(record.data);
        }
      });
    });
    setClient(next);
    void next.connect().catch((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      session.end("error", message);
      if (sessionRef.current === session) sessionRef.current = null;
      setError(message);
      setConnection("error");
    });
  }, [player, validPrompts]);

  const stop = useCallback(() => {
    client?.send({ type: "control", action: "stop" });
    client?.close();
    player.pause();
    player.destroy();
    setPlayer(createStreamingPcmPlayer({ sampleRate: 48_000, channels: 2 }));
    setClient(null);
    setConnection("idle");
    sessionRef.current?.end();
    sessionRef.current = null;
  }, [client, player]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3 pr-14">
        <Link
          href="/chat/voice/playground"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voice playground
        </Link>
        <div className="text-center">
          <h1 className="text-sm font-semibold">Lyria realtime mixer</h1>
          <p className="text-[11px] text-muted-foreground">
            48 kHz stereo PCM · live weighted prompts
          </p>
        </div>
        <span className="rounded-full border px-2 py-1 text-[11px] capitalize text-muted-foreground">
          {connection}
        </span>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Prompt channels</h2>
              <p className="text-xs text-muted-foreground">
                Move a fader or edit its prompt while playing; changes are sent
                to the same persistent synthesizer session.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setChannels((current) => [
                  ...current,
                  { id: crypto.randomUUID(), text: "", weight: 0.5 },
                ])
              }
            >
              <Plus /> Add channel
            </Button>
          </div>

          <div className="space-y-3">
            {channels.map((channel, index) => (
              <div
                key={channel.id}
                className="grid gap-3 rounded-xl border border-border/50 bg-background/70 p-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_3rem] sm:items-center"
              >
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Channel {index + 1}
                  </span>
                  <input
                    value={channel.text}
                    onChange={(event) =>
                      setChannels((current) =>
                        current.map((item) =>
                          item.id === channel.id
                            ? { ...item, text: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="Describe an instrument, texture, or direction"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </label>
                <label className="space-y-2">
                  <span className="flex justify-between text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Weight{" "}
                    <b className="text-foreground">
                      {channel.weight.toFixed(2)}
                    </b>
                  </span>
                  <Slider
                    min={-1}
                    max={1}
                    step={0.05}
                    value={[channel.weight]}
                    onValueChange={([weight]) =>
                      setChannels((current) =>
                        current.map((item) =>
                          item.id === channel.id ? { ...item, weight } : item,
                        ),
                      )
                    }
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={channels.length === 1}
                  aria-label={`Remove channel ${index + 1}`}
                  onClick={() =>
                    setChannels((current) =>
                      current.filter((item) => item.id !== channel.id),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-border/60 bg-card p-5">
          {!active ? (
            <Button type="button" onClick={start}>
              <CirclePlay /> Start generating
            </Button>
          ) : (
            <>
              <Button
                type="button"
                onClick={() => {
                  client.send({ type: "control", action: "play" });
                  player.play();
                  sessionRef.current?.update({ status: "active" });
                }}
              >
                <CirclePlay /> Play
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  client.send({ type: "control", action: "pause" });
                  player.pause();
                  sessionRef.current?.update({ status: "paused" });
                }}
              >
                <CirclePause /> Pause
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  client.send({ type: "control", action: "reset_context" });
                  sendPrompts();
                }}
              >
                <RotateCcw /> Reset context
              </Button>
              <Button type="button" variant="destructive" onClick={stop}>
                <Square /> End session
              </Button>
            </>
          )}
        </section>

        {error ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </main>
    </div>
  );
}
