"use client";

/**
 * OrgPrivacyTab — per-organization auto-ingest controls.
 *
 * Step 3.1 of the KG activation plan. Pairs with the per-user toggle in
 * `features/settings/tabs/PrivacyTab` to give org admins/owners a switch
 * + budget for the org-wide knowledge-graph auto-ingest pipeline.
 *
 * All writes go React → Supabase via `useOrgAutoRagPreference`. RLS
 * enforces "only an org admin/owner can write here" — the visibility of
 * the tab is also gated by `canManageSettings` in `OrgSettings.tsx`.
 *
 * No emojis, Lucide icons only, semantic colors only. React Compiler
 * handles memoization — no manual `useMemo` / `useCallback`.
 */

import { useState } from "react";
import {
  AlertTriangle,
  Brain,
  Loader2,
  Pencil,
  Wallet,
  X,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgAutoRagPreference } from "../hooks/useOrgAutoRagPreference";

interface OrgPrivacyTabProps {
  organizationId: string;
  /** When false, the controls render read-only so non-admins still see the
   * current state and limits without being able to flip them. */
  canEdit: boolean;
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

/**
 * Returns a relative "Resets in Xh Ym" string for a 24h window that started
 * at `windowStart`. Returns null when there's no window yet (the row hasn't
 * been materialized) or the window has already rolled over.
 */
function formatResetIn(windowStart: string | null): string | null {
  if (!windowStart) return null;
  const startMs = new Date(windowStart).getTime();
  if (!Number.isFinite(startMs)) return null;
  const resetMs = startMs + 24 * 60 * 60 * 1000;
  const remainingMs = resetMs - Date.now();
  if (remainingMs <= 0) return null;
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `Resets in ${hours}h ${minutes}m`;
  return `Resets in ${minutes}m`;
}

function percentToneClass(percent: number): string {
  if (!Number.isFinite(percent)) return "text-destructive";
  if (percent >= 80) return "text-destructive";
  if (percent >= 50) return "text-orange-500 dark:text-orange-400";
  return "text-muted-foreground";
}

export function OrgPrivacyTab({
  organizationId,
  canEdit,
}: OrgPrivacyTabProps) {
  const pref = useOrgAutoRagPreference(organizationId);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<string>("");

  const handleToggle = (next: boolean) => {
    void pref
      .setEnabled(next)
      .then(() =>
        toast.success(
          next
            ? "Auto knowledge-graph enabled for this org"
            : "Auto knowledge-graph disabled for this org",
        ),
      )
      .catch(() => toast.error("Couldn't update auto knowledge-graph"));
  };

  const handleStartEditingBudget = () => {
    setBudgetDraft(pref.budgetUsd.toFixed(2));
    setEditingBudget(true);
  };

  const handleCancelEditingBudget = () => {
    setEditingBudget(false);
    setBudgetDraft("");
  };

  const handleSaveBudget = async () => {
    const parsed = Number.parseFloat(budgetDraft);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Budget must be a non-negative number");
      return;
    }
    try {
      await pref.setBudgetUsd(parsed);
      setEditingBudget(false);
      toast.success(`Daily budget set to ${formatUsd(parsed)}`);
    } catch {
      toast.error("Couldn't update budget");
    }
  };

  const resetsIn = formatResetIn(pref.windowStart);
  // Cap the progress-bar fill at 100; Infinity (when budget is 0) renders
  // as full + the destructive tone takes over.
  const progressValue = Number.isFinite(pref.percentUsed)
    ? Math.min(100, pref.percentUsed)
    : 100;

  return (
    <div className="space-y-4">
      <Card className="p-5 md:p-6">
        <div className="flex items-start gap-3">
          <div className="text-primary shrink-0">
            <Brain className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <h2 className="text-base font-semibold">
              Auto-ingest content for the knowledge graph
            </h2>
            <p className="text-sm text-muted-foreground">
              When on, notes, transcripts, chat messages, and uploaded files
              are automatically processed for the knowledge graph and
              surfaced as scope-association suggestions. Suggestions are
              never applied automatically — every match is reviewed.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          {/* ── Toggle ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-card/50 px-4 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="org-auto-rag-switch" className="text-sm">
                Enabled for this organization
              </Label>
              <p className="text-xs text-muted-foreground">
                Owner / admin override — applies to every member of this org.
              </p>
            </div>
            {pref.loading ? (
              <Skeleton className="h-6 w-10" />
            ) : (
              <Switch
                id="org-auto-rag-switch"
                checked={pref.enabled}
                onCheckedChange={handleToggle}
                disabled={!canEdit || pref.saving}
              />
            )}
          </div>

          {/* ── Budget editor ───────────────────────────────────────────── */}
          <div className="rounded-md border border-border bg-card/50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Wallet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-medium">Daily budget</span>
              </div>
              {pref.loading ? (
                <Skeleton className="h-7 w-24" />
              ) : editingBudget ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={budgetDraft}
                    onChange={(e) => setBudgetDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleSaveBudget();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        handleCancelEditingBudget();
                      }
                    }}
                    className="h-7 w-24 text-sm tabular-nums text-base md:text-sm"
                    disabled={pref.saving}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleSaveBudget}
                    disabled={pref.saving}
                    aria-label="Save budget"
                    className="h-7 w-7 p-0"
                  >
                    {pref.saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCancelEditingBudget}
                    disabled={pref.saving}
                    aria-label="Cancel"
                    className="h-7 w-7 p-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatUsd(pref.budgetUsd)}
                  </span>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleStartEditingBudget}
                      aria-label="Edit budget"
                      className="h-7 w-7 p-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Usage row */}
            <div className="mt-3 space-y-1.5">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted-foreground">Today's usage</span>
                {pref.loading ? (
                  <Skeleton className="h-3 w-32" />
                ) : (
                  <span className="tabular-nums">
                    <span className="font-medium text-foreground">
                      {formatUsd(pref.usedTodayUsd)}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      of {formatUsd(pref.budgetUsd)} (
                    </span>
                    <span className={percentToneClass(pref.percentUsed)}>
                      {formatPercent(pref.percentUsed)}
                    </span>
                    <span className="text-muted-foreground"> of cap)</span>
                  </span>
                )}
              </div>
              {!pref.loading && (
                <Progress value={progressValue} className="h-1.5" />
              )}
              <p className="text-xs text-muted-foreground">
                {resetsIn ?? "Resets 24h after the first charge of the day."}
              </p>
            </div>
          </div>

          {!canEdit && (
            <p className="text-xs text-muted-foreground">
              View-only. Ask an owner or admin to change these settings.
            </p>
          )}

          {pref.error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{pref.error}</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
