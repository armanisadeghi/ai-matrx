"use client";

/**
 * MemoryAidBlock — THE renderer for the `memory_aid` kind. There is no other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (see `features/content-ir/FEATURE.md`).
 * A registered shape gets exactly ONE component: this one renders a memory-aid
 * set in the live run window, in chat, and on the education memory pages
 * (`MemoryDetail`, the shared `/education/media/[id]` viewer) — the same
 * pixels everywhere. Need one section on its own? Import `MnemonicsSection` /
 * `AnalogiesSection` / `MemoryPalaceSection`. **Do not build a second
 * memory-aid view** — the hand-rolled `MemoryAidView` this replaced is
 * deleted.
 *
 * Streaming-first by construction: the component mounts the instant the
 * discriminator parses and each mnemonic/analogy/locus appears as its object
 * closes, so an empty section is a normal mid-stream state, never a spinner
 * and never raw JSON.
 *
 * Consumes the bridge serverData from
 * `features/content-ir/kinds/memory-aid.ts`; also accepts a raw persisted
 * envelope (`study_media.ir_envelope`) — `readMemoryAidData` recognizes both.
 */

import { Brain, Landmark, Lightbulb, Loader2, MapPin } from "lucide-react";
import {
  coerceMemoryAidPartial,
  type MemoryAidData,
  type MnemonicTechnique,
  type HintTechnique,
  type Mnemonic,
  type Analogy,
  type MemoryPalace,
} from "@/features/content-ir/kinds/memory-aid";
import { cn } from "@/lib/utils";

/** One label map for every technique either memory shape can carry. */
export const TECHNIQUE_LABEL: Record<HintTechnique, string> = {
  acronym: "Acronym",
  acrostic: "Acrostic",
  rhyme: "Rhyme",
  sentence: "Sentence",
  keyword: "Keyword",
  chunking: "Chunking",
  analogy: "Analogy",
  association: "Association",
};

/**
 * Accepts either the streaming bridge output ({ aid, isComplete }) or a raw
 * persisted envelope value — persisted surfaces hand the block
 * `study_media.ir_envelope` directly.
 */
export function readMemoryAidData(serverData: unknown): MemoryAidData {
  if (
    typeof serverData === "object" &&
    serverData !== null &&
    "aid" in serverData
  ) {
    const data = serverData as { aid?: unknown; isComplete?: unknown };
    return {
      aid: coerceMemoryAidPartial(data.aid),
      isComplete: data.isComplete !== false,
    };
  }
  return { aid: coerceMemoryAidPartial(serverData), isComplete: true };
}

export interface MemoryAidBlockProps {
  serverData?: unknown;
  className?: string;
}

export default function MemoryAidBlock({
  serverData,
  className,
}: MemoryAidBlockProps) {
  const { aid, isComplete } = readMemoryAidData(serverData);
  const empty =
    aid.mnemonics.length === 0 &&
    aid.analogies.length === 0 &&
    !aid.memory_palace.applicable;

  if (empty && isComplete) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        This memory aid couldn&apos;t be displayed.
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      {aid.strategy_note && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {aid.strategy_note}
        </p>
      )}

      <MnemonicsSection mnemonics={aid.mnemonics} />
      <AnalogiesSection analogies={aid.analogies} />
      <MemoryPalaceSection palace={aid.memory_palace} />

      {!isComplete && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Writing your memory aids…
        </div>
      )}
    </div>
  );
}

// ── Exported section parts — compose these, never re-render a slice by hand ──

export function MnemonicsSection({ mnemonics }: { mnemonics: Mnemonic[] }) {
  if (mnemonics.length === 0) return null;
  return (
    <Section icon={Brain} title="Mnemonics" count={mnemonics.length}>
      <div className="space-y-2">
        {mnemonics.map((m, i) => (
          <div
            key={`mn-${i}`}
            className="rounded-xl border border-border bg-card p-3"
          >
            <div className="mb-1 flex items-center gap-2">
              <TechniquePill technique={m.technique} />
              {m.target && (
                <span className="truncate text-xs text-muted-foreground">
                  {m.target}
                </span>
              )}
            </div>
            <p className="text-base font-semibold text-foreground">
              {m.device}
            </p>
            {m.explanation && (
              <p className="mt-1 text-sm text-muted-foreground">
                {m.explanation}
              </p>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

export function AnalogiesSection({ analogies }: { analogies: Analogy[] }) {
  if (analogies.length === 0) return null;
  return (
    <Section
      icon={Lightbulb}
      title="Analogies & memory bridges"
      count={analogies.length}
    >
      <div className="space-y-2">
        {analogies.map((a, i) => (
          <div
            key={`an-${i}`}
            className="rounded-xl border border-border bg-card p-3"
          >
            {a.concept && (
              <p className="text-sm font-medium text-foreground">{a.concept}</p>
            )}
            <p className="mt-0.5 text-base text-foreground">
              <span className="text-muted-foreground">is like </span>
              {a.analogy}
            </p>
            {a.mapping && (
              <p className="mt-1 text-sm text-muted-foreground">{a.mapping}</p>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

export function MemoryPalaceSection({ palace }: { palace: MemoryPalace }) {
  if (!palace.applicable || palace.loci.length === 0) return null;
  return (
    <Section icon={Landmark} title="Memory palace">
      <div className="rounded-xl border border-border bg-card p-3">
        {palace.theme && (
          <p className="mb-2 text-sm text-muted-foreground">
            Journey:{" "}
            <span className="font-medium text-foreground">{palace.theme}</span>
          </p>
        )}
        <ol className="space-y-2">
          {palace.loci.map((l, i) => (
            <li key={`loc-${i}`} className="flex gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  <MapPin className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" />
                  {l.place}
                  {l.item && (
                    <span className="text-muted-foreground"> — {l.item}</span>
                  )}
                </p>
                {l.image && (
                  <p className="text-sm text-muted-foreground">{l.image}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

export function TechniquePill({
  technique,
}: {
  technique: MnemonicTechnique | HintTechnique;
}) {
  return (
    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
      {TECHNIQUE_LABEL[technique]}
    </span>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof Brain;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {typeof count === "number" && (
          <span className="text-xs text-muted-foreground">({count})</span>
        )}
      </div>
      {children}
    </section>
  );
}
