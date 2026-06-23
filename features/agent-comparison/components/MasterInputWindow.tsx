"use client";

/**
 * MasterInputWindow
 *
 * Centralized data mapping. Lets the user type a master message once
 * and have it routed to N agents' user messages (or specific variables)
 * via a per-column mapping dropdown. Also lets the user add custom
 * fields (e.g. a "topic" field) and map each to whichever per-agent
 * variable name is the right slot in each column.
 *
 * Apply happens automatically on Submit All; the in-window "Apply now"
 * button is for users who want to verify the values landed in the
 * column inputs before submitting.
 */

import { useState } from "react";
import { Plus, Trash2, Send, Pencil, Check } from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  addMasterField,
  removeMasterField,
  setMasterFieldLabel,
  setMasterFieldMapping,
  setMasterFieldValue,
} from "../redux/battleSlice";
import { applyMasterFieldsToColumns } from "../redux/thunks";
import { selectBattleColumns, selectMasterFields } from "../redux/selectors";
import { MASTER_INPUT_TARGET } from "../types";
import type { BattleColumn, MasterField } from "../types";

interface Props {
  id: string;
  onClose: () => void;
}

export function MasterInputWindow({ id, onClose }: Props) {
  const dispatch = useAppDispatch();
  const fields = useAppSelector(selectMasterFields);
  const columns = useAppSelector(selectBattleColumns);

  const handleAddField = () => {
    const fieldId = crypto.randomUUID();
    dispatch(
      addMasterField({
        fieldId,
        label: `Field ${fields.length}`,
      }),
    );
  };

  const handleApply = async () => {
    await dispatch(applyMasterFieldsToColumns()).unwrap();
    toast.success("Applied to columns");
  };

  return (
    <WindowPanel
      id={id}
      title="Master input + mapping"
      width={760}
      height={620}
      onClose={onClose}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      actionsLeft={
        <span className="text-[11px] text-muted-foreground leading-snug max-w-[360px] select-text">
          Enter values once and route them into the right slot of each agent.
          Auto-applies on Submit all.
        </span>
      }
      actionsRight={
        <Button
          size="sm"
          variant="default"
          className="h-7 shrink-0"
          onClick={handleApply}
          disabled={columns.filter((c) => c.agentId).length === 0}
        >
          <Send className="w-3.5 h-3.5" />
          Apply now
        </Button>
      }
      footerRight={
        <Button
          size="sm"
          variant="outline"
          onClick={handleAddField}
          className="!h-7"
        >
          <Plus className="w-3.5 h-3.5" />
          Add field
        </Button>
      }
    >
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {fields.map((field) => (
          <MasterFieldRow
            key={field.fieldId}
            field={field}
            columns={columns}
          />
        ))}
      </div>
    </WindowPanel>
  );
}

// =============================================================================
// One field's row — label, value textarea, per-column mapping dropdowns
// =============================================================================

