"use client";

// features/education/memory/components/MemoryAidView.tsx
//
// Renders a stored `memory_aid` payload (study_media.ir_envelope) — the three
// aid families from VISION §11: mnemonics, analogies/memory bridges, and a
// memory-palace scaffold. Pure presentational; coerces the raw envelope so a
// slightly-off agent payload still renders what it can. React Compiler is on.

import { Brain, Lightbulb, Landmark, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { coerceMemoryAid, type MnemonicTechnique } from "../types";

const TECHNIQUE_LABEL: Record<MnemonicTechnique, string> = {
  acronym: "Acronym",
  acrostic: "Acrostic",
  rhyme: "Rhyme",
  sentence: "Sentence",
  keyword: "Keyword",
  chunking: "Chunking",
};

export function MemoryAidView({ envelope }: { envelope: unknown }) {
  const aid = coerceMemoryAid(envelope);

  if (!aid) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        This memory aid couldn&apos;t be displayed.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {aid.strategyNote && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {aid.strategyNote}
        </p>
      )}

      {aid.mnemonics.length > 0 && (
        <Section icon={Brain} title="Mnemonics" count={aid.mnemonics.length}>
          <div className="space-y-2">
            {aid.mnemonics.map((m, i) => (
              <div
                key={`mn-${i}`}
                className="rounded-xl border border-border bg-card p-3"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {TECHNIQUE_LABEL[m.technique]}
                  </span>
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
      )}

      {aid.analogies.length > 0 && (
        <Section
          icon={Lightbulb}
          title="Analogies & memory bridges"
          count={aid.analogies.length}
        >
          <div className="space-y-2">
            {aid.analogies.map((a, i) => (
              <div
                key={`an-${i}`}
                className="rounded-xl border border-border bg-card p-3"
              >
                {a.concept && (
                  <p className="text-sm font-medium text-foreground">
                    {a.concept}
                  </p>
                )}
                <p className="mt-0.5 text-base text-foreground">
                  <span className="text-muted-foreground">is like </span>
                  {a.analogy}
                </p>
                {a.mapping && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {a.mapping}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {aid.memoryPalace.applicable && aid.memoryPalace.loci.length > 0 && (
        <Section icon={Landmark} title="Memory palace">
          <div className="rounded-xl border border-border bg-card p-3">
            {aid.memoryPalace.theme && (
              <p className="mb-2 text-sm text-muted-foreground">
                Journey:{" "}
                <span className="font-medium text-foreground">
                  {aid.memoryPalace.theme}
                </span>
              </p>
            )}
            <ol className="space-y-2">
              {aid.memoryPalace.loci.map((l, i) => (
                <li key={`loc-${i}`} className="flex gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      <MapPin className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" />
                      {l.place}
                      {l.item && (
                        <span className="text-muted-foreground">
                          {" "}
                          — {l.item}
                        </span>
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
      )}
    </div>
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
          <span className={cn("text-xs text-muted-foreground")}>({count})</span>
        )}
      </div>
      {children}
    </section>
  );
}
