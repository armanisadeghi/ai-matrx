/**
 * Right-rail Redact panel — lists annotations flagged for redaction
 * + buttons for generating a masked PDF and restoring from a response.
 */

"use client";

import { useMemo, useState } from "react";
import { Layers, Loader2, ShieldCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useAnnotations } from "@/features/file-analysis/hooks/useAnnotations";
import { useLabelCatalog } from "@/features/file-analysis/hooks/useLabelCatalog";
import { MaskDialog } from "@/features/file-analysis/redact/MaskDialog";
import { RestoreDialog } from "@/features/file-analysis/redact/RestoreDialog";
import { usePdfClient } from "@/features/pdf/api/client";
import { useDownloadBlob } from "@/features/pdf/hooks/useDownloadBlob";
import { buildPdfSourceFromFileId } from "@/features/pdf/utils/source";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import type { RepeatedRegionsReport } from "@/features/pdf-extractor/types";

interface Props {
  fileId: string;
}

export function RedactPanel({ fileId }: Props) {
  const { annotations, update } = useAnnotations(fileId);
  const { byId } = useLabelCatalog();
  const [maskOpen, setMaskOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const flagged = useMemo(
    () => annotations.filter((a) => a.redact && a.status === "active"),
    [annotations],
  );

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card/60 p-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Marked for redaction
          </span>
          <span className="rounded bg-muted px-1.5 py-px text-[10px] tabular-nums">
            {flagged.length}
          </span>
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRestoreOpen(true)}
            className="h-7 text-[10px]"
          >
            <Undo2 className="h-3 w-3 mr-1" /> Restore
          </Button>
          <Button
            size="sm"
            disabled={!flagged.length}
            onClick={() => setMaskOpen(true)}
            className="h-7 text-[10px]"
          >
            <ShieldCheck className="h-3 w-3 mr-1" /> Mask
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {flagged.length === 0 ? (
          <div className="px-3 py-6 text-center text-muted-foreground">
            No annotations marked for redaction. Open an annotation and toggle
            the <em>Mark for redaction</em> flag.
          </div>
        ) : (
          <ul className="space-y-1">
            {flagged.map((a) => {
              const label = byId.get(a.label)?.display_name ?? a.label;
              return (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded border border-border bg-card px-2 py-1.5"
                >
                  <span className="flex-1 truncate">{label}</span>
                  <span className="rounded bg-muted px-1 py-px text-[9px] uppercase">
                    p{a.page_number}
                  </span>
                  <button
                    type="button"
                    onClick={() => void update(a.id, { redact: false })}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    unflag
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <RepeatedRegionsRedactSection fileId={fileId} />

      <MaskDialog fileId={fileId} open={maskOpen} onOpenChange={setMaskOpen} />
      <RestoreDialog
        fileId={fileId}
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
      />
    </div>
  );
}

/**
 * Detect → redact-all one-flow for repeated regions (headers / footers /
 * watermarks / page numbers). The detector returns deterministic
 * region_ids, so the user's accept set maps 1:1 onto the
 * redact-repeated-regions endpoint. Produces a NEW redacted PDF download;
 * the source file is unchanged.
 */
function RepeatedRegionsRedactSection({ fileId }: { fileId: string }) {
  const api = usePdfClient();
  const downloadBlob = useDownloadBlob();
  const [detecting, setDetecting] = useState(false);
  const [redacting, setRedacting] = useState(false);
  const [report, setReport] = useState<RepeatedRegionsReport | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function detect() {
    setDetecting(true);
    setError(null);
    try {
      const r = await api.postJson<RepeatedRegionsReport>(
        "detectRepeatedRegions",
        { ...buildPdfSourceFromFileId(fileId) },
      );
      setReport(r);
      setAccepted(new Set((r.regions ?? []).map((reg) => reg.region_id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetecting(false);
    }
  }

  async function redactAccepted() {
    if (!accepted.size) return;
    if (!reason.trim()) {
      setError("Reason is required — it goes on the audit record.");
      return;
    }
    const ok = await confirm({
      title: `Redact ${accepted.size} repeated region${accepted.size === 1 ? "" : "s"} on every page?`,
      description:
        "Creates a NEW redacted copy with the selected headers/footers/watermarks blacked out across the whole document — the original file is unchanged.",
      confirmLabel: "Redact regions",
      variant: "destructive",
    });
    if (!ok) return;
    setRedacting(true);
    setError(null);
    try {
      const result = await api.postPdfBlob("redactRepeatedRegions", {
        ...buildPdfSourceFromFileId(fileId),
        accepted_region_ids: Array.from(accepted),
        reason: reason.trim(),
      });
      downloadBlob(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRedacting(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-card/40 p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Repeated regions (headers / footers)
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px]"
          onClick={() => void detect()}
          disabled={detecting || redacting}
        >
          {detecting ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Layers className="h-3 w-3 mr-1" />
          )}
          {report ? "Re-detect" : "Detect"}
        </Button>
      </div>

      {report &&
        ((report.regions?.length ?? 0) === 0 ? (
          <p className="text-[10px] text-muted-foreground">
            No repeated regions detected in this document.
          </p>
        ) : (
          <>
            <ul className="max-h-32 space-y-1 overflow-y-auto">
              {(report.regions ?? []).map((r) => (
                <li key={r.region_id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded border border-border bg-card px-2 py-1 text-[11px]">
                    <Checkbox
                      checked={accepted.has(r.region_id)}
                      onCheckedChange={(v) => {
                        setAccepted((prev) => {
                          const next = new Set(prev);
                          if (v === true) next.add(r.region_id);
                          else next.delete(r.region_id);
                          return next;
                        });
                      }}
                    />
                    <span className="flex-1 truncate">{r.kind}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {Math.round((r.confidence ?? 0) * 100)}%
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (required, goes on the audit record)"
              className="h-7 text-[11px]"
            />
            <Button
              size="sm"
              className="h-7 w-full text-[10px]"
              onClick={() => void redactAccepted()}
              disabled={redacting || detecting || !accepted.size}
            >
              {redacting ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <ShieldCheck className="h-3 w-3 mr-1" />
              )}
              Redact {accepted.size} region{accepted.size === 1 ? "" : "s"} on
              all pages
            </Button>
          </>
        ))}

      {error ? (
        <p className="text-[10px] text-destructive leading-snug">{error}</p>
      ) : null}
    </div>
  );
}
