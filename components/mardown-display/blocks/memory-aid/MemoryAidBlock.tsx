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

import { Brain, Landmark, Lightbulb, Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
// Inside the chat engine's graph: the inline level directly, never the
// router (its standard/full edges would stack under MarkdownStream).
import { RichContentInline } from "@/components/rich-content/RichContentInline";

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
  controls?: MemoryAidControls;
}

export type MemoryItemKind = "mnemonic" | "analogy" | "locus";

/** Optional page controls; the registered kind keeps owning every read view. */
export interface MemoryAidControls {
  onAdd: (kind: MemoryItemKind) => void;
  onEdit: (kind: MemoryItemKind, index: number) => void;
  onDelete: (kind: MemoryItemKind, index: number) => void;
  editor?: { kind: MemoryItemKind; index: number; content: React.ReactNode };
}

export default function MemoryAidBlock({
  serverData,
  className,
  controls,
}: MemoryAidBlockProps) {
  const { aid, isComplete } = readMemoryAidData(serverData);
  const empty =
    aid.mnemonics.length === 0 &&
    aid.analogies.length === 0 &&
    !aid.memory_palace.applicable;

  if (empty && isComplete && !controls) {
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
          <RichContentInline source={aid.strategy_note} />
        </p>
      )}

      <MnemonicsSection mnemonics={aid.mnemonics} controls={controls} />
      <AnalogiesSection analogies={aid.analogies} controls={controls} />
      <MemoryPalaceSection palace={aid.memory_palace} controls={controls} />

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

export function MnemonicsSection({ mnemonics, controls }: { mnemonics: Mnemonic[]; controls?: MemoryAidControls }) {
  if (mnemonics.length === 0 && !controls) return null;
  return (
    <Section icon={Brain} title="Mnemonics" count={mnemonics.length} action={controls && <AddItem kind="mnemonic" label="Add mnemonic" controls={controls} />}>
      <div className="space-y-2">
        {mnemonics.map((m, i) => (
          <div
            key={`mn-${i}`}
            className="group rounded-xl border border-border bg-card p-3"
          >
            {controls?.editor?.kind === "mnemonic" && controls.editor.index === i ? controls.editor.content : <>
            <div className="mb-1 flex items-center gap-2">
              <TechniquePill technique={m.technique} />
              {m.target && (
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {m.target}
                </span>
              )}
              {controls && <ItemActions kind="mnemonic" index={i} controls={controls} />}
            </div>
            <p className="text-base font-semibold text-foreground">
              <RichContentInline source={m.device} />
            </p>
            {m.explanation && (
              <p className="mt-1 text-sm text-muted-foreground">
                <RichContentInline source={m.explanation} />
              </p>
            )}
            </>}
          </div>
        ))}
      </div>
    </Section>
  );
}

export function AnalogiesSection({ analogies, controls }: { analogies: Analogy[]; controls?: MemoryAidControls }) {
  if (analogies.length === 0 && !controls) return null;
  return (
    <Section
      icon={Lightbulb}
      title="Analogies & memory bridges"
      count={analogies.length}
      action={controls && <AddItem kind="analogy" label="Add analogy" controls={controls} />}
    >
      <div className="space-y-2">
        {analogies.map((a, i) => (
          <div
            key={`an-${i}`}
            className="group rounded-xl border border-border bg-card p-3"
          >
            {controls?.editor?.kind === "analogy" && controls.editor.index === i ? controls.editor.content : <>
            {controls && <div className="float-right ml-2"><ItemActions kind="analogy" index={i} controls={controls} /></div>}
            {a.concept && (
              <p className="text-sm font-medium text-foreground">
                <RichContentInline source={a.concept} />
              </p>
            )}
            <p className="mt-0.5 text-base text-foreground">
              <span className="text-muted-foreground">is like </span>
              <RichContentInline source={a.analogy} />
            </p>
            {a.mapping && (
              <p className="mt-1 text-sm text-muted-foreground">
                <RichContentInline source={a.mapping} />
              </p>
            )}
            </>}
          </div>
        ))}
      </div>
    </Section>
  );
}

export function MemoryPalaceSection({ palace, controls }: { palace: MemoryPalace; controls?: MemoryAidControls }) {
  if ((!palace.applicable || palace.loci.length === 0) && !controls) return null;
  return (
    <Section icon={Landmark} title="Memory palace" action={controls && <AddItem kind="locus" label="Add stop" controls={controls} />}>
      <div className="rounded-xl border border-border bg-card p-3">
        {palace.theme && (
          <p className="mb-2 text-sm text-muted-foreground">
            Journey:{" "}
            <span className="font-medium text-foreground">{palace.theme}</span>
          </p>
        )}
        <ol className="space-y-2">
          {palace.loci.map((l, i) => (
            <li key={`loc-${i}`} className="group flex gap-2.5 rounded-md py-1">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                {i + 1}
              </span>
              {controls?.editor?.kind === "locus" && controls.editor.index === i ? controls.editor.content : <>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  <MapPin className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" />
                  {l.place}
                  {l.item && (
                    <span className="text-muted-foreground"> — {l.item}</span>
                  )}
                </p>
                {l.image && (
                  <p className="text-sm text-muted-foreground">
                    <RichContentInline source={l.image} />
                  </p>
                )}
              </div>
              {controls && <ItemActions kind="locus" index={i} controls={controls} />}
              </>}
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
  action,
  children,
}: {
  icon: typeof Brain;
  title: string;
  count?: number;
  action?: React.ReactNode;
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
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function AddItem({ kind, label, controls }: { kind: MemoryItemKind; label: string; controls: MemoryAidControls }) {
  return <Button type="button" variant="ghost" size="sm" onClick={() => controls.onAdd(kind)}>
    <Plus className="mr-1 h-3.5 w-3.5" />{label}
  </Button>;
}

function ItemActions({ kind, index, controls }: { kind: MemoryItemKind; index: number; controls: MemoryAidControls }) {
  const noun = kind === "locus" ? "stop" : kind;
  return <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${noun} ${index + 1}`} title={`Edit ${noun}`} onClick={() => controls.onEdit(kind, index)}>
      <Pencil className="h-3.5 w-3.5" />
    </Button>
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${noun} ${index + 1}`} title={`Delete ${noun}`} onClick={() => controls.onDelete(kind, index)}>
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  </div>;
}
