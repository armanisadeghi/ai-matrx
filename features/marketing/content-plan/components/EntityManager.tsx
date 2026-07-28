"use client";

/**
 * plan.entity CRUD for one site — the people / sources / media / orgs the
 * plan references (E-E-A-T). Source type comes from the seeded
 * `plan_source_type` category dimension.
 */
import { useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
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
import { CategorySelect } from "@/features/scopes/components/CategorySelect";

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

  const rows = entities.data ?? [];

  return (
    <div
      data-surface-value="entities_summary"
      className="flex h-full flex-col overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              People &amp; sources
            </h3>
            <p className="text-xs text-muted-foreground">
              The authors, reviewers, sources, and organizations behind this
              site's content (E-E-A-T).
            </p>
          </div>
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

        {entities.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 py-1">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : entities.isError ? (
          <p className="py-4 text-sm text-destructive">
            {extractErrorMessage(entities.error)}
          </p>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">
              No entities yet
            </p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
              Add the authors, reviewers, and sources this site's content will
              cite — nodes attach to them from the tree.
            </p>
            <Button
              size="sm"
              className="mt-4 h-7 text-xs"
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              <Plus className="mr-1 h-3 w-3" /> New entity
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {rows.map((entity) => (
              <div
                key={entity.id}
                className="group flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-accent/50"
              >
                <span className="w-16 shrink-0 rounded bg-muted px-1.5 py-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {entity.entity_type}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {entity.label}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label="Edit entity"
                  onClick={() => {
                    setEditing(entity);
                    setEditorOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label="Delete entity"
                  onClick={() => setDeleting(entity)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editorOpen ? (
        <EntityEditorDialog
          key={editing?.id ?? "new"}
          siteId={siteId}
          organizationId={organizationId}
          entity={editing}
          open={editorOpen}
          onOpenChange={setEditorOpen}
        />
      ) : null}
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
  // No re-seed logic needed: the dialog is mounted only while open and
  // keyed by the entity id, so useState initializers always seed fresh.

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
            <Label className="mb-1 block text-xs font-medium">Label</Label>
            <Input
              autoFocus
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Dr. Jane Smith"
              className="h-8"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs font-medium">Type</Label>
            <Select
              value={entityType}
              onValueChange={(next) => setEntityType(next as PlanEntityType)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_ENTITY_TYPES.map((type) => (
                  <SelectItem key={type} value={type} className="capitalize">
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs font-medium">Source type</Label>
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
