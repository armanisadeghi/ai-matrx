"use client";

// features/education/media/audio/components/AudioStudyNew.tsx
//
// The "generate audio study" form. Pick a source (a deck or a free-text topic),
// a format (overview / debate / panel), cast size, and — for a deck —
// weak-area adaptivity. Metered via useEntitlement('education.audio_generate')
// with the limit shown BEFORE the action (TRUST mandate: never a mid-workflow
// ambush). Delegates the actual create+stream+navigate to useAudioStudyCreate.
//
// React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Headphones, Loader2, MessagesSquare, Radio, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fcService } from "@/features/flashcards/data/fcService";
import type { FcSetRow } from "@/features/flashcards/data/types";
import { useEntitlement } from "@/features/entitlements/hooks";
import { useAudioStudyCreate } from "../useAudioStudyCreate";
import type { EduAudioFormat } from "../../types";

type SourceKind = "deck" | "topic";

const FORMATS: {
  id: EduAudioFormat;
  label: string;
  blurb: string;
  icon: typeof Headphones;
  defaultHosts: number;
}[] = [
  { id: "overview", label: "Overview", blurb: "A narrated walkthrough of the material.", icon: Radio, defaultHosts: 2 },
  { id: "debate", label: "Debate", blurb: "Two distinct voices argue opposing views.", icon: MessagesSquare, defaultHosts: 2 },
  { id: "panel", label: "Panel", blurb: "A multi-host expert roundtable.", icon: Users, defaultHosts: 4 },
];

export function AudioStudyNew() {
  const router = useRouter();
  const params = useSearchParams();
  const { create, busy } = useAudioStudyCreate();
  const ent = useEntitlement("education.audio_generate");

  const [decks, setDecks] = useState<FcSetRow[]>([]);
  const [sourceKind, setSourceKind] = useState<SourceKind>(
    params.get("source") === "topic" ? "topic" : "deck",
  );
  const [deckId, setDeckId] = useState<string>(params.get("deck") ?? "");
  const [topic, setTopic] = useState<string>("");
  const [format, setFormat] = useState<EduAudioFormat>(
    (params.get("format") as EduAudioFormat) ?? "overview",
  );
  const [hostCount, setHostCount] = useState<number>(2);
  const [adaptive, setAdaptive] = useState<boolean>(true);

  useEffect(() => {
    fcService.listSets().then((res) => {
      if (res.data) setDecks(res.data);
    });
  }, []);

  // Keep host count sensible per format when the format changes.
  useEffect(() => {
    const f = FORMATS.find((x) => x.id === format);
    if (f) setHostCount(f.defaultHosts);
  }, [format]);

  async function handleGenerate() {
    if (sourceKind === "deck" && !deckId) {
      toast.error("Pick a deck");
      return;
    }
    if (sourceKind === "topic" && topic.trim().length < 3) {
      toast.error("Type a topic to make audio about");
      return;
    }
    const verdict = await ent.check();
    if (!verdict.allowed) {
      toast.error(ent.definition?.upgradeMessage ?? "You've reached your audio limit.");
      return;
    }
    await create({
      format,
      sourceKind,
      deckId: sourceKind === "deck" ? deckId : undefined,
      topic: sourceKind === "topic" ? topic : undefined,
      hostCount,
      adaptive: sourceKind === "deck" && adaptive,
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/education/audio-study")} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Generate audio study</h1>
          <p className="text-xs text-muted-foreground">
            Turn a deck or a topic into a produced audio session you can listen to anywhere.
          </p>
        </div>
      </div>

      {/* Source */}
      <section className="space-y-2">
        <label className="text-sm font-medium text-foreground">Source</label>
        <div className="flex gap-2">
          <SegBtn active={sourceKind === "deck"} onClick={() => setSourceKind("deck")}>From a deck</SegBtn>
          <SegBtn active={sourceKind === "topic"} onClick={() => setSourceKind("topic")}>From a topic</SegBtn>
        </div>
        {sourceKind === "deck" ? (
          <select
            value={deckId}
            onChange={(e) => setDeckId(e.target.value)}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
          >
            <option value="">Select a deck…</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        ) : (
          <Textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. The causes of the French Revolution"
            className="min-h-20 text-base"
          />
        )}
        {sourceKind === "topic" && (
          <p className="text-[11px] text-muted-foreground">
            A topic isn&apos;t grounded in your own material — the audio is reasoned from general
            knowledge and labelled honestly.
          </p>
        )}
      </section>

      {/* Format */}
      <section className="space-y-2">
        <label className="text-sm font-medium text-foreground">Format</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {FORMATS.map((f) => {
            const Icon = f.icon;
            const active = format === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormat(f.id)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                  active ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-accent",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                <span className="text-sm font-medium text-foreground">{f.label}</span>
                <span className="text-[11px] leading-tight text-muted-foreground">{f.blurb}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Options */}
      <section className="space-y-3">
        {format === "panel" && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Hosts</span>
            <div className="flex items-center gap-2">
              {[3, 4, 5, 6].map((n) => (
                <SegBtn key={n} active={hostCount === n} onClick={() => setHostCount(n)}>
                  {String(n)}
                </SegBtn>
              ))}
            </div>
          </div>
        )}
        {sourceKind === "deck" && (
          <label className="flex cursor-pointer items-start gap-2">
            <Checkbox
              checked={adaptive}
              onCheckedChange={(checked) => setAdaptive(checked === true)}
              className="mt-0.5"
            />
            <span className="text-sm text-foreground">
              Target my weak areas
              <span className="block text-[11px] text-muted-foreground">
                Spends extra time on the concepts you&apos;ve been struggling with (from your study history).
              </span>
            </span>
          </label>
        )}
      </section>

      {ent.limit != null && (
        <p className="text-xs text-muted-foreground">
          {ent.remaining} of {ent.limit} audio generations left this month.
        </p>
      )}

      <Button onClick={handleGenerate} disabled={busy} className="w-full gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Headphones className="h-4 w-4" />}
        Generate audio
      </Button>
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-1.5 text-sm transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
