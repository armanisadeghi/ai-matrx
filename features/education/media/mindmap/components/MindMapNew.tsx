"use client";

// features/education/media/mindmap/components/MindMapNew.tsx
//
// Generate a mind map from a deck or a topic. Runs the diagram_spec agent
// (useGenerateMindMap — a single synchronous round-trip, unlike audio's
// streamed pipeline), persists the resulting envelope to study_media, and opens
// the map. Metered via useEntitlement('education.mindmap_generate') with the
// limit shown BEFORE the action.
//
// React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Network } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fcService } from "@/features/flashcards/data/fcService";
import type { FcSetRow } from "@/features/flashcards/data/types";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import {
  resolveDeckAudioSource,
  resolveTopicAudioSource,
} from "../../audio/resolveAudioSource";
import { studyMediaService } from "../../service";
import { useGenerateMindMap } from "../useGenerateMindMap";
import { linkDiagramToCards, type LinkableCard } from "../linkCards";

type SourceKind = "deck" | "topic";

export function MindMapNew() {
  const router = useRouter();
  const params = useSearchParams();
  const { generate, isGenerating } = useGenerateMindMap();
  const gen = useEntitlementGuard("education.mindmap_generate");

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
      toast.error("Type a topic to map");
      return;
    }
    // Canonical guard: awaits the server-truth check BEFORE spending; on a
    // cap-hit it opens the respectful contextual paywall (not a toast) and never
    // starts the work (DoD #2 — no mid-generation ambush).
    await gen.guard(async () => {
      const resolved =
        sourceKind === "deck"
          ? (await resolveDeckAudioSource(deckId, { adaptive: false })).data
          : resolveTopicAudioSource(topic);
      if (!resolved) {
        toast.error("Couldn't load that source — pick a deck with cards, or type a topic.");
        return;
      }

      // For a deck source, load the cards so generated nodes can be linked back to
      // the exact card they summarize (clickable node → source card / Ask tutor).
      let deckCards: LinkableCard[] = [];
      if (sourceKind === "deck") {
        const withCards = await fcService.getSetWithCards(deckId);
        deckCards = (withCards.data?.cards ?? []).map((c) => ({
          id: c.id,
          front: c.front,
          back: c.back,
        }));
      }

      try {
        const spec = await generate({
          source_content: resolved.content,
          title: resolved.source.title,
          focus: focus.trim(),
        });
        // Resolve nodes → source cards where we can (DoD item 3). Unmatched nodes
        // stay unlinked; a click still offers "ask the tutor about this idea".
        const { spec: linkedSpec, linkedCount } = linkDiagramToCards(spec, deckCards);
        const title = spec.title || resolved.source.title;
        const media = await studyMediaService.create({
          mediaKind: "mind_map",
          title,
          source: resolved.source,
          config: {
            diagramKind: "diagram_spec",
            hint: focus.trim() || undefined,
            linkedCards: linkedCount,
          },
          trust: resolved.trust,
          irEnvelope: linkedSpec,
          diagramKind: "diagram_spec",
          status: "ready",
        });
        if (media.error || !media.data) {
          toast.error(media.error ?? "Couldn't save the mind map");
          return;
        }
        router.push(`/education/mind-maps/${media.data.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't generate the mind map");
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/education/mind-maps")} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Generate a mind map</h1>
          <p className="text-xs text-muted-foreground">
            Turn a deck or topic into a visual concept map — nodes for the key ideas, edges for how
            they connect.
          </p>
        </div>
      </div>

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
            placeholder="e.g. The water cycle"
            className="min-h-20 text-base"
          />
        )}
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Focus <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="Center the map on a specific angle…"
          className="text-base"
        />
      </section>

      <EntitlementMeter
        capability="education.mindmap_generate"
        showAllWindows
        className="justify-center"
      />

      <Button
        onClick={handleGenerate}
        disabled={isGenerating || gen.isChecking}
        className="w-full gap-2"
      >
        {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />}
        {isGenerating ? "Mapping your material…" : "Generate mind map"}
      </Button>
      <gen.Paywall />
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
