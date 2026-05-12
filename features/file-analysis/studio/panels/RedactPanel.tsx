/**
 * Right-rail Redact panel — lists annotations flagged for redaction
 * + buttons for generating a masked PDF and restoring from a response.
 */

"use client";

import { useMemo, useState } from "react";
import { ShieldCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAnnotations } from "@/features/file-analysis/hooks/useAnnotations";
import { useLabelCatalog } from "@/features/file-analysis/hooks/useLabelCatalog";
import { MaskDialog } from "@/features/file-analysis/redact/MaskDialog";
import { RestoreDialog } from "@/features/file-analysis/redact/RestoreDialog";

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

      <MaskDialog
        fileId={fileId}
        open={maskOpen}
        onOpenChange={setMaskOpen}
      />
      <RestoreDialog
        fileId={fileId}
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
      />
    </div>
  );
}
