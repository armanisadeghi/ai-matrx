/**
 * Right-rail Detectors panel — per-detector accordions with tier toggle
 * + accept/reject for redaction_candidates spans (bulk-from-candidates).
 */

"use client";

import { FileKnowledgePanel } from "@/features/rag/components/files/FileKnowledgePanel";
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useFileAnalysis } from "@/features/file-analysis/hooks/useFileAnalysis";
import * as Api from "@/features/file-analysis/api/file-analysis";
import type { FileAnalysisResultRow } from "@/features/file-analysis/api/file-analysis";

interface Props {
  fileId: string;
  onJumpToPage: (pageNumber: number, pageId?: string | null) => void;
}

const TIER_AWARE = new Set([
  "redaction_candidates",
  "repeated_regions",
  "duplicate_pages_shingle",
  "duplicate_pages_visual",
]);

export function DetectorsPanel({ fileId, onJumpToPage }: Props) {
  const { data, loading } = useFileAnalysis(fileId);
  const [tier, setTier] = useState<"low" | "medium" | "high">("medium");
  const [busy, setBusy] = useState(false);

  const byKind = useMemo(() => {
    const out: Record<string, FileAnalysisResultRow[]> = {};
    for (const r of data?.results ?? []) {
      const k = r.detector_kind;
      out[k] = out[k] ?? [];
      out[k].push(r);
    }
    return out;
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading detectors…
      </div>
    );
  }
  if (!data || Object.keys(byKind).length === 0) {
    return (
      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
        No detector results yet.
      </div>
    );
  }

  async function handleAcceptAllPii() {
    const candidateRows = (byKind["redaction_candidates"] ?? []).filter(
      (r) => r.confidence_tier === tier,
    );
    if (!candidateRows.length) return;
    setBusy(true);
    try {
      const actions: Array<{
        result_id: string;
        span_index: number;
        action: "accept";
      }> = [];
      for (const row of candidateRows) {
        const spans =
          (row.payload as { spans?: unknown[] } | null | undefined)?.spans ??
          [];
        spans.forEach((_, idx) => {
          actions.push({
            result_id: row.id,
            span_index: idx,
            action: "accept",
          });
        });
      }
      if (!actions.length) return;
      await Api.bulkFromCandidates(fileId, { actions });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 p-2 text-xs">
      {/* Tier toggle */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Tier
        </span>
        {(["low", "medium", "high"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTier(t)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] capitalize transition-colors",
              tier === t
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {t}
          </button>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-6 text-[10px]"
          disabled={busy}
          onClick={() => void handleAcceptAllPii()}
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Check className="h-3 w-3 mr-1" />
          )}
          Accept all PII@{tier}
        </Button>
      </div>

      {Object.entries(byKind)
        .sort()
        .map(([kind, rows]) => (
          <DetectorBlock
            key={kind}
            kind={kind}
            rows={
              TIER_AWARE.has(kind)
                ? rows.filter((r) => r.confidence_tier === tier)
                : rows
            }
            onJumpToPage={onJumpToPage}
          />
        ))}

      <FileKnowledgePanel fileId={fileId} compact />

      <DetectorPrefsSection knownKinds={Object.keys(byKind)} />
    </div>
  );
}

/**
 * Per-detector enablement — backed by GET/PUT /files/analysis/preferences
 * (exposed 2026-06-11; the prefs system existed server-side since 2026-05
 * with no API surface). Toggles apply to the NEXT analysis run.
 */
function DetectorPrefsSection({ knownKinds }: { knownKinds: string[] }) {
  const [prefs, setPrefs] = useState<Api.AnalysisPreferences | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || prefs) return undefined;
    let cancelled = false;
    Api.getAnalysisPreferences()
      .then(({ data }) => {
        if (!cancelled) setPrefs(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, prefs]);

  async function toggleKind(kind: string, enabled: boolean) {
    if (!prefs || saving) return;
    const next: Api.AnalysisPreferences = {
      ...prefs,
      per_detector_enabled: { ...prefs.per_detector_enabled, [kind]: enabled },
    };
    setPrefs(next);
    setSaving(true);
    setError(null);
    try {
      await Api.putAnalysisPreferences(next);
    } catch (e) {
      setPrefs(prefs);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded border border-border bg-card/40">
      <button
        type="button"
        className="flex w-full items-center justify-between px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-accent/30"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>Detector preferences</span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="space-y-1 border-t border-border p-2">
          {!prefs && !error ? (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : null}
          {prefs
            ? knownKinds.map((kind) => {
                const enabled = prefs.per_detector_enabled[kind] !== false;
                return (
                  <label
                    key={kind}
                    className="flex cursor-pointer items-center gap-2 text-[11px]"
                  >
                    <Checkbox
                      checked={enabled}
                      disabled={saving}
                      onCheckedChange={(v) => void toggleKind(kind, v === true)}
                    />
                    <span className="flex-1 truncate">
                      {kind.replaceAll("_", " ")}
                    </span>
                  </label>
                );
              })
            : null}
          {prefs ? (
            <p className="pt-0.5 text-[9px] leading-snug text-muted-foreground">
              Applies to the next analysis run (Refresh).
            </p>
          ) : null}
          {error ? (
            <p className="text-[10px] text-destructive">{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DetectorBlock({
  kind,
  rows,
  onJumpToPage,
}: {
  kind: string;
  rows: FileAnalysisResultRow[];
  onJumpToPage: (pageNumber: number, pageId?: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = rows[0]?.summary ?? null;
  return (
    <div className="rounded border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-accent/30"
      >
        <span className="text-[11px] font-medium">
          {kind.replace(/_/g, " ")}
        </span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
          {rows.length}
        </span>
      </button>
      {open && summary ? (
        <pre className="overflow-x-auto border-t border-border bg-muted/30 px-2 py-1 text-[10px] leading-snug">
          {JSON.stringify(summary, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
