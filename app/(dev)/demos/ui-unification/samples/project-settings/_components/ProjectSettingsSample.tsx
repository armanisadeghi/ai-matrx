"use client";

/**
 * /projects/[id]/settings, rebuilt by hand on the settled 28px system — the
 * REAL project, role, members, invitations and references, from the same
 * hooks the real page uses (features/projects/hooks). Read-only: edits stay on
 * this page, and every save / remove / delete says it changed nothing.
 *
 * Structure: underline section tabs; a form at 28px; bordered groups of
 * hairline rows (never a card in a card); the three delete tiers — quiet
 * (remove a member, undo in the toast), confirm (names the cost), and the
 * danger zone.
 */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Archive, Copy, Database, ExternalLink, FolderKanban, Mail, Trash2, UserPlus, Users } from "lucide-react";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { Skeleton } from "@ai-matrx/design-system";
import PageHeader from "@/features/shell/components/header/PageHeader";
import {
  useProject,
  useProjectInvitations,
  useProjectMembers,
  useProjectReferences,
  useProjectUserRole,
  useUserProjects,
} from "@/features/projects/hooks";
import type { Project, ProjectMemberWithUser, ProjectPriority, ProjectRole, ProjectStatus } from "@/features/projects/types";
import { toast } from "@/lib/toast";
import { ReadFailure } from "@ai-matrx/design-system";
import { SampleTitle } from "../../_components/kit";
import { Badge, Button, ControlRow, ControlScope, DeleteButton, EmptyState, Field, RegionSkeleton, RowGroup, Select, SettingRow, Tabs, Textarea, type BadgeTone } from "@ai-matrx/design-system/controls";

