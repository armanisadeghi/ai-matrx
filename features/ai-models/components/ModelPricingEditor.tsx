"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, DollarSign, AlertCircle, AlertTriangle } from "lucide-react";
import type { PricingTier } from "../types";
import {
  USAGE_BASIS_OPTIONS,
  usageBasisOption,
  priceFieldLabel,
  validatePricingTiers,
  type PricingIssue,
} from "../usageBasis";

interface ModelPricingEditorProps {
  tiers: PricingTier[] | null | undefined;
  onChange: (tiers: PricingTier[]) => void;
  /** Model api_class — drives "media model needs a usage basis" validation. */
  apiClass?: string | null;
}

const NONE_BASIS = "__token__"; // shadcn Select can't use "" as an item value

function emptyTier(): PricingTier {
  return {
    max_tokens: null,
    input_price: 0,
    output_price: 0,
    cached_input_price: 0,
    usage_basis: null,
  };
}

function normalizeTier(raw: unknown): PricingTier {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    max_tokens: typeof t.max_tokens === "number" ? t.max_tokens : null,
    input_price: typeof t.input_price === "number" ? t.input_price : 0,
    output_price: typeof t.output_price === "number" ? t.output_price : 0,
    cached_input_price:
      typeof t.cached_input_price === "number" ? t.cached_input_price : 0,
    usage_basis: typeof t.usage_basis === "string" && t.usage_basis ? t.usage_basis : null,
    note: typeof t.note === "string" ? t.note : null,
  };
}

function normalizeTiers(raw: PricingTier[] | null | undefined): PricingTier[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeTier);
}

function formatPrice(p: number | null | undefined): string {
  if (p == null || !isFinite(p)) return "$—";
  return `$${p.toFixed(p < 0.01 ? 6 : p < 1 ? 3 : 2)}`;
}

function PriceInput({
  label,
  value,
  onChange,
  description,
  muted,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number) => void;
  description?: string;
  muted?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label
        className={`text-xs ${muted ? "text-muted-foreground/50" : "text-muted-foreground"}`}
      >
        {label}
      </Label>
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          $
        </span>
        <Input
          type="number"
          step="0.000001"
          min="0"
          value={value ?? 0}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className={`h-7 text-xs pl-5 font-mono ${muted ? "opacity-50" : ""}`}
        />
      </div>
      {description && (
        <p className="text-xs text-muted-foreground/70">{description}</p>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: PricingIssue }) {
  const isError = issue.severity === "error";
  return (
    <div
      className={`flex items-start gap-1.5 text-xs ${
        isError ? "text-destructive" : "text-amber-600 dark:text-amber-500"
      }`}
    >
      {isError ? (
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      )}
      <span>{issue.message}</span>
    </div>
  );
}

export default function ModelPricingEditor({
  tiers: rawTiers,
  onChange,
  apiClass,
}: ModelPricingEditorProps) {
  const tiers = normalizeTiers(rawTiers);
  const issues = validatePricingTiers(apiClass, tiers);

  const updateTier = (index: number, patch: Partial<PricingTier>) => {
    const next = tiers.map((t, i) => (i === index ? { ...t, ...patch } : t));
    onChange(next);
  };

  const addTier = () => onChange([...tiers, emptyTier()]);
  const removeTier = (index: number) => onChange(tiers.filter((_, i) => i !== index));

  const hasMultipleTiers = tiers.length > 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Pricing Tiers</span>
          {tiers.length === 0 && (
            <Badge
              variant="outline"
              className="text-xs text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20"
            >
              No pricing set
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={addTier}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Tier
        </Button>
      </div>

      {tiers.length === 0 && (
        <div className="rounded-md border border-dashed p-6 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No pricing configured for this model.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Click &quot;Add Tier&quot; to define prices. Pick the correct billing
            basis (token / per-image / per-second / per-character …).
          </p>
        </div>
      )}

      <div className="space-y-3">
        {tiers.map((tier, i) => {
          const opt = usageBasisOption(tier.usage_basis);
          const tierIssues = issues.filter((iss) => iss.tierIndex === i);
          const inputBilled = !tier.usage_basis || opt.billedField === "input_price";
          const outputBilled = !tier.usage_basis || opt.billedField === "output_price";
          return (
            <div key={i} className="rounded-md border bg-card p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Tier {i + 1}
                  </span>
                  {i === tiers.length - 1 && hasMultipleTiers && (
                    <Badge variant="outline" className="text-xs h-4 px-1">
                      highest
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => removeTier(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Billing basis — the unit every price below is measured in. */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Billing basis</Label>
                <Select
                  value={tier.usage_basis || NONE_BASIS}
                  onValueChange={(v) =>
                    updateTier(i, { usage_basis: v === NONE_BASIS ? null : v })
                  }
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USAGE_BASIS_OPTIONS.map((o) => (
                      <SelectItem
                        key={o.value || NONE_BASIS}
                        value={o.value || NONE_BASIS}
                        className="text-xs"
                      >
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground/70">{opt.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <PriceInput
                  label={priceFieldLabel(tier.usage_basis, "input_price")}
                  value={tier.input_price}
                  onChange={(v) => updateTier(i, { input_price: v })}
                  muted={!inputBilled}
                />
                <PriceInput
                  label={priceFieldLabel(tier.usage_basis, "output_price")}
                  value={tier.output_price}
                  onChange={(v) => updateTier(i, { output_price: v })}
                  muted={!outputBilled}
                />
                <PriceInput
                  label={priceFieldLabel(tier.usage_basis, "cached_input_price")}
                  value={tier.cached_input_price}
                  onChange={(v) => updateTier(i, { cached_input_price: v })}
                  description="Cache read discount"
                  muted={!!tier.usage_basis}
                />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Max Tokens Threshold
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="null = no limit / highest tier"
                    value={tier.max_tokens ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      updateTier(i, {
                        max_tokens: raw === "" ? null : parseInt(raw),
                      });
                    }}
                    className="h-7 text-xs font-mono"
                  />
                  <p className="text-xs text-muted-foreground/70">
                    Leave empty for the final/only tier
                  </p>
                </div>
              </div>

              {tierIssues.length > 0 && (
                <div className="space-y-1 pt-1 border-t">
                  {tierIssues.map((iss, k) => (
                    <IssueRow key={k} issue={iss} />
                  ))}
                </div>
              )}

              {/* Summary row */}
              <div className="flex items-center gap-3 pt-1 border-t text-xs text-muted-foreground font-mono">
                <span>{opt.label}</span>
                {inputBilled && <span>in {formatPrice(tier.input_price)}</span>}
                {outputBilled && <span>out {formatPrice(tier.output_price)}</span>}
                {!tier.usage_basis && (
                  <span>cached {formatPrice(tier.cached_input_price)}</span>
                )}
                {tier.max_tokens != null && (
                  <span className="text-muted-foreground/60">
                    ≤ {tier.max_tokens.toLocaleString()} tokens
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasMultipleTiers && (
        <div className="rounded-md bg-muted/50 border p-2.5 text-xs text-muted-foreground space-y-1">
          <p className="font-medium">Tiered pricing note:</p>
          <p>
            Tiers apply based on the prompt context length. The last tier
            (max_tokens = null) covers all prompts above the previous threshold.
            Order tiers from smallest to largest.
          </p>
        </div>
      )}
    </div>
  );
}
