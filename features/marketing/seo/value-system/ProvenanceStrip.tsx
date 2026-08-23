"use client";

/**
 * The one-line provenance strip an editor shows when the row it is editing
 * came from an industry pack: the pack's value beside the site's, and
 * "Revert to pack" — which is an ordinary write through the one adoption RPC
 * in reset mode, scoped to this single item. Rendered by ValueRuleEditor and
 * GeoAreaEditor; the data comes from the Rulebook (see EditorProvenance).
 */

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { SourceChip } from "./SourceChip";
import type { EditorProvenance } from "./types";

export function ProvenanceStrip({
  provenance,
  onReverted,
}: {
  provenance: EditorProvenance;
  /** Called after a successful revert — the editor usually closes. */
  onReverted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const changed = provenance.state === "changed" || provenance.state === "archived";

  const revert = async () => {
    const ok = await confirm({
      title: `Revert to ${provenance.packName}?`,
      description: `This puts the row back to what the pack proposes — ${provenance.packSummary}. You can edit it again any time.`,
      confirmLabel: "Revert",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await provenance.onRevert();
      toast.success(`Reverted to what ${provenance.packName} proposes.`);
      onReverted();
    } catch (error) {
      toast.error(`Could not revert: ${extractErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-2">
      <SourceChip
        state={
          provenance.state === "as_adopted"
            ? "pack"
            : provenance.state === "changed"
              ? "changed"
              : provenance.state === "archived"
                ? "archived"
                : "yours"
        }
        packName={provenance.packName}
      />
      <p className="min-w-0 flex-1 text-[11px] leading-4 text-muted-foreground">
        {changed ? (
          <>
            <span className="text-foreground">Pack says</span> {provenance.packSummary}{" "}
            <span className="text-muted-foreground">·</span>{" "}
            <span className="text-foreground">you set</span> {provenance.siteSummary}
          </>
        ) : (
          <>
            Still exactly what the pack proposes — edit anything and it becomes yours; the
            platform never re-applies the pack over your changes.
          </>
        )}
      </p>
      {changed ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={() => void revert()}
          disabled={busy}
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          {busy ? "Reverting…" : "Revert to pack"}
        </Button>
      ) : null}
    </div>
  );
}
