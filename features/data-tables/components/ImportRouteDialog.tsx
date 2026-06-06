/**
 * ImportRouteDialog — choose between typed dataset and workbook for an
 * imported file. Pre-selects the detector's recommendation (badged
 * "Recommended"); user can override.
 *
 * Caller responsibilities:
 *   - Pass the detection result from `detectImportRoute(file)`.
 *   - Pass the original `File` for the destination handler.
 *   - Wire `onCommit({ routing, file })` to perform the actual import.
 *   - Manage `isOpen` / `onClose`.
 */
"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { ImportRouteDetection, ImportRouting } from "../smart-importer";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  detection: ImportRouteDetection | null;
  fileName: string;
  /** Called when the user confirms. Caller dispatches the chosen import. */
  onCommit: (routing: ImportRouting) => void | Promise<void>;
  /** True while the parent is running the actual import after commit. */
  isCommitting?: boolean;
};

export function ImportRouteDialog({
  isOpen,
  onClose,
  detection,
  fileName,
  onCommit,
  isCommitting = false,
}: Props) {
  const [choice, setChoice] = useState<ImportRouting>("typed");

  useEffect(() => {
    if (detection) setChoice(detection.routing);
  }, [detection]);

  if (!detection) return null;

  const recommended = detection.routing;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isCommitting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>How should we import this file?</DialogTitle>
          <DialogDescription className="truncate" title={fileName}>
            {fileName}
            {detection.sheetCount > 1 && (
              <> · {detection.sheetCount} sheets</>
            )}
            {detection.firstSheetRowCount > 0 && (
              <> · {detection.firstSheetRowCount} rows on first sheet</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <RouteOption
            kind="typed"
            selected={choice === "typed"}
            recommended={recommended === "typed"}
            onSelect={() => setChoice("typed")}
            reasons={detection.reasons.typed}
            description="One row per record, each column has a declared type. Queryable, indexable, agent-friendly. Best for clean tabular data."
          />
          <RouteOption
            kind="workbook"
            selected={choice === "workbook"}
            recommended={recommended === "workbook"}
            onSelect={() => setChoice("workbook")}
            reasons={detection.reasons.workbook}
            description="Lossless spreadsheet — multi-sheet, formulas, merged cells, formatting preserved. Best when the original layout matters."
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isCommitting}>
            Cancel
          </Button>
          <Button onClick={() => void onCommit(choice)} disabled={isCommitting}>
            {isCommitting ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : null}
            Import as{" "}
            {choice === "typed" ? "Typed Dataset" : "Workbook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RouteOption({
  kind,
  selected,
  recommended,
  onSelect,
  reasons,
  description,
}: {
  kind: ImportRouting;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
  reasons: string[];
  description: string;
}) {
  const Icon = kind === "workbook" ? FileSpreadsheet : FileText;
  const title = kind === "workbook" ? "Workbook" : "Typed Dataset";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:bg-muted"
      }`}
    >
      <Icon
        className={`mt-0.5 size-5 flex-shrink-0 ${
          selected ? "text-primary" : "text-muted-foreground"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{title}</span>
          {recommended && (
            <Badge variant="secondary" className="text-xs">
              Recommended
            </Badge>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{description}</div>
        {reasons.length > 0 && (
          <div className="mt-1.5 text-xs text-muted-foreground">
            <span className="font-medium">Detected:</span>{" "}
            {reasons.join("; ")}
          </div>
        )}
      </div>
    </button>
  );
}
