"use client";

/**
 * COMBINATIONS (C7 / KI-004) — the ONE place a site says what two or more
 * answers are worth TOGETHER, and the ONE list of what it already said.
 *
 * ARMAN'S TWO STRIKES, verbatim: "if a keyword is not an enterprise keyword,
 * and it also happens to then carry, let's say, New York with it, well, then
 * that's dead in the water because it's two strikes against you … it's not a
 * point system. It's just not a good keyword. But if it's Los Angeles, it's
 * still not great if it's a consumer keyword, but it's worth something."
 *
 * WHY THIS FILE EXISTS. The editor (`ValueComboEditor`) has been real and
 * previewed-before-save since C7, and the storage and resolver with it — and
 * zero combinations were ever created, because the only door to it was a
 * section inside the value workbench's "how value is computed" panel: a place
 * you go to READ, two screens away from where a person authors the values a
 * combination is made of. This panel is that door, put where the values live.
 *
 * ONE IMPLEMENTATION, TWO MOUNTS. The Dimensions screen shows it as a card;
 * the value workbench's explainer renders the SAME component bare. A second
 * combination list — even a read-only one — would drift the moment either
 * gained an affordance, so there is not one.
 *
 * WHAT A ROW OWES THE READER: what it fires on, what that is worth, a door to
 * the keywords currently carrying all of those values, and a way to take it
 * back off. No dead ends.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers2, ListFilter, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import { extractErrorMessage } from "@/utils/errors";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { buildBandMeta, reviewWindow } from "../lib";
import { getValueVocabulary } from "../data";
import { stampMatchHref } from "../reason-links";
import type { ValueCombo } from "../types";
import { ValueComboEditor } from "./ValueComboEditor";
import {
  archiveValueCombo,
  listValueCombos,
  valueCombosQueryKey,
  valueSurfaceQueryKeys,
} from "./data";

/** What a combination is worth, in one glance-sized token. */
function EffectChip({ combo }: { combo: ValueCombo }) {
  return (
    <span
      className={cn(
        "shrink-0 text-[11px] font-semibold tabular-nums",
        combo.effect === "never"
          ? "text-destructive"
          : combo.effect === "add"
            ? "text-success"
            : (combo.amount ?? 1) < 1
              ? "text-warning"
              : "text-success",
      )}
    >
      {combo.effect === "never"
        ? "never"
        : combo.effect === "add"
          ? `+${combo.amount}`
          : `×${combo.amount}`}
    </span>
  );
}

function comboName(combo: ValueCombo): string {
  return (
    combo.label ?? combo.combo_values.map((value) => value.value_label).join(" + ")
  );
}

