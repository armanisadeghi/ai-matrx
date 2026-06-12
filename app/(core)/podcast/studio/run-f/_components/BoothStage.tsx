"use client";

// app/(core)/podcast/studio/run-f/_components/BoothStage.tsx
//
// The focal "stage" of the production booth — a large glass panel that shows
// whatever the run is doing *right now*. The visual reskins per active act:
//   source  → a scanning document synopsis
//   script  → a live script ticker (real script peek, revealed line by line)
//   art     → a soft generative shimmer behind the cover concept
//   voice   → an animated waveform
//   publish → a calm "almost there" pulse
// Always reflects honest state — never a generic spinner.

import { cn } from "@/lib/utils";
import { ACTS, ACCENT, type ActId, type AccentKey } from "./acts";
import type { BoothState } from "./boothState";

export function BoothStage({ state }: { state: BoothState }) {
  const act = ACTS.find((a) => a.id === state.activeAct) ?? ACTS[0];
  const accent = ACCENT[act.accent];
  const Icon = act.icon;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-glass-edge bg-glass p-6 backdrop-blur-glass backdrop-saturate-glass shadow-glass-lg sm:p-8",
        accent.glow,
      )}
    >
      {/* Ambient accent wash */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl transition-colors duration-700",
          accent.bg,
        )}
      />

      <div className="relative">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-2xl",
              accent.bg,
            )}
          >
            <Icon className={cn("h-5.5 w-5.5", accent.text)} />
          </span>
          <div className="min-w-0">
            <p className={cn("text-xs font-semibold uppercase tracking-wide", accent.text)}>
              Now producing
            </p>
            <h2 className="truncate text-lg font-semibold text-foreground">
              {act.title}
            </h2>
          </div>
        </div>

        <p className="mt-3 max-w-xl text-sm text-muted-foreground">{act.blurb}</p>

        <div className="mt-6">
          <StageVisual act={act.id} accent={act.accent} state={state} />
        </div>
      </div>
    </div>
  );
}

function StageVisual({
  act,
  accent,
  state,
}: {
  act: ActId;
  accent: AccentKey;
  state: BoothState;
}) {
  const a = ACCENT[accent];

  if (act === "voice" || act === "publish") {
    return <Waveform accent={accent} settled={act === "publish"} />;
  }

  if (act === "script") {
    return (
      <ScriptTicker
        text={state.scriptPreview || "ALEX: …\nJORDAN: …"}
        barClass={a.bar}
      />
    );
  }

  if (act === "art") {
    return <ArtShimmer accent={accent} title={state.title} />;
  }

  // source
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("h-1.5 w-1.5 animate-pulse rounded-full", a.bar)} />
        <span className="text-xs font-medium text-muted-foreground">
          Reading source
        </span>
      </div>
      {state.sourcePreview ? (
        <p className="line-clamp-3 text-sm leading-relaxed text-foreground/80">
          {state.sourcePreview}
        </p>
      ) : (
        <div className="space-y-2">
          {[100, 92, 78].map((w) => (
            <span
              key={w}
              className="block h-3 animate-pulse rounded bg-muted"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// A 28-bar audio waveform that breathes while recording and stills when done.
function Waveform({
  accent,
  settled,
}: {
  accent: AccentKey;
  settled: boolean;
}) {
  const a = ACCENT[accent];
  const bars = Array.from({ length: 28 });
  return (
    <div className="flex h-24 items-center justify-center gap-[3px] rounded-2xl border border-border bg-card/60 px-4">
      {bars.map((_, i) => {
        const base = 20 + ((i * 37) % 60);
        return (
          <span
            key={i}
            className={cn("w-[5px] rounded-full", a.bar, !settled && "animate-pulse")}
            style={{
              height: settled ? "30%" : `${base}%`,
              animationDelay: `${(i % 7) * 90}ms`,
              animationDuration: "900ms",
              opacity: settled ? 0.5 : 0.85,
            }}
          />
        );
      })}
    </div>
  );
}

// Reveals the real script peek line by line behind a soft cursor.
function ScriptTicker({ text, barClass }: { text: string; barClass: string }) {
  const lines = text.split("\n").filter(Boolean).slice(0, 4);
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4 font-mono text-[13px] leading-relaxed">
      {lines.map((line, i) => {
        const [speaker, ...rest] = line.split(":");
        const body = rest.join(":").trim();
        return (
          <p key={i} className="mb-1.5 last:mb-0">
            <span className="font-semibold text-foreground">{speaker}:</span>{" "}
            <span className="text-muted-foreground">{body}</span>
          </p>
        );
      })}
      <span
        className={cn("ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm align-middle", barClass)}
      />
    </div>
  );
}

// A drifting gradient shimmer evoking image generation, with the title fading in.
function ArtShimmer({
  accent,
  title,
}: {
  accent: AccentKey;
  title: string;
}) {
  const a = ACCENT[accent];
  return (
    <div className="relative flex h-24 items-center overflow-hidden rounded-2xl border border-border bg-card/60 px-5">
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 animate-pulse opacity-40 [background:radial-gradient(120px_circle_at_var(--x,30%)_50%,currentColor,transparent)]",
          a.text,
        )}
      />
      <p className="relative text-sm font-medium text-foreground transition-opacity duration-700">
        {title ? title : "Sketching the cover concept…"}
      </p>
    </div>
  );
}