function MasterFieldRow({
  field,
  columns,
}: {
  field: MasterField;
  columns: BattleColumn[];
}) {
  const dispatch = useAppDispatch();
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(field.label);

  const commitLabel = () => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== field.label) {
      dispatch(
        setMasterFieldLabel({
          fieldId: field.fieldId,
          label: trimmed,
        }),
      );
    } else {
      setLabelDraft(field.label);
    }
    setEditingLabel(false);
  };

  return (
    <div className="border border-border rounded-md bg-card/40">
      <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/30 border-b border-border">
        {field.kind === "custom" && editingLabel ? (
          <input
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitLabel();
              }
            }}
            autoFocus
            className="text-[11px] font-semibold bg-background border border-border rounded px-1.5 py-0.5 text-foreground focus:outline-none focus:border-primary flex-1 min-w-0"
          />
        ) : (
          <span className="text-[11px] font-semibold flex-1 min-w-0 truncate">
            {field.label}
            {field.kind === "master" && (
              <span className="ml-1.5 text-[9px] font-normal uppercase tracking-wider text-muted-foreground">
                · auto-default to user-message
              </span>
            )}
          </span>
        )}

        {field.kind === "custom" && !editingLabel && (
          <button
            type="button"
            onClick={() => {
              setLabelDraft(field.label);
              setEditingLabel(true);
            }}
            className="p-0.5 text-muted-foreground hover:text-foreground"
            title="Rename"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
        {field.kind === "custom" && editingLabel && (
          <button
            type="button"
            onClick={commitLabel}
            className="p-0.5 text-primary hover:text-primary/80"
            title="Save"
          >
            <Check className="w-3 h-3" />
          </button>
        )}
        {field.kind === "custom" && (
          <button
            type="button"
            onClick={() =>
              dispatch(removeMasterField({ fieldId: field.fieldId }))
            }
            className="p-0.5 text-muted-foreground hover:text-destructive"
            title="Remove field"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="p-2 space-y-2">
        <textarea
          value={field.value}
          onChange={(e) =>
            dispatch(
              setMasterFieldValue({
                fieldId: field.fieldId,
                value: e.target.value,
              }),
            )
          }
          placeholder={
            field.kind === "master"
              ? "Type the message you want every mapped agent to receive..."
              : "Value for this field..."
          }
          rows={Math.min(8, Math.max(2, field.value.split("\n").length))}
          spellCheck={false}
          className="w-full text-[12px] bg-background border border-border rounded px-2 py-1.5 text-foreground resize-y focus:outline-none focus:border-primary"
        />

        {columns.length === 0 ? (
          <div className="text-[10px] text-muted-foreground italic">
            Add columns to map this field to specific agent slots.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {columns.map((col) => (
              <ColumnMappingPicker
                key={col.columnId}
                field={field}
                column={col}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Per-column dropdown — pick which variable (or user-input) this field maps to
// =============================================================================

function ColumnMappingPicker({
  field,
  column,
}: {
  field: MasterField;
  column: BattleColumn;
}) {
  const dispatch = useAppDispatch();
  const agent = useAppSelector((s: RootState) =>
    column.agentId ? s.agentDefinition.agents?.[column.agentId] : undefined,
  );
  const agentName = agent?.name ?? "Unconfigured";
  const definitions = agent?.variableDefinitions ?? [];

  const currentTarget = field.mappings[column.columnId];

  // The master field is hard-wired to "User message" — every configured
  // column gets the master text in its chat input. No dropdown needed.
  if (field.kind === "master") {
    return (
      <div className="flex items-center gap-1.5 min-w-0 text-[11px]">
        <span
          className={cn(
            "shrink-0 max-w-[120px] truncate",
            column.agentId ? "text-foreground/80" : "text-muted-foreground/50",
          )}
          title={agentName}
        >
          {agentName}
        </span>
        <span
          className={cn(
            "flex-1 min-w-0 px-1.5 py-0.5 rounded border border-dashed border-border text-muted-foreground bg-muted/20 italic",
            !column.agentId && "opacity-50",
          )}
        >
          User message
        </span>
      </div>
    );
  }

  // Order options so "User message" is first (most common pick), then
  // each declared variable. No "skip" — leave mapping empty by not
  // selecting; users can clear by picking the explicit "— skip" item.
  return (
    <div className="flex items-center gap-1.5 min-w-0 text-[11px]">
      <span
        className={cn(
          "shrink-0 max-w-[120px] truncate",
          column.agentId ? "text-foreground/80" : "text-muted-foreground/50",
        )}
        title={agentName}
      >
        {agentName}
      </span>
      <select
        value={currentTarget ?? ""}
        onChange={(e) =>
          dispatch(
            setMasterFieldMapping({
              fieldId: field.fieldId,
              columnId: column.columnId,
              target: e.target.value === "" ? undefined : e.target.value,
            }),
          )
        }
        disabled={!column.agentId}
        className="flex-1 min-w-0 bg-background border border-border rounded px-1.5 py-0.5 text-foreground focus:outline-none focus:border-primary disabled:opacity-50"
      >
        <option value={MASTER_INPUT_TARGET}>User message</option>
        {definitions.map((v) => (
          <option key={v.name} value={v.name}>
            {v.name}
          </option>
        ))}
        <option value="">— skip</option>
      </select>
    </div>
  );
}