type Section = "general" | "members" | "invitations" | "references";

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];
const PRIORITY_OPTIONS: { value: ProjectPriority | "none"; label: string }[] = [
  { value: "none", label: "No priority" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];
const ROLE_TONE: Record<ProjectRole, BadgeTone> = { owner: "primary", admin: "info", member: "neutral" };

const NOT_SAVED = "Sample page — nothing was changed.";

export function ProjectSettingsSample() {
  const params = useSearchParams();
  const { projects } = useUserProjects();
  // Default to a project this person owns, so every section has something to show.
  const owned = projects.find((p) => p.role === "owner");
  const projectId = params.get("project") ?? owned?.id ?? projects[0]?.id;
  const [chosen, setChosen] = useState<string | null>(null);
  const id = chosen ?? projectId;

  const { project, loading, error } = useProject(id);
  const { role } = useProjectUserRole(id);
  const { members, loading: membersLoading, error: membersError } = useProjectMembers(id);
  const { invitations } = useProjectInvitations(id);
  const { references } = useProjectReferences(id);
  const [section, setSection] = useState<Section>("general");

  const projectOptions = projects.map((p) => ({
    value: p.id,
    label: p.name,
    meta: p.role ?? undefined,
  }));
  const linked = references.reduce((n, r) => n + r.rowCount, 0);

  return (
    <>
      <PageHeader>
        <SampleTitle icon={FolderKanban} title={project?.name ?? "Project"} meta="Sample" />
      </PageHeader>
      <ControlScope className="h-full">
        <div className="flex h-full flex-col overflow-hidden bg-textured">
          {/* Section tabs (underline) + the page's two controls, one row. */}
          <div className="flex shrink-0 items-end gap-x-1 border-b border-border pl-3 pr-[9px] sm:gap-x-3">
            <Tabs<Section>
              className="min-w-0 flex-1"
              rule={false}
              aria-label="Project sections"
              value={section}
              onValueChange={setSection}
              data={[
                { value: "general", label: "General" },
                { value: "members", label: "Members", count: members.length || null },
                { value: "invitations", label: "Invitations", count: invitations.length || null },
                { value: "references", label: "References", count: references.length || null },
              ]}
            />
            <ControlRow className="ml-auto py-0.5">
              {projectOptions.length > 1 && id ? (
                <div className="hidden sm:contents">
                  <Select value={id} options={projectOptions} onValueChange={setChosen} aria-label="Project" icon={<FolderKanban aria-hidden />} style={{ width: "12rem" }} align="end" />
                </div>
              ) : null}
              {project ? (
                <Button asChild variant="outline"><Link href={`/projects/${project.id}`} aria-label="Open workspace">
                  <ExternalLink aria-hidden />
                  <span className="max-sm:sr-only">Open workspace</span>
                </Link></Button>
              ) : null}
            </ControlRow>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 py-4">
              {loading || (!project && !error && id) ? (
                <FormSkeleton />
              ) : !project ? (
                <EmptyState
                  icon={<FolderKanban />}
                  title="No project to show"
                  line={error ? "The project could not be read." : "You aren't on any project yet."}
                  action={
                    <Button asChild variant="outline"><Link href="/projects">
                      All projects
                    </Link></Button>
                  }
                />
              ) : section === "general" ? (
                <General
                  key={project.id}
                  project={project}
                  role={role}
                  memberCount={members.length}
                  linked={linked}
                />
              ) : section === "members" ? (
                <Members members={members} loading={membersLoading} error={membersError} />
              ) : section === "invitations" ? (
                <RowGroup title="Pending invitations">
                  {invitations.length === 0 ? (
                    <EmptyState
                      icon={<Mail />}
                      title="No pending invitations"
                      line="People you invite by email wait here."
                      action={
                        <Button variant="outline" onClick={() => toast.info("Invite", { description: NOT_SAVED })}>
                          <UserPlus aria-hidden /> Invite
                        </Button>
                      }
                    />
                  ) : (
                    invitations.map((inv) => (
                      <SettingRow key={inv.id} label={inv.email} line={`Expires ${formatRelativeTime(inv.expiresAt)}`}>
                        <Badge tone={ROLE_TONE[inv.role]}>{inv.role}</Badge>
                        <DeleteButton aria-label={`Revoke ${inv.email}`} onClick={() => toast.success(`Invitation to ${inv.email} revoked`, { description: NOT_SAVED })} />
                      </SettingRow>
                    ))
                  )}
                </RowGroup>
              ) : (
                <RowGroup title={`Linked records · ${linked}`}>
                  {references.length === 0 ? (
                    <EmptyState icon={<Database />} title="Nothing links here" line="Tasks, notes and files tagged with this project show here." />
                  ) : (
                    references.map((r) => (
                      <SettingRow key={`${r.schemaName}.${r.tableName}.${r.columnName}`} label={`${r.schemaName}.${r.tableName}`} line={r.columnName}>
                        <span className="mx-[3px] text-[0.8125rem] font-medium tabular-nums">{r.rowCount}</span>
                      </SettingRow>
                    ))
                  )}
                </RowGroup>
              )}
            </div>
          </div>
        </div>
      </ControlScope>
    </>
  );
}

/* ------------------------------ General ---------------------------- */

function FormField({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block px-[3px] text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <ControlRow nowrap className="-mx-[3px]">{children}</ControlRow>
    </div>
  );
}

function General({
  project,
  role,
  memberCount,
  linked,
}: {
  project: Project;
  role: ProjectRole | null;
  memberCount: number;
  linked: number;
}) {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  const initial = {
    name: project.name,
    description: project.description ?? "",
    status: project.status,
    priority: (project.priority ?? "none") as ProjectPriority | "none",
    startDate: project.startDate?.slice(0, 10) ?? "",
    targetDate: project.targetDate?.slice(0, 10) ?? "",
  };
  const [form, setForm] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const canEdit = role === "owner" || role === "admin";
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      {/* The form: no card — fields sit on the page, 28px, labels above. */}
      <section className="flex flex-col gap-3">
        <FormField label="Name" htmlFor="ps-name">
          <Field className="flex-1" id="ps-name" value={form.name} disabled={!canEdit} onChange={(e) => set("name", e.target.value)} />
        </FormField>
        <div>
          <label htmlFor="ps-desc" className="mb-1 block px-[3px] text-xs font-medium text-muted-foreground">
            Description
          </label>
          <Textarea
            id="ps-desc"
            className="-mx-[3px] !w-full"
            rows={4}
            value={form.description}
            disabled={!canEdit}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
          <FormField label="Status">
            <Select value={form.status} options={STATUS_OPTIONS} onValueChange={(v) => set("status", v)} aria-label="Status" style={{ width: "calc(100% - var(--matrx-control-gap))" }} />
          </FormField>
          <FormField label="Priority">
            <Select value={form.priority} options={PRIORITY_OPTIONS} onValueChange={(v) => set("priority", v)} aria-label="Priority" style={{ width: "calc(100% - var(--matrx-control-gap))" }} />
          </FormField>
          <FormField label="Start date" htmlFor="ps-start">
            <Field className="flex-1" id="ps-start" type="date" value={form.startDate} disabled={!canEdit} onChange={(e) => set("startDate", e.target.value)} />
          </FormField>
          <FormField label="Target date" htmlFor="ps-target">
            <Field className="flex-1" id="ps-target" type="date" value={form.targetDate} disabled={!canEdit} onChange={(e) => set("targetDate", e.target.value)} />
          </FormField>
        </div>
        {dirty ? (
          <ControlRow className="-mx-[3px] justify-end">
            <Button variant="quiet" onClick={() => setForm(initial)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => toast.success("Project saved", { description: NOT_SAVED })}>
              Save
            </Button>
          </ControlRow>
        ) : null}
      </section>

      {/* Details — a bordered group of hairline rows. */}
      <RowGroup title="Details">
        <SettingRow label="Project ID" line={project.id}>
          <Button
            variant="quiet"
            aria-label="Copy project ID"
            icon={<Copy aria-hidden />}
            onClick={() => void copyText(project.id, "Project ID copied")}
          />
        </SettingRow>
        <SettingRow label="Slug" line={project.slug ?? "None"} />
        <SettingRow label="Your role">
          {role ? <Badge tone={ROLE_TONE[role]}>{role}</Badge> : <span className="mx-[3px] text-xs text-muted-foreground">Not a member</span>}
        </SettingRow>
        <SettingRow label="Created" line={new Date(project.createdAt).toLocaleString()} />
        <SettingRow label="Last updated" line={formatRelativeTime(project.updatedAt)} />
      </RowGroup>

      {/* Danger zone — tier 3. Delete opens the tier-2 confirm that names the cost. */}
      <RowGroup title="Danger zone" danger>
        <SettingRow label="Archive this project" line="Hides it from lists. Restore any time.">
          <Button variant="outline"
            disabled={!canEdit}
            onClick={() => toast.success(`“${project.name}” archived`, { description: NOT_SAVED })}
          >
            <Archive aria-hidden /> Archive
          </Button>
        </SettingRow>
        {confirming ? (
          <div className="flex flex-col gap-1.5 py-2.5 pl-3 pr-[9px]">
            <div className="text-[0.8125rem] font-semibold">Delete “{project.name}”?</div>
            <div className="text-xs text-muted-foreground">
              {memberCount} {memberCount === 1 ? "member loses" : "members lose"} access; {linked} linked {linked === 1 ? "record points" : "records point"} to it.
            </div>
            <ControlRow className="justify-end">
              <Button variant="quiet" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button variant="danger"
                onClick={() => {
                  setConfirming(false);
                  toast.success(`“${project.name}” deleted`, { description: NOT_SAVED });
                }}
              >
                Delete project
              </Button>
            </ControlRow>
          </div>
        ) : (
          <SettingRow label="Delete this project" line="Removes it for everyone on it.">
            <Button variant="danger" disabled={role !== "owner"} onClick={() => setConfirming(true)}>
              <Trash2 aria-hidden /> Delete
            </Button>
          </SettingRow>
        )}
      </RowGroup>
    </>
  );
}

