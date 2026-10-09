"use client";

// features/spaces/page/ExportDialog.tsx — Notion's Export (K1): format (PDF, HTML, Markdown), include
// sub-pages, Export. One page downloads as one file; with sub-pages it is a zip (PDF: one print window).

import { Button, Select, Switch } from "@ai-matrx/design-system/controls";
import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

import { exportSpace, type ExportFormat } from "../io/export";
import { useSpaces } from "../state/SpacesProvider";

const FORMATS: Array<{ value: ExportFormat; label: string }> = [
  { value: "pdf", label: "PDF" },
  { value: "html", label: "HTML" },
  { value: "markdown", label: "Markdown" },
];

export function ExportDialog({ open, onOpenChange, spaceId, beforeExport }: { open: boolean; onOpenChange: (o: boolean) => void; spaceId: string; beforeExport: () => Promise<void> }) {
  const { store, childrenOf, byId, loadChildren } = useSpaces();
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [withChildren, setWithChildren] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasChildren = childrenOf(spaceId).length > 0;
  // The lazy tree may not hold this page's sub-pages yet: read them so "Include sub-pages" is offered.
  useEffect(() => {
    if (open) void loadChildren(spaceId);
  }, [open, spaceId, loadChildren]);

  const run = async () => {
    setBusy(true);
    try {
      // What the person sees is what exports: write the pending edit first.
      await beforeExport();
      const said = await exportSpace(
        { get: (id) => store.get(id), childrenOf: (id) => store.children(id), titleOf: (id) => byId.get(id)?.title ?? "Untitled" },
        spaceId,
        format,
        withChildren && hasChildren,
      );
      toast.success(said);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The export failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(420px,96vw)] gap-0 p-0">
        <DialogTitle className="px-4 pb-2 pt-4 type-title">Export</DialogTitle>
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <span className="type-body">Export format</span>
          <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)} options={FORMATS} aria-label="Export format" />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <span className="type-body">Include subpages</span>
          <Switch checked={withChildren && hasChildren} disabled={!hasChildren} onCheckedChange={setWithChildren} aria-label="Include subpages" />
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void run()}>
            {busy ? "Exporting…" : "Export"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
