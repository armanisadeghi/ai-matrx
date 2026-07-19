"use client";

/**
 * Entity-type registry editor body — create/edit one row of
 * platform.entity_types. Sibling to ShareableResourceForm; same
 * side-panel-body contract (pure presentational, parent owns state).
 *
 * The token is the immutable PK: locked in edit mode. table_ref is derived
 * server-side from schema + table (the RPC validates the table exists).
 */

import { TriangleAlert } from "lucide-react";
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

export interface EntityTypeEditorState {
  mode: "create" | "edit";
  token: string;
  schemaName: string;
  tableName: string;
  label: string;
  baseTier: string;
  isVersioned: boolean;
  hasSoftDelete: boolean;
  isListed: boolean;
  isComponent: boolean;
  isModule: boolean;
  category: string;
  defaultScopeable: boolean;
  defaultVisibility: string;
  defaultMembersCanAdd: boolean;
  defaultNeedsApproval: boolean;
  defaultAutoIngest: boolean;
  rlsVariant: string;
  isActive: boolean;
  notes: string;
  referencePickable: boolean;
  titleColumn: string;
  contentRole: string;
}

const TOKEN_PATTERN = /^[a-z][a-z0-9_]*$/;

export function isValidEntityToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

const VISIBILITY_NONE = "__none__";
const VISIBILITY_OPTIONS = ["private", "internal", "link", "public"];

const CONTENT_ROLE_NONE = "__none__";
/** Mirrors the DB check constraint on platform.entity_types.content_role. */
const CONTENT_ROLE_OPTIONS = [
  ["utility", "Utility — agents/tools that act on knowledge"],
  ["source", "Source — incoming knowledge"],
  ["destination", "Output — knowledge the team produces"],
  ["hybrid", "Source & Output — read and written"],
  ["container", "Workspace — organizes other entities"],
] as const;

