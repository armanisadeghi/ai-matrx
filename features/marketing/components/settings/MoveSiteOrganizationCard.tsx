"use client";

/**
 * "Move to organization" — the product path that FOUND_DEFECTS D133 said did
 * not exist. Before this, re-homing a site meant a hand-written transaction.
 *
 * Everything it needs is already on the platform, so nothing here is new:
 *   - the orgs the user may place a site into  → `useScopeTree().organizations`
 *     (membership is exactly the RPC's destination gate — same bar, not tighter)
 *   - the doors on every record it names       → `EntityRef` (THE DOOR LAW)
 *   - the confirmation                         → `ConfirmDialog`
 *   - the move itself                          → ONE SECURITY DEFINER RPC
 *
 * The dialog states what moves AND what deliberately does not, because the
 * honest answer is not "everything": append-only fact tables (snapshots, crawl
 * facts) are stamped with the org that held the site at the time and stay put.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ArrowRightLeft, AlertTriangle } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { useAppDispatch } from "@/lib/redux/hooks";
import { extractErrorMessage } from "@/utils/errors";
import type { MarketingSite } from "@/features/marketing/types";
import {
  moveSiteToOrganization,
  previewSiteOrganizationMove,
  type BrandAction,
  type MovePreviewTable,
} from "@/features/marketing/data/move-site-org";

const BRAND_CHOICES: { value: BrandAction; label: string; detail: string }[] = [
  {
    value: "move_brand",
    label: "Move the brand too",
    detail: "The brand travels with this site. Only offered when no other site depends on it.",
  },
  {
    value: "detach",
    label: "Detach this site from the brand",
    detail: "The site keeps all of its data and simply stops belonging to that brand.",
  },
  {
    value: "keep",
    label: "Leave the brand where it is",
    detail: "The old organization keeps reading this site through the brand. Choose deliberately.",
  },
];

function tableSummary(rows: MovePreviewTable[]): string {
  if (!rows.length) return "nothing yet";
  return rows
    .map((row) => `${row.table.split(".")[1] ?? row.table} (${row.rows})`)
    .join(", ");
}

export function MoveSiteOrganizationCard({ site }: { site: MarketingSite }) {
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  // The scope tree is the platform's list of orgs the user belongs to — the
  // same source the global org picker reads. This card only READS it; global
  // active context is written by Surface A components alone.
  const { organizations, status } = useScopeTree();
  useEffect(() => {
    void dispatch(ensureScopeTree({}));
  }, [dispatch]);
  const loading = status === "idle" || status === "loading";
  const [targetOrgId, setTargetOrgId] = useState<string>("");
  // Deliberately unset: the RPC has no default either. A cross-org brand is an
  // access decision, and picking one for the user is how the hole gets reopened.
  const [brandAction, setBrandAction] = useState<BrandAction | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Only organizations the user is actually a member of, minus the one the
  // site already lives in — offering its current home as a destination is a
  // dead control.
  const destinations = organizations.filter(
    (org) => org.id !== site.organization_id,
  );
  const target = destinations.find((org) => org.id === targetOrgId) ?? null;

  const preview = useQuery({
    queryKey: ["marketing", "site", site.id, "move-preview"],
    queryFn: () => previewSiteOrganizationMove(site.id),
    enabled: confirming,
  });

  // The brand only forces a choice when it would end up in a different org
  // than the site — which is every cross-org move unless the brand is already
  // in the destination.
  const brand = preview.data?.brand ?? null;
  const brandNeedsChoice = Boolean(brand && brand.organization_id !== targetOrgId);
  const brandHasSiblings = (brand?.other_sites ?? 0) > 0;
  const brandChoiceMade =
    !brandNeedsChoice ||
    (brandAction !== null && !(brandAction === "move_brand" && brandHasSiblings));

  const move = useMutation({
    mutationFn: () =>
      moveSiteToOrganization({
        siteId: site.id,
        targetOrganizationId: targetOrgId,
        expectedVersion: site.version,
        ...(brandNeedsChoice && brandAction ? { brandAction } : {}),
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["marketing", "site", site.id] });
      void queryClient.invalidateQueries({ queryKey: ["marketing", "sites"] });
      setConfirming(false);
      if (!result.moved) {
        toast.info(`${result.site_name} is already in ${result.organization_name}.`);
        return;
      }
      // Honest feedback: what moved, and what stayed on purpose.
      const kept = result.preserved_tables.length;
      toast.success(`Moved ${result.site_name} to ${result.organization_name}`, {
        description:
          `${result.rows_moved} record${result.rows_moved === 1 ? "" : "s"} re-homed` +
          (kept ? `; ${kept} append-only history table${kept === 1 ? "" : "s"} left with the previous organization on purpose.` : "."),
      });
      if (result.brand?.action === "kept" && result.brand.warning) {
        toast.warning(result.brand.warning);
      }
    },
    onError: (error) =>
      toast.error("Could not move this site", {
        description: extractErrorMessage(error),
      }),
  });

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3">
        <ArrowRightLeft className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Organization</h2>
      </div>
      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span>This site belongs to</span>
          {/* THE DOOR LAW: the org is named, so the org is reachable. */}
          <EntityRef
            token="organization"
            id={site.organization_id}
            name={
              organizations.find((org) => org.id === site.organization_id)?.name ??
              null
            }
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="site-move-org" className="text-xs">
              Move to
            </Label>
            <Select value={targetOrgId} onValueChange={setTargetOrgId}>
              <SelectTrigger id="site-move-org" size="sm">
                <SelectValue
                  placeholder={
                    loading
                      ? "Loading your organizations…"
                      : destinations.length
                        ? "Choose an organization"
                        : "No other organization available"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {destinations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                    {org.is_personal ? " (personal workspace)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled={!targetOrgId || move.isPending}
            onClick={() => setConfirming(true)}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Move site
          </Button>
        </div>

        <p className="text-[11px] leading-4 text-muted-foreground">
          Everything under this site moves with it — pages, crawl sessions,
          competitors, rankings and plans. Its recorded history (snapshots and
          crawl facts) stays stamped with the organization that held the site at
          the time.
        </p>

        {!loading && destinations.length === 0 ? (
          <p className="text-[11px] leading-4 text-muted-foreground">
            You are only a member of this site&apos;s current organization, so
            there is nowhere to move it yet. Join or create another organization
            first.
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open);
          if (!open) {
            move.reset();
            setBrandAction(null);
          }
        }}
        title={`Move ${site.name} to ${target?.name ?? "another organization"}?`}
        description="Everyone in the destination organization will be able to see this site. People whose only access came through the current organization will lose it."
        confirmLabel="Move site"
        busy={move.isPending}
        confirmDisabled={preview.isLoading || preview.isError || !brandChoiceMade}
        content={
          <div className="space-y-3 text-xs">
            {preview.isLoading ? (
              <p className="text-muted-foreground">
                Counting what would move…
              </p>
            ) : preview.isError ? (
              <p className="text-destructive">
                Could not read what would move: {extractErrorMessage(preview.error)}
              </p>
            ) : preview.data ? (
              <>
                <div className="rounded-md border border-border bg-muted/30 p-2.5">
                  <p className="font-medium text-foreground">
                    Moves with the site ({preview.data.rows_moved} record
                    {preview.data.rows_moved === 1 ? "" : "s"})
                  </p>
                  <p className="mt-1 leading-4 text-muted-foreground">
                    {tableSummary(preview.data.moved_tables)}
                  </p>
                </div>
                {preview.data.preserved_tables.length ? (
                  <div className="rounded-md border border-border bg-muted/30 p-2.5">
                    <p className="font-medium text-foreground">
                      Deliberately stays with{" "}
                      {preview.data.site_name}&apos;s previous organization
                    </p>
                    <p className="mt-1 leading-4 text-muted-foreground">
                      {tableSummary(preview.data.preserved_tables)} — these are
                      append-only records of what was true at the time, and the
                      site still reaches them.
                    </p>
                  </div>
                ) : null}

                {brandNeedsChoice && brand ? (
                  <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
                    {/* The brand ref sits at the END of its own line: EntityRef
                        renders trailing controls (new tab, peek), so dropping it
                        mid-sentence strands punctuation after those icons. */}
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500" />
                      <div>
                        <p className="font-medium text-foreground">
                          This site belongs to a brand, which conveys access to it.
                        </p>
                        <EntityRef
                          token="web_brand"
                          id={brand.id}
                          name={brand.name}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {BRAND_CHOICES.map((choice) => {
                        const blocked =
                          choice.value === "move_brand" && brandHasSiblings;
                        return (
                          <label
                            key={choice.value}
                            className={
                              "flex cursor-pointer items-start gap-2 rounded-md border border-border p-2 " +
                              (blocked
                                ? "cursor-not-allowed opacity-50"
                                : brandAction === choice.value
                                  ? "border-primary bg-primary/5"
                                  : "hover:bg-accent")
                            }
                          >
                            <input
                              type="radio"
                              name="site-move-brand-action"
                              className="mt-0.5 accent-[var(--color-primary)]"
                              value={choice.value}
                              disabled={blocked}
                              checked={brandAction === choice.value}
                              onChange={() => setBrandAction(choice.value)}
                            />
                            <span>
                              <span className="block font-medium text-foreground">
                                {choice.label}
                              </span>
                              <span className="block leading-4 text-muted-foreground">
                                {blocked
                                  ? `"${brand.name}" also holds ${brand.other_sites} other site${brand.other_sites === 1 ? "" : "s"}, so moving it would take ${brand.other_sites === 1 ? "that site" : "those sites"} along.`
                                  : choice.detail}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        }
        onConfirm={async () => {
          await move.mutateAsync();
        }}
      />
    </section>
  );
}
