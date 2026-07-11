"use client";

/**
 * Shareable-resource registry editor body — create/edit one row of
 * platform.shareable_resource_registry. Sibling to RuleEditorForm; same
 * side-panel-body contract (pure presentational, parent owns state).
 */

import { TriangleAlert } from "lucide-react";
import { EntityTypeChip } from "@/components/entity-types/EntityTypeChip";
import { EntityTypeCombobox } from "@/components/entity-types/EntityTypeCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { EntityTypeDisabledMap } from "@/components/entity-types/EntityTypeCombobox";

export interface ShareableEditorState {
  mode: "create" | "edit";
  resourceType: string;
  schemaName: string;
  tableName: string;
  displayLabel: string;
  urlPathTemplate: string;
  idColumn: string;
  ownerColumn: string;
  isPublicColumn: string;
  rlsUsesHasPermission: boolean;
  isActive: boolean;
  contentRole: string;
  isScopeable: boolean;
  isLinkShareable: boolean;
  /** Comma-separated for editing; split/trim on save. */
  publicColumns: string;
  notes: string;
}

interface Props {
  editor: ShareableEditorState;
  onChange: (next: ShareableEditorState) => void;
  /** Tokens already registered — disabled in the create-mode token picker. */
  disabledTokens?: EntityTypeDisabledMap | ReadonlySet<string>;
  valid: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}

const CONTENT_ROLES = [
  "source",
  "destination",
  "container",
  "utility",
  "hybrid",
];

export function ShareableResourceForm({
  editor,
  onChange,
  disabledTokens,
  valid,
  saving,
  onCancel,
  onSave,
}: Props) {
  const createMode = editor.mode === "create";
  const urlMissingId =
    editor.urlPathTemplate.length > 0 &&
    !editor.urlPathTemplate.includes("{id}");

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">
          Resource type (entity token)
        </span>
        {createMode ? (
          <EntityTypeCombobox
            value={editor.resourceType || null}
            onChange={(t) => onChange({ ...editor, resourceType: t })}
            placeholder="Select entity type…"
            disabledTokens={disabledTokens}
          />
        ) : (
          <EntityTypeChip token={editor.resourceType} showToken />
        )}
        <p className="text-xs text-muted-foreground">
          Registering this makes the type shareable and — for association
          container types — clears the Relationship Manager&apos;s
          &quot;container not shareable&quot; drift for it.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Schema</span>
          <Input
            value={editor.schemaName}
            onChange={(e) =>
              onChange({ ...editor, schemaName: e.target.value })
            }
            placeholder="e.g. workspace"
            className="h-8 font-mono"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Table</span>
          <Input
            value={editor.tableName}
            onChange={(e) => onChange({ ...editor, tableName: e.target.value })}
            placeholder="e.g. projects"
            className="h-8 font-mono"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">ID column</span>
          <Input
            value={editor.idColumn}
            onChange={(e) => onChange({ ...editor, idColumn: e.target.value })}
            className="h-8 font-mono"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Owner column</span>
          <Input
            value={editor.ownerColumn}
            onChange={(e) =>
              onChange({ ...editor, ownerColumn: e.target.value })
            }
            className="h-8 font-mono"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <span className="text-xs font-medium">
            Public/visibility column{" "}
            <span className="font-normal text-muted-foreground">
              (optional — blank if none)
            </span>
          </span>
          <Input
            value={editor.isPublicColumn}
            onChange={(e) =>
              onChange({ ...editor, isPublicColumn: e.target.value })
            }
            placeholder="e.g. visibility"
            className="h-8 font-mono"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">Display label</span>
        <Input
          value={editor.displayLabel}
          onChange={(e) =>
            onChange({ ...editor, displayLabel: e.target.value })
          }
          placeholder="e.g. Project"
          className="h-8"
          style={{ fontSize: "16px" }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">URL path template</span>
        <Input
          value={editor.urlPathTemplate}
          onChange={(e) =>
            onChange({ ...editor, urlPathTemplate: e.target.value })
          }
          placeholder="e.g. /projects/{id}"
          className="h-8 font-mono"
          style={{ fontSize: "16px" }}
        />
        {urlMissingId ? (
          <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
            <TriangleAlert className="h-3 w-3" />
            Should contain <span className="font-mono">{"{id}"}</span> so
            ShareModal can build a real link.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Where a share link or reachability inspector row should route to.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">
          Content role{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <div className="flex flex-wrap gap-1.5">
          {CONTENT_ROLES.map((role) => (
            <Button
              key={role}
              type="button"
              size="sm"
              variant={editor.contentRole === role ? "default" : "outline"}
              onClick={() =>
                onChange({
                  ...editor,
                  contentRole: editor.contentRole === role ? "" : role,
                })
              }
            >
              {role}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Active</span>
          <Switch
            checked={editor.isActive}
            onCheckedChange={(v) => onChange({ ...editor, isActive: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="flex flex-col">
            <span className="text-xs font-medium">RLS uses has_permission</span>
            <span className="text-[10px] text-muted-foreground">
              Direct-grant sharing (ShareModal / iam.permissions) is wired for
              this table.
            </span>
          </span>
          <Switch
            checked={editor.rlsUsesHasPermission}
            onCheckedChange={(v) =>
              onChange({ ...editor, rlsUsesHasPermission: v })
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="flex flex-col">
            <span className="text-xs font-medium">Scopeable</span>
            <span className="text-[10px] text-muted-foreground">
              Can be tagged into scopes (context assignment).
            </span>
          </span>
          <Switch
            checked={editor.isScopeable}
            onCheckedChange={(v) => onChange({ ...editor, isScopeable: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="flex flex-col">
            <span className="text-xs font-medium">No-login link sharing</span>
            <span className="text-[10px] text-muted-foreground">
              Offers &quot;Anyone with the link&quot;. Same lever as
              /administration/sharing.
            </span>
          </span>
          <Switch
            checked={editor.isLinkShareable}
            onCheckedChange={(v) => onChange({ ...editor, isLinkShareable: v })}
          />
        </div>
      </div>

      {editor.isLinkShareable ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">
            Public columns{" "}
            <span className="font-normal text-muted-foreground">
              (comma-separated allowlist for anonymous viewers)
            </span>
          </span>
          <Input
            value={editor.publicColumns}
            onChange={(e) =>
              onChange({ ...editor, publicColumns: e.target.value })
            }
            placeholder="id, title, description, created_at"
            className="h-8 font-mono"
            style={{ fontSize: "16px" }}
          />
          <p className="text-xs text-muted-foreground">
            Default-deny — unknown/typo'd columns are dropped silently on save,
            never exposed by accident.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">Notes</span>
        <Textarea
          value={editor.notes}
          onChange={(e) => onChange({ ...editor, notes: e.target.value })}
          rows={3}
          placeholder="Why this is registered; grant-model caveats (e.g. ownership-asymmetric read)."
          style={{ fontSize: "16px" }}
        />
      </div>

      <div className="mt-auto flex justify-end gap-2 pb-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={saving || !valid} onClick={onSave}>
          {editor.mode === "create" ? "Register resource" : "Save resource"}
        </Button>
      </div>
    </div>
  );
}
