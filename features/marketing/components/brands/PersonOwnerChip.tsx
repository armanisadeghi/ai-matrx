"use client";

/**
 * The chip on a person-owned account: the linked person's name, or - when no person is linked yet -
 * a "Link person" picker over the organization's people (the CRM name search). One small popover.
 */

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Badge } from "@ai-matrx/design-system/controls";
import { searchPartiesByName } from "@/features/crm/service";
import type { PartyRef } from "@/features/crm/types";
import { setPropertyOwnerParty } from "@/features/marketing/data/service";

export function PersonOwnerChip({
  propertyId,
  ownerName,
  organizationId,
  brandId,
}: {
  propertyId: string | null;
  ownerName: string | null;
  organizationId: string;
  brandId: string;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PartyRef[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const rows = await searchPartiesByName({ orgId: organizationId, search: term });
        if (!cancelled) setResults(rows.filter((r) => r.party_kind === "person"));
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not search people");
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, term, organizationId]);

  if (ownerName) return <Badge>{ownerName}</Badge>;
  if (!propertyId) return <Badge>Person</Badge>;

  const link = async (partyId: string) => {
    try {
      await setPropertyOwnerParty(propertyId, partyId);
      await client.invalidateQueries({ queryKey: ["marketing", "social", "brand-accounts", brandId] });
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not link this person");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="rounded-full">
          <Badge tone="warning">Link person</Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search people"
          className="mb-2 w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
        <ul className="max-h-48 overflow-auto">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-muted"
                onClick={() => void link(p.id)}
              >
                {p.display_name}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
