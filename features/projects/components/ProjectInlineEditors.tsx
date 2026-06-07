"use client";

/**
 * ProjectInlineEditors — the project's fields, editable IN PLACE (no Edit/Save
 * mode toggle, no separate edit page). Every field autosaves via updateProject
 * and reports the patch up so the parent keeps its local Project in sync.
 *
 * Used by the workspace hero (view == edit) AND the Manage page. Mirrors the
 * scope-system inline-edit + popover-picker patterns.
 *
 * Exports:
 *   - <InlineProjectName>        click-to-edit title
 *   - <InlineProjectDescription> always-available description (click to edit)
 *   - <ProjectMetaRow>           status / priority / start / target / org pills
 *   - PROJECT_STATUS_META / PROJECT_PRIORITY_META (shared styling)
 */

import React from "react";
import { format } from "date-fns";
import {
  Pencil,
  X,
  Building2,
  Flag,
  CalendarClock,
  CalendarRange,
  CircleDashed,
  CircleDot,
  CirclePause,
  CircleCheck,
  Archive,
  Plus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/utils/cn";
import { toast } from "sonner";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { updateProject } from "../service";
import type {
  Project,
  ProjectStatus,
  ProjectPriority,
  UpdateProjectOptions,
} from "../types";

// ─── Shared styling vocab ──────────────────────────────────────────────────

export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; pill: string }
> = {
  planning: {
    label: "Planning",
    icon: CircleDashed,
    pill: "text-violet-600 dark:text-violet-400 border-violet-300 dark:border-violet-800 bg-violet-500/5",
  },
  active: {
    label: "Active",
    icon: CircleDot,
    pill: "text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 bg-emerald-500/5",
  },
  paused: {
    label: "Paused",
    icon: CirclePause,
    pill: "text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800 bg-amber-500/5",
  },
  completed: {
    label: "Completed",
    icon: CircleCheck,
    pill: "text-sky-600 dark:text-sky-400 border-sky-300 dark:border-sky-800 bg-sky-500/5",
  },
  archived: {
    label: "Archived",
    icon: Archive,
    pill: "text-muted-foreground border-border bg-muted/30",
  },
};

const STATUS_ORDER: ProjectStatus[] = [
  "planning",
  "active",
  "paused",
  "completed",
  "archived",
];

export const PROJECT_PRIORITY_META: Record<
  ProjectPriority,
  { label: string; pill: string }
> = {
  high: {
    label: "High",
    pill: "text-red-600 dark:text-red-400 border-red-300 dark:border-red-800 bg-red-500/5",
  },
  medium: {
    label: "Medium",
    pill: "text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800 bg-amber-500/5",
  },
  low: {
    label: "Low",
    pill: "text-sky-600 dark:text-sky-400 border-sky-300 dark:border-sky-800 bg-sky-500/5",
  },
};

const PRIORITY_ORDER: ProjectPriority[] = ["high", "medium", "low"];

// ─── date helpers (date-only, no TZ shift) ─────────────────────────────────

function parseDateOnly(v: string | null | undefined): Date | undefined {
  if (!v) return undefined;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}
function toDateOnly(d: Date): string {
  return format(d, "yyyy-MM-dd");
}
function fmtDate(v: string): string {
  const d = parseDateOnly(v);
  return d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : v;
}

// ─── shared persistence ────────────────────────────────────────────────────

type Patch = Partial<Project>;

async function save(
  projectId: string,
  updates: UpdateProjectOptions,
  optimistic: Patch,
  onPatch: (p: Patch) => void,
): Promise<boolean> {
  onPatch(optimistic);
  const res = await updateProject(projectId, updates);
  if (!res.success) {
    toast.error(res.error ?? "Couldn't save the change.");
    return false;
  }
  return true;
}

// ─── Name ──────────────────────────────────────────────────────────────────

