"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Save,
  X,
  ArrowRight,
  ExternalLink,
  LayoutPanelLeft,
  Check,
  Loader2,
  Calendar,
  Flag,
  Folder,
  Link2,
  Tag,
  Flame,
  MessagesSquare,
  StickyNote,
  MessageSquare,
  CheckSquare,
  FileText,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/ButtonMine";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useAssociateTask } from "@/features/tasks/hooks/useAssociateTask";
import { selectProjects } from "@/features/tasks/redux/selectors";
import { setSelectedTaskId } from "@/features/tasks/redux/taskUiSlice";
import { setQuickTasksSelectedTaskId } from "@/features/tasks/redux/quickTasksWindowSlice";
import {
  selectOrganizationId,
  selectScopeSelectionsContext,
  selectProjectId,
  selectProjectName,
} from "@/lib/redux/slices/appContextSlice";
import {
  selectAllScopesFlat,
  selectAllScopeTypesFlat,
} from "@/features/scopes/redux/selectors/tree";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { toast } from "sonner";
import { ConversationHoverPreview } from "@/features/agents/components/previews/ConversationHoverPreview";
import { MessageHoverPreview } from "@/features/agents/components/previews/MessageHoverPreview";

export type PostSaveAction = "newTab" | "navigate" | "openWindow" | "none";
type Priority = "low" | "medium" | "high" | "";

export interface TaskSourceInput {
  entity_type: string;
  entity_id: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskPrePopulate {
  title?: string;
  description?: string;
  priority?: "low" | "medium" | "high";
}

export interface TaskQuickCreateCoreProps {
  /** Entity this task should link to. A cx_message source with a
   *  metadata.parent of cx_conversation gets a link-scope toggle. */
  source?: TaskSourceInput;
  prePopulate?: TaskPrePopulate;
  compact?: boolean;
  saveLabel?: string;
  onSaved?: (taskId: string, action: PostSaveAction) => void;
  onCancel?: () => void;
  className?: string;
}

type LinkScope = "message" | "conversation" | "both";

interface ParentRef {
  entity_type: string;
  entity_id: string;
  label?: string;
}

/**
 * Reusable quick-create form body. Grows to fill its container (window,
 * popover, drawer). Owns all state; pulls defaults from Redux; writes via
 * the `useAssociateTask` hook.
 *
 * Layout:
 *   [Title]
 *   [Description (grows) | Scopes (grows)]
 *   [Project · Priority · Due]
 *   [Attachment chip(s) — clarifies "this message is LINKED to the task"]
 *   [Footer actions]
 */
export function TaskQuickCreateCore({
  source,
  prePopulate,
  compact = false,
  saveLabel,
  onSaved,
  onCancel,
  className,
}: TaskQuickCreateCoreProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { createAndAssociate, associate, isBusy } = useAssociateTask();

  // Context defaults (data is already in Redux via useNavTree — no fetch needed)
  const orgId = useAppSelector(selectOrganizationId);
  const appProjectId = useAppSelector(selectProjectId);
  const appProjectName = useAppSelector(selectProjectName);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);
  const projects = useAppSelector(selectProjects);
  const allScopes = useAppSelector(selectAllScopesFlat);
  const allScopeTypes = useAppSelector(selectAllScopeTypesFlat);

  const initialScopeIds = useMemo(
    () =>
      Object.values(scopeSelections ?? {}).filter(
        (v): v is string => typeof v === "string" && v.length > 0,
      ),
    [scopeSelections],
  );

  const parent = (source?.metadata?.parent as ParentRef | undefined) ?? null;
  const hasParent =
    !!parent && !!parent.entity_type && !!parent.entity_id && !!source;

  const [title, setTitle] = useState(prePopulate?.title ?? "");
  const [description, setDescription] = useState(
    prePopulate?.description ?? "",
  );
  const [priority, setPriority] = useState<Priority>(
    (prePopulate?.priority as Priority) ?? "",
  );
  const [dueDate, setDueDate] = useState("");
  const [projectId, setProjectId] = useState<string>(
    appProjectId && appProjectId !== "__unassigned__" ? appProjectId : "",
  );
  const [scopeIds, setScopeIds] = useState<string[]>(initialScopeIds);
  const [linkScope, setLinkScope] = useState<LinkScope>(
    hasParent ? "both" : "message",
  );
  const [savedTaskId, setSavedTaskId] = useState<string | null>(null);
  const [scopesTouched, setScopesTouched] = useState(false);

