"use client";

// features/crm/components/deals/PartyDealsCard.tsx
//
// Deals on a party record — THE DOOR LAW both directions: a deal names its
// party, so the party names its deals, each one openable, plus a one-click
// "New deal" that arrives pre-bound to this record.

import { useEffect, useRef, useState } from "react";
import { Handshake } from "lucide-react";
import { PlusTapButton } from "@ai-matrx/tap-target/buttons";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { CRM_RECORD_SURFACE_NAME } from "@/features/surfaces/manifests/crm-record.manifest";
import { parseDealDraft } from "../../agent-context/crmRecordSurfaceWrite";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useCrmContext } from "../../hooks/useCrmContext";
import { usePipelines } from "../../deals/usePipelines";
import { createDeal, fetchDealsForParty } from "../../deals/service";
import type { DealRow } from "../../deals/types";
import { formatDealAmount } from "../../deals/types";
import type { PartyListRow } from "../../types";
import { SectionCard, SectionEmpty } from "../record/SectionCard";
import { dealStatusBadge } from "./columns";
import { DealCreateDialog } from "./DealCreateDialog";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface Props {
  party: PartyListRow;
  /** What this card shows, handed up for the page's agent scope. */
  onStateChange?: (deals: DealRow[] | null, loadError: string | null) => void;
}

export function PartyDealsCard({ party, onStateChange }: Props) {
  const [deals, setDeals] = useState<DealRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [generation, setGeneration] = useState(0);
  const { pipelines, stageById } = usePipelines();
  const ctx = useCrmContext();
  const reportState = useRef(onStateChange);
  useEffect(() => {
    reportState.current = onStateChange;
  });

  // The agent twin of "New deal": the same createDeal the dialog calls, on the
  // default pipeline's first OPEN stage unless the agent names another.
  useSurfaceWriteHandlers(CRM_RECORD_SURFACE_NAME, {
    create_deal: {
      // Refused before the approval card when the value is malformed.
      validate: (raw: unknown) => {
        parseDealDraft(raw);
      },
      apply: async (raw: unknown) => {
      const input = parseDealDraft(raw);
      const pipeline = input.pipelineId
        ? pipelines.find((p) => p.id === input.pipelineId)
        : pipelines[0];
      if (!pipeline) {
        throw new Error(
          input.pipelineId
            ? "create_deal.pipeline_id is not one of this organization's pipelines."
            : "This organization has no deal pipeline yet — a person creates one on the Deals page first.",
        );
      }
      const stage = pipeline.stages.find((st) => !st.outcome);
      if (!stage) throw new Error(`Pipeline ${pipeline.name} has no open stage.`);
      const deal = await createDeal({
        name: input.name,
        pipelineId: pipeline.id,
        stageId: stage.id,
        orgId: party.organization_id,
        amount: input.amount,
        currency: input.currency,
        expectedCloseDate: input.expectedCloseDate,
        description: input.description,
        primaryPartyId: party.id,
        assignedTo: ctx?.userId ?? null,
      });
      setGeneration((g) => g + 1);
      return {
        summary: `Created deal "${deal.name}" in ${pipeline.name} · ${stage.name}.`,
        data: { id: deal.id, name: deal.name, pipeline: pipeline.name, stage: stage.name },
      };
      },
    },
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchDealsForParty(party.id);
        if (!cancelled) {
          setDeals(rows);
          setLoadError(null);
          reportState.current?.(rows, null);
        }
      } catch (e) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : String(e);
          setLoadError(message);
          reportState.current?.(null, message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [party.id, generation]);

  return (
    <SectionCard
      compactAction
      empty={!loadError && deals !== null && deals.length === 0}
      title="Deals"
      Icon={Handshake}
      count={loadError ? undefined : (deals?.length ?? undefined)}
      action={
        <PlusTapButton ariaLabel="New deal" onClick={() => setCreateOpen(true)} />
      }
    >
      {loadError ? (
        <div className="flex items-center justify-between gap-2 py-1 text-xs text-muted-foreground">
          <span>Couldn&apos;t load deals — {loadError} <ErrorAlchemyMenu error={loadError} /></span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setGeneration((g) => g + 1)}
          >
            Retry
          </Button>
        </div>
      ) : deals === null ? (
        <Skeleton className="h-8 w-full rounded" />
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
