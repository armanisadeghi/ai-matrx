"use client";

/**
 * PLATFORM DEFAULT RULES — the editor.
 *
 * Arman's spec, 2026-08-25: "I can create a rule where I could put as many
 * words or phrases as I want, and then I put the type of match… and then I put
 * the effect, which could be add, subtract, multiply."
 *
 * These rules are DETERMINISTIC. `seo.fn_evaluate_matchers` runs the phrases in
 * SQL over the keyword corpus. No AI reads them and none is charged for them.
 * The exclusions are the same: plain "except when the phrase contains this".
 *
 * They are TEMPLATES. Sites adopt the platform-defaults pack and may override
 * any rule — a default is a starting point, never an enforcement.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { extractErrorMessage } from "@/utils/errors";
import { getFacetDimensionCatalog } from "@/features/marketing/seo/value-system/dimensions/data";
import {
  EFFECTS,
  MATCH_KINDS,
  deleteDefaultRule,
  listDefaultRules,
  saveDefaultRule,
  type DefaultRule,
} from "./default-rules-data";

const RULES_KEY = ["marketing", "seo", "platform-default-rules"] as const;

interface Draft {
  id: string | null;
  label: string;
  dimensionSlug: string;
  valueSlug: string;
  matchKind: string;
  phrases: string[];
  exclusions: string[];
  effect: string;
  amount: string;
}

function blankDraft(): Draft {
  return {
    id: null,
    label: "",
    dimensionSlug: "",
    valueSlug: "",
    matchKind: "word",
    phrases: [],
    exclusions: [],
    effect: "add",
    amount: "",
  };
}

function toDraft(rule: DefaultRule): Draft {
  return {
    id: rule.id,
    label: rule.label,
    dimensionSlug: rule.dimensionSlug,
    valueSlug: rule.valueSlug,
    matchKind: rule.matchKind,
    phrases: rule.phrases,
    exclusions: rule.exclusions,
    effect: rule.effect,
    amount: rule.amount === null ? "" : String(rule.amount),
  };
}

/** Comma or Enter commits a chip; a chip is removable. */
function ChipInput({
  label,
  hint,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  hint: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [text, setText] = useState("");
  const commit = () => {
    const parts = text
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
      .filter((part) => !values.includes(part));
    if (parts.length > 0) onChange([...values, ...parts]);
    setText("");
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-background p-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-xs text-foreground"
          >
            {value}
            <button
              type="button"
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((v) => v !== value))}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          placeholder={values.length === 0 ? placeholder : "add another…"}
          className="min-w-[9rem] flex-1 bg-transparent px-1 py-0.5 text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}

export function DefaultRulesEditor() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const rules = useQuery({
    queryKey: RULES_KEY,
    queryFn: ({ signal }) => listDefaultRules(signal),
  });
  const catalog = useQuery({
    queryKey: ["marketing", "seo", "facet-catalog", "platform"],
    // null = the platform catalogue alone. NOT "" — that is not a uuid.
    queryFn: ({ signal }) => getFacetDimensionCatalog(null, signal),
  });

  const dimensions = useMemo(
    () => (catalog.data ?? []).filter((d) => d.scope === "platform"),
    [catalog.data],
  );
  const activeDimension = dimensions.find(
    (d) => d.slug === draft?.dimensionSlug,
  );

  const save = useMutation({
    mutationFn: async (input: Draft) => {
      const amount =
        input.effect === "never" ? null : Number.parseFloat(input.amount);
      if (input.effect !== "never" && Number.isNaN(amount as number)) {
        throw new Error("Give the rule a number, or set it to Never valuable.");
      }
      return saveDefaultRule({
        id: input.id,
        label: input.label.trim(),
        dimensionSlug: input.dimensionSlug,
        valueSlug: input.valueSlug,
        matchKind: input.matchKind,
        phrases: input.phrases,
        exclusions: input.exclusions,
        effect: input.effect,
        amount: amount as number | null,
      });
    },
    onSuccess: async () => {
      toast.success("Rule saved");
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: RULES_KEY });
    },
    onError: (error) =>
      toast.error("Could not save that rule", {
        description: extractErrorMessage(error),
      }),
  });

  const remove = useMutation({
    mutationFn: deleteDefaultRule,
    onSuccess: async () => {
      toast.success("Rule deleted");
      await queryClient.invalidateQueries({ queryKey: RULES_KEY });
    },
    onError: (error) =>
      toast.error("Could not delete that rule", {
        description: extractErrorMessage(error),
      }),
  });

  const list = rules.data ?? [];

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Default word rules
          </h2>
          <p className="text-xs text-foreground/80">
            Every new site starts from these and can change any of them. Phrases
            are matched in the database — no AI, no cost.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setDraft(blankDraft())}
        >
          <Plus className="h-4 w-4" /> New rule
        </Button>
      </header>

      {draft ? (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-card p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">Name</span>
              <Input
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="Wants it free"
                className="h-8 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">
                Match type
              </span>
              <select
                value={draft.matchKind}
                onChange={(e) =>
                  setDraft({ ...draft, matchKind: e.target.value })
                }
                className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              >
                {MATCH_KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label} — {kind.hint}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ChipInput
            label="Words and phrases"
            hint="Type or paste, comma-separated. Any one of them fires the rule."
            values={draft.phrases}
            onChange={(phrases) => setDraft({ ...draft, phrases })}
            placeholder="free, at no cost, no charge"
          />

          <ChipInput
            label="Except when the keyword contains"
            hint="Cancels the rule. “free” should not fire on “gluten-free”."
            values={draft.exclusions}
            onChange={(exclusions) => setDraft({ ...draft, exclusions })}
            placeholder="gluten free, free radical, freehold"
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">
                What it means
              </span>
              <select
                value={draft.dimensionSlug}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    dimensionSlug: e.target.value,
                    valueSlug: "",
                  })
                }
                className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              >
                <option value="">Choose a dimension…</option>
                {dimensions.map((dimension) => (
                  <option key={dimension.slug} value={dimension.slug}>
                    {dimension.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">
                The answer it stamps
              </span>
              <select
                value={draft.valueSlug}
                disabled={!activeDimension}
                onChange={(e) =>
                  setDraft({ ...draft, valueSlug: e.target.value })
                }
                className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground disabled:opacity-50"
              >
                <option value="">
                  {activeDimension ? "Choose an answer…" : "Pick a dimension first"}
                </option>
                {(activeDimension?.values ?? []).map((value) => (
                  <option key={value.key} value={value.key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">Effect</span>
              <select
                value={draft.effect}
                onChange={(e) => setDraft({ ...draft, effect: e.target.value })}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              >
                {EFFECTS.map((effect) => (
                  <option key={effect.value} value={effect.value}>
                    {effect.label} — {effect.hint}
                  </option>
                ))}
              </select>
            </label>
            {draft.effect === "never" ? null : (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-foreground">
                  {draft.effect === "add" ? "Points (− to penalise)" : "Multiplier"}
                </span>
                <Input
                  value={draft.amount}
                  onChange={(e) =>
                    setDraft({ ...draft, amount: e.target.value })
                  }
                  placeholder={draft.effect === "add" ? "-60" : "0.2"}
                  inputMode="decimal"
                  className="h-8 text-xs"
                />
              </label>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={save.isPending}
              onClick={() => save.mutate(draft)}
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save rule
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {rules.isLoading ? (
        <p className="text-xs text-foreground/80">Loading rules…</p>
      ) : list.length === 0 ? (
        <p className="rounded-md border border-border bg-card p-3 text-xs text-foreground/80">
          No default rules yet. “New rule” writes the first one.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-xs">
            <thead className="border-b border-border">
              <tr className="text-left text-foreground">
                <th className="px-2 py-1.5 font-medium">Rule</th>
                <th className="px-2 py-1.5 font-medium">Phrases</th>
                <th className="px-2 py-1.5 font-medium">Except</th>
                <th className="px-2 py-1.5 font-medium">Means</th>
                <th className="px-2 py-1.5 text-right font-medium">Effect</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((rule) => (
                <tr key={rule.id} className="align-top">
                  <td className="px-2 py-1.5 font-medium text-foreground">
                    {rule.label}
                  </td>
                  <td className="px-2 py-1.5 text-foreground/80">
                    {rule.phrases.join(", ")}
                  </td>
                  <td className="px-2 py-1.5 text-foreground/80">
                    {rule.exclusions.length > 0
                      ? rule.exclusions.join(", ")
                      : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-foreground/80">
                    {rule.dimensionSlug} · {rule.valueSlug}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
                    {rule.effect === "never"
                      ? "Never"
                      : rule.effect === "add"
                        ? `${rule.amount && rule.amount > 0 ? "+" : ""}${rule.amount}`
                        : `×${rule.amount}`}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setDraft(toDraft(rule))}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${rule.label}`}
                        className="h-6 px-1.5 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          void confirm({
                            title: `Delete “${rule.label}”?`,
                            description:
                              "Sites that already adopted it keep their copy. New sites stop getting it.",
                            confirmLabel: "Delete",
                            variant: "destructive",
                          }).then((ok) => {
                            if (ok) remove.mutate(rule.id);
                          });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