  // Keep scope defaults in sync if user changes app context AFTER opening
  useEffect(() => {
    if (scopesTouched) return;
    setScopeIds(initialScopeIds);
  }, [initialScopeIds, scopesTouched]);

  // Flat scope structure — mirrors the sidebar. All data is already hydrated
  // in Redux via useNavTree / fetchFullContext. No per-org fetch required.
  // Show everything the user has access to, grouped by type.
  const scopeGroups = useMemo(() => {
    return allScopeTypes
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((t) => ({
        type_id: t.id,
        label: t.label_plural,
        color: t.color,
        icon: t.icon,
        scopes: allScopes.filter((s) => s.scope_type_id === t.id),
        max_assignments: t.max_assignments_per_entity,
      }))
      .filter((g) => g.scopes.length > 0);
  }, [allScopes, allScopeTypes]);

  const selectedSet = useMemo(() => new Set(scopeIds), [scopeIds]);

  const toggleScope = (scopeId: string, typeId: string, max: number | null) => {
    setScopesTouched(true);
    setScopeIds((prev) => {
      const next = new Set(prev);
      if (next.has(scopeId)) {
        next.delete(scopeId);
      } else {
        if (max === 1) {
          for (const s of allScopes) {
            if (s.scope_type_id === typeId && next.has(s.id)) next.delete(s.id);
          }
        }
        next.add(scopeId);
      }
      return Array.from(next);
    });
  };

  const canSave = !!title.trim() && !isBusy && !savedTaskId;

  // Derive which link(s) to write from the linkScope toggle
  const effectiveSources = useMemo((): {
    primary?: TaskSourceInput;
    secondary?: TaskSourceInput;
  } => {
    if (!source) return {};
    if (!hasParent) return { primary: source };
    if (linkScope === "message") return { primary: source };
    if (linkScope === "conversation")
      return {
        primary: {
          entity_type: parent!.entity_type,
          entity_id: parent!.entity_id,
          label: parent!.label ?? source.label,
          metadata: {},
        },
      };
    // both
    return {
      primary: source,
      secondary: {
        entity_type: parent!.entity_type,
        entity_id: parent!.entity_id,
        label: parent!.label ?? source.label,
        metadata: {},
      },
    };
  }, [source, parent, hasParent, linkScope]);

  const handleSave = useCallback(async () => {
    if (!canSave) return;

    const { primary, secondary } = effectiveSources;

    const taskId = await createAndAssociate({
      title: title.trim(),
      description: description.trim() || null,
      priority: (priority || null) as "low" | "medium" | "high" | null,
      due_date: dueDate || null,
      project_id: projectId || null,
      organization_id: orgId ?? null,
      scope_ids: scopeIds,
      source: primary
        ? {
            entity_type: primary.entity_type,
            entity_id: primary.entity_id,
            label: primary.label,
            metadata: primary.metadata,
          }
        : undefined,
    });

    if (!taskId) {
      toast.error("Could not create task");
      return;
    }

    if (secondary?.entity_type && secondary.entity_id) {
      try {
        await associate(taskId, {
          entity_type: secondary.entity_type,
          entity_id: secondary.entity_id,
          label: secondary.label,
        });
      } catch {
        /* best-effort */
      }
    }

    dispatch(setSelectedTaskId(taskId));
    setSavedTaskId(taskId);
    toast.success("Task created");
  }, [
    canSave,
    createAndAssociate,
    associate,
    dispatch,
    title,
    description,
    priority,
    dueDate,
    projectId,
    orgId,
    scopeIds,
    effectiveSources,
  ]);

  const handlePostSaveAction = useCallback(
    (action: PostSaveAction) => {
      if (!savedTaskId) return;
      if (action === "newTab") {
        window.open(
          `/tasks?task=${savedTaskId}`,
          "_blank",
          "noopener,noreferrer",
        );
      } else if (action === "navigate") {
        router.push(`/tasks?task=${savedTaskId}`);
      } else if (action === "openWindow") {
        // QuickTasksWindow reads its selected task from quickTasksWindowSlice
        // rather than overlay data, so seed the slice first then open. The
        // overlay's `data` payload stays empty; previously this site passed
        // `{ taskId }` which the window silently ignored.
        dispatch(setQuickTasksSelectedTaskId(savedTaskId));
        dispatch(openOverlay({ overlayId: "quickTasksWindow" }));
      }
      onSaved?.(savedTaskId, action);
    },
    [savedTaskId, router, dispatch, onSaved],
  );

