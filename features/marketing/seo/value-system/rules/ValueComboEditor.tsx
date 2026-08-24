"use client";

/**
 * THE COMBINATION EDITOR (C7) — worth on a SET of values instead of one.
 *
 * Arman, on why a single-value multiplier could never say this: "if a keyword
 * is not an enterprise keyword, and it also happens to then carry, let's say,
 * New York with it, well, then that's dead in the water because it's two
 * strikes against you … it's not a point system. It's just not a good keyword.
 * But if it's Los Angeles, it's still not great if it's a consumer keyword,
 * but it's worth something."
 *
 * So a combination is ALL-OF: it fires only when every value it names is
 * stamped on the keyword at once, and it then contributes exactly like any
 * other worth — adds, then factors, then never — and shows up as one more step
 * in the keyword's receipt.
 *
 *   THE VALUE PICKER IS THE LIVE REGISTRY. Dimensions and values come from
 *   `seo.facet_dimension_catalog(site)`, never a hardcoded list, so a
 *   dimension invented this afternoon is combinable this afternoon.
 *
 *   NOTHING SAVES BLIND. `seo.gsc_value_combo_preview` measures the proposal
 *   against this site's real Search Console keywords, server-side, over the
 *   same effective stamps the resolver reads — and the save button states how
 *   many keywords change band.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 */

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Layers2, Plus, Trash2, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import { extractErrorMessage } from "@/utils/errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CreatablePicker } from "../pickers/CreatablePicker";
import { AddDimensionDialog } from "../pickers/AddDimensionDialog";
import { useQuickAdd } from "../pickers/useQuickAdd";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { useDebounce } from "@/hooks/usehooks/useDebounce";
import type { BandMeta } from "../lib";
import type { ValueCombo } from "../types";
import { ImpactPanel } from "./ImpactPanel";
import {
  archiveValueCombo,
  facetDimensionsQueryKey,
  listFacetDimensions,
  previewValueCombo,
  saveValueCombo,
  valueSurfaceQueryKeys,
} from "./data";
import {
  COMBO_MAX_VALUES,
  COMBO_MIN_VALUES,
  type ComboEffect,
  type FacetDimension,
  type ValueComboFormState,
} from "./types";

const EMPTY: ValueComboFormState = {
  valueIds: [],
  effect: "never",
  amount: "",
  label: "",
  notes: "",
  enabled: true,
};

function comboToForm(combo: ValueCombo): ValueComboFormState {
  return {
    valueIds: combo.value_ids,
    effect: combo.effect,
    amount: combo.amount === null ? "" : String(combo.amount),
    label: combo.label ?? "",
    notes: combo.notes ?? "",
    enabled: combo.enabled,
  };
}

const EFFECTS: Array<{ key: ComboEffect; label: string; hint: string }> = [
  {
    key: "never",
    label: "Never",
    hint: "Dead in the water. The score is zero whenever all of these are true together, no matter what else the keyword has going for it.",
  },
  {
    key: "scale",
    label: "Worth less / more",
    hint: "Multiplies whatever the keyword already earned. Under 1 demotes it, over 1 promotes it. It never invents value out of nothing.",
  },
  {
    key: "add",
    label: "Adds worth",
    hint: "Adds a flat amount to the score. Use this when the pair itself is the good news, not just a modifier.",
  },
];

interface PickedValue {
  value_id: string;
  dimension_label: string;
  value_label: string;
}

