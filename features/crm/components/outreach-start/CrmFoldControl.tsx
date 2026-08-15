"use client";

// features/crm/components/outreach-start/CrmFoldControl.tsx
//
// "Find these domains in my CRM" — the frontend half of G1 (outreach handoff
// §3), which shipped server-only on 2026-08-14 with NO caller.
//
// 🚨 ONE RECORD, TWO RENDERS. The mode lives on `web.site.settings->'crm_fold'`
// and is read/written through the live `/seo/sites/{site_id}/crm/fold-settings`
// contract. This component is mounted BOTH on the site-settings surface (where
// every per-site choice lives) and beside the prospect / reputation lists
// (where the consequence is visible). Two copies of this state is the thing the
// server contract's own docstring forbids.
//
// It never silently does nothing:
//   * mode `off` → the button REFUSES and says why, with the way to change it;
//   * every run reports what it added, what it matched, and — the part that is
//     usually swallowed — what it SKIPPED and the exact reason (toxic link
//     farm, watch-list verdict, the brand's own domain).
//   * every organization it created or matched is a real door to its record.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Loader2,
  RefreshCw,
  SearchCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  CRM_FOLD_MODES,
  CRM_FOLD_MODE_HELP,
  CRM_FOLD_MODE_LABEL,
  describeFoldReport,
  foldRefusalForMode,
  foldSiteDomains,
  readSiteCrmFoldSettings,
  writeSiteCrmFoldSettings,
  type CrmFoldMode,
  type DomainFoldReport,
  type FoldSource,
} from "../../outreach-start/service";

/** How many folded organizations get an inline door — see the comment below. */
const FOLDED_DOORS_SHOWN = 12;

const SOURCE_LABEL: Record<FoldSource, string> = {
  backlink: "Find these sites in my CRM",
  reputation: "Find these outlets in my CRM",
};

const SOURCE_BLURB: Record<FoldSource, string> = {
  backlink:
    "Turns the websites that link to you into organizations you can actually contact. Link farms are left out, and it says which.",
  reputation:
    "Turns the outlets behind your actionable cases into organizations you can actually contact. Watch-list cases are left out, and it says which.",
};

export function CrmFoldControl({
  siteId,
  source,
  className,
  /** Compact = one row beside a list; full = the settings surface section. */
  variant = "compact",
}: {
  siteId: string;
  source: FoldSource;
  className?: string;
  variant?: "compact" | "full";
}) {
  const [mode, setMode] = useState<CrmFoldMode | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<DomainFoldReport | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const settings = await readSiteCrmFoldSettings(siteId);
      setMode(settings.settings.mode ?? "auto");
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not read how this site adds organizations to your CRM.",
      );
    }
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeMode = async (next: CrmFoldMode) => {
    const previous = mode;
    setMode(next);
    setSaving(true);
    setRefusal(null);
    try {
      const settings = await writeSiteCrmFoldSettings(siteId, { mode: next });
      setMode(settings.settings.mode ?? next);
      toast.success(`Saved — ${CRM_FOLD_MODE_LABEL[next].toLowerCase()}.`);
    } catch (error) {
      setMode(previous);
      toast.error(
        error instanceof Error ? error.message : "Could not save that setting",
      );
    } finally {
      setSaving(false);
    }
  };

  const run = async () => {
    if (!mode) return;
    const blocked = foldRefusalForMode(mode);
    if (blocked) {
      setRefusal(blocked);
      return;
    }
    setRefusal(null);
    setRunning(true);
    try {
      const result = await foldSiteDomains({ siteId, source });
      setReport(result);
      toast.success(describeFoldReport(result));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not add these domains to your CRM",
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card",
        variant === "full" ? "p-4" : "p-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Organizations in your CRM
          </p>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            {SOURCE_BLURB[source]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            // Controlled from the first render — `undefined` here makes Radix
            // flip uncontrolled→controlled once the setting loads and warn.
            value={mode ?? ""}
            onValueChange={(value) => void changeMode(value as CrmFoldMode)}
            disabled={saving || mode === null}
          >
            <SelectTrigger className="h-8 w-56 text-xs">
              <SelectValue
                placeholder={loadError ? "Unavailable" : "Loading…"}
              />
            </SelectTrigger>
            <SelectContent>
              {CRM_FOLD_MODES.map((value) => (
                <SelectItem key={value} value={value} className="text-xs">
                  {CRM_FOLD_MODE_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled={running || mode === null}
            onClick={() => void run()}
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SearchCheck className="h-3.5 w-3.5" />
            )}
            {SOURCE_LABEL[source]}
          </Button>
        </div>
      </div>

      {mode && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {CRM_FOLD_MODE_HELP[mode]}
        </p>
      )}

      {loadError && (
        <div className="mt-2 flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs">
          <span className="flex gap-1.5 text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {loadError}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 text-[11px]"
            onClick={() => void load()}
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </Button>
        </div>
      )}

      {refusal && (
        <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs">
          <p className="font-medium text-foreground">{refusal}</p>
          <p className="mt-1 text-muted-foreground">
            Fix: choose “{CRM_FOLD_MODE_LABEL.manual}” above, then press the
            button again.
          </p>
        </div>
      )}

      {report && (
        <div className="mt-2 space-y-2 rounded-md border bg-muted/20 p-2.5 text-xs">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <Check className="h-3.5 w-3.5 text-emerald-500" />
            {describeFoldReport(report)}
          </p>
          {(report.folded ?? []).length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {/* 🚨 CAPPED ON PURPOSE. A first fold resolves up to 250 domains,
                  and 250 `EntityRef`s each prefetch their record route — which
                  really does exhaust the browser's connection pool
                  (ERR_INSUFFICIENT_RESOURCES, seen on a 206-domain run). The
                  doors that matter are the first screenful; the rest are
                  reachable in the CRM, and the count above stays honest. */}
              {(report.folded ?? []).slice(0, FOLDED_DOORS_SHOWN).map((row) => (
                <span
                  key={row.party_id}
                  className="inline-flex items-center gap-1"
                >
                  {/* Every organization this created or matched is a door. */}
                  <EntityRef
                    token="party"
                    id={row.party_id}
                    name={row.display_name || row.domain}
                  />
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {row.created ? "new" : `matched · ${row.matched_by}`}
                  </span>
                </span>
              ))}
              {(report.folded ?? []).length > FOLDED_DOORS_SHOWN && (
                <span className="text-muted-foreground">
                  and {(report.folded ?? []).length - FOLDED_DOORS_SHOWN} more —
                  find them in{" "}
                  <Link href="/crm" className="text-primary hover:underline">
                    your CRM
                  </Link>
                </span>
              )}
            </div>
          )}
          {(report.skipped ?? []).length > 0 && (
            <div>
              <p className="font-medium text-foreground">
                Left out on purpose ({(report.skipped ?? []).length})
              </p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {(report.skipped ?? []).map((row) => (
                  <li key={`${row.row_id}-${row.domain}`}>
                    <span className="text-foreground">{row.domain}</span> —{" "}
                    {row.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(report.errors ?? []).length > 0 && (
            <div>
              <p className="flex gap-1.5 font-medium text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {(report.errors ?? []).length} could not be resolved
              </p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {(report.errors ?? []).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
