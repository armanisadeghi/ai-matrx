"use client";

/**
 * plan.entity CRUD for one site — the people / sources / media / orgs the
 * plan references (E-E-A-T). Source type comes from the seeded
 * `plan_source_type` category dimension.
 *
 * Also the WRITE end of `matrx-user/content-plan-entities` (see that
 * manifest's `writeTargets`). The editor dialog's draft is held HERE rather
 * than inside the dialog so one staging buffer serves all three readers: the
 * user's typing, the `entity_editor_draft` surface value, and the
 * `entity_draft` / `save_entity_draft` handlers. Every handler runs the same
 * mutation the dialog's own buttons run.
 */
import { useRef, useState } from "react";
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
import {
  SurfaceRuntimeProvider,
  useSurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
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
import { useSetupAgents } from "../setup/ai";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import { fetchFreshSite, readSiteResearchTopicId } from "../setup/draft";
import {
  PLAN_ENTITY_TYPES,
  type PlanEntityInsert,
  type PlanEntityRow,
  type PlanEntityType,
} from "../types";
import {
  parseCreateEntityWrite,
  parseEntityDraftWrite,
  parseOpenEntityEditorWrite,
  type EntityWriteContext,
} from "../lib/entity-write-targets";
import { CategorySelect } from "@/features/scopes/components/CategorySelect";

const SURFACE_NAME = "matrx-user/content-plan-entities";

/**
 * The entity dialog's staged draft — local until the user (or
 * `save_entity_draft`) commits it. `entityId === null` means "creating".
 */
interface EntityDraft {
  entityId: string | null;
  label: string;
  entityType: PlanEntityType;
  sourceTypeId: string | null;
}

function asRecord(value: unknown, target: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${target} expects an object value.`);
  }
  return value as Record<string, unknown>;
}

/** Validate against the REAL vocabulary constant, never a re-typed literal. */
function requireEntityType(raw: unknown, target: string): PlanEntityType {
  if (
    typeof raw !== "string" ||
    !PLAN_ENTITY_TYPES.includes(raw as PlanEntityType)
  ) {
    throw new Error(
      `${target}: entity_type must be exactly one of ${PLAN_ENTITY_TYPES.join(
        " | ",
      )}.`,
    );
  }
  return raw as PlanEntityType;
}

function requireLabel(raw: unknown, target: string): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(`${target}: label must be a non-empty string.`);
  }
  return raw.trim();
}

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
  const create = useCreatePlanEntity(siteId);
  const update = useUpdatePlanEntity(siteId);
  const queryClient = useQueryClient();
  const agents = useSetupAgents(siteId);
  // The SAME dimension the editor's CategorySelect renders from — loaded here
  // too so the surface can publish the picker's vocabulary (source_type_options)
  // and the handlers can refuse an id that is not in it. The hook is
  // idempotent per dimension, so this is the cached read, not a second fetch.
  const sourceTypes = useCategories({
    dimension: CATEGORY_DIMENSIONS.planSourceType,
  });

  /** The open editor's staged draft; `null` means no editor is open. */
  const [draft, setDraft] = useState<EntityDraft | null>(null);
  const [deleting, setDeleting] = useState<PlanEntityRow | null>(null);
  // Reported UP by the open dialog so `entity_editor` reflects what is TYPED,
  // not just which row is open. Null whenever the dialog is closed.
  const [editorSnapshot, setEditorSnapshot] =
    useState<EntityEditorSnapshot | null>(null);

  const rows = entities.data ?? [];
  const writeContext: EntityWriteContext = {
    sourceTypeIds: sourceTypes.categories.map((category) => category.id),
  };

  // The draft the write handlers read. Mirrored in a ref (and written
  // through it) so a `save_entity_draft` arriving in the same agent turn as
  // an `entity_draft` stage saves what was just staged, not the render-old
  // value — the agent's two tool calls are not separated by a React commit.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const setDraftState = (next: EntityDraft | null) => {
    draftRef.current = next;
    setDraft(next);
  };

  const openEditor = (entity: PlanEntityRow | null) =>
    setDraftState({
      entityId: entity?.id ?? null,
      label: entity?.label ?? "",
      entityType: (entity?.entity_type as PlanEntityType) ?? "person",
      sourceTypeId: entity?.source_type_id ?? null,
    });

  const patchDraft = (patch: Partial<EntityDraft>) => {
    const current = draftRef.current;
    if (!current) return;
    setDraftState({ ...current, ...patch });
  };

  const busy = create.isPending || update.isPending;

  /**
   * THE one save path — the dialog's Save/Create button and the
   * `save_entity_draft` target both land here. It THROWS on anything short
   * of a landed write: the button turns that into a toast, the write handler
   * lets it reach the writeback seam so an agent is never told a rejected
   * write succeeded.
   */
  const saveDraft = async (): Promise<PlanEntityRow> => {
    const current = draftRef.current;
    if (!current)
      throw new Error("No entity editor is open — nothing to save.");
    const label = current.label.trim();
    if (!label)
      throw new Error("An entity needs a label before it can be saved.");
    const patch = {
      label,
      entity_type: current.entityType,
      source_type_id: current.sourceTypeId,
    };
    const saved = current.entityId
      ? await update.mutateAsync({ id: current.entityId, patch })
      : await create.mutateAsync({
          site_id: siteId,
          organization_id: organizationId,
          ...patch,
        });
    // The service throws when the DB rejects the write, but a row that comes
    // back carrying different values means it did not take what we sent.
    if (saved.label !== label || saved.entity_type !== current.entityType) {
      throw new Error(
        `The saved entity came back as "${saved.label}" (${saved.entity_type}) — the write did not land as sent.`,
      );
    }
    const wasCreating = current.entityId === null;
    setDraftState(null);
    toast.success(wasCreating ? "Entity created." : "Entity saved.");
    return saved;
  };

  // The Entity Curator agent: read the site's linked research report and
  // propose real E-E-A-T entities; the user confirms before anything writes.
  const handleSuggestFromResearch = async () => {
    try {
      const fresh = await fetchFreshSite(siteId);
      const topicId = readSiteResearchTopicId(fresh.settings);
      if (!topicId) {
        toast.error(
          "No research topic is linked to this site yet — pick one in Setup's AI grounding bar (or the Generate popover) first.",
        );
        return;
      }
      const document = await getLatestSuccessfulDocument(topicId);
      const report = (document?.content ?? "").trim();
      if (!report) {
        toast.error(
          "The linked research topic has no successful final report — run Document assembly in Research first.",
        );
        return;
      }
      const outcome = await agents.curateEntities({
        research_report: report,
        site_domain: fresh.domain ?? fresh.name ?? "",
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
        toast.success(
          `Added ${created} entit${created === 1 ? "y" : "ies"} from the research report.`,
        );
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
      entity_editor_draft: draft
        ? {
            mode: draft.entityId ? "edit" : "new",
            entity_id: draft.entityId,
            label: draft.label,
            entity_type: draft.entityType,
            source_type_id: draft.sourceTypeId,
          }
        : undefined,
    });
  };

  // Write half of the surface. Registered by name (not through the
  // provider prop) so the handlers below always close over THIS render's
  // draft and roster — see useSurfaceWriteHandlers' ref indirection.
  useSurfaceWriteHandlers(SURFACE_NAME, {
    entity_draft: (value: unknown) => {
      const obj = asRecord(value, "entity_draft");
      // The entities view can be mounted with no editor open — and an agent
      // launched on the inherited content-plan surface may not even be
      // looking at this view. Refuse loudly rather than stage into nothing.
      if (!draftRef.current) {
        throw new Error(
          "entity_draft: no entity editor is open — the user has to open New entity (or Edit on a row) before a draft can be staged.",
        );
      }
      const patch: Partial<EntityDraft> = {};
      if (obj.label !== undefined) {
        patch.label = requireLabel(obj.label, "entity_draft");
      }
      if (obj.entity_type !== undefined) {
        patch.entityType = requireEntityType(obj.entity_type, "entity_draft");
      }
      if (Object.keys(patch).length === 0) {
        throw new Error(
          "entity_draft: provide label and/or entity_type — source type and identity fields are not agent-writable.",
        );
      }
      patchDraft(patch);
    },

    save_entity_draft: async () => {
      if (!draftRef.current) {
        throw new Error(
          "save_entity_draft: no entity editor is open — there is nothing staged to save.",
        );
      }
      await saveDraft();
    },

    add_entities: async (value: unknown) => {
      if (!siteId || !organizationId) {
        throw new Error(
          "add_entities: no site is loaded on the entities view — nothing can receive new entities.",
        );
      }
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error(
          "add_entities: expects a non-empty array of { label, entity_type, description?, reason? }.",
        );
      }
      const existing = new Set(
        rows.map((entity) => entity.label.trim().toLowerCase()),
      );
      const inserts = value.map((entry, index): PlanEntityInsert => {
        const where = `add_entities: [${index}]`;
        const record = asRecord(entry, where);
        const label = requireLabel(record.label, where);
        const entityType = requireEntityType(record.entity_type, where);
        const key = label.toLowerCase();
        if (existing.has(key)) {
          throw new Error(
            `${where}: "${label}" is already on this site's roster — add_entities only appends. Read entities_detail first.`,
          );
        }
        existing.add(key);
        // Same attributes shape the "Suggest from research" flow writes.
        const description = record.description;
        const reason = record.reason;
        for (const [key2, raw] of [
          ["description", description],
          ["reason", reason],
        ] as const) {
          if (raw !== undefined && typeof raw !== "string") {
            throw new Error(
              `${where}: ${key2} must be a string when provided.`,
            );
          }
        }
        const research: Record<string, string> = {};
        if (typeof description === "string" && description.trim()) {
          research.description = description.trim();
        }
        if (typeof reason === "string" && reason.trim()) {
          research.reason = reason.trim();
        }
        return {
          site_id: siteId,
          organization_id: organizationId,
          label,
          entity_type: entityType,
          ...(Object.keys(research).length > 0
            ? { attributes: { research } }
            : {}),
        };
      });
      // The SAME mutation the dialog's Create button runs. Each call returns
      // the inserted row and throws when the DB rejects it; a partial run is
      // reported as the partial run it was, never as success.
      const created: PlanEntityRow[] = [];
      for (const insert of inserts) {
        try {
          created.push(await create.mutateAsync(insert));
        } catch (error) {
          throw new Error(
            `add_entities: created ${created.length} of ${inserts.length}; "${insert.label}" failed — ${extractErrorMessage(error)}`,
          );
        }
      }
      const mismatched = created.filter(
        (row, index) => row.label !== inserts[index].label,
      );
      if (mismatched.length > 0) {
        throw new Error(
          `add_entities: ${mismatched.length} row(s) came back with a different label than sent — the write did not land as sent.`,
        );
      }
      toast.success(
        `Added ${created.length} entit${created.length === 1 ? "y" : "ies"}.`,
      );
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={buildWriteHandlers}
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
                  openEditor(null);
                }}
              >
                <Plus className="mr-1 h-3 w-3" /> New entity
              </Button>
            </div>
          </div>

          {/* Live curator output — the agent's stream renders while it works. */}
          {agents.live.hasLiveRun ? (
            <div className="mt-2">
              <LiveRunDisplay
                conversationId={agents.live.conversationId}
                label={agents.live.label ?? "Curating entities"}
                pending={agents.live.isRunning}
                onDismiss={agents.live.dismiss}
              />
            </div>
          ) : null}

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
                  openEditor(null);
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
                      openEditor(entity);
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

        {draft ? (
          <EntityEditorDialog
            draft={draft}
            busy={busy}
            onPatch={patchDraft}
            onClose={() => setDraftState(null)}
            onSave={() => {
              void saveDraft().catch((error) =>
                toast.error(
                  `Could not save the entity: ${extractErrorMessage(error)}`,
                ),
              );
            }}
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

/**
 * Controlled editor. It owns NO draft state — `EntityManager` holds the
 * staging buffer so the surface's `entity_editor_draft` value and the
 * `entity_draft` / `save_entity_draft` handlers see (and fill) exactly what
 * the user is looking at.
 */
function EntityEditorDialog({
  draft,
  busy,
  onPatch,
  onClose,
  onSave,
}: {
  draft: EntityDraft;
  busy: boolean;
  onPatch: (patch: Partial<EntityDraft>) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {draft.entityId ? "Edit entity" : "New entity"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs font-medium">Label</Label>
            <Input
              autoFocus
              value={draft.label}
              onChange={(event) => onPatch({ label: event.target.value })}
              placeholder="Dr. Jane Smith"
              className="h-8"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs font-medium">Type</Label>
            <Select
              value={draft.entityType}
              onValueChange={(next) =>
                onPatch({ entityType: next as PlanEntityType })
              }
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
            <Label className="mb-1 block text-xs font-medium">
              Source type
            </Label>
            <CategorySelect
              dimension={CATEGORY_DIMENSIONS.planSourceType}
              value={draft.sourceTypeId}
              onChange={(next) => onPatch({ sourceTypeId: next })}
              placeholder="Source type"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!draft.label.trim() || busy}
            onClick={onSave}
          >
            {busy ? "Saving\u2026" : draft.entityId ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