  return (
    <div
      className={cn(
        "flex flex-col h-full min-h-0",
        compact ? "gap-1.5" : "gap-2.5",
        className,
      )}
    >
      {/* Post-save banner */}
      {savedTaskId && (
        <div className="shrink-0 flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs">
          <Check className="h-3.5 w-3.5 text-green-600" />
          <span className="font-medium">Task created</span>
          {source && (
            <span className="text-muted-foreground">
              · linked to{" "}
              {entityTypeLabel(
                linkScope === "conversation" && parent
                  ? parent.entity_type
                  : source.entity_type,
              )}
            </span>
          )}
        </div>
      )}

      {/* ── Title ─────────────────────────────────────────────────────── */}
      {!savedTaskId && (
        <div className="shrink-0 grid gap-1 min-w-0">
          <Label htmlFor="tqc-title" className="text-xs">
            Title
          </Label>
          <Input
            id="tqc-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSave();
              }
            }}
            placeholder="What do you want to do?"
            className="h-9 text-sm"
            style={{ fontSize: "16px" }}
          />
        </div>
      )}

      {/* ── Body: description (flex-3) + scopes (flex-2) ───────────────── */}
      {!savedTaskId && (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">
          <div className="lg:flex-[3] flex flex-col min-h-0 min-w-0 gap-1">
            <Label htmlFor="tqc-desc" className="text-xs shrink-0">
              Description
            </Label>
            <textarea
              id="tqc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — more detail about this task"
              className={cn(
                "flex-1 min-h-0 w-full resize-none rounded-md border border-input bg-background px-3 py-2",
                "text-sm placeholder:text-muted-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
              )}
              style={{ fontSize: "16px" }}
            />
          </div>

          <div className="lg:flex-[2] flex flex-col min-h-0 min-w-0 gap-1">
            <Label className="text-xs shrink-0 flex items-center gap-1.5">
              <Tag className="w-3 h-3" />
              Scopes
              {scopeIds.length > 0 && (
                <Badge
                  variant="outline"
                  className="h-4 px-1 text-[9px] font-medium"
                >
                  {scopeIds.length}
                </Badge>
              )}
            </Label>
            <ScopeTagsEditor
              groups={scopeGroups}
              selectedSet={selectedSet}
              onToggle={toggleScope}
            />
          </div>
        </div>
      )}

      {/* ── Meta row: project / priority / due ─────────────────────────── */}
      {!savedTaskId && (
        <div className="shrink-0 grid grid-cols-3 gap-2 min-w-0">
          <div className="grid gap-1 min-w-0">
            <Label
              htmlFor="tqc-project"
              className="text-xs flex items-center gap-1"
            >
              <Folder className="w-3 h-3" /> Project
            </Label>
            <Select
              value={projectId || "__none__"}
              onValueChange={(v) => setProjectId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger
                id="tqc-project"
                className="h-8 text-xs rounded-md"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {appProjectName
                    ? `Inherit (${appProjectName})`
                    : "Unassigned"}
                </SelectItem>
                {projects
                  .filter((p) => p.id !== "__unassigned__")
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1 min-w-0">
            <Label
              htmlFor="tqc-priority"
              className="text-xs flex items-center gap-1"
            >
              <Flag className="w-3 h-3" /> Priority
            </Label>
            <Select
              value={priority || "none"}
              onValueChange={(v) =>
                setPriority((v === "none" ? "" : v) as Priority)
              }
            >
              <SelectTrigger
                id="tqc-priority"
                className="h-8 text-xs rounded-md"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1 min-w-0">
            <Label
              htmlFor="tqc-due"
              className="text-xs flex items-center gap-1"
            >
              <Calendar className="w-3 h-3" /> Due
            </Label>
            <Input
              id="tqc-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-8 text-xs rounded-md"
            />
          </div>
        </div>
      )}

      {/* ── Attachment chips — the task links "attached" to this task ──── */}
      {!savedTaskId && source && (
        <div className="shrink-0 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Link2 className="w-3 h-3" />
              Attached to this task
            </Label>
            {hasParent && (
              <LinkScopeToggle value={linkScope} onChange={setLinkScope} />
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(linkScope === "message" || linkScope === "both") && (
              <ResourceLinkChip
                entityType={source.entity_type}
                entityId={source.entity_id}
                parentEntityId={parent?.entity_id}
                label={source.label}
                onOpen={() =>
                  openEntity(
                    source.entity_type,
                    source.entity_id,
                    parent?.entity_id,
                  )
                }
              />
            )}
            {hasParent &&
              (linkScope === "conversation" || linkScope === "both") && (
                <ResourceLinkChip
                  entityType={parent!.entity_type}
                  entityId={parent!.entity_id}
                  label={parent!.label ?? source.label}
                  onOpen={() =>
                    openEntity(parent!.entity_type, parent!.entity_id)
                  }
                />
              )}
          </div>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-end gap-2 pt-1">
        {savedTaskId ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handlePostSaveAction("newTab")}
              className="h-8 text-xs gap-1.5 rounded-md"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New tab</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handlePostSaveAction("openWindow")}
              className="h-8 text-xs gap-1.5 rounded-md"
            >
              <LayoutPanelLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Window</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handlePostSaveAction("navigate")}
              className="h-8 text-xs gap-1.5 rounded-md"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Go to task</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => handlePostSaveAction("none")}
              className="h-8 text-xs rounded-md"
            >
              Done
            </Button>
          </>
        ) : (
          <>
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCancel}
                disabled={isBusy}
                className="h-8 text-xs gap-1.5 rounded-md"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!canSave}
              className="h-8 text-xs gap-1.5 rounded-md"
            >
              {isBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : source ? (
                <Link2 className="h-3.5 w-3.5" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {isBusy
                ? "Saving…"
                : (saveLabel ?? (source ? "Create & attach" : "Create task"))}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

interface ScopeGroup {
  type_id: string;
  label: string;
  icon: string;
  color: string;
  scopes: { id: string; name: string }[];
  max_assignments: number | null;
}

function ScopeTagsEditor({
  groups,
  selectedSet,
  onToggle,
}: {
  groups: ScopeGroup[];
  selectedSet: Set<string>;
  onToggle: (scopeId: string, typeId: string, max: number | null) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center rounded-md border border-border/60 bg-muted/30 px-3 py-4">
        <p className="text-[11px] text-muted-foreground text-center">
          No scopes defined yet.
        </p>
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 rounded-md border border-border/60 bg-background overflow-y-auto">
      <div className="p-1 space-y-1.5">
        {groups.map((group) => {
          const selectedInGroup = group.scopes.filter((s) =>
            selectedSet.has(s.id),
          ).length;
          return (
            <div key={group.type_id}>
              <div className="flex items-center gap-1.5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: group.color || "currentColor" }}
                />
                <span className="truncate flex-1">{group.label}</span>
                {group.max_assignments !== null && (
                  <span className="text-muted-foreground/60 font-normal normal-case">
                    {selectedInGroup}/{group.max_assignments}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1 px-1 py-0.5">
                {group.scopes.map((scope) => {
                  const active = selectedSet.has(scope.id);
                  return (
                    <button
                      key={scope.id}
                      type="button"
                      onClick={() =>
                        onToggle(scope.id, group.type_id, group.max_assignments)
                      }
                      className={cn(
                        "inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[11px] font-medium transition-colors",
                        active
                          ? "border-transparent text-white shadow-sm"
                          : "border-border/60 text-foreground/80 hover:bg-accent hover:border-foreground/30",
                      )}
                      style={
                        active
                          ? {
                              backgroundColor: group.color || undefined,
                              borderColor: group.color || undefined,
                            }
                          : { color: group.color || undefined }
                      }
                    >
                      <span className="truncate max-w-[140px]">
                        {scope.name}
                      </span>
                      {active && <Check className="w-2.5 h-2.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function LinkScopeToggle({
  value,
  onChange,
}: {
  value: LinkScope;
  onChange: (v: LinkScope) => void;
}) {
  const options: { value: LinkScope; label: string }[] = [
    { value: "message", label: "Message" },
    { value: "conversation", label: "Conversation" },
    { value: "both", label: "Both" },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-background p-0.5">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "h-5 px-2 rounded text-[10px] font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function ResourceLinkChip({
  entityType,
  entityId,
  parentEntityId,
  label,
  onOpen,
}: {
  entityType: string;
  /** UUID of the entity (message id, conversation id, etc.). */
  entityId?: string;
  /** For message chips, the conversation id that owns the message. */
  parentEntityId?: string;
  label?: string;
  onOpen: () => void;
}) {
  const { Icon, colorClass, bgClass, typeLabel } = getEntityStyle(entityType);
  const preview = (label ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

  const chip = (
    <button
      type="button"
      onClick={onOpen}
      title="Open source"
      className={cn(
        "group inline-flex items-center gap-1.5 max-w-full rounded-full px-2 py-1 text-[11px] transition-colors",
        bgClass,
        "hover:ring-1 hover:ring-foreground/20",
      )}
    >
      <Icon className={cn("w-3 h-3 shrink-0", colorClass)} />
      <span className={cn("font-semibold shrink-0", colorClass)}>
        {typeLabel}
      </span>
      {preview && (
        <>
          <span className="text-muted-foreground shrink-0">·</span>
          <span className="text-foreground truncate">
            {preview}
            {label && label.length > 80 ? "…" : ""}
          </span>
        </>
      )}
      <ExternalLink className="w-3 h-3 shrink-0 opacity-50 group-hover:opacity-100" />
    </button>
  );

  // Wrap with the appropriate hover preview when we have the necessary ids.
  const isConversation =
    entityType === "cx_conversation" ||
    entityType === "conversation" ||
    entityType === "agent_conversation";
  const isMessage = entityType === "cx_message" || entityType === "message";

  if (isConversation && entityId) {
    return (
      <ConversationHoverPreview
        conversationId={entityId}
        side="top"
        align="start"
        onOpen={onOpen}
      >
        {chip}
      </ConversationHoverPreview>
    );
  }

  if (isMessage && entityId && parentEntityId) {
    return (
      <MessageHoverPreview
        conversationId={parentEntityId}
        messageId={entityId}
        side="top"
        align="start"
        onOpen={onOpen}
      >
        {chip}
      </MessageHoverPreview>
    );
  }

  return chip;
}

function getEntityStyle(entityType: string): {
  Icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  bgClass: string;
  typeLabel: string;
} {
  switch (entityType) {
    case "cx_message":
      return {
        Icon: Flame,
        colorClass: "text-violet-600 dark:text-violet-400",
        bgClass: "bg-violet-500/10",
        typeLabel: "AI message",
      };
    case "cx_conversation":
      return {
        Icon: MessagesSquare,
        colorClass: "text-blue-600 dark:text-blue-400",
        bgClass: "bg-blue-500/10",
        typeLabel: "AI conversation",
      };
    case "message":
      return {
        Icon: MessageSquare,
        colorClass: "text-slate-600 dark:text-slate-400",
        bgClass: "bg-slate-500/10",
        typeLabel: "Message",
      };
    case "conversation":
      return {
        Icon: MessagesSquare,
        colorClass: "text-slate-600 dark:text-slate-400",
        bgClass: "bg-slate-500/10",
        typeLabel: "Conversation",
      };
    case "agent_conversation":
      return {
        Icon: Cpu,
        colorClass: "text-indigo-600 dark:text-indigo-400",
        bgClass: "bg-indigo-500/10",
        typeLabel: "Agent chat",
      };
    case "note":
      return {
        Icon: StickyNote,
        colorClass: "text-orange-600 dark:text-orange-400",
        bgClass: "bg-orange-500/10",
        typeLabel: "Note",
      };
    case "user_file":
      return {
        Icon: FileText,
        colorClass: "text-purple-600 dark:text-purple-400",
        bgClass: "bg-purple-500/10",
        typeLabel: "File",
      };
    case "chat_block":
      return {
        Icon: CheckSquare,
        colorClass: "text-teal-600 dark:text-teal-400",
        bgClass: "bg-teal-500/10",
        typeLabel: "Chat block",
      };
    default:
      return {
        Icon: Link2,
        colorClass: "text-gray-600 dark:text-gray-400",
        bgClass: "bg-gray-500/10",
        typeLabel: entityType,
      };
  }
}

function entityTypeLabel(t: string): string {
  return getEntityStyle(t).typeLabel;
}

function openEntity(
  entityType: string,
  entityId: string,
  parentConversationId?: string,
) {
  if (!entityId) return;
  if (entityType === "cx_conversation") {
    window.open(`/demos/chat/c/${entityId}`, "_blank", "noopener,noreferrer");
  } else if (entityType === "cx_message" && parentConversationId) {
    window.open(
      `/demos/chat/c/${parentConversationId}#m-${entityId}`,
      "_blank",
      "noopener,noreferrer",
    );
  } else if (entityType === "note") {
    window.open(`/notes?active=${entityId}`, "_blank", "noopener,noreferrer");
  }
  // Unknown types: no-op (chip still shows what's linked)
}
