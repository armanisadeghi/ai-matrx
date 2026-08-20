"use client";

// features/crm/components/deals/PartyDealsCard.tsx
//
// Deals on a party record — THE DOOR LAW both directions: a deal names its
// party, so the party names its deals, each one openable, plus a one-click
// "New deal" that arrives pre-bound to this record.

import { useEffect, useState } from "react";
import { Handshake, Plus } from "lucide-react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useCrmContext } from "../../hooks/useCrmContext";
import { usePipelines } from "../../deals/usePipelines";
import { fetchDealsForParty } from "../../deals/service";
import type { DealRow } from "../../deals/types";
import { formatDealAmount } from "../../deals/types";
import type { PartyListRow } from "../../types";
import { SectionCard, SectionEmpty } from "../record/SectionCard";
import { dealStatusBadge } from "./columns";
import { DealCreateDialog } from "./DealCreateDialog";

interface Props {
  party: PartyListRow;
}

export function PartyDealsCard({ party }: Props) {
  const [deals, setDeals] = useState<DealRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [generation, setGeneration] = useState(0);
  const { pipelines, stageById } = usePipelines();
  const ctx = useCrmContext();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchDealsForParty(party.id);
        if (!cancelled) {
          setDeals(rows);
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [party.id, generation]);

  return (
    <SectionCard
      title="Deals"
      Icon={Handshake}
      count={loadError ? undefined : (deals?.length ?? undefined)}
      action={
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-primary hover:bg-accent"
        >
          <Plus className="h-3 w-3" />
          New deal
        </button>
      }
    >
      {loadError ? (
        <div className="flex items-center justify-between gap-2 py-1 text-xs text-muted-foreground">
          <span>Couldn&apos;t load deals — {loadError}</span>
          <button
            type="button"
            onClick={() => setGeneration((g) => g + 1)}
            className="rounded px-1.5 py-0.5 font-medium text-primary hover:bg-accent"
          >
            Retry
          </button>
        </div>
      ) : deals === null ? (
        <SectionEmpty>Loading…</SectionEmpty>
      ) : deals.length === 0 ? (
        <SectionEmpty>No deals with {party.display_name} yet</SectionEmpty>
      ) : (
        <ul className="space-y-1">
          {deals.map((deal) => (
            <li
              key={deal.id}
              className="flex items-center justify-between gap-2 rounded border border-border bg-muted/20 px-2 py-1.5"
            >
              <EntityRef token="crm_deal" id={deal.id} name={deal.name}>
                <span className="min-w-0 truncate text-sm font-medium">
                  {deal.name}
                </span>
              </EntityRef>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {formatDealAmount(deal.amount, deal.currency)}
                </span>
                <span>{stageById.get(deal.stage_id)?.name ?? ""}</span>
                {dealStatusBadge(deal.status)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <DealCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        pipelines={pipelines}
        orgId={party.organization_id}
        userId={ctx?.userId ?? null}
        defaultParty={{
          id: party.id,
          display_name: party.display_name,
          party_kind: party.party_kind,
        }}
        onCreated={() => setGeneration((g) => g + 1)}
      />
    </SectionCard>
  );
}
