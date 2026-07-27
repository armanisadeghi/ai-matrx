'use client';

import { SpeakerButton } from '@/features/tts/components/SpeakerButton';
import { SpeakerGroup } from '@/features/tts/components/SpeakerGroup';
import { SpeakerCompactGroup } from '@/features/tts/components/SpeakerCompactGroup';
import { StreamingSpeakerButton } from '@/features/tts/components/StreamingSpeakerButton';
import { FilterSearchGroup } from '@/components/icons/search-toolbar-presets';

const SHORT = 'Hello! This is a quick test of the text to speech system.';

const MARKDOWN =
  '## Key Points\n\n- React 19 introduces **Server Components** as a first-class pattern\n- The `use` hook simplifies async data fetching\n\n> This quote should be read naturally.';

const LONG =
  'Artificial intelligence has transformed the way we interact with technology. From voice assistants that understand natural language to recommendation systems that predict our preferences, AI is woven into the fabric of modern life.';

/** Multi-paragraph markdown — the case where streaming matters most. */
const VERY_LONG = `## Why streaming TTS matters

When a chat assistant produces a long response, users expect playback to start immediately, not after the entire text has been synthesized. A non-streaming text-to-speech flow sends the full transcript in one request and waits for the provider to generate all the audio before the first byte is returned. For short replies this is imperceptible, but the latency grows with input length — two or three seconds for a few paragraphs, noticeably worse for a full article.

A proper streaming flow splits the input into small sentence-scale chunks and sends them progressively on the same context. The provider begins generating audio from the first chunk while the client is still sending the remaining ones. Audio starts playing within a few hundred milliseconds regardless of total length, and the network round-trip for the trailing chunks overlaps with playback instead of blocking it.

The user experience difference is dramatic. Instead of clicking play and staring at a spinner, the voice begins almost instantly and the rest of the message continues smoothly. There is no perceptible boundary between chunks because the audio stream is a single continuous source on the player — the chunked sends are invisible to the listener.

Technically, the pattern relies on three things: a stable context identifier that threads the sends together, a continue flag that keeps the context open for more input, and a client player that can consume a progressively-filled audio source without stalling when it catches up to the write head. Cartesia's WebSocket API provides all three directly.

This demo compares the two approaches back-to-back. Click the first button to hear the classic single-send flow — notice the pause before playback begins. Then click the streaming button and compare.`;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center">
      <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
      {children}
    </div>
  );
}

/** Side-by-side row: same text, both variants. Compare time-to-first-audio. */
function CompareRow({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 py-1">
      <span className="text-xs text-muted-foreground w-24 shrink-0 pt-1">{label}</span>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <SpeakerButton text={text} />
          <span className="text-[10px] text-muted-foreground">classic</span>
        </div>
        <div className="flex items-center gap-1.5">
          <StreamingSpeakerButton text={text} />
          <span className="text-[10px] text-muted-foreground">streaming</span>
        </div>
      </div>
    </div>
  );
}

export default function SpeakerDemoPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">
        <div>
          <h1 className="text-xl font-bold">Cartesia TTS — Tap Target Buttons</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Same glass system as FilterSearchGroup. Nothing loads until first click.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Reference: FilterSearchGroup</h2>
          <FilterSearchGroup />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">0. Streaming vs classic (side-by-side)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click the classic button (left) and the streaming button (right) on
              the long markdown row. Time-to-first-audio should be obviously
              shorter on streaming — and it stays short regardless of input length.
              Nothing loads for either button until the first click.
            </p>
          </div>
          <div className="space-y-1">
            <CompareRow label="Short" text={SHORT} />
            <CompareRow label="Markdown" text={MARKDOWN} />
            <CompareRow label="Long" text={LONG} />
            <CompareRow label="Very long" text={VERY_LONG} />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">1. SpeakerButton (single toggle)</h2>
          <div className="space-y-2">
            <Row label="Short"><SpeakerButton text={SHORT} /></Row>
            <Row label="Markdown"><SpeakerButton text={MARKDOWN} /></Row>
            <Row label="Long"><SpeakerButton text={LONG} /></Row>
            <Row label="Disabled"><SpeakerButton text={SHORT} disabled /></Row>
            <Row label="Empty"><SpeakerButton text="" /></Row>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">2. SpeakerGroup (play / pause / stop)</h2>
          <div className="space-y-2">
            <Row label="Short"><SpeakerGroup text={SHORT} /></Row>
            <Row label="Markdown"><SpeakerGroup text={MARKDOWN} /></Row>
            <Row label="Long"><SpeakerGroup text={LONG} /></Row>
            <Row label="Disabled"><SpeakerGroup text={SHORT} disabled /></Row>
            <Row label="Empty"><SpeakerGroup text="" /></Row>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">3. SpeakerCompactGroup (toggle + stop)</h2>
          <div className="space-y-2">
            <Row label="Short"><SpeakerCompactGroup text={SHORT} /></Row>
            <Row label="Markdown"><SpeakerCompactGroup text={MARKDOWN} /></Row>
            <Row label="Long"><SpeakerCompactGroup text={LONG} /></Row>
            <Row label="Disabled"><SpeakerCompactGroup text={SHORT} disabled /></Row>
            <Row label="Empty"><SpeakerCompactGroup text="" /></Row>
          </div>
        </section>
      </div>
    </div>
  );
}
