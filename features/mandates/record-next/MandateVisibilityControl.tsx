"use client";

// features/mandates/record-next/MandateVisibilityControl.tsx
//
// WHO CAN SEE A MANDATE I CREATED — the sharing control for a person's own
// soft mandate, on the person seat of the record page.
//
// It writes the mandate's own `visibility` column (`platform.visibility`, the
// store's closed four: personal · internal · link · public), read through the
// platform's FOUR VISIBILITY LANES (`@ai-matrx/records-ui` VISIBILITY_LANES:
// mine · my organization · community · world). Three lanes are offered:
//
//   Only me          visibility personal
//   <an organization> visibility internal, homed in that organization — the
//                    mandate MOVES there so its members can list it (RLS reads
//                    `internal` rows of the organizations you belong to)
//   Everyone         visibility public
//
// COMMUNITY is not offered: the store has no signed-in-only value yet (the
// records-ui ruling: "today nothing is in Community"), and a choice that would
// silently be "World" is a lie. Person-to-person sharing (ShareModal) is not
// offered either: `mandate` is not in the shareable-resource registry. Both
// are recorded as owner decisions, not faked here.
//
// The write is a direct, RLS-checked update (the creator owns the row).

import { useState } from "react";
import { Building2, Check, ChevronDown, Globe, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import { createClient } from "@/utils/supabase/client";
import { invalidateMandateCache } from "@/features/mandates/service";
import { mandateDefinitions } from "@/lib/supabase/mandateStorage";
import { useUserOrganizations } from "@/features/organizations/hooks";
import type { MandateWorkspaceData } from "@/features/mandates/workspace/useMandateWorkspaceData";

type Mandate = MandateWorkspaceData["mandate"];

/** The lane a stored visibility reads as, in a person's words. Pure. */
export function visibilityWords(
  visibility: string | null | undefined,
  homeName: string | null,
): string {
  switch (visibility) {
    case "personal":
      return "Only me";
    case "internal":
      return homeName ? `${homeName} members` : "Organization members";
    case "link":
    case "public":
      return "Everyone";
    default:
      return "Not set";
  }
}

export function MandateVisibilityControl({
  mandate,
  onChanged,
}: {
  mandate: Mandate;
  onChanged: () => void;
}) {
  const { organizations } = useUserOrganizations();
  const [saving, setSaving] = useState(false);
  const teams = organizations.filter((org) => !org.isPersonal && !org.archivedAt);
  const home = organizations.find((org) => org.id === mandate.organization_id) ?? null;
  const current = mandate.visibility;
  const label = visibilityWords(current, home && !home.isPersonal ? home.name : null);

  const save = async (
    next: { visibility: "personal" | "internal" | "public"; organizationId?: string },
    sentence: string,
  ) => {
    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await mandateDefinitions(supabase)
        .update({
          visibility: next.visibility,
          ...(next.organizationId ? { organization_id: next.organizationId } : {}),
        })
        .eq("id", mandate.id)
        .is("deleted_at", null)
        .select("mandate_key")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error("Nothing changed — this mandate is not yours to share.");
      }
      invalidateMandateCache(data.mandate_key);
      toast.success(sentence);
      onChanged();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Sharing was not changed.");
    } finally {
      setSaving(false);
    }
  };

  const isOrgLane = (orgId: string) =>
    current === "internal" && mandate.organization_id === orgId;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={saving}>
          {current === "personal" ? (
            <Lock className="h-3.5 w-3.5" />
          ) : current === "internal" ? (
            <Building2 className="h-3.5 w-3.5" />
          ) : (
            <Globe className="h-3.5 w-3.5" />
          )}
          {saving ? "Saving…" : label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs">Who can see this mandate</DropdownMenuLabel>
        <DropdownMenuItem
          className="gap-2 text-xs"
          onSelect={() =>
            void save({ visibility: "personal" }, "Only you can see this mandate now.")
          }
        >
          <Lock className="h-3.5 w-3.5" />
          Only me
          {current === "personal" ? <Check className="ml-auto h-3.5 w-3.5" /> : null}
        </DropdownMenuItem>
        {teams.length > 0 ? <DropdownMenuSeparator /> : null}
        {teams.map((org) => (
          <DropdownMenuItem
            key={org.id}
            className="gap-2 text-xs"
            onSelect={() =>
              void save(
                { visibility: "internal", organizationId: org.id },
                `Every member of ${org.name} can see this mandate now.`,
              )
            }
          >
            <Building2 className="h-3.5 w-3.5" />
            <span className="truncate">{org.name} members</span>
            {isOrgLane(org.id) ? <Check className="ml-auto h-3.5 w-3.5" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-xs"
          onSelect={() =>
            void save({ visibility: "public" }, "Everyone can see this mandate now.")
          }
        >
          <Globe className="h-3.5 w-3.5" />
          Everyone
          {current === "public" || current === "link" ? (
            <Check className="ml-auto h-3.5 w-3.5" />
          ) : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
