"use client";

// features/crm/components/campaigns/AddMembersDialog.tsx
//
// Enroll members FROM A FILTER: the same predicates the /crm list serves
// (`applyPartyListPredicates` — one predicate builder, so preview and
// enrollment can never diverge). DNC-flagged records are excluded by default;
// including them is a visible, deliberate choice.

import { useEffect, useMemo, useState } from "react";
import { Building2, Contact, Users } from "lucide-react";
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
import type { CampaignRow } from "../../campaigns/types";
import {
  addMembersByPartyIds,
  fetchFilterPreview,
  fetchPartyIdsByFilter,
} from "../../campaigns/service";

type SourceScope = "org" | "mine";

export function AddMembersDialog({
  open,
  onOpenChange,
  campaign,
  ctx,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: CampaignRow;
  ctx: CrmQueryContext;
  onAdded: () => void;
}) {
  const [source, setSource] = useState<SourceScope>("org");
  const [kind, setKind] = useState<PartyKindFilter>("person");
  const [search, setSearch] = useState("");
  const [excludeDnc, setExcludeDnc] = useState(true);
  const [preview, setPreview] = useState<{
    total: number;
    dncCount: number;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [adding, setAdding] = useState(false);

  const orgName =
    ctx.orgNames[campaign.organization_id] ?? "Campaign organization";

  const query: PartyListQuery = useMemo(
    () => ({
      scope:
        source === "mine"
          ? { kind: "mine" }
          : { kind: "orgs", organizationId: campaign.organization_id },
      search,
      kind,
      filters: {},
      page: 1,
      view: "active",
    }),
    [source, search, kind, campaign.organization_id],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreviewing(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const p = await fetchFilterPreview(query, ctx);
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
    setAdding(true);
    try {
      const ids = await fetchPartyIdsByFilter(query, ctx, { excludeDnc });
      if (ids.length === 0) {
        toast.info("Nothing to add — the filter matches no records");
        return;
      }
      const { added, skippedExisting } = await addMembersByPartyIds({
        campaign,
        partyIds: ids,
      });
      onOpenChange(false);
      onAdded();
      toast.success(
        `${added.toLocaleString()} member${added === 1 ? "" : "s"} added` +
          (skippedExisting > 0
            ? ` (${skippedExisting.toLocaleString()} already enrolled)`
            : ""),
        { action: toastDoor("crm_campaign", campaign.id) },
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
          <DialogTitle>Add members from a filter</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Source</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { value: "org", label: orgName, icon: Users },
                  { value: "mine", label: "My records", icon: Contact },
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
            {previewing ? (
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
            disabled={adding || previewing || !preview || (willAdd ?? 0) === 0}
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
