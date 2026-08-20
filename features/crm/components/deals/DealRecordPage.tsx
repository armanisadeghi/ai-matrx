"use client";

// features/crm/components/deals/DealRecordPage.tsx
//
// The deal 360° — stage flow (click-to-move), value + facts, the party door
// (THE DOOR LAW: the person/company on the deal opens), the activity timeline
// (crm.interaction rows bound by deal_id), stage history (crm.deal_stage_event
// — cycle time made visible), notes (platform.comments), and attached
// tasks/files via the canonical AssociationCardGrid.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Building2, Handshake, History, User } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { AssociationCardGrid } from "@/features/scopes/components/associations/AssociationCardGrid";
import { PrimaryEntityProvider } from "@/features/scopes/components/associations/PrimaryEntityContext";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  UserAvatarDisplay,
  resolveUserName,
} from "@/components/user/UserIdentity";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/utils/datetime";
import { InteractionTimeline } from "../record/InteractionTimeline";
import { PartyNotes } from "../record/PartyNotes";
import { SectionCard, SectionEmpty } from "../record/SectionCard";
import { useDealDetail } from "../../deals/useDealDetail";
import { usePipelines } from "../../deals/usePipelines";
import { useOrgMembers } from "../../deals/useOrgMembers";
import { deleteDeal, updateDeal } from "../../deals/service";
import {
  effectiveProbability,
  formatDealAmount,
} from "../../deals/types";
import { dealStatusBadge } from "./columns";
import { DealStageFlow } from "./DealStageFlow";

interface Props {
  dealId: string;
}

function RecordSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(280px,26rem)_1fr]">
      <div className="space-y-3">
        <Skeleton className="h-40 w-full rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-32 w-full rounded-md" />
      </div>
    </div>
  );
}

