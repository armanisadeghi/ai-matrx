"use client";

/**
 * OrgIndustriesSection — manage which industries an organization belongs to.
 *
 * Industry membership is an ACCESS-CONTROL INPUT (it grants access to shared
 * knowledge libraries published to that industry) and a classification spine
 * (it seeds default scope templates). So assignment is SUPER-ADMIN ONLY — the
 * DB RPC enforces it; non-admins see the memberships read-only.
 */

import { useMemo, useState } from "react";
import { Building2, Loader2, Lock, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { useIndustries, useOrgIndustries } from "@/features/industries/hooks";

export function OrgIndustriesSection({ orgId }: { orgId: string }) {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const { industries } = useIndustries();
  const { orgIndustries, loading, assign, unassign } = useOrgIndustries(orgId);
  const [adding, setAdding] = useState("");

  const byId = useMemo(
    () => new Map(industries.map((i) => [i.id, i])),
    [industries],
  );
  const assigned = orgIndustries.map((oi) => ({
    ...oi,
    industry: byId.get(oi.industryId),
  }));
  const unassigned = industries.filter(
    (i) => !orgIndustries.some((oi) => oi.industryId === i.id),
  );

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Industries</h3>
        {!isSuperAdmin && (
          <Lock
            className="h-3 w-3 text-muted-foreground"
            aria-label="Super-admin only"
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
        <div className="flex flex-wrap gap-1.5">
          {assigned.map((a) => (
            <span
              key={a.industryId}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
            >
              {a.industry?.name ?? a.industryId}
              {a.isPrimary && (
                <span className="text-[10px] uppercase tracking-wide text-primary">
                  primary
                </span>
              )}
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await unassign(a.industryId);
                    if (ok) toast.success("Industry removed");
                    else toast.error("Could not remove industry");
                  }}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove industry"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {isSuperAdmin && unassigned.length > 0 && (
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
    </section>
  );
}
