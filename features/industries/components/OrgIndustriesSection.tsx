"use client";

/**
 * OrgIndustriesSection — manage which industries an organization belongs to,
 * and make that choice LEGIBLE: each assigned industry lists the shared
 * knowledge libraries it unlocks, and a "Shared libraries" block shows every
 * discoverable store with this org's entitlement chip + self-service
 * subscribe/unsubscribe (rag.library_subscribe/_unsubscribe — server-side
 * validated).
 *
 * Industry membership is an ACCESS-CONTROL INPUT (it grants access to shared
 * knowledge libraries published to that industry) and a classification spine
 * (it seeds default scope templates). Org owners/admins can assign/unassign;
 * Matrx super-admins can too. Members see memberships read-only. The DB RPC
 * enforces the same gate. Self-serve joining is a settled decision (Decision 1,
 * docs/handoffs/shared-knowledge-access.md) — never make this read-only or
 * add an approval flow.
 */

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  Building2,
  Library,
  Loader2,
  Lock,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { useUserRole } from "@/features/organizations/hooks";
import { useIndustries, useOrgIndustries } from "@/features/industries/hooks";
import { useLibraryCatalog } from "@/features/rag/hooks/useLibraryCatalog";
import { EntitlementChip } from "@/features/rag/components/library-catalog/EntitlementChip";

export function OrgIndustriesSection({ orgId }: { orgId: string }) {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const { canManageSettings } = useUserRole(orgId);
  const canEdit = isSuperAdmin || canManageSettings;
  const { industries } = useIndustries();
  const { orgIndustries, loading, assign, unassign } = useOrgIndustries(orgId);
  const [adding, setAdding] = useState("");

  // What each industry / subscription actually unlocks — the discoverable
  // library catalog evaluated against THIS org (not the active org).
  const catalog = useLibraryCatalog(orgId);

  const byId = new Map(industries.map((i) => [i.id, i]));
  const assigned = orgIndustries.map((oi) => ({
    ...oi,
    industry: byId.get(oi.industryId),
  }));
  const unassigned = industries.filter(
    (i) => !orgIndustries.some((oi) => oi.industryId === i.id),
  );

  const librariesForSlug = (slug: string | undefined) =>
    slug
      ? catalog.items.filter(
          (it) =>
            it.entitledVia === "industry" && it.entitledIndustrySlug === slug,
        )
      : [];

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Industries</h3>
        {!canEdit && (
          <Lock
            className="h-3 w-3 text-muted-foreground"
            aria-label="Org admin only"
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Industries this organization belongs to. Membership grants access to
        shared knowledge libraries published to that industry and seeds default
        scope templates.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : assigned.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No industries assigned.
        </div>
      ) : (
        <div className="space-y-1.5">
          {assigned.map((a) => {
            const unlocked = librariesForSlug(a.industry?.slug);
            return (
              <div
                key={a.industryId}
                className="rounded-md border border-border/70 bg-background/40 px-2.5 py-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-foreground">
                    {a.industry?.name ?? a.industryId}
                  </span>
                  {a.isPrimary && (
                    <span className="text-[10px] uppercase tracking-wide text-primary">
                      primary
                    </span>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await unassign(a.industryId);
                        if (ok) toast.success("Industry removed");
                        else toast.error("Could not remove industry");
                      }}
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      aria-label="Remove industry"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {unlocked.length > 0 ? (
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                      <BookOpenText className="h-3 w-3" /> Unlocks:
                    </span>
                    {unlocked.map((lib) => (
                      <Link
                        key={lib.id}
                        href={`/rag/library-catalog?store_id=${lib.id}`}
                        className="rounded-full bg-primary/10 px-2 py-0.5 text-primary hover:underline"
                      >
                        {lib.name}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1 text-[11px] text-muted-foreground/70">
                    No shared libraries are published to this industry yet.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canEdit && unassigned.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={adding} onValueChange={setAdding}>
            <SelectTrigger className="h-8 w-56">
              <SelectValue placeholder="Add an industry…" />
            </SelectTrigger>
            <SelectContent>
              {unassigned.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                  <span className="text-muted-foreground">
                    {" "}
                    · {i.facet.replace("_", " ")}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={!adding}
            onClick={async () => {
              const ok = await assign(adding);
              if (ok) {
                toast.success("Industry added");
                setAdding("");
              } else {
                toast.error("Could not add industry");
              }
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      )}

      {/* Shared libraries — every discoverable store, with this org's
          entitlement state and self-service subscribe/unsubscribe. */}
      <div className="space-y-2 border-t border-border/70 pt-3">
        <div className="flex items-center gap-2">
          <Library className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-xs font-semibold">Shared knowledge libraries</h4>
          <Link
            href="/rag/library-catalog"
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            Full catalog
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {catalog.loading && catalog.items.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : catalog.items.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            No shared libraries are discoverable yet.
          </div>
        ) : (
          <div className="space-y-1">
            {catalog.items.map((it) => (
              <div
                key={it.id}
                className="flex items-center gap-2 rounded-md border border-border/70 bg-background/40 px-2.5 py-1.5"
              >
                <Link
                  href={`/rag/library-catalog?store_id=${it.id}`}
                  className="min-w-0 truncate text-xs font-medium text-foreground hover:underline"
                >
                  {it.name}
                </Link>
                <EntitlementChip
                  entitledVia={it.entitledVia}
                  industryName={it.entitledIndustryName}
                />
                <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                  {it.memberCount} doc{it.memberCount === 1 ? "" : "s"}
                </span>
                {canEdit &&
                  (it.subscribed ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        const ok = await catalog.unsubscribe(it.id);
                        if (ok) toast.success(`Left ${it.name}`);
                        else
                          toast.error(
                            catalog.error ?? "Could not unsubscribe",
                          );
                      }}
                    >
                      <X className="h-3 w-3" /> Leave
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      onClick={async () => {
                        const ok = await catalog.subscribe(it.id);
                        if (ok) toast.success(`Subscribed to ${it.name}`);
                        else
                          toast.error(catalog.error ?? "Could not subscribe");
                      }}
                    >
                      <Plus className="h-3 w-3" /> Subscribe
                    </Button>
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
