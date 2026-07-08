"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
  DollarSign,
} from "lucide-react";
import { aiModelService } from "../service";
import type { AiModel, PricingTier } from "../types";
import type { ModelAuditResult, AuditRuleConfig } from "./auditTypes";
import {
  AuditTableShell,
  Th,
  StatusBadge,
  IssueList,
  ProviderBadge,
  ModelNameCell,
} from "./AuditTableShell";
import ModelDetailSheet, { OpenDetailButton } from "./ModelDetailSheet";

interface PricingAuditTabProps {
  results: ModelAuditResult[];
  rules: AuditRuleConfig;
  allModels: AiModel[];
  onModelUpdated: (id: string, patch: Partial<AiModel>) => void;
}

function emptyTier(): PricingTier {
  return {
    max_tokens: null,
    input_price: 0,
    output_price: 0,
    cached_input_price: 0,
  };
}

function formatPrice(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  return `$${p.toFixed(p < 0.01 ? 4 : p < 1 ? 3 : 2)}`;
}

function InlinePricingEditor({
  model,
  onSaved,
}: {
  model: AiModel;
  onSaved: (tiers: PricingTier[]) => void;
}) {
  const [tiers, setTiers] = useState<PricingTier[]>(
    model.pricing ?? [emptyTier()],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateTier = (i: number, patch: Partial<PricingTier>) =>
    setTiers((prev) =>
      prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)),
    );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await aiModelService.patchField(
        model.id,
        "pricing",
        tiers as unknown as AiModel["pricing"],
      );
      onSaved(tiers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-1 space-y-2 bg-muted/30 rounded-md p-3 border">
      {tiers.map((tier, i) => (
        <div key={i} className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground">
              Input $/1M
            </span>
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={tier.input_price}
              onChange={(e) =>
                updateTier(i, { input_price: parseFloat(e.target.value) || 0 })
              }
              className="h-7 text-xs w-24 font-mono"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground">
              Output $/1M
            </span>
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={tier.output_price}
              onChange={(e) =>
                updateTier(i, { output_price: parseFloat(e.target.value) || 0 })
              }
              className="h-7 text-xs w-24 font-mono"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground">
              Cached $/1M
            </span>
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={tier.cached_input_price}
              onChange={(e) =>
                updateTier(i, {
                  cached_input_price: parseFloat(e.target.value) || 0,
                })
              }
              className="h-7 text-xs w-24 font-mono"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground">
              Max tokens
            </span>
            <Input
              type="number"
              min="0"
              placeholder="∞"
              value={tier.max_tokens ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                updateTier(i, {
                  max_tokens: raw === "" ? null : parseInt(raw),
                });
              }}
              className="h-7 text-xs w-24 font-mono"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive self-end"
            onClick={() =>
              setTiers((prev) => prev.filter((_, idx) => idx !== i))
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[11px] gap-1"
          onClick={() => setTiers((prev) => [...prev, emptyTier()])}
        >
          <Plus className="h-3 w-3" /> Add Tier
        </Button>
        <Button
          size="sm"
          className="h-6 px-2 text-[11px] gap-1"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          Save
        </Button>
        {error && <span className="text-destructive text-[10px]">{error}</span>}
      </div>
    </div>
  );
}

export default function PricingAuditTab({
  results,
  allModels,
  onModelUpdated,
}: PricingAuditTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [showPassingModels, setShowPassingModels] = useState(false);
  const [detailModelId, setDetailModelId] = useState<string | null>(null);

  const pricingResults = results.map((r) => ({
    ...r,
    issues: r.issues.filter((i) => i.category === "pricing"),
    pass: r.categoryPass.pricing,
  }));

  const failingResults = pricingResults.filter((r) => !r.pass);
  const passingResults = pricingResults.filter((r) => r.pass);
  const displayResults = showPassingModels ? pricingResults : failingResults;

  const handleSaved = (modelId: string, tiers: PricingTier[]) => {
    onModelUpdated(modelId, { pricing: tiers });
    setSavedIds((prev) => new Set([...prev, modelId]));
    setExpandedId(null);
  };

  return (
    <>
      <div className="flex flex-col h-full min-h-0">
        {/* Sub-header */}
        <div className="flex items-center gap-3 px-3 py-2 border-b shrink-0 bg-muted/20">
          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-destructive">
              {failingResults.length} failing
            </span>
            {" · "}
            <span className="font-medium text-green-600">
              {passingResults.length} passing
            </span>
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => setShowPassingModels((v) => !v)}
          >
            {showPassingModels ? "Hide passing" : "Show all"}
          </Button>
        </div>

        <AuditTableShell
          isEmpty={displayResults.length === 0}
          empty={
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="h-10 w-10 text-green-500 opacity-60" />
              <p className="text-sm">All models pass pricing audit</p>
            </div>
          }
          headers={
            <>
              <Th className="w-6" />
              <Th>Model</Th>
              <Th className="w-28">Provider</Th>
              <Th className="w-16">Status</Th>
              <Th>Current Pricing</Th>
              <Th className="w-40">Issues</Th>
              <Th className="w-20 text-right">Action</Th>
            </>
          }
        >
          {displayResults.map((r, idx) => {
            const { model } = r;
            const isExpanded = expandedId === model.id;
            const wasSaved = savedIds.has(model.id);
            const pricing = model.pricing ?? [];

            return (
              <React.Fragment key={model.id}>
                <tr
                  className={`h-10 border-b border-border ${idx % 2 === 0 ? "" : "bg-muted/20"}`}
                >
                  <td className="px-1.5 py-1.5">
                    <OpenDetailButton
                      onClick={() => setDetailModelId(model.id)}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <ModelNameCell
                      name={model.name}
                      commonName={model.common_name}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <ProviderBadge provider={model.provider} />
                  </td>
                  <td className="px-3 py-1.5">
                    {wasSaved ? (
                      <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                      </span>
                    ) : (
                      <StatusBadge pass={r.pass} />
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {pricing.length === 0 ? (
                      <span className="text-destructive/70 text-xs font-medium">
                        Not set
                      </span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {pricing.map((t, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-mono text-muted-foreground whitespace-nowrap"
                          >
                            in {formatPrice(t.input_price)} · out{" "}
                            {formatPrice(t.output_price)}
                            {t.max_tokens != null &&
                              ` · ≤${t.max_tokens.toLocaleString()}`}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <IssueList issues={r.issues} />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Button
                      variant={isExpanded ? "default" : "outline"}
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : model.id)
                      }
                    >
                      {isExpanded ? "Collapse" : "Edit"}
                    </Button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className={idx % 2 === 0 ? "" : "bg-muted/20"}>
                    <td colSpan={8} className="px-3 pb-3">
                      <InlinePricingEditor
                        model={model}
                        onSaved={(tiers) => handleSaved(model.id, tiers)}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </AuditTableShell>
      </div>

      <ModelDetailSheet
        modelId={detailModelId}
        allModels={allModels}
        onClose={() => setDetailModelId(null)}
        onSaved={(saved) => {
          onModelUpdated(saved.id, saved);
          setDetailModelId(null);
        }}
      />
    </>
  );
}
