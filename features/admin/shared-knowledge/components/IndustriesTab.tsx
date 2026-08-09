"use client";

// features/admin/shared-knowledge/components/IndustriesTab.tsx
//
// Industry taxonomy management: create/edit via the any-admin `industry_upsert`
// RPC (slug is the upsert key — immutable once created), facets + ordering,
// soft-delete/reactivate via `industry_set_active`, and per-industry
// organization assignment via `industry_assign_org` / `industry_unassign_org`.
// All writes go through `features/industries/service.ts` — never raw table writes.
//
// THE DOOR LAW (common-docs/policies/no-dead-ends.md): every organization named
// on the right-hand assignment list is a real record, so it opens — `EntityRef`
// resolves `organization` → /organizations/[orgId] + its peek from the
// registries. Industries themselves have no record route (this console IS their
// home; the left list selects one), so they stay plain by design.

import { useMemo, useState } from "react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Archive,
  ArchiveRestore,
  Loader2,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { useAllOrgIndustries, useIndustries } from "@/features/industries/hooks";
import {
  assignOrgIndustry,
  setIndustryActive,
  unassignOrgIndustry,
  upsertIndustry,
} from "@/features/industries/service";
import {
  INDUSTRY_FACETS,
  type Industry,
  type IndustryFacet,
} from "@/features/industries/types";
import type { SharedKnowledgeDirectory } from "../types";

interface IndustryFormState {
  slug: string;
  name: string;
  facet: IndustryFacet;
  parentId: string | null;
  description: string;
  sortOrder: number;
}

