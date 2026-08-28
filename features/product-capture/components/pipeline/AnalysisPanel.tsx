"use client";

/**
 * AnalysisPanel — the first-pass vision analysis, human-correctable:
 * composition (single / lot / MIXED), identifiers, attributes, damage, the
 * "needed but couldn't see" list, and the split tool when the agent found
 * multiple distinct products mixed into one folder.
 */

import React, { useState } from "react";
import { Split, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { CaptureFile } from "../../types";
import type { AnalysisResult } from "../../pipeline-types";
import type { SplitGroupInput } from "../../pipeline-service";
import {
  CommitField,
  CommitTextArea,
  EditableRows,
  PanelSection,
  SelectField,
} from "./panel-primitives";
import { SplitDialog } from "./SplitDialog";

const CONFIDENCES = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const ID_KINDS = [
  { value: "part_number", label: "Part #" },
  { value: "model_number", label: "Model #" },
  { value: "serial_number", label: "Serial #" },
  { value: "upc", label: "UPC" },
  { value: "other", label: "Other" },
];

export function AnalysisPanel({
  analysis,
  files,
  onEdit,
  onSplit,
}: {
  analysis: Partial<AnalysisResult>;
  files: CaptureFile[];
  onEdit: (patch: Partial<AnalysisResult>) => void;
  onSplit: (groups: SplitGroupInput[]) => Promise<void>;
}) {
  const [splitOpen, setSplitOpen] = useState(false);

  const composition = analysis.composition ?? "single";
  const identifiers = analysis.identifiers ?? [];
  const attributes = analysis.attributes ?? [];
  const damage = analysis.damage ?? [];
  const unseen = analysis.unseen ?? [];

  return (
    <PanelSection
      title="AI analysis"
      badge={
        composition === "mixed" ? (
          <span className="flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
            <TriangleAlert className="h-3 w-3" />
            Multiple products detected
          </span>
        ) : undefined
      }
      actions={
        composition === "mixed" ? (
          <Button size="sm" className="h-8" onClick={() => setSplitOpen(true)}>
            <Split className="mr-1.5 h-3.5 w-3.5" />
            Split into items
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField
          label="What is this?"
          value={composition}
          options={[
            { value: "single", label: "Single item" },
            { value: "lot", label: "Lot (quantity of one type)" },
            { value: "mixed", label: "Mixed distinct products" },
          ]}
          onChange={(v) =>
            onEdit({ composition: v as AnalysisResult["composition"] })
          }
        />
        {composition === "lot" && (
          <CommitField
            label="Approx. count"
            type="number"
            value={analysis.lotCount != null ? String(analysis.lotCount) : ""}
            onCommit={(v) =>
              onEdit({ lotCount: v ? Number(v) : undefined })
            }
          />
        )}
      </div>

      <CommitTextArea
        label="Summary"
        value={analysis.summary ?? ""}
        placeholder="What the agent saw…"
        onCommit={(v) => onEdit({ summary: v })}
        rows={2}
      />

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Identifiers
        </p>
        <EditableRows
          rows={identifiers}
          onChange={(rows) => onEdit({ identifiers: rows })}
          empty="No identifiers extracted yet."
          addLabel="Add identifier"
          makeNew={() => ({
            kind: "part_number" as const,
            value: "",
            confidence: "medium" as const,
          })}
          render={(row, update) => (
            <div className="grid grid-cols-[7.5rem_1fr_6rem] gap-2">
              <SelectField
                value={row.kind}
                options={ID_KINDS}
                onChange={(v) => update({ ...row, kind: v as never })}
              />
              <CommitField
                value={row.value}
                placeholder="Value"
                onCommit={(v) => update({ ...row, value: v })}
              />
              <SelectField
                value={row.confidence}
                options={CONFIDENCES}
                onChange={(v) => update({ ...row, confidence: v as never })}
              />
            </div>
          )}
        />
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Attributes (color, brand, capacity…)
        </p>
        <EditableRows
          rows={attributes}
          onChange={(rows) => onEdit({ attributes: rows })}
          empty="No attributes yet."
          addLabel="Add attribute"
          makeNew={() => ({ name: "", value: "" })}
          render={(row, update) => (
            <div className="grid grid-cols-[10rem_1fr] gap-2">
              <CommitField
                value={row.name}
                placeholder="Name"
                onCommit={(v) => update({ ...row, name: v })}
              />
              <CommitField
                value={row.value}
                placeholder="Value"
                onCommit={(v) => update({ ...row, value: v })}
              />
            </div>
          )}
        />
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Visible damage
        </p>
        <EditableRows
          rows={damage}
          onChange={(rows) => onEdit({ damage: rows })}
          empty="No damage noted."
          addLabel="Add damage note"
          makeNew={() => ({ description: "" })}
          render={(row, update) => (
            <CommitField
              value={row.description}
              placeholder="Scratch on lid, dented corner…"
              onCommit={(v) => update({ ...row, description: v })}
            />
          )}
        />
      </div>

      <div>
        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          Needed but not visible
          {unseen.length > 0 && (
            <span className="rounded-full bg-warning/15 px-1.5 text-[10px] font-medium text-warning">
              {unseen.length}
            </span>
          )}
        </p>
        <EditableRows
          rows={unseen}
          onChange={(rows) => onEdit({ unseen: rows })}
          empty="Nothing reported missing."
          addLabel="Add missing detail"
          makeNew={() => ({ description: "" })}
          render={(row, update) => (
            <CommitField
              value={row.description}
              placeholder="Model number partially obscured…"
              onCommit={(v) => update({ ...row, description: v })}
            />
          )}
        />
      </div>

      <SplitDialog
        open={splitOpen}
        onOpenChange={setSplitOpen}
        files={files}
        initialGroups={analysis.groups}
        onConfirm={async (groups) => {
          setSplitOpen(false);
          await onSplit(groups);
        }}
      />
    </PanelSection>
  );
}