/* ------------------------------ Members ---------------------------- */

function Members({ members, loading, error }: { members: ProjectMemberWithUser[]; loading: boolean; error: unknown }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="px-3 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
          Members · {members.length}
        </h2>
        <ControlRow className="-mr-[3px]">
          <Button variant="outline" onClick={() => toast.info("Invite", { description: NOT_SAVED })}>
            <UserPlus aria-hidden /> Invite
          </Button>
        </ControlRow>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {loading ? (
          <RegionSkeleton count={4} twoLine />
        ) : error != null ? (
          <ReadFailure error={error} what="the members" />
        ) : members.length === 0 ? (
          <EmptyState icon={<Users />} title="No members yet" line="Invite people to work on this project." />
        ) : (
          <div className="divide-y divide-border">
            {members.map((m) => {
              const name = m.user?.displayName || m.user?.email || m.userId;
              return (
                <div key={m.id} className="hover:bg-accent/50 flex min-h-9 items-center gap-2 pl-3 pr-[9px]">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.6875rem] font-semibold uppercase text-primary-ink">
                    {name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1 py-1.5">
                    <div className="truncate text-[0.8125rem] font-medium leading-4">{name}</div>
                    <div className="truncate text-[0.6875rem] leading-4 text-muted-foreground">
                      {[m.user?.email && m.user.email !== name ? m.user.email : null, `Joined ${formatRelativeTime(m.joinedAt)}`].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <Badge tone={ROLE_TONE[m.role]}>{m.role}</Badge>
                  {/* Delete tier 1 (quiet): remove, undo in the toast. */}
                  <DeleteButton
                    aria-label={`Remove ${name}`}
                    disabled={m.role === "owner"}
                    onClick={() => toast.success(`${name} removed`, { description: NOT_SAVED })}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3 w-12 rounded" />
          <Skeleton className="h-7 w-full rounded-full" />
        </div>
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3 w-20 rounded" />
          <Skeleton className="h-[6.5rem] w-full rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1">
              <Skeleton className="h-3 w-14 rounded" />
              <Skeleton className="h-7 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <RegionSkeleton count={5} twoLine />
      </div>
    </div>
  );
}