export function DealRecordPage({ dealId }: Props) {
  const router = useRouter();
  const { detail, isLoading, error, refresh } = useDealDetail(dealId);
  const { stageById, pipelineById } = usePipelines();
  const deal = detail?.deal ?? null;
  const { memberById } = useOrgMembers(
    useMemo(
      () => (deal?.organization_id ? [deal.organization_id] : []),
      [deal?.organization_id],
    ),
  );

  // Inline edit state for the facts card.
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountDraft, setAmountDraft] = useState("");

  const pipeline = deal ? (pipelineById.get(deal.pipeline_id) ?? null) : null;
  const stage = deal ? stageById.get(deal.stage_id) : undefined;

  const onDelete = async () => {
    if (!deal) return;
    const ok = await confirm({
      title: `Delete ${deal.name}?`,
      description: "The deal moves to trash. Its history is kept.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteDeal(deal.id);
      toast.success(`${deal.name} deleted`);
      router.push("/crm/deals");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const saveAmount = async () => {
    if (!deal) return;
    const parsed = amountDraft.trim() ? Number(amountDraft) : null;
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      toast.error("The value must be a non-negative number");
      return;
    }
    try {
      await updateDeal(deal.id, { amount: parsed });
      setEditingAmount(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the value");
    }
  };

  const saveExpectedClose = async (value: string) => {
    if (!deal) return;
    try {
      await updateDeal(deal.id, { expected_close_date: value || null });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the date");
    }
  };

  const probability = deal ? effectiveProbability(deal, stage) : null;

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton
              onClick={() => router.push("/crm/deals")}
              ariaLabel="Back to deals"
            />
            {deal && (
              <span className="ml-1 flex min-w-0 items-center gap-1.5">
                <Handshake className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate text-sm font-medium text-foreground">
                  {deal.name}
                </span>
                {dealStatusBadge(deal.status)}
              </span>
            )}
          </>
        }
        right={
          deal ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void onDelete()}
              className="hidden h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive sm:inline-flex"
            >
              Delete
            </Button>
          ) : undefined
        }
      />

      <div
        className="h-full overflow-y-auto bg-textured px-3 pb-6"
        style={{ paddingTop: "calc(var(--shell-header-h) + 0.5rem)" }}
      >
        {!isLoading && !deal && (
          <AccessGate
            token="crm_deal"
            id={dealId}
            error={error ?? undefined}
            onRetry={() => void refresh()}
            fallbackHref="/crm/deals"
            fallbackLabel="All deals"
          />
        )}

        {isLoading && !detail && <RecordSkeleton />}

        {deal && error && (
          <div className="mx-auto mb-3 flex max-w-3xl items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            <span>This deal couldn&apos;t be refreshed just now.</span>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              Retry
            </Button>
          </div>
        )}

        {detail && deal && (
          <div className="space-y-3">
            {/* The stage flow spans the page — it IS the deal's headline. */}
            <div className="rounded-md border border-border bg-card p-2.5">
              {pipeline ? (
                <DealStageFlow
                  deal={deal}
                  pipeline={pipeline}
                  onChanged={refresh}
                />
              ) : (
                <span className="text-xs text-muted-foreground">
                  Loading pipeline…
                </span>
              )}
            </div>

            <div
              className={cn(
                "grid items-start gap-3",
                "lg:grid-cols-[minmax(280px,26rem)_1fr]",
              )}
            >
              {/* Facts rail */}
              <div className="space-y-3">
                <SectionCard title="Deal" Icon={Handshake}>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-xs text-muted-foreground">Value</dt>
                      <dd>
                        {editingAmount ? (
                          <span className="flex items-center gap-1">
                            <Input
                              value={amountDraft}
                              onChange={(e) => setAmountDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void saveAmount();
                                if (e.key === "Escape") setEditingAmount(false);
                              }}
                              inputMode="decimal"
                              className="h-7 w-28 text-right text-sm"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => void saveAmount()}
                            >
                              Save
                            </Button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="rounded px-1 text-sm font-medium tabular-nums hover:bg-accent"
                            title="Edit the value"
                            onClick={() => {
                              setAmountDraft(
                                deal.amount === null ? "" : String(deal.amount),
                              );
                              setEditingAmount(true);
                            }}
                          >
                            {formatDealAmount(deal.amount, deal.currency)}
                          </button>
                        )}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-xs text-muted-foreground">Win %</dt>
                      <dd className="text-sm tabular-nums">
                        {probability === null ? "—" : `${probability}%`}
                        {deal.probability === null && stage?.probability !== undefined && (
                          <span className="ml-1 text-[11px] text-muted-foreground">
                            (stage default)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-xs text-muted-foreground">
                        Expected close
                      </dt>
                      <dd>
                        <input
                          type="date"
                          aria-label="Expected close date"
                          className="h-7 rounded border border-transparent bg-transparent px-1 text-right text-sm hover:border-border"
                          value={deal.expected_close_date ?? ""}
                          onChange={(e) => void saveExpectedClose(e.target.value)}
                        />
                      </dd>
                    </div>
                    {deal.closed_at && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-xs text-muted-foreground">Closed</dt>
                        <dd className="text-sm text-muted-foreground">
                          {formatRelativeTime(deal.closed_at)}
                        </dd>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-xs text-muted-foreground">Owner</dt>
                      <dd>
                        {deal.assigned_to ? (
                          <span className="inline-flex items-center gap-1.5">
                            <UserAvatarDisplay
                              user={
                                memberById.get(deal.assigned_to) ?? {
                                  id: deal.assigned_to,
                                }
                              }
                              size="xs"
                            />
                            <span className="text-sm">
                              {resolveUserName(
                                memberById.get(deal.assigned_to) ?? {
                                  id: deal.assigned_to,
                                },
                              )}
                            </span>
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Unassigned
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-xs text-muted-foreground">With</dt>
                      <dd className="min-w-0">
                        {deal.party ? (
                          <EntityRef
                            token="party"
                            id={deal.party.id}
                            name={deal.party.display_name}
                          >
                            <span className="inline-flex min-w-0 items-center gap-1.5 text-sm">
                              {deal.party.party_kind === "person" ? (
                                <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              )}
                              <span className="truncate">
                                {deal.party.display_name}
                              </span>
                            </span>
                          </EntityRef>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Nobody attached yet
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>
                  {deal.description && (
                    <p className="mt-2 whitespace-pre-wrap border-t border-border/60 pt-2 text-sm text-muted-foreground">
                      {deal.description}
                    </p>
                  )}
                </SectionCard>

                <SectionCard
                  title="Stage history"
                  Icon={History}
                  count={detail.stageEvents.length}
                >
                  {detail.stageEvents.length === 0 ? (
                    <SectionEmpty>No stage changes recorded</SectionEmpty>
                  ) : (
                    <ol className="space-y-1">
                      {detail.stageEvents.map((event) => (
                        <li
                          key={event.id}
                          className="flex items-baseline justify-between gap-2 text-xs"
                        >
                          <span className="min-w-0 truncate text-foreground">
                            {event.from_stage_id && (
                              <>
                                <span className="text-muted-foreground">
                                  {stageById.get(event.from_stage_id)?.name ??
                                    "?"}
                                </span>
                                <span className="mx-1 text-muted-foreground">
                                  →
                                </span>
                              </>
                            )}
                            {stageById.get(event.stage_id)?.name ?? "?"}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {formatRelativeTime(event.entered_at)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </SectionCard>
              </div>

              {/* Activity main */}
              <div className="min-w-0 space-y-3">
                {deal.party ? (
                  <InteractionTimeline
                    partyId={deal.party.id}
                    orgId={deal.organization_id}
                    interactions={detail.interactions}
                    onChanged={refresh}
                    dealId={deal.id}
                  />
                ) : (
                  <SectionCard title="Activity" Icon={History}>
                    <SectionEmpty>
                      Attach a person or company to log activity — an
                      interaction always belongs to someone.
                    </SectionEmpty>
                  </SectionCard>
                )}
                <PartyNotes
                  partyId={deal.id}
                  orgId={deal.organization_id}
                  entityType="crm_deal"
                />
                <PrimaryEntityProvider
                  value={{
                    type: "crm_deal",
                    id: deal.id,
                    orgId: deal.organization_id,
                    label: deal.name,
                  }}
                >
                  <AssociationCardGrid tokens={["task", "file"]} />
                </PrimaryEntityProvider>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
