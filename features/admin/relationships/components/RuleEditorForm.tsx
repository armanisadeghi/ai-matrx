"use client";

/**
 * Rule editor body — shared between the MatrxDataTable side panel (edit) and
 * the create SidePanelSurface. Pure presentational; parent owns EditorState.
 */

import { TriangleAlert, Trash2 } from "lucide-react";
import { EntityTypeChip } from "@/components/entity-types/EntityTypeChip";
import { EntityTypeCombobox } from "@/components/entity-types/EntityTypeCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import type { ContainerSide, PermissionLevel } from "../types";

function label(token: string): string {
  return tryGetEntityInfo(token)?.label ?? token;
}

export interface RuleEditorState {
  mode: "create" | "edit";
  sourceType: string;
  targetType: string;
  label: string;
  containerSide: ContainerSide;
  conveysMax: PermissionLevel;
  isActive: boolean;
  notes: string;
}

interface RuleEditorFormProps {
  editor: RuleEditorState;
  onChange: (next: RuleEditorState) => void;
  directionGlyph: React.ReactNode;
  sentence: string;
  conveys: boolean;
  valid: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  onDelete?: () => void;
}

export function RuleEditorForm({
  editor,
  onChange,
  directionGlyph,
  sentence,
  conveys,
  valid,
  saving,
  onCancel,
  onSave,
  onDelete,
}: RuleEditorFormProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-3">
      <p className="text-xs text-muted-foreground">{sentence}</p>

      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Source (content)</span>
          {editor.mode === "create" ? (
            <EntityTypeCombobox
              value={editor.sourceType || null}
              onChange={(t) => onChange({ ...editor, sourceType: t })}
              placeholder="Select content type…"
            />
          ) : (
            <EntityTypeChip token={editor.sourceType} showToken />
          )}
        </div>
        <div className="flex items-center justify-center py-0.5">
          {directionGlyph}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Target (container)</span>
          {editor.mode === "create" ? (
            <EntityTypeCombobox
              value={editor.targetType || null}
              onChange={(t) => onChange({ ...editor, targetType: t })}
              placeholder="Select container type…"
            />
          ) : (
            <EntityTypeChip token={editor.targetType} showToken />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">
            Label{" "}
            <span className="font-normal text-muted-foreground">
              (optional — blank applies to any label)
            </span>
          </span>
          {editor.mode === "create" ? (
            <Input
              value={editor.label}
              onChange={(e) => onChange({ ...editor, label: e.target.value })}
              placeholder="e.g. attachment"
              className="h-8"
              style={{ fontSize: "16px" }}
            />
          ) : (
            <span className="text-sm text-muted-foreground">
              {editor.label ? (
                <span className="font-mono">{editor.label}</span>
              ) : (
                "— (generic rule, any label)"
              )}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">Container side</span>
        <p className="text-xs text-muted-foreground">
          Convention: the edge is stored little→big, so the{" "}
          <span className="font-medium text-foreground">target</span> (
          {label(editor.targetType) || "container"}) is normally the container.
        </p>
        {(
          [
            ["none", "Neither — just a known relationship"],
            [
              "target",
              `${label(editor.targetType) || "Target"} is the container (convention)`,
            ],
            [
              "source",
              `${label(editor.sourceType) || "Source"} is the container — against convention (big→little); only by explicit design`,
            ],
          ] as const
        ).map(([side, text]) => (
          <Button
            key={side}
            variant={editor.containerSide === side ? "default" : "outline"}
            size="sm"
            className={`justify-start ${side === "source" && editor.containerSide !== "source" ? "border-amber-500/50 text-amber-700 dark:text-amber-500" : ""}`}
            onClick={() => onChange({ ...editor, containerSide: side })}
          >
            {side === "source" ? (
              <TriangleAlert className="mr-1.5 h-3.5 w-3.5" />
            ) : null}
            {text}
          </Button>
        ))}
        {editor.containerSide === "source" ? (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            This declares the edge stored big→little. Every writer must store it
            that way, and the notes field must say why.
          </p>
        ) : null}
      </div>

      {conveys ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Maximum conveyed level</span>
          <Select
            value={editor.conveysMax}
            onValueChange={(v) =>
              onChange({ ...editor, conveysMax: v as PermissionLevel })
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">
                viewer — visible through the container, never editable
              </SelectItem>
              <SelectItem value="editor">
                editor — full collaboration inside a shared workspace
              </SelectItem>
              <SelectItem value="admin">
                admin — avoid; almost never right through a cascade
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Composes as LEAST along a path. Admin on a container never silently
            confers admin on contents.
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <span className="text-xs font-medium">Active</span>
        <Switch
          checked={editor.isActive}
          onCheckedChange={(v) => onChange({ ...editor, isActive: v })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">Notes</span>
        <Textarea
          value={editor.notes}
          onChange={(e) => onChange({ ...editor, notes: e.target.value })}
          rows={3}
          placeholder="Why this rule exists; any direction exceptions."
          style={{ fontSize: "16px" }}
        />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pb-2">
        {editor.mode === "edit" && onDelete ? (
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={saving}
            onClick={onDelete}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={saving || !valid} onClick={onSave}>
            {editor.mode === "create" ? "Create rule" : "Save rule"}
          </Button>
        </div>
      </div>
    </div>
  );
}
