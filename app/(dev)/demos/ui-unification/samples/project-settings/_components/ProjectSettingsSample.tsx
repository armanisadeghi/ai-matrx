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

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Archive, Database, ExternalLink, FolderKanban, Mail, Trash2, UserPlus, Users } from "lucide-react";
import { CopyTapButton, TrashTapButton } from "@ai-matrx/tap-target/buttons";
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
import { ReadFailure } from "@/components/read-state/ReadFailure";
import {
  EmptyState,
  RowGroup,
  RowSkeletons,
  SampleScale,
  SampleTitle,
  SettingRow,
  ToneBadge,
  UcSelect,
  UnderlineTabs,
  type Tone,
} from "../../_components/kit";

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
const ROLE_TONE: Record<ProjectRole, Tone> = { owner: "primary", admin: "info", member: "neutral" };

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

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name, meta: p.role }));
  const linked = references.reduce((n, r) => n + r.rowCount, 0);

  return (
    <>
      <PageHeader>
        <SampleTitle icon={FolderKanban} title={project?.name ?? "Project"} meta="Sample" />
      </PageHeader>
      <SampleScale>
        <div className="uk-page flex h-full flex-col overflow-hidden bg-textured">
          {/* Section tabs (underline) + the page's two controls, one row. */}
          <div className="flex shrink-0 items-end gap-x-1 border-b border-border pl-3 pr-[9px] sm:gap-x-3">
            <UnderlineTabs<Section>
              className="min-w-0 flex-1 border-b-0"
              value={section}
              onChange={setSection}
              items={[
                { id: "general", label: "General" },
                { id: "members", label: "Members", count: members.length || null },
                { id: "invitations", label: "Invitations", count: invitations.length || null },
                { id: "references", label: "References", count: references.length || null },
              ]}
            />
            <div className="uc-row ml-auto py-0.5">
              {projectOptions.length > 1 && id ? (
                <div className="hidden sm:contents">
                  <UcSelect value={id} options={projectOptions} onChange={setChosen} ariaLabel="Project" icon={FolderKanban} width="12rem" align="end" />
                </div>
              ) : null}
              {project ? (
                <Link href={`/projects/${project.id}`} className="uc-btn uc-btn-outline" aria-label="Open workspace">
                  <ExternalLink aria-hidden />
                  <span className="max-sm:sr-only">Open workspace</span>
                </Link>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 py-4">
              {loading || (!project && !error && id) ? (
                <FormSkeleton />
              ) : !project ? (
                <EmptyState
                  icon={FolderKanban}
                  title="No project to show"
                  line={error ? "The project could not be read." : "You aren't on any project yet."}
                  action={
                    <Link href="/projects" className="uc-btn uc-btn-outline">
                      All projects
                    </Link>
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
                      icon={Mail}
                      title="No pending invitations"
                      line="People you invite by email wait here."
                      action={
                        <button type="button" className="uc-btn uc-btn-outline" onClick={() => toast.info("Invite", { description: NOT_SAVED })}>
                          <UserPlus aria-hidden /> Invite
                        </button>
                      }
                    />
                  ) : (
                    invitations.map((inv) => (
                      <SettingRow key={inv.id} label={inv.email} line={`Expires ${formatRelativeTime(inv.expiresAt)}`}>
                        <ToneBadge tone={ROLE_TONE[inv.role]}>{inv.role}</ToneBadge>
                        <span className="uk-quiet">
                          <TrashTapButton variant="transparent" ariaLabel={`Revoke ${inv.email}`} onClick={() => toast.success(`Invitation to ${inv.email} revoked`, { description: NOT_SAVED })} />
                        </span>
                      </SettingRow>
                    ))
                  )}
                </RowGroup>
              ) : (
                <RowGroup title={`Linked records · ${linked}`}>
                  {references.length === 0 ? (
                    <EmptyState icon={Database} title="Nothing links here" line="Tasks, notes and files tagged with this project show here." />
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
      </SampleScale>
    </>
  );
}

/* ------------------------------ General ---------------------------- */

function Field({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block px-[3px] text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="uc-row -mx-[3px]" style={{ flexWrap: "nowrap" }}>{children}</div>
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
        <Field label="Name" htmlFor="ps-name">
          <label className="uc-field flex-1">
            <input id="ps-name" value={form.name} disabled={!canEdit} onChange={(e) => set("name", e.target.value)} />
          </label>
        </Field>
        <div>
          <label htmlFor="ps-desc" className="mb-1 block px-[3px] text-xs font-medium text-muted-foreground">
            Description
          </label>
          <textarea
            id="ps-desc"
            className="uk-textarea -mx-[3px] block !w-full"
            rows={4}
            value={form.description}
            disabled={!canEdit}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
          <Field label="Status">
            <UcSelect value={form.status} options={STATUS_OPTIONS} onChange={(v) => set("status", v)} ariaLabel="Status" width="calc(100% - var(--matrx-tap-gap))" />
          </Field>
          <Field label="Priority">
            <UcSelect value={form.priority} options={PRIORITY_OPTIONS} onChange={(v) => set("priority", v)} ariaLabel="Priority" width="calc(100% - var(--matrx-tap-gap))" />
          </Field>
          <Field label="Start date" htmlFor="ps-start">
            <label className="uc-field flex-1">
              <input id="ps-start" type="date" value={form.startDate} disabled={!canEdit} onChange={(e) => set("startDate", e.target.value)} />
            </label>
          </Field>
          <Field label="Target date" htmlFor="ps-target">
            <label className="uc-field flex-1">
              <input id="ps-target" type="date" value={form.targetDate} disabled={!canEdit} onChange={(e) => set("targetDate", e.target.value)} />
            </label>
          </Field>
        </div>
        {dirty ? (
          <div className="uc-row -mx-[3px] justify-end">
            <button type="button" className="uc-btn uc-btn-quiet" onClick={() => setForm(initial)}>
              Cancel
            </button>
            <button type="button" className="uc-btn uc-btn-primary" onClick={() => toast.success("Project saved", { description: NOT_SAVED })}>
              Save
            </button>
          </div>
        ) : null}
      </section>

      {/* Details — a bordered group of hairline rows. */}
      <RowGroup title="Details">
        <SettingRow label="Project ID" line={project.id}>
          <span className="uk-quiet">
            <CopyTapButton
              variant="transparent"
              ariaLabel="Copy project ID"
              onClick={() => void navigator.clipboard.writeText(project.id).then(() => toast.success("Project ID copied"))}
            />
          </span>
        </SettingRow>
        <SettingRow label="Slug" line={project.slug ?? "None"} />
        <SettingRow label="Your role">
          {role ? <ToneBadge tone={ROLE_TONE[role]}>{role}</ToneBadge> : <span className="mx-[3px] text-xs text-muted-foreground">Not a member</span>}
        </SettingRow>
        <SettingRow label="Created" line={new Date(project.createdAt).toLocaleString()} />
        <SettingRow label="Last updated" line={formatRelativeTime(project.updatedAt)} />
      </RowGroup>

      {/* Danger zone — tier 3. Delete opens the tier-2 confirm that names the cost. */}
      <RowGroup title="Danger zone" danger>
        <SettingRow label="Archive this project" line="Hides it from lists. Restore any time.">
          <button
            type="button"
            className="uc-btn uc-btn-outline"
            disabled={!canEdit}
            onClick={() => toast.success(`“${project.name}” archived`, { description: NOT_SAVED })}
          >
            <Archive aria-hidden /> Archive
          </button>
        </SettingRow>
        {confirming ? (
          <div className="flex flex-col gap-1.5 py-2.5 pl-3 pr-[9px]">
            <div className="text-[0.8125rem] font-semibold">Delete “{project.name}”?</div>
            <div className="text-xs text-muted-foreground">
              {memberCount} {memberCount === 1 ? "member loses" : "members lose"} access; {linked} linked {linked === 1 ? "record points" : "records point"} to it.
            </div>
            <div className="uc-row justify-end">
              <button type="button" className="uc-btn uc-btn-quiet" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="uc-btn uc-btn-danger"
                onClick={() => {
                  setConfirming(false);
                  toast.success(`“${project.name}” deleted`, { description: NOT_SAVED });
                }}
              >
                Delete project
              </button>
            </div>
          </div>
        ) : (
          <SettingRow label="Delete this project" line="Removes it for everyone on it.">
            <button type="button" className="uc-btn uc-btn-danger" disabled={role !== "owner"} onClick={() => setConfirming(true)}>
              <Trash2 aria-hidden /> Delete
            </button>
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
        <div className="uc-row -mr-[3px]">
          <button type="button" className="uc-btn uc-btn-outline" onClick={() => toast.info("Invite", { description: NOT_SAVED })}>
            <UserPlus aria-hidden /> Invite
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {loading ? (
          <RowSkeletons count={4} twoLine />
        ) : error != null ? (
          <ReadFailure error={error} what="the members" />
        ) : members.length === 0 ? (
          <EmptyState icon={Users} title="No members yet" line="Invite people to work on this project." />
        ) : (
          <div className="divide-y divide-border">
            {members.map((m) => {
              const name = m.user?.displayName || m.user?.email || m.userId;
              return (
                <div key={m.id} className="uk-row flex min-h-9 items-center gap-2 pl-3 pr-[9px]">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.6875rem] font-semibold uppercase text-primary">
                    {name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1 py-1.5">
                    <div className="truncate text-[0.8125rem] font-medium leading-4">{name}</div>
                    <div className="truncate text-[0.6875rem] leading-4 text-muted-foreground">
                      {[m.user?.email && m.user.email !== name ? m.user.email : null, `Joined ${formatRelativeTime(m.joinedAt)}`].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <ToneBadge tone={ROLE_TONE[m.role]}>{m.role}</ToneBadge>
                  {/* Delete tier 1 (quiet): remove, undo in the toast. */}
                  <span className="uk-quiet">
                    <TrashTapButton
                      variant="transparent"
                      ariaLabel={`Remove ${name}`}
                      disabled={m.role === "owner"}
                      onClick={() => toast.success(`${name} removed`, { description: NOT_SAVED })}
                    />
                  </span>
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
        <RowSkeletons count={5} twoLine />
      </div>
    </div>
  );
}
