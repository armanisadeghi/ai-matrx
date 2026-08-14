"use client";

// features/crm/components/outreach-lists/AddMembersDialog.tsx
//
// Enroll members FROM A FILTER: the same predicates the /crm list serves
// (`applyPartyListPredicates` — one predicate builder, so preview and
// enrollment can never diverge). DNC-flagged records are excluded by default;
// including them is a visible, deliberate choice.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, Building2, Contact, Users } from "lucide-react";
import { toast } from "@/lib/toast";
import { toastDoor } from "@/components/official/entity-ref/toastDoor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { CrmQueryContext, PartyKindFilter, PartyListQuery } from "../../types";
import type { OutreachListRow } from "../../outreach-lists/types";
import {
  addMembersByPartyIds,
  fetchFilterPreview,
  fetchPartyIdsByFilter,
  recordEnrollmentSource,
} from "../../outreach-lists/service";
import type { SavedView } from "../../saved-views/types";
import { describeDefinition, queryFromDefinition } from "../../saved-views/types";
import { fetchSavedViews } from "../../saved-views/service";

type SourceScope = "org" | "mine" | "view";

export function AddMembersDialog({
  open,
  onOpenChange,
  list,
  ctx,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: OutreachListRow;
  ctx: CrmQueryContext;
  onAdded: () => void;
}) {
  const [source, setSource] = useState<SourceScope>("org");
  const [kind, setKind] = useState<PartyKindFilter>("person");
  const [search, setSearch] = useState("");
  // Smart views: the saved queries this user can enroll from. A view carries
  // the FULL /crm query (scope, kind facet, search, every column filter), so
  // "everyone in this view" is one click instead of rebuilding the filter here.
  const [views, setViews] = useState<SavedView[]>([]);
  const [viewsLoading, setViewsLoading] = useState(true);
  const [viewId, setViewId] = useState<string | null>(null);
  const selectedView = views.find((v) => v.id === viewId) ?? null;
  const [excludeDnc, setExcludeDnc] = useState(true);
  const [preview, setPreview] = useState<{
    total: number;
    dncCount: number;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [adding, setAdding] = useState(false);

  const orgName =
    ctx.orgNames[list.organization_id] ?? "Outreach list organization";

  // The enrolled set is whatever this query matches — and it runs through the
  // SAME `applyPartyListPredicates` the /crm list serves, so a view's preview
  // here and the rows the view shows there can never diverge.
  // `null` until there is a real query to run — "Saved view" with nothing
  // picked previews and enrolls NOTHING, never a silent fallback to the whole
  // organization.
  const query: PartyListQuery | null = useMemo(() => {
    if (source === "view") {
      return selectedView ? queryFromDefinition(selectedView.definition) : null;
    }
    return {
      scope:
        source === "mine"
          ? { kind: "mine" }
          : { kind: "orgs", organizationId: list.organization_id },
      search,
      kind,
      filters: {},
      page: 1,
      view: "active",
    };
  }, [source, search, kind, list.organization_id, selectedView]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchSavedViews(ctx);
        if (!cancelled) setViews(rows);
      } catch (e) {
        if (!cancelled) {
          console.error("[crm] saved views load failed:", e);
          toast.error(
            e instanceof Error ? e.message : "Could not load smart views",
          );
        }
      } finally {
        if (!cancelled) setViewsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ctx]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (!query) {
      setPreview(null);
      setPreviewing(false);
      return;
    }
    const currentQuery = query;
    setPreviewing(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const p = await fetchFilterPreview(currentQuery, ctx);
          if (!cancelled) setPreview(p);
        } catch (e) {
          if (!cancelled) {
            setPreview(null);
            toast.error(
              e instanceof Error ? e.message : "Preview failed",
            );
          }
        } finally {
          if (!cancelled) setPreviewing(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, ctx]);

  const willAdd = preview
    ? excludeDnc
      ? preview.total - preview.dncCount
      : preview.total
    : null;

  const submit = async () => {
    if (!query) return;
    setAdding(true);
    try {
      const ids = await fetchPartyIdsByFilter(query, ctx, { excludeDnc });
      if (ids.length === 0) {
        toast.info("Nothing to add — the filter matches no records");
        return;
      }
      const { added, skippedExisting } = await addMembersByPartyIds({
        list,
        partyIds: ids,
      });
      // Provenance: the queue records WHICH query filled it, so the list can
      // point back at the view instead of being an anonymous pile of names.
      await recordEnrollmentSource({
        list,
        query,
        savedViewId: selectedView?.id ?? null,
        savedViewName: selectedView?.name ?? null,
        enrolled: added,
      });
      onOpenChange(false);
      onAdded();
      toast.success(
        `${added.toLocaleString()} member${added === 1 ? "" : "s"} added` +
          (skippedExisting > 0
            ? ` (${skippedExisting.toLocaleString()} already enrolled)`
            : ""),
        { action: toastDoor("crm_outreach_list", list.id) },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enrollment failed");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add members from a filter or smart view</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Source</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { value: "org", label: orgName, icon: Users },
                  { value: "mine", label: "My records", icon: Contact },
                  { value: "view", label: "Smart view", icon: Bookmark },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSource(value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    source === value
                      ? "border-primary/40 bg-accent text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {source === "view" ? (
            <div className="space-y-1">
              <Label className="text-xs">Smart view</Label>
              {viewsLoading ? (
                <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground">
                  Loading your views…
                </div>
              ) : views.length === 0 ? (
                <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground">
                  No smart views yet. Filter the list on{" "}
                  <Link
                    href="/crm"
                    target="_blank"
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    /crm
                  </Link>{" "}
                  and press Save view — then enroll everyone it matches from here.
                </div>
              ) : (
                <div className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
                  {views.map((view) => (
                    <button
                      key={view.id}
                      type="button"
                      onClick={() => setViewId(view.id)}
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                        viewId === view.id
                          ? "border-primary/40 bg-accent"
                          : "border-border hover:bg-accent/50",
                      )}
                    >
                      <span className="flex w-full items-center gap-1.5 text-xs font-medium text-foreground">
                        <Bookmark className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{view.name}</span>
                        {view.visibility === "internal" && (
                          <Users className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                      </span>
                      <span className="line-clamp-2 text-[11px] text-muted-foreground">
                        {describeDefinition(view.definition)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                The view&apos;s own scope and filters decide who is enrolled —
                the record kind and search below do not apply.
              </p>
            </div>
          ) : (
            <>
            <div className="space-y-1">
              <Label className="text-xs">Record kind</Label>
              <div className="flex gap-1.5">
                {(
                  [
                    { value: "person", label: "People", icon: Contact },
                    { value: "organization", label: "Companies", icon: Building2 },
                    { value: "all", label: "Both", icon: Users },
                  ] as const
                ).map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setKind(value)}
                    className={cn(
                      "flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      kind === value
                        ? "border-primary/40 bg-accent text-foreground"
                        : "border-border text-muted-foreground hover:bg-accent/50",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="member-filter-search" className="text-xs">
                Name / title / domain contains{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="member-filter-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. oncology, VP, acme.com"
                className="h-9 text-sm"
              />
            </div>
            </>
          )}

          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={excludeDnc}
              onCheckedChange={(v) => setExcludeDnc(v === true)}
            />
            <span className="text-xs text-foreground">
              Skip do-not-contact records
              {preview && preview.dncCount > 0 && (
                <span className="ml-1 text-muted-foreground">
                  ({preview.dncCount.toLocaleString()} flagged)
                </span>
              )}
            </span>
          </label>

          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
            {!query ? (
              <span className="text-muted-foreground">
                Pick a smart view to see who it enrolls
              </span>
            ) : previewing ? (
              <span className="text-muted-foreground">Counting…</span>
            ) : preview ? (
              <span className="text-foreground">
                <span className="font-semibold tabular-nums">
                  {(willAdd ?? 0).toLocaleString()}
                </span>{" "}
                record{willAdd === 1 ? "" : "s"} will be enrolled
                <span className="text-muted-foreground">
                  {" "}
                  · already-enrolled members are skipped automatically
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">No preview yet</span>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={adding}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={
              adding || previewing || !query || !preview || (willAdd ?? 0) === 0
            }
          >
            {adding
              ? "Enrolling…"
              : `Add ${willAdd != null ? willAdd.toLocaleString() : ""} member${willAdd === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
