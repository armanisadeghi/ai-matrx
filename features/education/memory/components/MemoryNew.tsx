"use client";

// features/education/memory/components/MemoryNew.tsx
//
// Generate memory aids from a deck or a topic. Runs the memory_aid agent
// (useGenerateMemoryAid → runAgentExtraction), persists the resulting envelope
// to study_media (media_kind='memory_aid'), links a source-lineage edge, and
// opens the aid. Metered via useEntitlementGuard('education.memory_generate')
// with the limit shown BEFORE the action (TRUST mandate — no mid-generation
// ambush). Mirrors MindMapNew. React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Brain, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fcService } from "@/features/flashcards/data/fcService";
import type { FcSetRow } from "@/features/flashcards/data/types";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import {
  resolveDeckAudioSource,
  resolveTopicAudioSource,
} from "@/features/education/media/audio/resolveAudioSource";
import { studyMediaService } from "@/features/education/media/service";
import { useGenerateMemoryAid } from "../useGenerateMemoryAid";
import { memoryAidCounts } from "../types";

type SourceKind = "deck" | "topic";

export function MemoryNew() {
  const router = useRouter();
  const params = useSearchParams();
  const { generate, isGenerating } = useGenerateMemoryAid();
  const gen = useEntitlementGuard("education.memory_generate");
  // School-safe COPPA gate: an under-13 account with no active guardian link is
  // blocked from AI generation until a parent approves (never a silent failure).
  const coppa = useAiComplianceGate();

  const [decks, setDecks] = useState<FcSetRow[]>([]);
  const [sourceKind, setSourceKind] = useState<SourceKind>(
    params.get("source") === "topic" ? "topic" : "deck",
  );
  const [deckId, setDeckId] = useState(params.get("deck") ?? "");
  const [topic, setTopic] = useState("");
  const [focus, setFocus] = useState("");

  useEffect(() => {
    fcService.listSets().then((res) => {
      if (res.data) setDecks(res.data);
    });
  }, []);

  async function handleGenerate() {
    if (sourceKind === "deck" && !deckId) {
      toast.error("Pick a deck");
      return;
    }
    if (sourceKind === "topic" && topic.trim().length < 3) {
      toast.error("Type a topic to build aids for");
      return;
    }
    // School-safe gate FIRST (COPPA): is this account allowed to collect/process
    // data at all? An unconsented under-13 opens the "a parent must approve"
    // dialog and never reaches the billing gate or starts a run.
    if (!(await coppa.ensureAllowed())) return;
    // Canonical guard: awaits the server-truth check BEFORE spending; a cap-hit
    // opens the respectful contextual paywall and never starts the work.
    await gen.guard(async () => {
      const resolved =
        sourceKind === "deck"
          ? (await resolveDeckAudioSource(deckId, { adaptive: false })).data
          : resolveTopicAudioSource(topic);
      if (!resolved) {
        toast.error(
          "Couldn't load that source — pick a deck with cards, or type a topic.",
        );
        return;
      }

      try {
        const payload = await generate({
          source_content: resolved.content,
          title: resolved.source.title,
          focus: focus.trim(),
        });
        const title = payload.title || resolved.source.title;
        const media = await studyMediaService.create({
          mediaKind: "memory_aid",
          title,
          source: resolved.source,
          config: { focus: focus.trim() || undefined, ...memoryAidCounts(payload) },
          trust: resolved.trust,
          irEnvelope: payload,
          status: "ready",
        });
        if (media.error || !media.data) {
          toast.error(media.error ?? "Couldn't save the memory aids");
          return;
        }
        // Metered action SUCCEEDED — record real usage so the meter decrements
        // (honest even while enforced:false). Failed branches above return
        // first, so a failed generation never burns quota.
        await gen.commit();
        router.push(`/education/memory/${media.data.id}`);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Couldn't generate memory aids",
        );
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/education/memory")}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Generate memory aids
          </h1>
          <p className="text-xs text-muted-foreground">
            Turn a deck or topic into mnemonics, analogies, and a memory-palace
            scaffold for the hard-to-retain parts.
          </p>
        </div>
      </div>

      <section className="space-y-2">
        <label className="text-sm font-medium text-foreground">Source</label>
        <div className="flex gap-2">
          <SegBtn active={sourceKind === "deck"} onClick={() => setSourceKind("deck")}>
            From a deck
          </SegBtn>
          <SegBtn active={sourceKind === "topic"} onClick={() => setSourceKind("topic")}>
            From a topic
          </SegBtn>
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
            placeholder="e.g. The cranial nerves"
            className="min-h-20 text-base"
          />
        )}
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Focus{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="Concentrate on a specific list, term set, or concept…"
          className="text-base"
        />
      </section>

      <EntitlementMeter
        capability="education.memory_generate"
        showAllWindows
        className="justify-center"
      />

      <Button
        onClick={handleGenerate}
        disabled={isGenerating || gen.isChecking}
        className="w-full gap-2"
      >
        {isGenerating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Brain className="h-4 w-4" />
        )}
        {isGenerating ? "Building your memory aids…" : "Generate memory aids"}
      </Button>
      <gen.Paywall />
      <coppa.Gate />
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
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
