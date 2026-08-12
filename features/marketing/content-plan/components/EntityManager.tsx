"use client";

/**
 * plan.entity CRUD for one site — the people / sources / media / orgs the
 * plan references (E-E-A-T). Source type comes from the seeded
 * `plan_source_type` category dimension.
 */
import { useState } from "react";
import { Lightbulb, Loader2, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

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
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { createContentPlanEntitiesScope } from "@/features/surfaces/manifests/content-plan-entities.manifest";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { getLatestSuccessfulDocument } from "@/features/research/service";

import {
  planKeys,
  useCreatePlanEntity,
  useDeletePlanEntity,
  usePlanEntities,
  useUpdatePlanEntity,
} from "../data/hooks";
import { createPlanEntity } from "../data/service";
import { EntityAttachDialog } from "./EntityAttachDialog";
import { useSetupAgents } from "../setup/ai";
import { fetchFreshSite, readSiteResearchTopicId } from "../setup/draft";
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
  const queryClient = useQueryClient();
  const agents = useSetupAgents(siteId);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PlanEntityRow | null>(null);
  const [deleting, setDeleting] = useState<PlanEntityRow | null>(null);

  const rows = entities.data ?? [];

  // Real per-node status for the attacher's `current_plan` — never fabricated.
  const statuses = useCategories({ dimension: CATEGORY_DIMENSIONS.planStatus });
  const statusSlugById = new Map<string, string>();
  for (const category of statuses.categories) {
    if (category.slug) statusSlugById.set(category.id, category.slug);
  }

  // Both entity agents are grounded in the SAME artifact — the site's linked
  // research topic's latest successful Document. Resolved in one place so the
  // two can never disagree about what "the report" is.
  const resolveResearchReport = async (): Promise<{
    report: string;
    domain: string;
  }> => {
    const fresh = await fetchFreshSite(siteId);
    const topicId = readSiteResearchTopicId(fresh.settings);
    if (!topicId) {
      toast.error(
        "No research topic is linked to this site yet — pick one in Setup's AI grounding bar (or the Generate popover) first.",
      );
      return { report: "", domain: "" };
    }
    const document = await getLatestSuccessfulDocument(topicId);
    const report = (document?.content ?? "").trim();
    if (!report) {
      toast.error(
        "The linked research topic has no successful final report — run Document assembly in Research first.",
      );
    }
    return { report, domain: fresh.domain ?? fresh.name ?? "" };
  };

  // The Entity Curator agent: read the site's linked research report and
  // propose real E-E-A-T entities; the user confirms before anything writes.
  const handleSuggestFromResearch = async () => {
    try {
      const { report, domain } = await resolveResearchReport();
      if (!report) return;
      const outcome = await agents.curateEntities({
        research_report: report,
        site_domain: domain,
        existing_entities: rows
          .map((entity) => `${entity.entity_type}: ${entity.label}`)
          .join("\n"),
        guidance: "",
      });
      const existingLabels = new Set(
        rows.map((entity) => entity.label.trim().toLowerCase()),
      );
      const fresh_suggestions = outcome.entities.filter(
        (item) => !existingLabels.has(item.label.trim().toLowerCase()),
      );
      if (fresh_suggestions.length === 0) {
        toast.success(
          outcome.notes ||
            "The curator found nothing new — everything it proposed already exists.",
        );
        return;
      }
      const ok = await confirm({
        title: `Add ${fresh_suggestions.length} suggested entit${fresh_suggestions.length === 1 ? "y" : "ies"}?`,
        description:
          fresh_suggestions
            .map((item) => `${item.entityType}: ${item.label}`)
            .join(" · ") + (outcome.notes ? ` — ${outcome.notes}` : ""),
        confirmLabel: "Add entities",
      });
      if (!ok) return;
      let created = 0;
      const failures: string[] = [];
      for (const item of fresh_suggestions) {
        try {
          await createPlanEntity({
            site_id: siteId,
            organization_id: organizationId,
            label: item.label,
            entity_type: item.entityType,
            attributes: {
              research: { description: item.description, reason: item.reason },
            },
          });
          created += 1;
        } catch (error) {
          failures.push(`${item.label}: ${extractErrorMessage(error)}`);
        }
      }
      await queryClient.invalidateQueries({
        queryKey: planKeys.entities(siteId),
      });
      if (failures.length > 0) {
        toast.error(
          `Added ${created}; ${failures.length} failed — ${failures[0]}`,
        );
      } else {
        toast.success(`Added ${created} entit${created === 1 ? "y" : "ies"} from the research report.`);
      }
    } catch (error) {
      toast.error(`Entity suggestion failed: ${extractErrorMessage(error)}`);
    }
  };

  // Surface: matrx-user/content-plan-entities — nested provider (deepest
  // wins while this view renders). Agents here see the FULL roster; the
  // workspace surface behind it keeps the site + plan context.
  const getScope = () => {
    const countsByType: Record<string, number> = {};
    for (const entity of rows) {
      countsByType[entity.entity_type] =
        (countsByType[entity.entity_type] ?? 0) + 1;
    }
    return createContentPlanEntitiesScope({
      view: "entities",
      entities_detail:
        entities.data !== undefined
          ? rows.map((entity) => ({
              id: entity.id,
              label: entity.label,
              entity_type: entity.entity_type,
              source_type_id: entity.source_type_id,
              attributes: entity.attributes,
            }))
          : undefined,
      entity_counts_by_type:
        entities.data !== undefined ? countsByType : undefined,
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/content-plan-entities"
      getScope={getScope}
    >
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
          <div className="flex items-center gap-1.5">
            <EntityAttachDialog
              siteId={siteId}
              entities={rows}
              rosterLoading={entities.isLoading}
              rosterError={
                entities.isError ? extractErrorMessage(entities.error) : null
              }
              statusSlugById={statusSlugById}
              agents={agents}
              researchReport={async () => (await resolveResearchReport()).report}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={agents.entitiesBusy}
              title="Read the site's linked research report and propose the real people, standards, and sources this content should cite."
              onClick={() => void handleSuggestFromResearch()}
            >
              {agents.entitiesBusy ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Lightbulb className="mr-1 h-3 w-3" />
              )}
              Suggest from research
            </Button>
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
    </SurfaceRuntimeProvider>
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
