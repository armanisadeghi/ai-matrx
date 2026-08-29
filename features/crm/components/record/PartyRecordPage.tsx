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

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Building2, User } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { AssociationCardGrid } from "@/features/scopes/components/associations/AssociationCardGrid";
import { PrimaryEntityProvider } from "@/features/scopes/components/associations/PrimaryEntityContext";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { CRM_RECORD_SURFACE_NAME } from "@/features/surfaces/manifests/crm-record.manifest";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { useAssociations } from "@/features/scopes/hooks/useAssociations";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import type { Comment } from "@/features/comments/types";
import { buildCrmRecordContextData } from "../../agent-context/buildCrmRecordContextData";
import { CRM_RECORD_CONTEXT_MENU_PROPS } from "../../agent-context/crmRecordContextMenuProps";
import { usePartyDetail } from "../../hooks/usePartyDetail";
import { deleteParty } from "../../service";
import { MergeStatusCard } from "../dedup/MergeStatusCard";
import { PartyIdentityCard } from "./PartyIdentityCard";
import { ExpertStatusCard } from "./ExpertStatusCard";
import { ContactPointsCard } from "./ContactPointsCard";
import { AddressesCard } from "./AddressesCard";
import { EmploymentCard } from "./EmploymentCard";
import { PartyEmployeeCard } from "@/features/hr/entry-points/PartyEmployeeCard";
import { InteractionTimeline } from "./InteractionTimeline";
import { PartyNotes } from "./PartyNotes";
import { OutreachContactCandidatesCard } from "./OutreachContactCandidatesCard";
import { ContactCandidatesCard } from "./ContactCandidatesCard";
import {
  JournalistIntelligenceCard,
  storedJournalistActivity,
} from "./JournalistIntelligenceCard";
import { PartyProvenanceCard } from "./PartyProvenanceCard";
import { PartyDealsCard } from "../deals/PartyDealsCard";
import type { CrmRecordCopyParent } from "./record-copy";

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
  const [notes, setNotes] = useState<Comment[]>([]);
  const [notesLoadError, setNotesLoadError] = useState<string | null>(null);
  const { categories: lifecycleStages } = useCategories({
    dimension: CATEGORY_DIMENSIONS.crmLifecycleStage,
  });
  const { categories: ratings } = useCategories({
    dimension: CATEGORY_DIMENSIONS.crmRating,
  });
  const { categories: partyRoles } = useCategories({
    dimension: CATEGORY_DIMENSIONS.partyRole,
  });
  const { edges: partyEdges } = useAssociations({ type: "party", id: partyId });

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

  const lifecycleStage = lifecycleStages.find(
    (category) => category.id === party?.lifecycle_stage_id,
  );
  const rating = ratings.find((category) => category.id === party?.rating_id);
  const selectedRoleIds = new Set(
    partyEdges
      .filter(
        (edge) =>
          edge.direction === "outgoing" &&
          edge.otherType === "category" &&
          edge.role === "member",
      )
      .map((edge) => edge.otherId),
  );
  const roles = partyRoles
    .filter((category) => selectedRoleIds.has(category.id))
    .map((category) => ({ id: category.id, name: category.name }));
  const copyParent: CrmRecordCopyParent | undefined = party
    ? { type: "party", id: party.id, label: party.display_name }
    : undefined;

  // The record scope is sampled at execution time, so category labels and
  // independently-loaded notes are as fresh as the data visible on the page.
  const getScope = () =>
    buildCrmRecordContextData({
      detail,
      isLoading,
      loadError: error,
      lifecycleStage: lifecycleStage
        ? { id: lifecycleStage.id, name: lifecycleStage.name }
        : null,
      rating: rating ? { id: rating.id, name: rating.name } : null,
      roles,
      notes,
      notesLoadError,
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={CRM_RECORD_SURFACE_NAME}
      getScope={getScope}
    >
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
          <NonEditableContextMenu
            {...CRM_RECORD_CONTEXT_MENU_PROPS}
            getApplicationScope={getScope}
            entity={{
              type: "party",
              id: party.id,
              title: party.display_name,
            }}
          >
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
                {/* Renders nothing unless this person is (or was proposed as)
                    an expert — see ExpertStatusCard. */}
                <ExpertStatusCard party={party} onChanged={refresh} />
                <ContactPointsCard
                  partyId={party.id}
                  partyLabel={party.display_name}
                  orgId={party.organization_id}
                  points={detail.contactPoints}
                  onChanged={refresh}
                />
                <AddressesCard
                  partyId={party.id}
                  partyLabel={party.display_name}
                  orgId={party.organization_id}
                  addresses={detail.addresses}
                  onChanged={refresh}
                />
                {/* SPEC-UI-IA §6 — a CRM record and an employee record must
                    never look like two unrelated search results for the same
                    person. Renders NOTHING when this party is not an employee
                    here, or when HR is off for this org: absent, not a card
                    that announces the absence. */}
                {isPerson && (
                  <PartyEmployeeCard
                    partyId={party.id}
                    orgId={party.organization_id}
                  />
                )}
                {isPerson ? (
                  <EmploymentCard
                    mode="person"
                    partyId={party.id}
                    partyLabel={party.display_name}
                    orgId={party.organization_id}
                    affiliations={detail.affiliations}
                    onChanged={refresh}
                  />
                ) : (
                  <EmploymentCard
                    mode="company"
                    partyId={party.id}
                    partyLabel={party.display_name}
                    orgId={party.organization_id}
                    members={detail.members}
                    onChanged={refresh}
                  />
                )}
              </div>

              {/* Activity main */}
              <div className="min-w-0 space-y-3">
                {/* "Why is this org in my CRM?" — the G1 provenance edge,
                    rendered as real doors. Renders nothing for a record the
                    user typed in themselves. */}
                <PartyProvenanceCard party={party} onChanged={refresh} />
                {!isPerson && party.primary_domain && (
                  <OutreachContactCandidatesCard outletPartyId={party.id} />
                )}
                {/* The persisted candidate queue (IC-3): every producer — the
                    crawl, the paid waterfall, the registries, the extension —
                    writes ONE ranked list, and none of it is contactable until
                    somebody confirms a row here. */}
                <ContactCandidatesCard partyId={party.id} onChanged={refresh} />
                {/* Only for people, and only when we have somewhere to look:
                    "is this journalist still there, and what do they cover?" */}
                {isPerson && (
                  <JournalistIntelligenceCard
                    partyId={party.id}
                    storedActivity={storedJournalistActivity(party)}
                  />
                )}
                {/* Deals with this person/company — the door goes both ways
                    (a deal names its party; the party names its deals). */}
                <PartyDealsCard party={party} />
                <InteractionTimeline
                  partyId={party.id}
                  orgId={party.organization_id}
                  interactions={detail.interactions}
                  onChanged={refresh}
                  getApplicationScope={getScope}
                  writeSurfaceName={CRM_RECORD_SURFACE_NAME}
                  copyParent={copyParent}
                />
                <PartyNotes
                  partyId={party.id}
                  orgId={party.organization_id}
                  getApplicationScope={getScope}
                  writeSurfaceName={CRM_RECORD_SURFACE_NAME}
                  copyParent={copyParent}
                  onNotesStateChange={(nextNotes, nextError) => {
                    setNotes(nextNotes);
                    setNotesLoadError(nextError);
                  }}
                />
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
          </NonEditableContextMenu>
        )}
      </div>
    </SurfaceRuntimeProvider>
  );
}
