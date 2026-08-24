"use client";

/**
 * Autonomy modes (KI-044) — how much rope each AI step gets, at any rung of the
 * settings ladder (platform → organization → brand → site).
 *
 * Policy: /policies/human-in-the-loop-autonomy-modes.md — four modes, a platform
 * default, and the tiers below may override it.
 *
 * The honesty this screen owes: a capability whose running code does not consult
 * the setting yet says so plainly. A control that silently governs nothing is
 * worse than no control at all.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/styles/themes/utils";
import { toast } from "@/lib/toast";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import {
  getAutonomyModes,
  setAutonomyMode,
  type AutonomyMode,
  type SettingsScope,
} from "./data";

const MODES: Array<{ value: AutonomyMode; label: string; hint: string }> = [
  { value: "auto_platform", label: "Runs on its own", hint: "Uses the platform's rules and applies the result." },
  { value: "auto_org", label: "Runs on your rules", hint: "Uses the rules your organization set, and applies the result." },
  { value: "review_timeout", label: "Review, then apply", hint: "Waits for you, and goes ahead if nobody answers in time." },
  { value: "review_required", label: "Never without you", hint: "Nothing is applied until a person approves it." },
];

export function AutonomyModesEditor({
  scope,
  id,
}: {
  scope: SettingsScope;
  id: string | null;
}) {
  const qc = useQueryClient();
  const queryKey = ["seo", "ai-autonomy", scope, id] as const;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getAutonomyModes(scope, id, signal),
  });

  const save = useMutation({
    mutationFn: (input: Parameters<typeof setAutonomyMode>[0]) =>
      setAutonomyMode(input),
    onSuccess: (fresh) => {
      qc.setQueryData(queryKey, fresh);
      toast.success("Saved");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : String(error)),
  });

  if (query.isError) {
    return (
      <InlineQueryError
        what="the AI autonomy settings"
        error={query.error}
        onRetry={() => query.refetch()}
      />
    );
  }
  if (query.isPending || !query.data) {
    return <Skeleton className="h-40 rounded-md" />;
  }

  const data = query.data;
  const readOnly = !data.may_edit;
  const parentWord = data.parent?.label ?? "the platform defaults";

  return (
    <section className="rounded-md border border-border bg-card p-3">
      <h3 className="text-xs font-semibold text-foreground">
        How much the AI may do on its own
      </h3>
      <p className="mt-0.5 max-w-3xl text-[11px] leading-4 text-muted-foreground">
        Each step below can run by itself, wait for you, or wait only so long.
        {scope === "platform"
          ? " These are the defaults every site starts from."
          : ` Anything you leave alone follows ${parentWord}.`}
      </p>

      <ul className="mt-2 space-y-2">
        {data.capabilities.map((capability) => {
          const isOwn = capability.own_mode !== null;
          const effective = capability.effective?.mode ?? capability.default_mode;
          return (
            <li
              key={capability.slug}
              className="rounded-md border border-border bg-muted/20 p-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-foreground">
                  {capability.label}
                </span>
                <span
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                    isOwn
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-muted/50 text-muted-foreground",
                  )}
                >
                  {isOwn
                    ? "Set here"
                    : `Following ${capability.effective?.source === "platform_default" ? "the platform default" : parentWord}`}
                </span>
                {capability.enforced ? (
                  <span className="flex items-center gap-1 text-[10px] text-success">
                    <ShieldCheck className="h-3 w-3" aria-hidden />
                    In force
                  </span>
                ) : (
                  <span
                    className="flex items-center gap-1 text-[10px] text-warning"
                    title={capability.enforcement_note ?? undefined}
                  >
                    <TriangleAlert className="h-3 w-3" aria-hidden />
                    Recorded, not yet obeyed
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                {capability.description}
              </p>
              {!capability.enforced && capability.enforcement_note ? (
                <p className="mt-1 text-[10px] leading-4 text-warning">
                  {capability.enforcement_note}
                </p>
              ) : null}

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <select
                  className="h-7 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                  aria-label={`Autonomy for ${capability.label}`}
                  disabled={readOnly || save.isPending}
                  value={capability.own_mode ?? effective}
                  onChange={(event) => {
                    const mode = event.target.value as AutonomyMode;
                    save.mutate({
                      scope,
                      id,
                      capability: capability.slug,
                      mode,
                      timeoutHours:
                        mode === "review_timeout"
                          ? (capability.own_timeout_hours ??
                            capability.default_timeout_hours ??
                            72)
                          : undefined,
                    });
                  }}
                >
                  {MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>

                {(capability.own_mode ?? effective) === "review_timeout" ? (
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    wait
                    <Input
                      type="number"
                      min={1}
                      className="h-7 w-20 text-xs"
                      aria-label={`Hours to wait for ${capability.label}`}
                      disabled={readOnly || save.isPending}
                      defaultValue={
                        capability.own_timeout_hours ??
                        capability.default_timeout_hours ??
                        72
                      }
                      onBlur={(event) => {
                        const hours = Number(event.target.value);
                        if (!hours || hours < 1) return;
                        save.mutate({
                          scope,
                          id,
                          capability: capability.slug,
                          mode: "review_timeout",
                          timeoutHours: hours,
                        });
                      }}
                    />
                    hours
                  </label>
                ) : null}

                {scope !== "platform" && isOwn ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px]"
                    disabled={readOnly || save.isPending}
                    onClick={() =>
                      save.mutate({
                        scope,
                        id,
                        capability: capability.slug,
                        clear: true,
                      })
                    }
                  >
                    <RotateCcw className="mr-1 h-3 w-3" aria-hidden />
                    Follow {parentWord}
                  </Button>
                ) : null}
                {save.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