export function InlineProjectName({
  project,
  canEdit,
  onPatch,
  className,
  size = "hero",
}: {
  project: Project;
  canEdit: boolean;
  onPatch: (p: Patch) => void;
  className?: string;
  size?: "hero" | "inline";
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(project.name);
  const [busy, setBusy] = React.useState(false);
  const textCls = size === "hero" ? "text-2xl md:text-3xl font-bold" : "text-base font-semibold";

  React.useEffect(() => setDraft(project.name), [project.name]);

  const commit = async () => {
    const next = draft.trim();
    if (!next || next === project.name) {
      setDraft(project.name);
      setEditing(false);
      return;
    }
    setBusy(true);
    const ok = await save(project.id, { name: next }, { name: next }, onPatch);
    setBusy(false);
    if (!ok) setDraft(project.name);
    setEditing(false);
  };

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(project.name);
            setEditing(false);
          }
        }}
        onBlur={commit}
        className={cn("h-auto py-1", textCls, className)}
        maxLength={80}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={() => canEdit && setEditing(true)}
      className={cn(
        "group/name inline-flex items-center gap-2 text-left max-w-full",
        canEdit && "cursor-text",
        className,
      )}
      title={canEdit ? "Click to rename" : undefined}
    >
      <span className="text-2xl md:text-3xl font-bold text-foreground truncate">
        {project.name}
      </span>
      {canEdit && (
        <Pencil className="h-4 w-4 text-muted-foreground/60 shrink-0" />
      )}
    </button>
  );
}

// ─── Description ─────────────────────────────────────────────────────────────

export function InlineProjectDescription({
  project,
  canEdit,
  onPatch,
}: {
  project: Project;
  canEdit: boolean;
  onPatch: (p: Patch) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(project.description ?? "");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => setDraft(project.description ?? ""), [project.description]);

  const commit = async () => {
    const next = draft.trim();
    if (next === (project.description ?? "")) {
      setEditing(false);
      return;
    }
    setBusy(true);
    const ok = await save(
      project.id,
      { description: next || undefined },
      { description: next || null },
      onPatch,
    );
    setBusy(false);
    if (!ok) setDraft(project.description ?? "");
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-1">
        <Textarea
          autoFocus
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(project.description ?? "");
              setEditing(false);
            }
          }}
          onBlur={commit}
          rows={3}
          maxLength={2000}
          placeholder="What is this project about? Goals, scope, links…"
          className="text-sm resize-y"
        />
        <p className="text-[11px] text-muted-foreground">
          {busy ? "Saving…" : "Esc to cancel · saves when you click away"}
        </p>
      </div>
    );
  }

  if (!project.description) {
    return canEdit ? (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        Add a description
      </button>
    ) : (
      <p className="text-sm text-muted-foreground italic">No description</p>
    );
  }

  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={() => canEdit && setEditing(true)}
      className={cn(
        "group/desc flex items-start gap-2 text-left w-full rounded-md -mx-1 px-1 py-0.5",
        canEdit && "hover:bg-accent/40 cursor-text",
      )}
      title={canEdit ? "Click to edit" : undefined}
    >
      <span className="flex-1 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
        {project.description}
      </span>
      {canEdit && (
        <Pencil className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
      )}
    </button>
  );
}

// ─── Individual field pickers (labeled-form friendly) + meta row ─────────────

type FieldProps = {
  project: Project;
  canEdit: boolean;
  onPatch: (p: Patch) => void;
};