const EMPTY_FORM: IndustryFormState = {
  slug: "",
  name: "",
  facet: "domain",
  parentId: null,
  description: "",
  sortOrder: 0,
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function IndustriesTab({
  directory,
}: {
  directory: SharedKnowledgeDirectory;
}) {
  const { industries, loading, error, refresh } = useIndustries(true);
  const {
    assignments,
    loading: assignmentsLoading,
    refresh: refreshAssignments,
  } = useAllOrgIndustries();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Industry | null>(null);
  const [form, setForm] = useState<IndustryFormState>(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const [assignOrgId, setAssignOrgId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [unassignTarget, setUnassignTarget] = useState<{
    orgId: string;
    orgName: string;
  } | null>(null);
  const [unassignBusy, setUnassignBusy] = useState(false);

  const [deactivateTarget, setDeactivateTarget] = useState<Industry | null>(
    null,
  );
  const [activeBusy, setActiveBusy] = useState(false);

  const selected = industries.find((i) => i.id === selectedId) ?? null;

  const orgNameById = useMemo(
    () => new Map(directory.organizations.map((o) => [o.id, o.name])),
    [directory.organizations],
  );

  const assignedOrgs = useMemo(() => {
    if (!selected) return [];
    return assignments
      .filter((a) => a.industryId === selected.id)
      .map((a) => ({
        orgId: a.organizationId,
        orgName: orgNameById.get(a.organizationId) ?? a.organizationId,
        isPrimary: a.isPrimary,
      }))
      .sort((a, b) => a.orgName.localeCompare(b.orgName));
  }, [assignments, selected, orgNameById]);

  const assignableOrgs = useMemo(() => {
    const assignedIds = new Set(assignedOrgs.map((a) => a.orgId));
    return directory.organizations
      .filter((o) => !o.is_personal && !assignedIds.has(o.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [directory.organizations, assignedOrgs]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSlugTouched(false);
    setFormOpen(true);
  };

  const openEdit = (industry: Industry) => {
    setEditing(industry);
    setForm({
      slug: industry.slug,
      name: industry.name,
      facet: industry.facet,
      parentId: industry.parentId,
      description: industry.description ?? "",
      sortOrder: industry.sortOrder,
    });
    setSlugTouched(true);
    setFormOpen(true);
  };

  const onSave = async () => {
    if (!form.slug.trim() || !form.name.trim()) {
      toast.error("Slug and name are required");
      return;
    }
    setSaving(true);
    try {
      const saved = await upsertIndustry({
        slug: form.slug.trim(),
        name: form.name.trim(),
        facet: form.facet,
        parentId: form.parentId,
        description: form.description.trim() || null,
        sortOrder: form.sortOrder,
      });
      toast.success(editing ? "Industry updated" : "Industry created");
      setFormOpen(false);
      setSelectedId(saved.id);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save industry");
    } finally {
      setSaving(false);
    }
  };

  const onAssign = async () => {
    if (!selected || !assignOrgId) return;
    setAssigning(true);
    try {
      await assignOrgIndustry(assignOrgId, selected.id);
      toast.success("Organization assigned");
      setAssignOrgId("");
      refreshAssignments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not assign");
    } finally {
      setAssigning(false);
    }
  };

  const setActive = async (industry: Industry, isActive: boolean) => {
    setActiveBusy(true);
    try {
      await setIndustryActive(industry.id, isActive);
      toast.success(isActive ? "Industry reactivated" : "Industry deactivated");
      setDeactivateTarget(null);
      refresh();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not update industry",
      );
    } finally {
      setActiveBusy(false);
    }
  };

  const onUnassign = async () => {
    if (!selected || !unassignTarget) return;
    setUnassignBusy(true);
    try {
      await unassignOrgIndustry(unassignTarget.orgId, selected.id);
      toast.success("Organization unassigned");
      setUnassignTarget(null);
      refreshAssignments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not unassign");
    } finally {
      setUnassignBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* Left: taxonomy list */}
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium text-foreground">
            Taxonomy ({industries.length})
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New industry
          </Button>
        </div>
        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : loading && industries.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading industries…
          </div>
        ) : industries.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No industries yet. Create the first taxonomy node.
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {industries.map((i) => (
              <li
                key={i.id}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted/60 ${
                  i.id === selectedId ? "bg-accent" : ""
                }`}
                onClick={() => setSelectedId(i.id)}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {/* Mobile: wrap so long names stay readable; desktop keeps
                        the dense one-line row with a hover title. */}
                    <span
                      className="break-words font-medium text-foreground sm:truncate"
                      title={i.name}
                    >
                      {i.name}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {i.facet.replace("_", " ")}
                    </Badge>
                    {!i.isActive ? (
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-[10px]"
                      >
                        inactive
                      </Badge>
                    ) : null}
                  </div>
                  <div
                    className="break-words text-xs text-muted-foreground sm:truncate"
                    title={`${i.slug} · sort ${i.sortOrder}${i.description ? ` · ${i.description}` : ""}`}
                  >
                    {i.slug} · sort {i.sortOrder}
                    {i.description ? ` · ${i.description}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 sm:h-7 sm:w-auto sm:px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(i);
                    }}
                    aria-label={`Edit ${i.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {i.isActive ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive sm:h-7 sm:w-auto sm:px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeactivateTarget(i);
                      }}
                      aria-label={`Deactivate ${i.name}`}
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground sm:h-7 sm:w-auto sm:px-2"
                      disabled={activeBusy}
                      onClick={(e) => {
                        e.stopPropagation();
                        void setActive(i, true);
                      }}
                      aria-label={`Reactivate ${i.name}`}
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Right: selected industry orgs */}
      <div className="min-w-0">
        <div className="mb-2 text-sm font-medium text-foreground">
          {selected
            ? `Organizations in “${selected.name}”`
            : "Organizations"}
        </div>
        {!selected ? (
          <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Select an industry to see and manage its member organizations.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Select value={assignOrgId} onValueChange={setAssignOrgId}>
                <SelectTrigger className="min-w-0 flex-1">
                  <SelectValue placeholder="Assign an organization…" />
                </SelectTrigger>
                <SelectContent>
                  {assignableOrgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={onAssign}
                disabled={!assignOrgId || assigning}
                size="sm"
                className="shrink-0"
              >
                {assigning ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                )}
                Assign
              </Button>
            </div>

            {assignmentsLoading && assignedOrgs.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : assignedOrgs.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                No organizations assigned — industry grants on this taxonomy
                node currently reach nobody.
              </div>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                {assignedOrgs.map((a) => (
                  <li
                    key={a.orgId}
                    className="group/entity-ref flex items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-foreground">
                      <EntityRef
                        token="organization"
                        id={a.orgId}
                        name={a.orgName}
                        className="min-w-0"
                      />
                      {a.isPrimary ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[10px]"
                        >
                          primary
                        </Badge>
                      ) : null}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setUnassignTarget({ orgId: a.orgId, orgName: a.orgName })
                      }
                      aria-label={`Unassign ${a.orgName}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Create / edit dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => !o && setFormOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit “${editing.name}”` : "New industry"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Name
              </label>
              <Input
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({
                    ...f,
                    name,
                    slug: !editing && !slugTouched ? slugify(name) : f.slug,
                  }));
                }}
                placeholder="California Workers' Compensation"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Slug{editing ? " (immutable — the upsert key)" : ""}
              </label>
              <Input
                value={form.slug}
                disabled={Boolean(editing)}
                onChange={(e) => {
                  setSlugTouched(true);
                  setForm((f) => ({ ...f, slug: e.target.value }));
                }}
                placeholder="ca-workers-comp"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Facet
                </label>
                <Select
                  value={form.facet}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, facet: v as IndustryFacet }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRY_FACETS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Sort order
                </label>
                <Input
                  type="number"
                  value={String(form.sortOrder)}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      sortOrder: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Parent (nesting within a facet)
              </label>
              <Select
                value={form.parentId ?? "none"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, parentId: v === "none" ? null : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No parent</SelectItem>
                  {industries
                    .filter((i) => i.id !== editing?.id)
                    .map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Description
              </label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={2}
              />
            </div>
            <Button onClick={onSave} disabled={saving} className="w-full">
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {editing ? "Save changes" : "Create industry"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unassign confirm */}
      <ConfirmDialog
        open={Boolean(unassignTarget)}
        onOpenChange={(o) => !o && setUnassignTarget(null)}
        title="Unassign organization?"
        description={
          unassignTarget && selected
            ? `${unassignTarget.orgName} will leave “${selected.name}” and lose read access to every library published to that industry.`
            : undefined
        }
        variant="destructive"
        confirmLabel="Unassign"
        busy={unassignBusy}
        onConfirm={onUnassign}
      />

      {/* Deactivate confirm (soft-delete — reversible) */}
      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        onOpenChange={(o) => !o && setDeactivateTarget(null)}
        title="Deactivate industry?"
        description={
          deactivateTarget
            ? `“${deactivateTarget.name}” will be hidden from new assignments and catalogs. Existing org assignments and library grants are kept; you can reactivate it any time.`
            : undefined
        }
        variant="destructive"
        confirmLabel="Deactivate"
        busy={activeBusy}
        onConfirm={() =>
          deactivateTarget ? setActive(deactivateTarget, false) : undefined
        }
      />
    </div>
  );
}