/** What the picked ids MEAN, resolved against the live registry. */
function resolvePicked(
  valueIds: string[],
  dimensions: FacetDimension[],
): Array<PickedValue | { value_id: string; unknown: true }> {
  return valueIds.map((id) => {
    for (const dimension of dimensions) {
      const value = dimension.facet_values.find((v) => v.value_id === id);
      if (value) {
        return {
          value_id: id,
          dimension_label: dimension.label,
          value_label: value.label,
        };
      }
    }
    return { value_id: id, unknown: true as const };
  });
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-[11px] font-medium text-foreground">{label}</span>
      {children}
      {hint ? (
        <span className="block text-[10px] leading-4 text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

/** Everything wrong with the draft, in the order a person would fix it. */
function draftIssues(form: ValueComboFormState): string[] {
  const issues: string[] = [];
  if (form.valueIds.length < COMBO_MIN_VALUES) {
    issues.push(
      `Pick at least ${COMBO_MIN_VALUES} values. One value on its own is ordinary worth — set that on the value itself.`,
    );
  }
  if (form.valueIds.length > COMBO_MAX_VALUES) {
    issues.push(`A combination holds at most ${COMBO_MAX_VALUES} values.`);
  }
  if (form.effect !== "never") {
    const amount = Number(form.amount.trim());
    if (!form.amount.trim() || !Number.isFinite(amount)) {
      issues.push("Enter an amount.");
    } else if (form.effect === "scale" && (amount < 0.05 || amount > 5)) {
      issues.push(
        "A scale factor is between 0.05 and 5. It multiplies what the keyword already earned — for “worthless” use Never instead.",
      );
    }
  }
  return issues;
}

export function ValueComboEditor({
  siteId,
  window,
  windowLabel,
  bandMetas,
  combo,
  onClose,
}: {
  siteId: string;
  window: { start: string; end: string };
  windowLabel: string;
  bandMetas: BandMeta[];
  /** null = creating a new combination. */
  combo: ValueCombo | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ValueComboFormState>(() =>
    combo ? comboToForm(combo) : EMPTY,
  );
  const { quickAdd } = useQuickAdd(siteId);
  // P23 — what was typed into the dimension picker when it matched nothing.
  const [newDimensionDraft, setNewDimensionDraft] = useState<string | null>(null);
  const [pickDimension, setPickDimension] = useState("");
  const [pickValue, setPickValue] = useState("");
  const set = <K extends keyof ValueComboFormState>(
    key: K,
    value: ValueComboFormState[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const dimensions = useQuery({
    queryKey: facetDimensionsQueryKey(siteId),
    queryFn: ({ signal }) => listFacetDimensions(siteId, signal),
    staleTime: 5 * 60_000,
  });

  const selectedDimension: FacetDimension | undefined = (dimensions.data ?? []).find(
    (dimension) => dimension.slug === pickDimension,
  );
  const picked = resolvePicked(form.valueIds, dimensions.data ?? []);

  const addValue = () => {
    const value = selectedDimension?.facet_values.find((v) => v.key === pickValue);
    if (!value) return;
    if (form.valueIds.includes(value.value_id)) return;
    setForm((prev) => ({ ...prev, valueIds: [...prev.valueIds, value.value_id] }));
    setPickValue("");
  };

  const removeValue = (valueId: string) =>
    setForm((prev) => ({
      ...prev,
      valueIds: prev.valueIds.filter((id) => id !== valueId),
    }));

  const issues = draftIssues(form);
  const ready = issues.length === 0;
  const debounced = useDebounce(form, 450);
  const debouncedReady = draftIssues(debounced).length === 0;
  const debouncedAmount =
    debounced.effect === "never" ? null : Number(debounced.amount.trim());

  const preview = useQuery({
    queryKey: [
      "seo",
      "value-combos",
      "preview",
      siteId,
      window.start,
      window.end,
      combo?.id ?? "new",
      debounced.valueIds.join("|"),
      debounced.effect,
      debouncedAmount,
    ],
    enabled: debouncedReady,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      previewValueCombo(
        {
          siteId,
          start: window.start,
          end: window.end,
          valueIds: debounced.valueIds,
          effect: debounced.effect,
          amount: debouncedAmount,
          comboId: combo?.id ?? null,
        },
        signal,
      ),
  });

  const invalidate = () => {
    for (const key of valueSurfaceQueryKeys(siteId)) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const save = useMutation({
    mutationFn: () =>
      saveValueCombo(
        siteId,
        {
          valueIds: form.valueIds,
          effect: form.effect,
          amount: form.effect === "never" ? null : Number(form.amount.trim()),
          label: form.label,
          notes: form.notes,
          enabled: form.enabled,
        },
        combo?.id ?? null,
      ),
    onSuccess: () => {
      const moved = preview.data?.moved_keywords ?? 0;
      toast.success(combo ? "Combination updated" : "Combination saved", {
        description:
          moved > 0
            ? `${moved} keyword${moved === 1 ? "" : "s"} changed band.`
            : "No keyword changes band today — it will apply the moment one carries all of these.",
      });
      invalidate();
      onClose();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const archive = useMutation({
    mutationFn: async () => {
      if (!combo) return;
      await archiveValueCombo(siteId, combo.id);
    },
    onSuccess: () => {
      toast.success("Combination archived", {
        description: "Every keyword it was scoring re-resolves without it.",
      });
      invalidate();
      onClose();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const askArchive = async () => {
    const ok = await confirm({
      title: "Archive this combination?",
      description:
        "Keywords it was scoring re-resolve immediately without it — some will change band. Your explicit keyword rulings are untouched.",
      confirmLabel: "Archive combination",
      variant: "destructive",
    });
    if (ok) archive.mutate();
  };

  const busy = save.isPending || archive.isPending;
  const moved = preview.data?.moved_keywords ?? 0;
  const effectHint = EFFECTS.find((e) => e.key === form.effect)?.hint ?? "";

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="flex max-h-[92dvh] w-[min(58rem,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b border-border px-4 pt-4 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Layers2 className="h-4 w-4 text-primary" aria-hidden />
            {combo ? "Edit combination" : "New combination"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Two things that are each only so-so can be fatal together. A
            combination fires only when a keyword carries <em>all</em> of the
            values you name — “consumer <em>and</em> New York” — and it is not a
            point system: you say outright what that pairing is worth.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          {/* ── The combination ── */}
          <div className="min-h-0 space-y-3 overflow-y-auto border-border p-4 scrollbar-thin md:border-r">
            <div className="space-y-1.5">
              <span className="block text-[11px] font-medium text-foreground">
                All of these at once
              </span>
              {picked.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
                  Nothing picked yet. Add {COMBO_MIN_VALUES}–{COMBO_MAX_VALUES}{" "}
                  values — the combination fires only on keywords carrying every
                  one of them.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1">
                  {picked.map((item) => (
                    <li key={item.value_id}>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]",
                          "unknown" in item
                            ? "border-warning/40 bg-warning/10 text-warning"
                            : "border-border bg-card text-foreground",
                        )}
                      >
                        {"unknown" in item ? (
                          "A value that no longer exists"
                        ) : (
                          <>
                            <span className="text-muted-foreground">
                              {item.dimension_label}:
                            </span>
                            {item.value_label}
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => removeValue(item.value_id)}
                          className="text-muted-foreground transition-colors hover:text-destructive"
                          aria-label="Remove this value from the combination"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {dimensions.isLoading ? (
              <div className="space-y-1.5">
                <Skeleton className="h-8 rounded-md" />
                <Skeleton className="h-8 rounded-md" />
              </div>
            ) : dimensions.isError ? (
              <InlineQueryError
                what="your keyword dimensions"
                error={dimensions.error}
                onRetry={() => void dimensions.refetch()}
              />
            ) : (dimensions.data ?? []).length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
                No dimensions are registered yet, so there is nothing to
                combine.
              </p>
            ) : form.valueIds.length >= COMBO_MAX_VALUES ? (
              <p className="rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
                That is the most values one combination holds. More conditions
                than this is a rule nobody can read back later.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <Field label="Dimension">
                  {/* P23 — invent the dimension here rather than abandoning
                      the combination to go and create it elsewhere. */}
                  <CreatablePicker
                    value={pickDimension || null}
                    onSelect={(v) => {
                      setPickDimension(v);
                      setPickValue("");
                    }}
                    placeholder="Choose a dimension"
                    noun="dimension"
                    ariaLabel="Combination dimension"
                    loading={dimensions.isPending}
                    onCreateRequiresMore={(typed) => setNewDimensionDraft(typed)}
                    options={(dimensions.data ?? []).map((dimension) => ({
                      value: dimension.slug,
                      label: dimension.label,
                      hint: dimension.scope === "site" ? "yours" : undefined,
                    }))}
                  />
                </Field>
                <Field
                  label="Is"
                  hint={
                    selectedDimension
                      ? `${selectedDimension.keyword_count} keywords carry this dimension`
                      : undefined
                  }
                >
                  <CreatablePicker
                    value={pickValue || null}
                    onSelect={setPickValue}
                    disabled={!selectedDimension}
                    placeholder="Choose a value"
                    noun="value"
                    ariaLabel="Combination value"
                    options={(selectedDimension?.facet_values ?? [])
                      .filter((value) => !form.valueIds.includes(value.value_id))
                      .map((value) => ({
                        value: value.key,
                        label: value.label,
                        hint:
                          value.keyword_count > 0
                            ? `${value.keyword_count.toLocaleString()} kw`
                            : undefined,
                      }))}
                    lockedNote={
                      selectedDimension && selectedDimension.scope !== "site"
                        ? `“${selectedDimension.label}” is a shared dimension every business uses, so its choices are platform-governed.`
                        : undefined
                    }
                    lockedAction={
                      selectedDimension && selectedDimension.scope !== "site"
                        ? {
                            label: "Make this your own dimension instead",
                            onSelect: () =>
                              setNewDimensionDraft(selectedDimension.label),
                          }
                        : undefined
                    }
                    onCreate={async (typed) => {
                      if (!selectedDimension) return null;
                      const created = await quickAdd(typed, {
                        dimensionId: selectedDimension.dimension_id,
                      });
                      if (!created) return null;
                      await dimensions.refetch();
                      return created.value_key;
                    }}
                  />
                </Field>
                <div className="flex items-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addValue}
                    disabled={!pickValue}
                    className="h-8 gap-1 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Add
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <span className="block text-[11px] font-medium text-foreground">
                When all of them are true, this keyword is
              </span>
              <div className="flex gap-1 rounded-md border border-border p-0.5">
                {EFFECTS.map((effect) => (
                  <button
                    key={effect.key}
                    type="button"
                    onClick={() => set("effect", effect.key)}
                    className={cn(
                      "flex-1 rounded px-2 py-1 text-[11px] transition-colors",
                      form.effect === effect.key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {effect.label}
                  </button>
                ))}
              </div>
              <span className="block text-[10px] leading-4 text-muted-foreground">
                {effectHint}
              </span>
            </div>

            {form.effect !== "never" ? (
              <Field
                label={form.effect === "scale" ? "Multiplier" : "Amount to add"}
                hint={
                  form.effect === "scale"
                    ? "0.2 = a fifth of what it was worth. Between 0.05 and 5."
                    : "Added before any multiplier runs — order is always add, then scale, then never."
                }
              >
                <Input
                  value={form.amount}
                  onChange={(e) => set("amount", e.target.value)}
                  inputMode="decimal"
                  placeholder={form.effect === "scale" ? "0.3" : "10"}
                  className={cn(
                    "h-8 w-28 text-sm tabular-nums",
                    form.effect === "scale" && Number(form.amount) > 1 && "text-success",
                    form.effect === "scale" &&
                      Number(form.amount) > 0 &&
                      Number(form.amount) < 1 &&
                      "text-warning",
                  )}
                />
              </Field>
            ) : null}

            <Field
              label="Name (optional)"
              hint="What you will call this in the ledger and in every keyword's why chain. Left empty, it names itself after the values."
            >
              <Input
                value={form.label}
                onChange={(e) => set("label", e.target.value)}
                placeholder="Consumer + out of market"
                className="h-8 text-sm"
              />
            </Field>

            <Field
              label="Why (optional)"
              hint="The reasoning survives you. Every keyword this touches shows it."
            >
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                placeholder="A consumer searching from a city we do not serve is two strikes — there is no job here at any price."
                className="text-xs"
              />
            </Field>

            {issues.length > 0 ? (
              <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2">
                {issues.map((issue) => (
                  <li key={issue} className="text-[11px] leading-4 text-warning">
                    {issue}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* ── What it does ── */}
          <div className="min-h-0 space-y-2 overflow-y-auto bg-muted/20 p-4 scrollbar-thin">
            <p className="text-xs font-semibold text-foreground">
              What this does to your keywords
            </p>
            <ImpactPanel
              impact={preview.data}
              isPending={preview.isPending}
              isFetching={preview.isFetching}
              error={preview.error}
              onRetry={() => void preview.refetch()}
              bandMetas={bandMetas}
              incomplete={
                debouncedReady
                  ? null
                  : `Pick ${COMBO_MIN_VALUES}–${COMBO_MAX_VALUES} values and say what they are worth together, and this will show exactly which of your keywords change band — before you save.`
              }
              windowLabel={windowLabel}
              nothingMatchedHint="No keyword in this window carries all of these values at once. That is normal for a sharp combination — it will apply the moment one does. Check each value on its own first: a value nothing is stamped with can never be half of a pair."
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-border px-4 pt-3 pb-4">
          <div>
            {combo ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void askArchive()}
                disabled={busy}
                className="h-8 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Archive
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => save.mutate()}
              disabled={!ready || busy}
              className="gap-1.5"
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              {moved > 0
                ? `Save — ${moved} keyword${moved === 1 ? "" : "s"} move`
                : combo
                  ? "Save changes"
                  : "Save combination"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      {newDimensionDraft !== null ? (
        <AddDimensionDialog
          siteId={siteId}
          initialLabel={newDimensionDraft}
          onCancel={() => setNewDimensionDraft(null)}
          onCreated={(created) => {
            setNewDimensionDraft(null);
            void dimensions.refetch();
            setPickDimension(created.dimension_slug);
            setPickValue(created.value_key);
          }}
        />
      ) : null}
    </Dialog>
  );
}
