"use client";

// features/education/spoken-practice/components/PracticeSetup.tsx
//
// Configure a session for one mode: the required focus (subject / interview type
// / resolution), optional grounding (a deck or pasted material), difficulty, and
// prompt count. The metered start is guarded + the limit is shown BEFORE the cap
// (TRUST mandate) via the canonical entitlement primitives.

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Mic } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import type { FcSetRow } from "@/features/flashcards/data/types";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  MODE_CONFIG,
  DIFFICULTY_OPTIONS,
  DEFAULT_PROMPTS,
  PROMPT_COUNT_OPTIONS,
} from "../constants";
import { buildDeckSource, buildTopicSource } from "../data/grounding";
import {
  publishPracticeSetupSnapshot,
  type PracticeSetupSnapshot,
} from "../setupSnapshot";
import { resolvePracticeSetupPatch } from "../setupWrites";
import type { PracticeConfig, PracticeSource, SpokenPracticeMode } from "../types";

const SURFACE_NAME = "matrx-user/education-practice-oral";

export function PracticeSetup({
  mode,
  onBack,
  start,
}: {
  mode: SpokenPracticeMode;
  onBack: () => void;
  start: (config: PracticeConfig) => Promise<boolean>;
}) {
  const cfg = MODE_CONFIG[mode];
  const Icon = cfg.icon;
  const guard = useEntitlementGuard("education.spoken_practice");
  // School-safe COPPA gate: an under-13 account with no active guardian link is
  // blocked from AI generation until a parent approves (never a silent failure).
  const coppa = useAiComplianceGate();

  const [focus, setFocus] = useState("");
  const [difficulty, setDifficulty] = useState<string>(DIFFICULTY_OPTIONS[1]);
  const [count, setCount] = useState(DEFAULT_PROMPTS);
  const [deckId, setDeckId] = useState("");
  const [pasted, setPasted] = useState("");
  const [decks, setDecks] = useState<FcSetRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cfg.offersDeckGrounding) return;
    let alive = true;
    void (async () => {
      const { fcService } = await import("@/features/flashcards/data/fcService");
      const res = await fcService.listSets();
      if (alive && res.data) setDecks(res.data);
    })();
    return () => {
      alive = false;
    };
  }, [cfg.offersDeckGrounding]);

  // ── Surface: the setup half of `matrx-user/education-practice-oral` ────
  //
  // The form state lives here, so this component publishes it into the module
  // snapshot store the emitter (SpokenPracticeSurface) reads back synchronously,
  // and registers the `practice_setup` write handler itself. Both are scoped to
  // this component's life: the snapshot is CLEARED on unmount and the handler
  // registration is dropped with it, so the runner and the summary neither emit
  // a form that is gone nor offer an agent a target for one.
  const surfaceSnapshot = (): PracticeSetupSnapshot => ({
    mode,
    focus,
    difficulty,
    count,
    deckId,
    pasted,
    offersDeckGrounding: cfg.offersDeckGrounding,
    decks: decks.map((d) => ({ id: d.id, name: d.name })),
    busy,
  });

  useEffect(() => {
    publishPracticeSetupSnapshot(surfaceSnapshot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    focus,
    difficulty,
    count,
    deckId,
    pasted,
    cfg.offersDeckGrounding,
    decks,
    busy,
  ]);

  useEffect(() => () => publishPracticeSetupSnapshot(null), []);

  /**
   * The value is validated by the ONE validator in `../setupWrites.ts` — which
   * reads the same DIFFICULTY_OPTIONS / PROMPT_COUNT_OPTIONS the pickers below
   * render, so the options the learner sees, the enum the agent is told about,
   * and this check cannot drift — and is then applied through the SAME setters
   * the learner's own typing goes through. Never a parallel write path, and
   * never a direct service call. A bad shape throws, and the writeback seam
   * turns that into the error envelope the agent reads back.
   *
   * Note what this does NOT do: it fills the form and stops. Pressing Start is
   * the learner's — it spends an agent run, opens the microphone, and meters
   * their entitlement.
   */
  useSurfaceWriteHandlers(SURFACE_NAME, {
    practice_setup: (value: unknown) => {
      const patch = resolvePracticeSetupPatch(value, surfaceSnapshot());
      if (patch.focus !== undefined) setFocus(patch.focus);
      if (patch.difficulty !== undefined) setDifficulty(patch.difficulty);
      if (patch.count !== undefined) setCount(patch.count);
      if (patch.deckId !== undefined) setDeckId(patch.deckId);
      if (patch.pasted !== undefined) setPasted(patch.pasted);
    },
  });

  async function handleStart() {
    if (!focus.trim()) {
      toast.error(`Enter a ${cfg.focusLabel.toLowerCase()} first`);
      return;
    }
    // School-safe gate FIRST (COPPA): is this account allowed to collect/process
    // data at all? An unconsented under-13 opens the "a parent must approve"
    // dialog and never reaches the billing gate or starts a session.
    if (!(await coppa.ensureAllowed())) return;
    setBusy(true);
    try {
      // Resolve the grounding source (deck > pasted > none).
      let source: PracticeSource | null = null;
      if (cfg.offersDeckGrounding && deckId) {
        source = await buildDeckSource(deckId);
        if (!source) toast.error("That deck has no cards — continuing ungrounded");
      }
      if (!source) source = buildTopicSource(focus.trim(), pasted);

      const config: PracticeConfig = {
        mode,
        focus: focus.trim(),
        difficulty,
        count,
        source,
      };
      await guard.guard(async () => {
        // Meter only a session that actually started; a failed start (bad
        // design, mic denied, save error) returns false and burns nothing.
        if (await start(config)) await guard.commit();
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-5 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {cfg.label}
            </h1>
            <p className="text-xs text-muted-foreground">{cfg.tagline}</p>
          </div>
        </div>
      </div>

      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        {cfg.howItWorks}
      </p>

      <div className="space-y-4">
        <ProInput
          floatingLabel={cfg.focusLabel}
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder={cfg.focusPlaceholder}
        />

        {cfg.offersDeckGrounding && (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Ground in one of your decks (optional)
            </span>
            <select
              value={deckId}
              onChange={(e) => setDeckId(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
            >
              <option value="">No deck — use the subject above</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {!(cfg.offersDeckGrounding && deckId) && (
          <ProTextarea
            floatingLabel="Paste your own material (optional)"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="Notes, an outline, or a source passage to ground the session in…"
            rows={3}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Level
            </span>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
            >
              {DIFFICULTY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Questions
            </span>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
            >
              {PROMPT_COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <Button
          className="w-full gap-2"
          onClick={handleStart}
          disabled={busy || guard.isChecking}
        >
          {busy || guard.isChecking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
          Start {cfg.label.toLowerCase()}
        </Button>
        <div className="flex justify-center">
          <EntitlementMeter capability="education.spoken_practice" />
        </div>
      </div>

      <guard.Paywall />
      <coppa.Gate />
    </div>
  );
}
