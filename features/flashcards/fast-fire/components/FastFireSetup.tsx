// features/flashcards/fast-fire/components/FastFireSetup.tsx
//
// The setup screen (REQUIREMENTS §2.1): pick a real fc_set, seconds-per-card,
// card count, and live-score vs summary. The set picker reads real sets from
// `fcService.listSets` (hard-requirement #7) — no hardcoded deck. "Start" warms
// the mic + opens the session inside the click gesture (one mic prompt).
//
// React Compiler is on: no manual memo.

"use client";

import { useEffect, useState } from "react";
import { Flame, Layers, Clock, Hash, Gauge, AlertCircle, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fcService } from "@/features/flashcards/data/fcService";
import type { FcSetRow } from "@/features/flashcards/data/types";
import { updateConfig } from "../redux/fastFireSlice";
import { selectFastFireConfig } from "../redux/fastFire.selectors";
import { useFastFireLauncher } from "../hooks/useFastFireLauncher";

export function FastFireSetup() {
  const dispatch = useAppDispatch();
  const config = useAppSelector(selectFastFireConfig);
  const { start, starting, startError } = useFastFireLauncher();

  const [sets, setSets] = useState<FcSetRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fcService.listSets();
      if (cancelled) return;
      if (res.error) {
        setLoadError(res.error);
        setSets([]);
        return;
      }
      setSets(res.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedSet = sets?.find((s) => s.id === config.setId) ?? null;

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8 pb-safe">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <Flame className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              FastFire
            </h1>
            <p className="text-sm text-muted-foreground">
              Speak your answers out loud. Cards advance on a timer — you never
              wait on the AI.
            </p>
          </div>
        </div>

        {/* Set picker */}
        <section className="mb-5 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <Layers className="h-4 w-4 text-muted-foreground" />
            Choose a set
          </div>
          {sets === null ? (
            <div className="flex items-center justify-center py-8">
              <MatrxMiniLoader />
            </div>
          ) : loadError ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-4 text-xs text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              {loadError}
            </div>
          ) : sets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-background px-3 py-8 text-center text-xs text-muted-foreground">
              No sets yet. Create one in the Flashcard Studio first.
            </div>
          ) : (
            <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto">
              {sets.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => dispatch(updateConfig({ setId: s.id }))}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    config.setId === s.id
                      ? "border-orange-400 bg-orange-50 dark:border-orange-700 dark:bg-orange-950/40"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {s.name}
                    </div>
                    {s.description && (
                      <div className="truncate text-xs text-muted-foreground">
                        {s.description}
                      </div>
                    )}
                  </div>
                  {config.setId === s.id && (
                    <span className="shrink-0 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-medium text-white">
                      Selected
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Pace + count */}
        <section className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Seconds per card
              </span>
              <span className="tabular-nums text-orange-600 dark:text-orange-400">
                {config.secondsPerCard}s
              </span>
            </div>
            <Slider
              min={3}
              max={30}
              step={1}
              value={[config.secondsPerCard]}
              onValueChange={(v) =>
                dispatch(updateConfig({ secondsPerCard: v[0] ?? 12 }))
              }
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
              <span className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                Number of cards
              </span>
              <span className="tabular-nums text-orange-600 dark:text-orange-400">
                {config.cardLimit === 0 ? "All" : config.cardLimit}
              </span>
            </div>
            <Slider
              min={0}
              max={50}
              step={1}
              value={[config.cardLimit]}
              onValueChange={(v) =>
                dispatch(updateConfig({ cardLimit: v[0] ?? 0 }))
              }
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              0 = all cards in the set.
            </p>
          </div>
        </section>

        {/* Live score toggle */}
        <section className="mb-6 flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium text-foreground">
                Live scoreboard
              </div>
              <div className="text-xs text-muted-foreground">
                Show grades as they catch up, or only at the end.
              </div>
            </div>
          </div>
          <Switch
            checked={config.liveScore}
            onCheckedChange={(checked) =>
              dispatch(updateConfig({ liveScore: checked }))
            }
          />
        </section>

        {startError && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {startError}
          </div>
        )}

        <Button
          size="lg"
          className="w-full gap-2 bg-orange-600 hover:bg-orange-700"
          disabled={!selectedSet || starting}
          onClick={() => void start()}
        >
          {starting ? (
            <>
              <Mic className="h-5 w-5 animate-pulse" />
              Warming the mic…
            </>
          ) : (
            <>
              <Flame className="h-5 w-5" />
              Start FastFire
            </>
          )}
        </Button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          One microphone prompt for the whole session. Answer each card aloud
          before the timer runs out.
        </p>
      </div>
    </div>
  );
}
