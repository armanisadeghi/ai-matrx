"use client";

/**
 * ONE editor for the settings ladder, mounted at every tier (platform, org,
 * brand, site). The screens differ only in which scope they pass — never in
 * what the numbers mean or how they are written (P22: shared machinery, and
 * here the same surface honestly serves all four).
 *
 * The whole point of this screen is that a person can see WHERE a number comes
 * from before they change it: every field says either "set here" or "inherited
 * from <tier>", and "Use inherited" is a real action that hands the setting
 * back up the ladder rather than copying the parent's number down.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/styles/themes/utils";
import { toast } from "@/lib/toast";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import {
  getValueSettings,
  setValueSettings,
  type SettingsScope,
  type ValueLevel,
} from "./data";

const SCOPE_WORD: Record<SettingsScope, string> = {
  platform: "the platform defaults",
  org: "this organization",
  brand: "this brand",
  site: "this site",
};

function SourceBadge({ own, from }: { own: boolean; from: string }) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[10px] font-medium",
        own
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-muted/50 text-muted-foreground",
      )}
    >
      {own ? "Set here" : `Inherited from ${from}`}
    </span>
  );
}

export function ValueSettingsEditor({
  scope,
  id,
  className,
}: {
  scope: SettingsScope;
  id: string | null;
  className?: string;
}) {
  const qc = useQueryClient();
  const queryKey = ["seo", "value-settings", scope, id] as const;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getValueSettings(scope, id, signal),
  });
  const data = query.data;

  const [baseline, setBaseline] = useState<string>("");
  const [levels, setLevels] = useState<ValueLevel[] | null>(null);

  // Re-seed the form whenever the server's answer changes; a draft never
  // survives a save, so what is on screen is always what the ladder says.
  useEffect(() => {
    if (!data) return;
    setBaseline(
      data.own.baseline === null || data.own.baseline === undefined
        ? ""
        : String(data.own.baseline),
    );
    setLevels(data.own.levels ? [...data.own.levels] : null);
  }, [data]);

  const parentWord = data?.parent?.label ?? "the platform defaults";
  const effectiveLevels = useMemo(
    () => levels ?? data?.inherited.levels ?? [],
    [levels, data],
  );

  const save = useMutation({
    mutationFn: (input: Parameters<typeof setValueSettings>[0]) =>
      setValueSettings(input),
    onSuccess: (fresh) => {
      qc.setQueryData(queryKey, fresh);
      // Every score on every surface for these sites just changed.
      qc.invalidateQueries({ queryKey: ["marketing", "gsc"] });
      qc.invalidateQueries({ queryKey: ["seo"] });
      toast.success("Saved — scores recalculated from here down");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : String(error)),
  });

  if (query.isError) {
    return (
      <InlineQueryError
        what="these value settings"
        error={query.error}
        onRetry={() => query.refetch()}
      />
    );
  }

  if (query.isPending || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 rounded-md" />
        <Skeleton className="h-48 rounded-md" />
      </div>
    );
  }

  const readOnly = !data.may_edit;
  const baselineIsOwn = data.own.baseline !== null && data.own.baseline !== undefined;
  const levelsAreOwn = Boolean(data.own.levels && data.own.levels.length > 0);

  return (
    <div className={cn("space-y-4", className)}>
      <header className="rounded-md border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Keyword value settings — {data.label ?? SCOPE_WORD[scope]}
          </h2>
          {readOnly ? (
            <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              You can see these but not change them
            </span>
          ) : null}
        </div>
        <p className="mt-1 max-w-3xl text-[11px] leading-4 text-muted-foreground">
          {scope === "platform"
            ? "These are the numbers every site starts from. An organization, a brand or a single site can override any of them; anything they do not override keeps following this screen."
            : `Anything you leave alone here follows ${parentWord}. Anything you set stops following it — for ${data.sites_affected === 1 ? "this site" : `all ${data.sites_affected} sites`} below this level.`}
        </p>
      </header>

      {/* ── the baseline ─────────────────────────────────────────────── */}
      <section className="rounded-md border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-foreground">Starting score</h3>
            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
              Every keyword begins here before anything you have said about it
              adds, subtracts or scales. Below it reads as worse than neutral.
            </p>
          </div>
          <SourceBadge own={baselineIsOwn} from={parentWord} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={0}
            className="h-8 w-32 text-xs"
            value={baseline}
            disabled={readOnly}
            placeholder={String(data.inherited.baseline ?? 100)}
            onChange={(event) => setBaseline(event.target.value)}
            aria-label="Starting score"
          />
          <Button
            size="sm"
            className="h-8"
            disabled={readOnly || save.isPending || baseline.trim() === ""}
            onClick={() =>
              save.mutate({ scope, id, baseline: Number(baseline) })
            }
          >
            {save.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <Check className="mr-1 h-3 w-3" aria-hidden />
            )}
            Save
          </Button>
          {scope !== "platform" && baselineIsOwn ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              disabled={readOnly || save.isPending}
              onClick={() => save.mutate({ scope, id, clear: ["baseline"] })}
            >
              <RotateCcw className="mr-1 h-3 w-3" aria-hidden />
              Use {parentWord}&rsquo;s ({data.inherited.baseline ?? 100})
            </Button>
          ) : null}
        </div>
      </section>

      {/* ── the levels ───────────────────────────────────────────────── */}
      <section className="rounded-md border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-foreground">Levels</h3>
            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
              The words a score is given. A level is a threshold — a keyword
              takes the highest level whose starting number it reaches. Level
              words only; a level never names a kind of keyword.
            </p>
          </div>
          <SourceBadge own={levelsAreOwn} from={parentWord} />
        </div>

        <table className="mt-2 w-full text-xs">
          <thead className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Level</th>
              <th className="py-1 font-medium">Starts at</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {effectiveLevels.map((level, index) => (
              <tr key={`${level.value}-${index}`} className="border-t border-border">
                <td className="py-1.5 pr-2">
                  <Input
                    className="h-7 w-full max-w-[16rem] text-xs"
                    value={level.label ?? level.value}
                    disabled={readOnly}
                    aria-label={`Name for ${level.value}`}
                    onChange={(event) => {
                      const next = [...effectiveLevels];
                      next[index] = { ...level, label: event.target.value };
                      setLevels(next);
                    }}
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <Input
                    type="number"
                    className="h-7 w-28 text-xs"
                    value={level.min_score}
                    disabled={readOnly}
                    aria-label={`Score ${level.label ?? level.value} starts at`}
                    onChange={(event) => {
                      const next = [...effectiveLevels];
                      next[index] = {
                        ...level,
                        min_score: Number(event.target.value),
                      };
                      setLevels(next);
                    }}
                  />
                </td>
                <td className="py-1.5 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-muted-foreground"
                    disabled={readOnly}
                    aria-label={`Remove ${level.label ?? level.value}`}
                    onClick={() =>
                      setLevels(effectiveLevels.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={readOnly}
            onClick={() =>
              setLevels([
                ...effectiveLevels,
                { value: `level_${effectiveLevels.length + 1}`, label: "", min_score: 0 },
              ])
            }
          >
            <Plus className="mr-1 h-3 w-3" aria-hidden />
            Add a level
          </Button>
          <Button
            size="sm"
            className="h-8"
            disabled={readOnly || save.isPending || levels === null}
            onClick={() => save.mutate({ scope, id, levels: effectiveLevels })}
          >
            {save.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <Check className="mr-1 h-3 w-3" aria-hidden />
            )}
            Save levels
          </Button>
          {scope !== "platform" && levelsAreOwn ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              disabled={readOnly || save.isPending}
              onClick={() => save.mutate({ scope, id, clear: ["levels"] })}
            >
              <RotateCcw className="mr-1 h-3 w-3" aria-hidden />
              Use {parentWord}&rsquo;s levels
            </Button>
          ) : null}
        </div>

        {data.parent ? (
          <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
            <ArrowUpRight className="h-3 w-3" aria-hidden />
            Anything not set here follows {parentWord}.
          </p>
        ) : null}
      </section>
    </div>
  );
}