export function ProjectStatusPicker({ project, canEdit, onPatch }: FieldProps) {
  const meta = PROJECT_STATUS_META[project.status] ?? PROJECT_STATUS_META.active;
  const Icon = meta.icon;
  if (!canEdit) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 h-7 text-xs font-medium", meta.pill)}>
        <Icon className="h-3.5 w-3.5" /> {meta.label}
      </span>
    );
  }
  return (
    <Select
      value={project.status}
      onValueChange={(v) =>
        save(project.id, { status: v as ProjectStatus }, { status: v as ProjectStatus }, onPatch)
      }
    >
      <SelectTrigger className={cn("h-7 w-auto gap-1.5 rounded-full border px-2.5 text-xs font-medium", meta.pill)}>
        <Icon className="h-3.5 w-3.5" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_ORDER.map((s) => (
          <SelectItem key={s} value={s}>
            {PROJECT_STATUS_META[s].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProjectPriorityPicker({ project, canEdit, onPatch }: FieldProps) {
  if (!canEdit) {
    return project.priority ? (
      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 h-7 text-xs font-medium", PROJECT_PRIORITY_META[project.priority].pill)}>
        <Flag className="h-3.5 w-3.5" /> {PROJECT_PRIORITY_META[project.priority].label}
      </span>
    ) : (
      <span className="text-sm text-muted-foreground">None</span>
    );
  }
  return (
    <Select
      value={project.priority ?? "none"}
      onValueChange={(v) => {
        const next = (v === "none" ? null : v) as ProjectPriority | null;
        save(project.id, { priority: next }, { priority: next }, onPatch);
      }}
    >
      <SelectTrigger
        className={cn(
          "h-7 w-auto gap-1.5 rounded-full border px-2.5 text-xs font-medium",
          project.priority ? PROJECT_PRIORITY_META[project.priority].pill : "text-muted-foreground",
        )}
      >
        <Flag className="h-3.5 w-3.5" />
        <SelectValue placeholder="Priority" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No priority</SelectItem>
        {PRIORITY_ORDER.map((p) => (
          <SelectItem key={p} value={p}>
            {PROJECT_PRIORITY_META[p].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProjectDateField({
  project,
  field,
  canEdit,
  onPatch,
}: FieldProps & { field: "startDate" | "targetDate" }) {
  const isTarget = field === "targetDate";
  return (
    <DatePill
      icon={isTarget ? <CalendarRange className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
      label={isTarget ? "Target" : "Start"}
      value={project[field] ?? null}
      canEdit={canEdit}
      overdueAware={isTarget}
      onChange={(d) =>
        save(project.id, { [field]: d } as UpdateProjectOptions, { [field]: d } as Patch, onPatch)
      }
    />
  );
}

export function ProjectOrgPicker({ project, canEdit, onPatch }: FieldProps) {
  const { organizations } = useUserOrganizations();
  const currentOrg = organizations.find((o) => o.id === project.organizationId) ?? null;
  if (!canEdit) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Building2 className="h-3.5 w-3.5" /> {currentOrg ? currentOrg.name : "—"}
      </span>
    );
  }
  return (
    <Select
      value={project.organizationId ?? ""}
      onValueChange={(v) => save(project.id, { organizationId: v }, { organizationId: v }, onPatch)}
    >
      <SelectTrigger className="h-7 w-auto gap-1.5 rounded-full border px-2.5 text-xs font-medium text-muted-foreground">
        <Building2 className="h-3.5 w-3.5" />
        <SelectValue placeholder="Organization" />
      </SelectTrigger>
      <SelectContent>
        {organizations.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProjectMetaRow({
  project,
  canEdit,
  onPatch,
  showOrg = true,
}: FieldProps & { showOrg?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ProjectStatusPicker project={project} canEdit={canEdit} onPatch={onPatch} />
      <ProjectPriorityPicker project={project} canEdit={canEdit} onPatch={onPatch} />
      <ProjectDateField project={project} field="startDate" canEdit={canEdit} onPatch={onPatch} />
      <ProjectDateField project={project} field="targetDate" canEdit={canEdit} onPatch={onPatch} />
      {showOrg && <ProjectOrgPicker project={project} canEdit={canEdit} onPatch={onPatch} />}
    </div>
  );
}

function DatePill({
  icon,
  label,
  value,
  canEdit,
  overdueAware,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  canEdit: boolean;
  overdueAware?: boolean;
  onChange: (d: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = parseDateOnly(value);
  const overdue =
    overdueAware && value ? new Date(value) < new Date(new Date().toDateString()) : false;

  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        value
          ? overdue
            ? "text-red-600 dark:text-red-400"
            : "text-foreground"
          : "text-muted-foreground",
      )}
    >
      {icon}
      {value ? `${label}: ${fmtDate(value)}` : `Set ${label.toLowerCase()}`}
    </span>
  );

  if (!canEdit) {
    return value ? (
      <Badge variant="outline" className="gap-1 rounded-full">
        {content}
      </Badge>
    ) : null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-7 inline-flex items-center rounded-full border px-2.5 text-xs font-medium hover:bg-accent/50 transition-colors",
            overdue ? "border-red-300 dark:border-red-800" : "border-border",
          )}
        >
          {content}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            onChange(d ? toDateOnly(d) : null);
            setOpen(false);
          }}
          initialFocus
        />
        {value && (
          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1"
            >
              <X className="h-3.5 w-3.5" />
              Clear {label.toLowerCase()}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
