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
import {
  MEDIA_GENERATOR_SOURCE_KINDS,
  isMediaGeneratorSourceKind,
  type MediaGeneratorSourceKind,
} from "@/features/education/media/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  createEducationMemoryScope,
  MEMORY_FOCUS_MAX,
  MEMORY_TOPIC_MAX,
  MEMORY_TOPIC_MIN,
  type MemoryDeckOption,
} from "@/features/surfaces/manifests/education-memory.manifest";
import { useGenerateMemoryAid } from "../useGenerateMemoryAid";
import { memoryAidCounts } from "../types";

// The generator source vocabulary lives ONCE in media/types.ts — the picker
// below renders from it, the manifest interpolates it into the write-target
// prose, and the handler validates against it, so what the UI offers, what the
// agent is told it may send, and what is accepted cannot drift.
type SourceKind = MediaGeneratorSourceKind;

const SURFACE_NAME = "matrx-user/education-memory";

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

  // Read at trigger time, never from stale closure state. The composer is
  // READ-ONLY to agents: this surface declares no write targets, because topic
  // and focus are one composite request consumed by a metered Generate button
  // that stays human-pressed. An agent here advises on what to ask for.
  const buildScope = () => {
    const trimmedTopic = topic.trim();
    const trimmedFocus = focus.trim();
    const deckTitle = decks.find((d) => d.id === deckId)?.name ?? null;
    return createEducationMemoryScope({
      view: "new",
      request_source_kind: sourceKind,
      ...(sourceKind === "deck" && deckId ? { request_deck_id: deckId } : {}),
      ...(sourceKind === "deck" && deckTitle
        ? { request_deck_title: deckTitle }
        : {}),
      ...(sourceKind === "topic" && trimmedTopic
        ? { request_topic: trimmedTopic }
        : {}),
      ...(trimmedFocus ? { request_focus: trimmedFocus } : {}),
      generation_request: {
        source_kind: sourceKind,
        deck_id: sourceKind === "deck" ? deckId || null : null,
        deck_title: sourceKind === "deck" ? deckTitle : null,
        topic: sourceKind === "topic" ? trimmedTopic || null : null,
        focus: trimmedFocus || null,
      },
      available_decks: decks.map(
        (d): MemoryDeckOption => ({ id: d.id, name: d.name }),
      ),
    });
  };

  // ── Surface write targets (the write half) ──────────────────────────────
  // Both targets STAGE into the same setters the learner's own typing uses —
  // never a parallel write path — so an applied write is visible in the form
  // immediately and nothing is generated or persisted. The metered spend stays
  // behind the learner's own Generate press, where the COPPA gate, the
  // entitlement guard and studyMediaService.create run. Handlers validate FIRST
  // and THROW on a bad shape (the writeback seam turns a throw into a safe error
  // envelope the agent reads); no setter fires until every check has passed.
  // Fresh closures per call (getWriteHandlers contract). The list and detail
  // mounts of this surface register NO handlers — see the manifest docblock.
  const getSurfaceWriteHandlers = () => ({
    generation_source: (value: unknown) => {
      if (isGenerating)
        throw new Error(
          "generation_source refused — memory aids are being generated right now. Wait for the run to finish before changing the source.",
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
      // what the aids are built from, so a value naming both is contradictory
      // rather than something to silently pick a winner from.
      if (hasTopic && hasDeck)
        throw new Error(
          "generation_source rejected — topic and deck_id are alternative sources; send one, not both.",
        );

      let nextKind: SourceKind | null = null;
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
          throw new Error(
            "generation_source.topic expects a plain text string, not JSON and not JSON-encoded, no code fence.",
          );
        const trimmed = patch.topic.trim();
        if (trimmed.length < MEMORY_TOPIC_MIN || trimmed.length > MEMORY_TOPIC_MAX)
          throw new Error(
            `generation_source.topic expects ${MEMORY_TOPIC_MIN}-${MEMORY_TOPIC_MAX} characters after trimming (got ${trimmed.length}).`,
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
            "generation_source.deck_id rejected — the learner has no flashcard decks to build aids from, so only topic mode can work here.",
          );
        const match = decks.find((d) => d.id === patch.deck_id);
        if (!match)
          throw new Error(
            `generation_source.deck_id ${JSON.stringify(patch.deck_id)} is not one of the learner's decks. Read available_decks and use an \`id\` from it.`,
          );
        nextDeckId = match.id;
        nextKind = "deck";
      }

      // Every check passed — only now does any state change.
      if (nextKind) setSourceKind(nextKind);
      if (nextTopic !== null) setTopic(nextTopic);
      if (nextDeckId !== null) setDeckId(nextDeckId);
    },

    generation_focus: (value: unknown) => {
      if (isGenerating)
        throw new Error(
          "generation_focus refused — memory aids are being generated right now. Wait for the run to finish before changing the focus.",
        );
      if (typeof value !== "string")
        throw new Error(
          "generation_focus expects a plain text string, not JSON and not JSON-encoded, no code fence. Send the empty string to clear the focus.",
        );
      const trimmed = value.trim();
      if (trimmed.length > MEMORY_FOCUS_MAX)
        throw new Error(
          `generation_focus expects at most ${MEMORY_FOCUS_MAX} characters after trimming (got ${trimmed.length}).`,
        );
      setFocus(trimmed);
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={SURFACE_NAME}
      getScope={buildScope}
      getWriteHandlers={getSurfaceWriteHandlers}
    >
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
            data-surface-value="request_deck_id"
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
            data-surface-value="request_topic"
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
          data-surface-value="request_focus"
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
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
