"use client";

/**
 * TemplatePreviewButton — THE DOOR for a label-stock id.
 *
 * NO DEAD ENDS: the certified-printers table names a stock ("Avery 5163"), so
 * that name has to open something. It opens the same `LabelSheetPreview` the
 * printer's own geometry brain drives, in calibration view — exactly what the
 * certification wizard printed.
 */

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getLabelTemplate } from "@ai-matrx/print/labels";
import { LabelSheetPreview } from "@ai-matrx/print/react";

export function TemplatePreviewButton({ templateId }: { templateId: string }) {
  const [open, setOpen] = useState(false);
  const template = getLabelTemplate(templateId);

  if (!template) {
    // Honest, never dead: a custom/unknown stock has no registry geometry.
    return (
      <span
        className="text-muted-foreground"
        title="Custom stock — geometry was supplied at print time, so there is no registry preview."
      >
        {templateId} (custom)
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="truncate text-left text-primary underline-offset-2 hover:underline"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {template.name}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{template.name}</DialogTitle>
            <DialogDescription>
              {template.stockCode} —{" "}
              {template.kind === "roll"
                ? `${template.labelWIn}" × ${template.labelHIn}" roll label`
                : `${template.cols * template.rows} labels per ${template.sheetWIn}" × ${template.sheetHIn}" sheet`}
              . This is the calibration view the wizard prints.
            </DialogDescription>
          </DialogHeader>
          <LabelSheetPreview template={template} labels={[]} calibration />
        </DialogContent>
      </Dialog>
    </>
  );
}