export function ValueCombosPanel({
  siteId,
  brandId,
  /**
   * `card` is the Dimensions screen's own bordered panel. `bare` is the same
   * component inside a host that already carries chrome — a panel never gets a
   * second border around a component that brings its own.
   */
  variant = "card",
  className,
}: {
  siteId: string;
  brandId: string | null | undefined;
  variant?: "card" | "bare";
  className?: string;
}) {
  const queryClient = useQueryClient();
  /**
   * `?combo=<id>` — the door a keyword receipt's combination step opens. Applied
   * once; after that the reader owns the screen.
   */
  const searchParams = useSearchParams();
  const focusComboId = searchParams.get("combo");
  const focusedRef = useRef<string | null>(null);
  /** `undefined` = closed · `null` = creating · a combo = editing it. */
  const [editing, setEditing] = useState<ValueCombo | null | undefined>(
    undefined,
  );

  const combos = useQuery({
    queryKey: valueCombosQueryKey(siteId),
    queryFn: ({ signal }) => listValueCombos(siteId, signal),
    staleTime: 60_000,
  });

  /**
   * The bands the preview reports movement in. Same query key the value
   * workbench uses, so mounting this beside it costs no extra request.
   */
  const vocab = useQuery({
    queryKey: ["marketing", "value", "vocab", siteId, "value_band"],
    queryFn: ({ signal }) => getValueVocabulary(siteId, "value_band", signal),
    staleTime: 5 * 60_000,
  });
  const bandMetas = buildBandMeta(vocab.data ?? []);
  const windowRef = useRef(reviewWindow());
  const window = windowRef.current;

  useEffect(() => {
    if (!focusComboId || focusedRef.current === focusComboId) return;
    const combo = (combos.data ?? []).find((row) => row.id === focusComboId);
    if (!combo) return;
    focusedRef.current = focusComboId;
    setEditing(combo);
  }, [focusComboId, combos.data]);

  const archive = useMutation({
    mutationFn: (comboId: string) => archiveValueCombo(siteId, comboId),
    onSuccess: () => {
      toast.success("Combination removed", {
        description: "Every keyword it was scoring re-resolves without it.",
      });
      for (const key of valueSurfaceQueryKeys(siteId)) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const askRemove = async (combo: ValueCombo) => {
    const ok = await confirm({
      title: `Remove “${comboName(combo)}”?`,
      description:
        "Keywords it was scoring re-resolve immediately without it — some will change level. Your explicit keyword rulings are untouched, and the combination is archived rather than erased.",
      confirmLabel: "Remove combination",
      variant: "destructive",
    });
    if (ok) archive.mutate(combo.id);
  };

  const rows = combos.data ?? [];
  const body = (
    <>
      {combos.isLoading ? (
        <div className="space-y-1.5" aria-hidden>
          <Skeleton className="h-11 rounded-md" />
          <Skeleton className="h-11 rounded-md" />
        </div>
      ) : null}

      {combos.isError ? (
        <InlineQueryError
          what="your combinations"
          error={combos.error}
          onRetry={() => void combos.refetch()}
        />
      ) : null}

      {combos.data && rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2.5">
          <p className="text-[11px] leading-4 text-muted-foreground">
            Worth set on one answer at a time can only ever add up. A
            combination is how you say the thing adding up cannot:{" "}
            <span className="text-foreground">
              a consumer search from a city you do not serve is dead in the
              water, whatever else it has going for it
            </span>
            . Pick two to four answers, say what they are worth together, and
            see exactly which keywords move before you save.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2 h-7 gap-1 text-[11px]"
            onClick={() => setEditing(null)}
          >
            <Plus className="h-3.5 w-3.5" />
            Write your first combination
          </Button>
        </div>
      ) : null}

      <ul className="space-y-1">
        {rows.map((combo) => {
          const pairs = combo.combo_values.map((value) => ({
            dimension: value.dimension,
            value: value.value,
          }));
          return (
            <li
              key={combo.id}
              className={cn(
                "group flex items-start gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 transition-colors hover:border-primary/40",
                !combo.enabled && "opacity-70",
              )}
            >
              <button
                type="button"
                onClick={() => setEditing(combo)}
                className="min-w-0 flex-1 text-left"
                title="Edit this combination — the live preview shows what changes before you save."
              >
                <p className="flex items-center gap-1.5 text-[11px]">
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {comboName(combo)}
                  </span>
                  {combo.enabled ? null : (
                    <span className="shrink-0 rounded border border-border bg-muted/40 px-1 py-px text-[10px] text-muted-foreground">
                      off
                    </span>
                  )}
                  <EffectChip combo={combo} />
                </p>
                <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                  Fires when a keyword is{" "}
                  {combo.combo_values
                    .map(
                      (value) =>
                        `${value.dimension_label.toLowerCase()} “${value.value_label.toLowerCase()}”`,
                    )
                    .join(" and ")}
                  {combo.notes ? ` — ${combo.notes}` : ""}
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                <Link
                  href={stampMatchHref({ brandId, siteId }, pairs)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Open the keywords currently carrying all of these values"
                  aria-label={`Keywords matching ${comboName(combo)}`}
                >
                  <ListFilter className="h-3.5 w-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={() => void askRemove(combo)}
                  disabled={archive.isPending}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  title="Remove this combination"
                  aria-label={`Remove ${comboName(combo)}`}
                >
                  {archive.isPending && archive.variables === combo.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );

  const header = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Layers2 className="h-4 w-4 shrink-0 text-primary" />
      <h2 className="text-sm font-semibold text-foreground">Combinations</h2>
      {rows.length > 0 ? (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {rows.length}
        </span>
      ) : null}
      <p className="min-w-0 text-[11px] text-muted-foreground">
        Two strikes — what a set of answers is worth together
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setEditing(null)}
        className="ml-auto h-7 shrink-0 gap-1 text-[11px]"
        title="Combine two to four answers — you will see exactly which of your keywords it moves before you save."
      >
        <Plus className="h-3.5 w-3.5" />
        New combination
      </Button>
    </div>
  );

  return (
    <section
      data-surface-value="value-combinations"
      className={cn(
        variant === "card"
          ? "overflow-hidden rounded-lg border border-border bg-card"
          : "space-y-2",
        className,
      )}
    >
      {variant === "card" ? (
        <>
          <header className="border-b border-border px-3 py-2">{header}</header>
          <div className="space-y-1.5 p-3">{body}</div>
        </>
      ) : (
        <>
          {header}
          {body}
        </>
      )}

      {editing !== undefined ? (
        <ValueComboEditor
          siteId={siteId}
          window={window}
          windowLabel="the last 28 days"
          bandMetas={bandMetas}
          combo={editing}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </section>
  );
}