interface Props {
  editor: EntityTypeEditorState;
  onChange: (next: EntityTypeEditorState) => void;
  /** Tokens already registered — blocks duplicate creates. */
  existingTokens: ReadonlySet<string>;
  valid: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export function EntityTypeForm({
  editor,
  onChange,
  existingTokens,
  valid,
  saving,
  onCancel,
  onSave,
}: Props) {
  const createMode = editor.mode === "create";
  const tokenInvalid =
    editor.token.length > 0 && !isValidEntityToken(editor.token);
  const tokenTaken =
    createMode && editor.token.length > 0 && existingTokens.has(editor.token);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">Token (immutable PK)</span>
        <Input
          value={editor.token}
          disabled={!createMode}
          onChange={(e) => onChange({ ...editor, token: e.target.value })}
          placeholder="e.g. picklist"
          className="h-8 font-mono"
          style={{ fontSize: "16px" }}
        />
        {tokenInvalid ? (
          <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
            <TriangleAlert className="h-3 w-3" />
            snake_case starting with a letter (^[a-z][a-z0-9_]*$)
          </p>
        ) : tokenTaken ? (
          <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
            <TriangleAlert className="h-3 w-3" />
            This token is already registered — edit it from the table instead.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            The FK target for platform.associations and every registry
            consumer. Cannot be renamed once registered.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Schema</span>
          <Input
            value={editor.schemaName}
            onChange={(e) =>
              onChange({ ...editor, schemaName: e.target.value })
            }
            placeholder="e.g. workbench"
            className="h-8 font-mono"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Table</span>
          <Input
            value={editor.tableName}
            onChange={(e) => onChange({ ...editor, tableName: e.target.value })}
            placeholder="e.g. udt_structured_lists"
            className="h-8 font-mono"
            style={{ fontSize: "16px" }}
          />
        </div>
        <p className="col-span-2 text-xs text-muted-foreground">
          The physical table must already exist — the save is rejected
          otherwise, so a typo can&apos;t register a phantom entity.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Label</span>
          <Input
            value={editor.label}
            onChange={(e) => onChange({ ...editor, label: e.target.value })}
            placeholder="e.g. Picklist"
            className="h-8"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Category</span>
          <Input
            value={editor.category}
            onChange={(e) => onChange({ ...editor, category: e.target.value })}
            placeholder="optional"
            className="h-8"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Base tier</span>
          <Input
            type="number"
            value={editor.baseTier}
            onChange={(e) => onChange({ ...editor, baseTier: e.target.value })}
            className="h-8 font-mono"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Default visibility</span>
          <Select
            value={editor.defaultVisibility || VISIBILITY_NONE}
            onValueChange={(v) =>
              onChange({
                ...editor,
                defaultVisibility: v === VISIBILITY_NONE ? "" : v,
              })
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="(none)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={VISIBILITY_NONE}>(none)</SelectItem>
              {VISIBILITY_OPTIONS.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <span className="text-xs font-medium">
            RLS variant{" "}
            <span className="font-normal text-muted-foreground">
              (optional — iam.apply_rls override)
            </span>
          </span>
          <Input
            value={editor.rlsVariant}
            onChange={(e) =>
              onChange({ ...editor, rlsVariant: e.target.value })
            }
            className="h-8 font-mono"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        {(
          [
            ["Active", "isActive", "Inactive tokens vanish from entity_types_list() and the generated TS vocabulary."],
            ["Versioned", "isVersioned", "Rows participate in the platform versioning system."],
            ["Soft delete", "hasSoftDelete", "Table carries deleted_at instead of hard deletes."],
            ["Listed", "isListed", "Appears in user-facing entity pickers and lists."],
            ["Component", "isComponent", "A sub-part of another entity, not standalone content."],
            ["Module", "isModule", "A top-level org module."],
            ["Scopeable by default", "defaultScopeable", "Can be tagged into scopes (context assignment)."],
            ["Members can add", "defaultMembersCanAdd", "Org members may create instances by default."],
            ["Needs approval", "defaultNeedsApproval", "New instances require approval by default."],
            ["Auto ingest", "defaultAutoIngest", "New instances auto-ingest into RAG by default."],
          ] as const
        ).map(([flagLabel, key, hint]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="flex flex-col">
              <span className="text-xs font-medium">{flagLabel}</span>
              <span className="text-[10px] text-muted-foreground">{hint}</span>
            </span>
            <Switch
              checked={editor[key]}
              onCheckedChange={(v) => onChange({ ...editor, [key]: v })}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        <span className="text-xs font-semibold">Reference picker</span>
        <p className="text-[10px] text-muted-foreground">
          Governs the &ldquo;Allowed types&rdquo; chooser on reference context
          items (scope context fields). Changes are live for pickers on the
          next page load — no type regeneration needed for the chooser itself.
        </p>
        <div className="flex items-center justify-between">
          <span className="flex flex-col">
            <span className="text-xs font-medium">Reference pickable</span>
            <span className="text-[10px] text-muted-foreground">
              Offer this type in reference &ldquo;Allowed types&rdquo; choosers.
            </span>
          </span>
          <Switch
            checked={editor.referencePickable}
            onCheckedChange={(v) =>
              onChange({ ...editor, referencePickable: v })
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">Title column</span>
            <Input
              value={editor.titleColumn}
              onChange={(e) =>
                onChange({ ...editor, titleColumn: e.target.value })
              }
              placeholder="e.g. name / title / label"
              className="h-8 font-mono"
              style={{ fontSize: "16px" }}
            />
            <p className="text-[10px] text-muted-foreground">
              Human-readable column pickers read for candidate titles. The
              save is rejected if it doesn&apos;t exist on the table.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">Content role</span>
            <Select
              value={editor.contentRole || CONTENT_ROLE_NONE}
              onValueChange={(v) =>
                onChange({
                  ...editor,
                  contentRole: v === CONTENT_ROLE_NONE ? "" : v,
                })
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="(none)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CONTENT_ROLE_NONE}>(none)</SelectItem>
                {CONTENT_ROLE_OPTIONS.map(([v, hint]) => (
                  <SelectItem key={v} value={v}>
                    {hint}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Grouping bucket for two-tier pickers and resource surfaces.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">Notes</span>
        <Textarea
          value={editor.notes}
          onChange={(e) => onChange({ ...editor, notes: e.target.value })}
          rows={3}
          placeholder="Why this is registered; anything the next admin should know."
          style={{ fontSize: "16px" }}
        />
      </div>

      <div className="mt-auto flex justify-end gap-2 pb-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={saving || !valid} onClick={onSave}>
          {editor.mode === "create" ? "Register entity type" : "Save entity type"}
        </Button>
      </div>
    </div>
  );
}
