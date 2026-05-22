"use client";

/**
 * TtsTesterBench — admin side-by-side Cartesia TTS comparison.
 *
 * Drives two independent {@link TtsTesterPanel}s off one shared transcript so
 * model / voice / speed / client-playback-buffer / server-buffering can be
 * A/B-tested by ear and by the time-to-first-audio + total-synth metrics. The
 * default A/B isolates the client playback buffer (1.0s vs 0.25s) on Sonic 3.5,
 * the leading suspect for the choppy pauses in the standard path.
 */

import { useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import {
  DEFAULT_VOICE_ID,
  STUDIO_VOICE_ID,
  type TtsTestConfig,
} from "./cartesiaTestEngine";
import { TtsTesterPanel } from "./TtsTesterPanel";

const PRESETS: ReadonlyArray<{ label: string; text: string }> = [
  {
    label: "Conversational",
    text: "Thanks for jumping on so quickly. I pulled the numbers this morning, and honestly, they look better than we expected — not perfect, but a real step in the right direction. Let's walk through it together, and if anything feels off, just stop me.",
  },
  {
    label: "Document (markdown)",
    text: "# Quarterly Summary\n\nRevenue is **up 12%** quarter over quarter. Key drivers:\n\n- Stronger retention in the *enterprise* tier\n- A faster onboarding flow\n- Fewer support escalations\n\n> Note: these figures are preliminary.\n\n```js\nconst growth = 0.12;\n```\n\nSee the [full report](https://example.com) for details.",
  },
  {
    label: "Alphanumerics",
    text: "Your confirmation code is A4X7Q2. The order number is 100245788, and we sent the receipt to jordan.smith@example.com. If you need help, call 1-800-555-0147 and reference ticket ID 9F3K.",
  },
  {
    label: "Pauses & punctuation",
    text: "Wait — did you hear that? It sounded like... something. Maybe it was nothing. Or maybe, just maybe, it was exactly what we were waiting for. Either way: stay calm, breathe, and keep moving.",
  },
];

const baseConfig: TtsTestConfig = {
  modelId: "sonic-3.5",
  voiceId: STUDIO_VOICE_ID,
  language: "en",
  speed: "normal",
  playbackBufferSec: 1.0,
  maxBufferDelayMs: 0,
  emotions: [],
};

export function TtsTesterBench() {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const [text, setText] = useState(PRESETS[0]!.text);

  if (!isSuperAdmin) {
    return (
      <div className="flex h-dvh items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">
          The Voice Tester is restricted to administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh max-w-5xl flex-col overflow-hidden bg-textured">
      <header className="shrink-0 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <h1 className="text-base font-semibold text-foreground">Voice Tester</h1>
        <p className="text-xs text-muted-foreground">
          Side-by-side Cartesia comparison. The default A/B isolates the client
          playback buffer (1.0s vs 0.25s) on Sonic 3.5 — flip it to hear the
          choppy "pauses" effect. Then vary model, voice, and server buffering.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Shared transcript */}
        <div className="mb-4">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Presets:
            </span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setText(p.text)}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground active:bg-accent"
              >
                {p.label}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Text to synthesize on both sides…"
            className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>

        {/* A/B panels */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TtsTesterPanel
            title="A"
            text={text}
            accent="border-primary/40"
            initialConfig={{ ...baseConfig, playbackBufferSec: 1.0 }}
          />
          <TtsTesterPanel
            title="B"
            text={text}
            initialConfig={{
              ...baseConfig,
              voiceId: DEFAULT_VOICE_ID,
              playbackBufferSec: 0.25,
            }}
          />
        </div>

        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">How to read this</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              <strong>Playback buffer (client)</strong> = how much audio the
              browser buffers before playing. Too low → underruns → stutter that
              sounds like bad pauses. Suspected cause of the standard path's 0.25s.
            </li>
            <li>
              <strong>Server buffering</strong> = Cartesia's <code>max_buffer_delay_ms</code>.
              0 = synth immediately (good for full text you already have). &gt;0 =
              managed buffering for token-by-token LLM streaming.
            </li>
            <li>
              <strong>First audio</strong> = latency to the first chunk;{" "}
              <strong>Total synth</strong> = time to the last chunk.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
