"use client";

// features/crm/components/record/PartyRecordPage.tsx
//
// The party 360° — identity, contact points (joined to their media),
// addresses, employment both directions, interaction timeline, notes
// (platform.comments), and attached tasks/files via the canonical
// AssociationCardGrid (PrimaryEntityProvider type "party").
//
// Dense two-column layout on desktop (identity rail + activity main), single
// stacked scroll on mobile. One scroll area per view.

import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Building2, User } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { AssociationCardGrid } from "@/features/scopes/components/associations/AssociationCardGrid";
import { PrimaryEntityProvider } from "@/features/scopes/components/associations/PrimaryEntityContext";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePartyDetail } from "../../hooks/usePartyDetail";
import { deleteParty } from "../../service";
import { MergeStatusCard } from "../dedup/MergeStatusCard";
import { PartyIdentityCard } from "./PartyIdentityCard";
import { ContactPointsCard } from "./ContactPointsCard";
import { AddressesCard } from "./AddressesCard";
import { EmploymentCard } from "./EmploymentCard";
import { InteractionTimeline } from "./InteractionTimeline";
import { PartyNotes } from "./PartyNotes";

interface Props {
  partyId: string;
}

function RecordSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(280px,26rem)_1fr]">
      <div className="space-y-3">
        <Skeleton className="h-56 w-full rounded-md" />
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-40 w-full rounded-md" />
        <Skeleton className="h-32 w-full rounded-md" />
      </div>
    </div>
  );
}

export function PartyRecordPage({ partyId }: Props) {
  const router = useRouter();
  const { detail, isLoading, error, refresh } = usePartyDetail(partyId);

  const party = detail?.party ?? null;
  const isPerson = party?.party_kind === "person";

  const onDelete = async () => {
    if (!party) return;
    const ok = await confirm({
      title: `Delete ${party.display_name}?`,
      description: "The record moves to trash. Contact history is kept.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteParty(party.id);
      toast.success(`${party.display_name} deleted`);
      router.push("/crm");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton
              onClick={() => router.back()}
              ariaLabel="Back"
            />
            {party && (
              <span className="ml-1 flex min-w-0 items-center gap-1.5">
                {isPerson ? (
                  <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 truncate text-sm font-medium text-foreground">
                  {party.display_name}
                </span>
              </span>
            )}
          </>
        }
        right={
          party ? (
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
        {/* No record to show: denied / deleted / missing / signed-out /
            transient each render their TRUE state — never a raw DB message. */}
        {!isLoading && !party && (
          <AccessGate
            token="party"
            id={partyId}
            error={error ?? undefined}
            onRetry={() => void refresh()}
            fallbackHref="/crm"
            fallbackLabel="All records"
          />
        )}

        {isLoading && !detail && <RecordSkeleton />}

        {/* Record on screen but a refresh failed — say so (no raw DB text)
            with a retry, instead of silently showing stale data. */}
        {party && error && (
          <div className="mx-auto mb-3 flex max-w-3xl items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            <span>This record couldn&apos;t be refreshed just now.</span>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              Retry
            </Button>
          </div>
        )}

        {detail && party && (
          <div
            className={cn(
              "grid items-start gap-3",
              "lg:grid-cols-[minmax(280px,26rem)_1fr]",
            )}
          >
            {/* Identity rail */}
            <div className="space-y-3">
              {/* Dedup status: merged-into banner, duplicate suggestions,
                  absorbed merges — renders nothing when clean. */}
              <MergeStatusCard party={party} onChanged={refresh} />
              <PartyIdentityCard party={party} onChanged={refresh} />
              <ContactPointsCard
                partyId={party.id}
                orgId={party.organization_id}
                points={detail.contactPoints}
                onChanged={refresh}
              />
              <AddressesCard
                partyId={party.id}
                orgId={party.organization_id}
                addresses={detail.addresses}
                onChanged={refresh}
              />
              {isPerson ? (
                <EmploymentCard
                  mode="person"
                  partyId={party.id}
                  orgId={party.organization_id}
                  affiliations={detail.affiliations}
                  onChanged={refresh}
                />
              ) : (
                <EmploymentCard
                  mode="company"
                  partyId={party.id}
                  orgId={party.organization_id}
                  members={detail.members}
                  onChanged={refresh}
                />
              )}
            </div>

            {/* Activity main */}
            <div className="min-w-0 space-y-3">
              <InteractionTimeline
                partyId={party.id}
                orgId={party.organization_id}
                interactions={detail.interactions}
                onChanged={refresh}
              />
              <PartyNotes partyId={party.id} orgId={party.organization_id} />
              <PrimaryEntityProvider
                value={{
                  type: "party",
                  id: party.id,
                  orgId: party.organization_id,
                  label: party.display_name,
                }}
              >
                <AssociationCardGrid tokens={["task", "file"]} />
              </PrimaryEntityProvider>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
