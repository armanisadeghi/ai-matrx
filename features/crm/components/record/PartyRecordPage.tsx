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
import { Building2, Send, User } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { AssociationCardGrid } from "@ai-matrx/associations/react";
import { PrimaryEntityProvider } from "@ai-matrx/associations/react";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { CRM_RECORD_SURFACE_NAME } from "@/features/surfaces/manifests/crm-record.manifest";
import { useOpenGmailComposeWindow } from "@/features/overlays/openers/gmailComposeWindow";
import { selectActiveProjectId } from "@/features/scopes/redux/selectors/active-context";
import { useAppSelector } from "@/lib/redux/hooks";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { useAssociations } from "@/features/scopes/hooks/useAssociations";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import type { PlatformComment as Comment } from "@ai-matrx/associations";
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
import { PersonUpcomingCard } from "@/features/google-workspace/calendar/PersonUpcomingCard";
import { InteractionTimeline } from "./InteractionTimeline";
import { PartyNotes } from "./PartyNotes";
import { OutreachContactCandidatesCard } from "./OutreachContactCandidatesCard";
import { ContactCandidatesCard } from "./ContactCandidatesCard";
import {
  JournalistIntelligenceCard,
  storedJournalistActivity,
} from "./JournalistIntelligenceCard";
import { PartyProvenanceCard } from "./PartyProvenanceCard";
import { CustomFieldsSection, RecordsMount, personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { createClient } from "@/utils/supabase/client";
import {
  UNIFIED_DATA_CAMPAIGN,
  useUnifiedDataCampaign,
} from "@/lib/knobs/unifiedDataCampaign";
import { PartyOutputsSection } from "./PartyOutputsSection";
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
  const openGmailCompose = useOpenGmailComposeWindow();
  // The project the person is working in, so the sent message is ASSOCIATED with
  // it. Until F-20 no opener passed one, so the project edge `associations.ts`
  // writes was unreachable from every surface (VERIFY-B1-B2-R2 A5/D7). The
  // compose panel names the project before the send — never a silent link.
  const activeProjectId = useAppSelector(selectActiveProjectId);

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
            <>
              {/* 🚨 EMAILING A PERSON IS A FIRST-CLASS ACTION ON THE RECORD.
                  Until 2026-09-17 the only door to the Gmail compose window was
                  hidden behind the "Email" chip of the log-a-past-activity strip
                  further down the page, so arriving on a Person showed no way to
                  write to them (VERIFY-B1-B2 A1). It opens the window over the
                  record; the record stays readable behind it. */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  openGmailCompose({
                    partyId: party.id,
                    organizationId: party.organization_id,
                    partyLabel: party.display_name,
                    projectId: activeProjectId ?? null,
                    onSent: () => {
                      void refresh();
                    },
                  })
                }
                className="h-7 px-2 text-xs"
              >
                <Send className="mr-1 h-3.5 w-3.5" />
                Send email
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onDelete()}
                className="hidden h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive sm:inline-flex"
              >
                Delete
              </Button>
            </>
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
                {/* REC-34 / SCR-12 — the organization's OWN fields on this
                    standard entity, from the unified record store. One line,
                    no per-entity code: a field an organization adds to
                    contacts appears here the same afternoon. Absent (not an
                    empty box) until this org declares one. */}
                <PartyUnifiedCustomFields partyId={party.id} />
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
                {/* "Outputs about this customer" — the reverse view slice 2
                    built for sites, pointed at this party (DD-131 slice 3). */}
                <PartyOutputsSection
                  partyId={party.id}
                  partyName={party.display_name}
                />
                {/* "Upcoming with this person" (PLAN §4.6): the ONE agenda
                    component, filtered to this record's own email addresses.
                    Renders NOTHING when it has none — absent, not a card that
                    announces an absence. */}
                <PersonUpcomingCard partyId={party.id} partyName={party.display_name} />
                <InteractionTimeline
                  partyId={party.id}
                  orgId={party.organization_id}
                  interactions={detail.interactions}
                  onChanged={refresh}
                  getApplicationScope={getScope}
                  writeSurfaceName={CRM_RECORD_SURFACE_NAME}
                  copyParent={copyParent}
                  partyLabel={party.display_name}
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

/**
 * The unified record store's custom fields for this standard entity, behind the
 * campaign switch. It is the provider pair plus ONE line — everything else,
 * including "which fields extend `party`" and "render nothing when there are
 * none", lives in `@ai-matrx/records-ui`. When the campaign is on
 * platform-wide this wrapper collapses to the single `<CustomFieldsSection />`.
 */
function PartyUnifiedCustomFields({ partyId }: { partyId: string }) {
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const campaign = useUnifiedDataCampaign({
    organizationId,
    userId,
    platformDefault: () => UNIFIED_DATA_CAMPAIGN.enabled(),
  });
  if (!campaign.on || !organizationId) return null;
  return (
    <RecordsMount
      letTheStoreDecideRights
      config={{ dataSource: recordsDataSource(createClient()), actor: personActor(userId), organizationId }}
    >
      <CustomFieldsSection entityToken="party" recordId={partyId} />
    </RecordsMount>
  );
}
