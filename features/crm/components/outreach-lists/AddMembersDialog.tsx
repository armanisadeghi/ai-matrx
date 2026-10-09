"use client";

// features/crm/components/outreach-lists/AddMembersDialog.tsx
//
// Enroll members FROM A FILTER: the same predicates the /crm list serves
// (`applyPartyListPredicates` — one predicate builder, so preview and
// enrollment can never diverge). DNC-flagged records are excluded by default;
// including them is a visible, deliberate choice.

import { useEffect, useMemo, useState } from "react";
import { ReadFailure } from "@ai-matrx/design-system";
import Link from "next/link";
import { Bookmark, Building2, Contact, Users } from "lucide-react";
import { toast } from "@/lib/toast";
import { toastDoor } from "@/components/official/entity-ref/toastDoor";
import { Button } from "@/components/ui/button";
import { PitchAdvisoryPanel } from "@/features/crm/pitch-advisories/PitchAdvisoryPanel";
import { usePitchAdvisories } from "@/features/crm/pitch-advisories/usePitchAdvisories";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  CrmQueryContext,
  PartyKindFilter,
  PartyListQuery,
} from "../../types";
import type { OutreachListRow } from "../../outreach-lists/types";
import {
  addMembersByPartyIds,
  fetchFilterPreview,
  fetchPartyIdsByFilter,
  recordEnrollmentSource,
} from "../../outreach-lists/service";
import type { SavedView } from "../../saved-views/types";
import {
  describeDefinition,
  parseSavedViewDefinition,
  queryFromDefinition,
} from "../../saved-views/types";
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
  const [viewsError, setViewsError] = useState<unknown>(null);
  const [viewsAttempt, setViewsAttempt] = useState(0);
  const [viewId, setViewId] = useState<string | null>(null);
  const selectedView = views.find((v) => v.id === viewId) ?? null;
  const [excludeDnc, setExcludeDnc] = useState(true);
  const [preview, setPreview] = useState<{
    total: number;
    dncCount: number;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<unknown>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
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
      scope: source === "mine" ? { kind: "mine" } : { kind: "orgs" },
      // The outreach list's OWN organization (the record's, never the active one).
      orgId: source === "mine" ? null : list.organization_id,
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
        const rows = await fetchSavedViews(ctx, {
          listKey: "parties",
          parse: parseSavedViewDefinition,
        });
        if (cancelled) return;
        setViews(rows);
        setViewsError(null);
      } catch (e) {
        if (!cancelled) {
          console.error("[crm] saved views load failed:", e);
          setViewsError(e);
        }
      } finally {
        if (!cancelled) setViewsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ctx, viewsAttempt]);

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
          if (cancelled) return;
          setPreview(p);
          setPreviewError(null);
        } catch (e) {
          if (!cancelled) {
            setPreview(null);
            setPreviewError(e);
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
  }, [open, query, ctx, previewAttempt]);

  const willAdd = preview
    ? excludeDnc
      ? preview.total - preview.dncCount
      : preview.total
    : null;

  // THE PR FLOOR at the media-list save (E1–E4): how big this list becomes,
  // and the first wave the organization's `pr.first_wave_size_*` knobs propose.
  // "Start with the first N" enrolls only those; Add still adds everyone.
  const advisories = usePitchAdvisories(
    list.organization_id,
    open && willAdd
      ? {
          surface: "list_save",
          outreach_list_id: list.id,
          adding_recipients: willAdd,
          attachment_count: 0,
          is_exclusive: false,
        }
      : null,
  );

  const submit = async (limit?: number) => {
    if (!query) return;
    setAdding(true);
    try {
      await advisories.recordGoAhead({
        entityType: "crm_outreach_list",
        entityId: list.id,
        choice: limit ? "limit_to" : "go_ahead",
      });
      const all = await fetchPartyIdsByFilter(query, ctx, { excludeDnc });
      const ids = limit ? all.slice(0, limit) : all;
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
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
              ) : viewsError ? (
                <ReadFailure
                  className="m-0"
                  error={viewsError}
                  what="your smart views"
                  onRetry={() => setViewsAttempt((n) => n + 1)}
                />
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
                  and press Save view — then enroll everyone it matches from
                  here.
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
                      {
                        value: "organization",
                        label: "Companies",
                        icon: Building2,
                      },
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
              {/* read-gate-exempt: preview is null whenever its read failed (the count box below says the failure) */}
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
            ) : previewError ? (
              <ReadFailure
                className="m-0"
                error={previewError}
                what="who this enrolls"
                onRetry={() => setPreviewAttempt((n) => n + 1)}
              />
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
          <PitchAdvisoryPanel
            state={advisories}
            organizationId={list.organization_id}
            actionLabel="adding them"
            surfaceName="crm-outreach-lists"
            canPerformLocal={(offer) =>
              offer.action === "limit_to" && typeof offer.detail?.count === "number"
            }
            onLocalOffer={(_advisory, offer) => {
              const count = offer.detail?.count;
              if (offer.action !== "limit_to" || typeof count !== "number") return false;
              void submit(count);
              return true;
            }}
          />
        </div>
        <DialogFooter>
          <Button
            variant="quiet"
            onClick={() => onOpenChange(false)}
            disabled={adding}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
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
