"use client";

/**
 * plan.entity CRUD for one site — the people / sources / media / orgs the
 * plan references (E-E-A-T). Source type comes from the seeded
 * `plan_source_type` category dimension.
 */
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import {
  useCreatePlanEntity,
  useDeletePlanEntity,
  usePlanEntities,
  useUpdatePlanEntity,
} from "../data/hooks";
import {
  PLAN_ENTITY_TYPES,
  type PlanEntityRow,
  type PlanEntityType,
} from "../types";
import { CategorySelect } from "./CategorySelect";

export function EntityManager({
  siteId,
  organizationId,
}: {
  siteId: string;
  /** The SITE's org — required on inserts; the DB guard verifies it. */
  organizationId: string;
}) {
  const entities = usePlanEntities(siteId);
  const remove = useDeletePlanEntity(siteId);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PlanEntityRow | null>(null);
  const [deleting, setDeleting] = useState<PlanEntityRow | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-sm font-medium">People &amp; sources</h3>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="mr-1 h-3 w-3" /> New entity
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {entities.isLoading ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">Loading…</p>
        ) : entities.isError ? (
          <p className="px-3 py-4 text-xs text-destructive">
            {extractErrorMessage(entities.error)}
          </p>
        ) : (entities.data ?? []).length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            No entities yet. Add the authors, reviewers, and sources this
            site's content will cite.
          </p>
        ) : (
          (entities.data ?? []).map((entity) => (
            <div
              key={entity.id}
              className="group flex items-center gap-2 border-b border-border/40 px-3 py-1.5 text-sm"
            >
              <span className="rounded bg-muted px-1 text-[10px] uppercase text-muted-foreground">
                {entity.entity_type}
              </span>
              <span className="min-w-0 flex-1 truncate">{entity.label}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                aria-label="Edit entity"
                onClick={() => {
                  setEditing(entity);
                  setEditorOpen(true);
                }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                aria-label="Delete entity"
                onClick={() => setDeleting(entity)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))
        )}
      </div>

      <EntityEditorDialog
        siteId={siteId}
        organizationId={organizationId}
        entity={editing}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this entity?"
        description={
          deleting
            ? `"${deleting.label}" will be soft-deleted; its node attachments are swept by the platform GC.`
            : undefined
        }
        confirmLabel="Delete"
        variant="destructive"
        busy={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              toast.success("Entity deleted.");
            },
            onError: (error) => {
              setDeleting(null);
              toast.error(extractErrorMessage(error));
            },
          });
        }}
      />
    </div>
  );
}

function EntityEditorDialog({
  siteId,
  organizationId,
  entity,
  open,
  onOpenChange,
}: {
  siteId: string;
  organizationId: string;
  entity: PlanEntityRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreatePlanEntity(siteId);
  const update = useUpdatePlanEntity(siteId);

  const [label, setLabel] = useState(entity?.label ?? "");
  const [entityType, setEntityType] = useState<PlanEntityType>(
    (entity?.entity_type as PlanEntityType) ?? "person",
  );
  const [sourceTypeId, setSourceTypeId] = useState<string | null>(
    entity?.source_type_id ?? null,
  );
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Re-seed local state when the dialog opens for a different row.
  const seedKey = `${open}:${entity?.id ?? "new"}`;
  if (open && seededFor !== seedKey) {
    setSeededFor(seedKey);
    setLabel(entity?.label ?? "");
    setEntityType((entity?.entity_type as PlanEntityType) ?? "person");
    setSourceTypeId(entity?.source_type_id ?? null);
  }

  const busy = create.isPending || update.isPending;

  const submit = () => {
    const onError = (error: unknown) =>
      toast.error(`Could not save the entity: ${extractErrorMessage(error)}`);
    if (entity) {
      update.mutate(
        {
          id: entity.id,
          patch: {
            label: label.trim(),
            entity_type: entityType,
            source_type_id: sourceTypeId,
          },
        },
        {
          onSuccess: () => {
            onOpenChange(false);
            toast.success("Entity saved.");
          },
          onError,
        },
      );
    } else {
      create.mutate(
        {
          site_id: siteId,
          organization_id: organizationId,
          label: label.trim(),
          entity_type: entityType,
          source_type_id: sourceTypeId,
        },
        {
          onSuccess: () => {
            onOpenChange(false);
            toast.success("Entity created.");
          },
          onError,
        },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{entity ? "Edit entity" : "New entity"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Label</Label>
            <Input
              autoFocus
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Dr. Jane Smith"
              className="h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select
              value={entityType}
              onValueChange={(next) => setEntityType(next as PlanEntityType)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_ENTITY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Source type</Label>
            <CategorySelect
              dimension={CATEGORY_DIMENSIONS.planSourceType}
              value={sourceTypeId}
              onChange={setSourceTypeId}
              placeholder="Source type"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!label.trim() || busy} onClick={submit}>
            {busy ? "Saving…" : entity ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
