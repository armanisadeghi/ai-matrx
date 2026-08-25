"use client";

/**
 * Autonomy modes (KI-044) — how much rope each AI step gets, at any rung of the
 * settings ladder (platform → organization → brand → site).
 *
 * Policy: /policies/human-in-the-loop-autonomy-modes.md — five modes, a platform
 * default, and the tiers below may override it.
 *
 * A capability whose running code doesn't consult this setting yet is marked
 * "Not enforced" — hover it for why. Keep this screen terse: a name, a mode
 * picker, and a one-word status. No paragraphs.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  ExternalLink,
  Loader2,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { fetchMandateAssignments } from "@/features/agents/mandates/service";
import { agentHref } from "@/features/admin/mandates/mandate-health";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import {
  getAutonomyModes,
  setAutonomyMode,
  type AutonomyMode,
  type SettingsScope,
} from "./data";

const MODES: Array<{ value: AutonomyMode; label: string; hint: string }> = [
  {
    value: "auto_platform",
    label: "Auto (platform rules)",
    hint: "Runs by itself, using the platform's rules.",
  },
  {
    value: "auto_org",
    label: "Auto (your rules)",
    hint: "Runs by itself, using your organization's rules.",
  },
  {
    value: "review_timeout",
    label: "Review, then auto",
    hint: "Waits for a person; runs on its own if nobody answers in time.",
  },
  {
    value: "review_required",
    label: "Review required",
    hint: "Never runs until a person approves it.",
  },
  {
    value: "off",
    label: "Off",
    hint: "Does not run at all, and says so where its work would have appeared.",
  },
];

/**
 * Stable code-to-mandate connections. The Holder behind each key stays in the
 * database and is resolved below; agent ids and names never live here.
 */
const CAPABILITY_MANDATES: Readonly<Record<string, readonly string[]>> = {
  keyword_classifier: ["seo.keyword_classifier"],
  topic_assigner: ["seo.topic_assigner"],
};

const MANDATE_KEYS = ["seo.keyword_classifier", "seo.topic_assigner"] as const;

const UNASSIGNED_EXPLANATION: Readonly<Record<string, string>> = {
  place_detection: "Deterministic · no mandate or agent",
  matcher_engine: "Deterministic · no mandate or agent",
  meaning_suggestions: "Shared proposal path · no dedicated mandate or agent",
};

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
  const assignments = useQuery({
    queryKey: ["agent", "mandate-assignments", ...MANDATE_KEYS],
    queryFn: () => fetchMandateAssignments(MANDATE_KEYS),
    staleTime: 5 * 60 * 1000,
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
  const parentWord = data.parent?.label ?? "the platform";

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">AI autonomy</h3>
        <span className="text-xs text-muted-foreground">
          {scope === "platform"
            ? "Defaults for every site"
            : `Unset rows follow ${parentWord}`}
        </span>
      </div>

      <ul className="mt-2 divide-y divide-border">
        {data.capabilities.map((capability) => {
          const isOwn = capability.own_mode !== null;
          const effective =
            capability.effective?.mode ?? capability.default_mode;
          const currentMode = capability.own_mode ?? effective;
          const mandateKeys = CAPABILITY_MANDATES[capability.slug] ?? [];

          return (
            <li key={capability.slug} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">
                      {capability.label}
                    </span>
                    {isOwn ? (
                      <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        Custom
                      </span>
                    ) : null}
                    {capability.enforced ? (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-success">
                        <ShieldCheck className="h-3 w-3" aria-hidden />
                        Live
                      </span>
                    ) : (
                      <span
                        className="flex items-center gap-1 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning"
                        title={
                          capability.enforcement_note ??
                          "Not wired to running code yet."
                        }
                      >
                        <TriangleAlert className="h-3 w-3" aria-hidden />
                        Not enforced
                      </span>
                    )}
                  </div>
                  {capability.description ? (
                    <p
                      className="mt-0.5 line-clamp-1 max-w-md text-xs text-foreground/80"
                      title={capability.description}
                    >
                      {capability.description}
                    </p>
                  ) : null}
                  <div className="mt-1 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    {mandateKeys.length > 0 ? (
                      mandateKeys.map((mandateKey) => {
                        const assignment = assignments.data?.[mandateKey];
                        return (
                          <span
                            key={mandateKey}
                            className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1"
                          >
                            <span className="text-muted-foreground">
                              Mandate
                            </span>
                            <Link
                              href={`/administration/agents/mandates?mandate=${encodeURIComponent(mandateKey)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Open ${mandateKey} in Mandates`}
                              className="inline-flex items-center gap-1 font-mono text-foreground underline-offset-2 hover:text-primary hover:underline"
                            >
                              {mandateKey}
                              <ExternalLink
                                className="h-2.5 w-2.5"
                                aria-hidden
                              />
                            </Link>
                            <span className="text-muted-foreground">
                              · Agent
                            </span>
                            {assignments.isPending ? (
                              <Skeleton className="h-3 w-24" />
                            ) : assignment?.agentName &&
                              assignment.agentType ? (
                              <EntityRef
                                token="agent"
                                id={assignment.agentId}
                                name={assignment.agentName}
                                href={agentHref(
                                  assignment.agentId,
                                  assignment.agentType,
                                )}
                                openInNewTab
                                showIcon={false}
                                labelClassName="font-medium"
                              />
                            ) : (
                              <span
                                className="font-medium text-warning"
                                title={
                                  assignments.error instanceof Error
                                    ? assignments.error.message
                                    : "Open the mandate to inspect or repair its Holder."
                                }
                              >
                                Assignment unavailable
                              </span>
                            )}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-muted-foreground">
                        {UNASSIGNED_EXPLANATION[capability.slug] ??
                          "No mandate or agent assigned"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                    aria-label={`Autonomy for ${capability.label}`}
                    disabled={readOnly || save.isPending}
                    value={currentMode}
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
                      <option
                        key={mode.value}
                        value={mode.value}
                        title={mode.hint}
                      >
                        {mode.label}
                      </option>
                    ))}
                  </select>

                  {currentMode === "review_timeout" ? (
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      wait
                      <Input
                        type="number"
                        min={1}
                        className="h-7 w-16 text-xs"
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
                      hrs
                    </label>
                  ) : null}

                  {scope !== "platform" && isOwn ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      title={`Follow ${parentWord}`}
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
                      <RotateCcw className="h-3 w-3" aria-hidden />
                    </Button>
                  ) : null}
                  {save.isPending ? (
                    <Loader2
                      className="h-3 w-3 animate-spin text-muted-foreground"
                      aria-hidden
                    />
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
