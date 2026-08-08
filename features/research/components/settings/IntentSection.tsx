"use client";

// Research-intent picker — sits ABOVE the quota ladder in TopicSettingsForm.
// `rs_topic.intent_key`/`intent_brief` are written ONLY through
// `POST /research/topics/{id}/intent` (`useResearchApi().setTopicIntent`) —
// THAT endpoint composes the intent_brief and applies the intent's quota
// package. Never write `intent_key` directly to Supabase from the client;
// that would leave the brief stale and quotas untouched.
//
// Visual pattern imitates `init/AutonomySelector.tsx` (card list, icon tile,
// label + one-line description).

import { useEffect, useState } from "react";
import { Compass, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTopicContext } from "../../context/ResearchContext";
import { useResearchApi } from "../../hooks/useResearchApi";
import { getResearchIntents } from "../../service";
import type {
  ResearchIntent,
  ResearchTopic,
  TopicQuotaFields,
} from "../../types";

export interface IntentApplyResult {
  intent_key: string;
  quota_updates: Partial<TopicQuotaFields> | null;
}

interface IntentSectionProps {
  topic: ResearchTopic;
  /** Intent key currently shown (owner form keeps this in local state so it
   *  reflects an apply immediately, without waiting on a topic refetch). */
  intentKey: string | null;
  /** Fired after a successful apply — carries the new key + any quota fields
   *  the server changed, so the owner form can update its own state. */
  onApplied: (result: IntentApplyResult) => void;
  disabled?: boolean;
}

export function IntentSection({
  topic,
  intentKey,
  onApplied,
  disabled,
}: IntentSectionProps) {
  const { refresh } = useTopicContext();
  const api = useResearchApi();

  const [intents, setIntents] = useState<ResearchIntent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<ResearchIntent | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getResearchIntents();
        if (!cancelled) setIntents(data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            (err as Error).message ?? "Could not load research intents.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyIntent = async (intent: ResearchIntent) => {
    setApplying(true);
    try {
      const result = await api.setTopicIntent(topic.id, {
        intent_key: intent.key,
        apply_quotas: true,
      });
      toast.success(
        `Research intent set to "${intent.label}". Quotas updated to its package — adjust numbers after if needed.`,
      );
      setPending(null);
      onApplied(result);
      void refresh();
    } catch (err) {
      toast.error(
        (err as Error).message ?? "Could not apply research intent.",
      );
    } finally {
      setApplying(false);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
        Research Intent
      </h2>
      <p className="text-xs text-muted-foreground">
        Shapes what this topic is trying to produce — keyword phrasing,
        source mix, and how results get scored. Changing it also resets the
        pipeline limits below to that intent&apos;s package; adjust numbers
        after if needed.
      </p>

      {loadError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {loadError}
        </div>
      )}

      {!intents ? (
        <div className="flex h-9 items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading intents…
        </div>
      ) : (
        <div className="space-y-1.5">
          {!intentKey && (
            <div className="rounded-xl border border-dashed border-border/60 bg-card/20 px-2.5 py-2 text-[11px] text-muted-foreground">
              Not set (defaults) — the pipeline runs its baseline behavior.
            </div>
          )}
          {intents.map((intent) => {
            const isSelected = intent.key === intentKey;
            return (
              <button
                key={intent.key}
                type="button"
                onClick={() => {
                  if (!isSelected) setPending(intent);
                }}
                disabled={disabled || applying}
                className={cn(
                  "w-full rounded-xl border p-2.5 text-left text-foreground transition-all min-h-[44px]",
                  isSelected
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/50 hover:border-primary/20 bg-card/40",
                  (disabled || applying) && "opacity-60 pointer-events-none",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground",
                    )}
                  >
                    <Compass className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-xs text-foreground">
                      {intent.label}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-px leading-snug line-clamp-1">
                      {intent.primary_objective}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pending != null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={pending ? `Set intent to "${pending.label}"?` : ""}
        description="This rewrites the intent brief every research agent reads for this topic, and resets the pipeline limits below to this intent's package. Adjust the numbers after if needed."
        confirmLabel="Set intent"
        busy={applying}
        onConfirm={async () => {
          if (pending) await applyIntent(pending);
        }}
      />
    </section>
  );
}
