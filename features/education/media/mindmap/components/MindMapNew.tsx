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
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationMindMapsScope } from "@/features/surfaces/manifests/education-mind-maps.manifest";
import {
  resolveDeckAudioSource,
  resolveTopicAudioSource,
} from "../../audio/resolveAudioSource";
import { studyMediaService } from "../../service";
import {
  MEDIA_GENERATOR_SOURCE_KINDS,
  isMediaGeneratorSourceKind,
  type MediaGeneratorSourceKind,
} from "../../types";
import { useGenerateMindMap } from "../useGenerateMindMap";
import { linkDiagramToCards, type LinkableCard } from "../linkCards";

// Presentation only — the VALUE vocabulary lives in features/education/media/
// types.ts and is imported above, so this picker cannot drift from what the
// surface's write target advertises or what its handler accepts. The Record is
// keyed by the union, so adding a source mode fails to compile until it is
// given UI copy here.
const SOURCE_KIND_LABELS: Record<MediaGeneratorSourceKind, string> = {
  deck: "From a deck",
  topic: "From a topic",
};

/** Bounds the write handlers enforce (the form's own inputs are unbounded text). */
const TOPIC_MIN = 3;
const TOPIC_MAX = 500;
const FOCUS_MAX = 300;

export function MindMapNew() {
  const router = useRouter();
  const params = useSearchParams();
  const { generate, isGenerating } = useGenerateMindMap();
  const gen = useEntitlementGuard("education.mindmap_generate");
  // School-safe COPPA gate: an under-13 account with no active guardian link is
  // blocked from AI generation until a parent approves (never a silent failure).
  const coppa = useAiComplianceGate();

  const [decks, setDecks] = useState<FcSetRow[]>([]);
  const [sourceKind, setSourceKind] = useState<MediaGeneratorSourceKind>(
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
    // School-safe gate FIRST (COPPA): is this account allowed to collect/process
    // data at all? An unconsented under-13 opens the "a parent must approve"
    // dialog and never reaches the billing gate or starts a run.
    if (!(await coppa.ensureAllowed())) return;
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
        // Metered action SUCCEEDED — record real usage so the meter decrements
        // (honest even while enforced:false). Failed branches return first, so a
        // failed generation never burns quota.
        await gen.commit();
        router.push(`/education/mind-maps/${media.data.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't generate the mind map");
      }
    });
  }

  const selectedDeck = decks.find((d) => d.id === deckId) ?? null;

  // Live surface scope for the Agents chrome (matrx-user/education-mind-maps,
  // create view). A plain synchronous function over the live render values —
  // the Surface Context window polls this every 400ms, so it must never fetch.
  const getScope = () =>
    createEducationMindMapsScope({
      view: "create",
      source_kind: sourceKind,
      ...(topic.trim() ? { topic: topic.trim() } : {}),
      ...(focus.trim() ? { focus: focus.trim() } : {}),
      ...(selectedDeck
        ? { selected_deck: { id: selectedDeck.id, name: selectedDeck.name } }
        : {}),
      available_decks: decks.map((d) => ({ id: d.id, name: d.name })),
      deck_count: decks.length,
      source_selection: {
        source_kind: sourceKind,
        topic: sourceKind === "topic" ? (topic.trim() || null) : null,
        deck_id: sourceKind === "deck" ? (deckId || null) : null,
        deck_name: sourceKind === "deck" ? (selectedDeck?.name ?? null) : null,
      },
      is_generating: isGenerating,
    });

  // Write half of the mind-map surface (manifest `writeTargets`). Both targets
  // are draft-mode: they stage through the SAME setters the learner's own
  // typing uses, so the value shows up in the form and the learner still
  // presses Generate — which is where the COPPA gate, the entitlement guard and
  // the canonical studyMediaService path run. Nothing here spends quota or
  // writes a row. Handlers validate FIRST and THROW on a bad shape (the
  // writeback seam turns a throw into a safe error envelope the agent reads);
  // no setter fires until every check has passed. Fresh closures per call
  // (getWriteHandlers contract). The list and detail mounts of this same
  // surface register NO handlers — see the manifest's writeTargets docblock.
  const getSurfaceWriteHandlers = () => ({
    generation_source: (value: unknown) => {
      if (isGenerating)
        throw new Error(
          "generation_source refused — a mind map is being generated right now. Wait for the run to finish before changing the source.",
        );
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error(
          'generation_source expects an OBJECT like { source_kind?: "deck" | "topic", topic?: string, deck_id?: string }.',
        );
      const patch = value as Record<string, unknown>;
      const allowed = ["source_kind", "topic", "deck_id"];
      const unknownKeys = Object.keys(patch).filter(
        (k) => !allowed.includes(k),
      );
      if (unknownKeys.length > 0)
        throw new Error(
          `generation_source rejected — unsupported field(s): ${unknownKeys.join(", ")}. It accepts only ${allowed.join(", ")}. The focus angle has its own target, generation_focus.`,
        );

      const hasKind = patch.source_kind !== undefined;
      const hasTopic = patch.topic !== undefined;
      const hasDeck = patch.deck_id !== undefined;
      if (!hasKind && !hasTopic && !hasDeck)
        throw new Error(
          `generation_source needs at least one of ${allowed.join(", ")}.`,
        );
      // topic and deck_id are the two ALTERNATIVE sources — only one can be
      // what the map is built from, so a value naming both is contradictory
      // rather than something to silently pick a winner from.
      if (hasTopic && hasDeck)
        throw new Error(
          "generation_source rejected — topic and deck_id are alternative sources; send one, not both.",
        );

      let nextKind: MediaGeneratorSourceKind | null = null;
      if (hasKind) {
        if (
          typeof patch.source_kind !== "string" ||
          !isMediaGeneratorSourceKind(patch.source_kind)
        )
          throw new Error(
            `generation_source.source_kind expects exactly one of: ${MEDIA_GENERATOR_SOURCE_KINDS.join(", ")}.`,
          );
        nextKind = patch.source_kind;
      }

      let nextTopic: string | null = null;
      if (hasTopic) {
        if (typeof patch.topic !== "string")
          throw new Error("generation_source.topic expects a string.");
        const trimmed = patch.topic.trim();
        if (trimmed.length < TOPIC_MIN || trimmed.length > TOPIC_MAX)
          throw new Error(
            `generation_source.topic expects ${TOPIC_MIN}-${TOPIC_MAX} characters after trimming (got ${trimmed.length}).`,
          );
        if (nextKind === "deck")
          throw new Error(
            'generation_source rejected — a topic cannot be the source while source_kind is "deck". Send the topic on its own (it switches to topic mode), or send deck_id instead.',
          );
        nextTopic = trimmed;
        nextKind = "topic";
      }

      let nextDeckId: string | null = null;
      if (hasDeck) {
        if (typeof patch.deck_id !== "string" || !patch.deck_id.trim())
          throw new Error(
            "generation_source.deck_id expects a non-empty deck id string from available_decks.",
          );
        if (nextKind === "topic")
          throw new Error(
            'generation_source rejected — a deck cannot be the source while source_kind is "topic". Send deck_id on its own (it switches to deck mode), or send topic instead.',
          );
        if (decks.length === 0)
          throw new Error(
            "generation_source.deck_id rejected — the learner has no flashcard decks to generate from, so only topic mode can work here.",
          );
        const match = decks.find((d) => d.id === patch.deck_id);
        if (!match)
          throw new Error(
            `generation_source.deck_id ${JSON.stringify(patch.deck_id)} is not one of the learner's decks. Read available_decks and use an \`id\` from it.`,
          );
        nextDeckId = match.id;
        nextKind = "deck";
      }

      // Every check passed — now stage, through the same setters the learner's
      // own clicks and typing use.
      if (nextTopic !== null) setTopic(nextTopic);
      if (nextDeckId !== null) setDeckId(nextDeckId);
      if (nextKind !== null) setSourceKind(nextKind);
    },
    generation_focus: (value: unknown) => {
      if (isGenerating)
        throw new Error(
          "generation_focus refused — a mind map is being generated right now. Wait for the run to finish before changing the focus.",
        );
      if (typeof value !== "string")
        throw new Error(
          "generation_focus expects a plain string (the empty string clears the focus).",
        );
      if (value.length > FOCUS_MAX)
        throw new Error(
          `generation_focus expects at most ${FOCUS_MAX} characters (got ${value.length}).`,
        );
      setFocus(value.trim());
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/education-mind-maps"
      isEditable
      getScope={getScope}
      getWriteHandlers={getSurfaceWriteHandlers}
    >
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
          {MEDIA_GENERATOR_SOURCE_KINDS.map((kind) => (
            <SegBtn
              key={kind}
              active={sourceKind === kind}
              onClick={() => setSourceKind(kind)}
            >
              {SOURCE_KIND_LABELS[kind]}
            </SegBtn>
          ))}
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
      <coppa.Gate />
    </div>
    </SurfaceRuntimeProvider>
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
