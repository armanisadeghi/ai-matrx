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

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/lib/toast";
import {
  Building2,
  History,
  Link2,
  MailX,
  Plus,
  Send,
  Trash2,
  User,
} from "lucide-react";
import { contactPointBlockReason } from "../../reachability";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  ChevronLeftTapButton,
  MoreHorizontalTapButton,
} from "@ai-matrx/tap-target/buttons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createTask } from "@/features/tasks/services/taskService";
import { isUuidShape } from "@ai-matrx/kit/uuid";
import { getAssociationsStore } from "@/features/scopes/host/associationsStore";
import { parseTaskDraft } from "../../agent-context/crmRecordSurfaceWrite";
import type { DealRow } from "../../deals/types";
import type { ContactCandidateView } from "../../enrichment/service";
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
import { EntityCustomFields } from "@/features/unified-data/components/EntityCustomFields";
import { PartyOutputsSection } from "./PartyOutputsSection";
import { PartyDealsCard } from "../deals/PartyDealsCard";
import type { CrmRecordCopyParent } from "./record-copy";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface Props {
  partyId: string;
  /** The record's name + kind read on the server, so the header title is in
   *  the first HTML; the live record replaces it once loaded. */
  initialHeading?: { name: string; kind: string | null } | null;
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

export function PartyRecordPage({ partyId, initialHeading }: Props) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { detail, isLoading, error, refresh } = usePartyDetail(partyId);
  const [notes, setNotes] = useState<Comment[]>([]);
  const [notesLoadError, setNotesLoadError] = useState<string | null>(null);
  const [contactCandidates, setContactCandidates] = useState<
    ContactCandidateView[] | null
  >(null);
  const [contactCandidatesLoadError, setContactCandidatesLoadError] = useState<
    string | null
  >(null);
  const { categories: lifecycleStages } = useCategories({
    dimension: CATEGORY_DIMENSIONS.crmLifecycleStage,
  });
  const { categories: ratings } = useCategories({
    dimension: CATEGORY_DIMENSIONS.crmRating,
  });
  const { categories: partyRoles } = useCategories({
    dimension: CATEGORY_DIMENSIONS.partyRole,
  });
  const { edges: partyEdges } = useAssociations({
    type: "party",
    id: partyId,
  });
  const [deals, setDeals] = useState<DealRow[] | null>(null);
  const [dealsLoadError, setDealsLoadError] = useState<string | null>(null);
  const openGmailCompose = useOpenGmailComposeWindow();
  // The project the person is working in, so the sent message is ASSOCIATED with
  // it. Until F-20 no opener passed one, so the project edge `associations.ts`
  // writes was unreachable from every surface (VERIFY-B1-B2-R2 A5/D7). The
  // compose panel names the project before the send — never a silent link.
  const activeProjectId = useAppSelector(selectActiveProjectId);

  const party = detail?.party ?? null;
  const isPerson = party?.party_kind === "person";
  const headingName = party?.display_name ?? initialHeading?.name ?? null;
  const headingIsPerson = party
    ? isPerson
    : initialHeading?.kind === "person";

  // HONEST EMAIL ACTION. A record with a usable address offers "Send email";
  // one whose addresses are all blocked says so; one with no address at all
  // offers the step that comes first — "Add email", which opens Contact points
  // on the email channel.
  const emailPoints = (detail?.contactPoints ?? []).filter(
    (point) => point.medium.channel === "email",
  );
  const usableEmail =
    party != null &&
    emailPoints.some((point) => contactPointBlockReason(party, point) === null);
  const emailAction: "send" | "blocked" | "add" = usableEmail
    ? "send"
    : emailPoints.length > 0
      ? "blocked"
      : "add";
  const [addEmailRequest, setAddEmailRequest] = useState(0);
  const requestAddEmail = () => setAddEmailRequest((n) => n + 1);

  // The tab leads with the record's name as soon as it loads — the server
  // title is a bounded best effort and may fall back to "CRM record".
  useEffect(() => {
    if (party?.display_name) document.title = party.display_name;
  }, [party?.display_name]);

  const openCompose = () => {
    if (!party) return;
    openGmailCompose({
      partyId: party.id,
      organizationId: party.organization_id,
      partyLabel: party.display_name,
      projectId: activeProjectId ?? null,
      onSent: () => {
        void refresh();
      },
    });
  };

  const copyLink = async () => {
    if (!party) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/crm/${party.id}`,
      );
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy the link — your browser blocked the clipboard.");
    }
  };

  const jumpToActivity = () => {
    const activity = document.getElementById("crm-record-activity");
    activity?.scrollIntoView({ block: "start", behavior: "smooth" });
    activity?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
  };

  const onDelete = async () => {
    if (!party) return;
    const ok = await confirm({
      title: `Move ${party.display_name} to trash?`,
      description:
        "The record moves to trash and can be restored from there. Its contact history, notes and deals are kept.",
      confirmLabel: "Move to trash",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteParty(party.id);
      toast.success(`${party.display_name} moved to trash`);
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
      contactCandidates,
      contactCandidatesLoadError,
      deals,
      dealsLoadError,
      lifecycleStageOptions: lifecycleStages.map((c) => ({ id: c.id, name: c.name })),
      ratingOptions: ratings.map((c) => ({ id: c.id, name: c.name })),
      roleOptions: partyRoles.map((c) => ({ id: c.id, name: c.name })),
      // What the Tasks / Files tiles count: resources filed INTO this record.
      // Tasks: the registered edge is party → task (outgoing from here).
      attachedTaskIds: partyEdges
        .filter((edge) => edge.direction === "outgoing" && edge.otherType === "task")
        .map((edge) => edge.otherId),
      attachedFileIds: partyEdges
        .filter((edge) => edge.direction === "incoming" && edge.otherType === "file")
        .map((edge) => edge.otherId),
    });

  // The agent twin of the Tasks tile's "+": the same createTask every task
  // surface uses, in THIS record's organization, then attached to the record
  // through the one association write the tile itself uses.
  useSurfaceWriteHandlers(CRM_RECORD_SURFACE_NAME, {
    // The agent twin of "Move to trash…". The approval card IS the confirm;
    // the record is soft-deleted (restorable from Trash), exactly like the
    // header action.
    move_to_trash: {
      validate: (raw: unknown) => {
        if (raw !== true) throw new Error("move_to_trash expects true.");
      },
      apply: async () => {
        if (!party) throw new Error("The record has not loaded yet.");
        await deleteParty(party.id);
        toast.success(`${party.display_name} moved to trash`);
        router.push("/crm");
        return { summary: `Moved ${party.display_name} to trash (restorable from Trash).` };
      },
    },
    // The agent twin of the Files tile's "+": files a file the person can see
    // INTO this record (file -> party, the registered direction).
    attach_file: {
      validate: (raw: unknown) => {
        if (!isUuidShape(raw)) {
          throw new Error("attach_file expects the file's id (a UUID).");
        }
      },
      apply: async (raw: unknown) => {
        if (!party || typeof raw !== "string") {
          throw new Error("The record has not loaded yet.");
        }
        const linked = await getAssociationsStore().add({
          sourceType: "file",
          sourceId: raw,
          targetType: "party",
          targetId: party.id,
          orgId: party.organization_id,
        });
        if (!linked.ok) {
          throw new Error(
            `The file could not be attached to ${party.display_name}: ${linked.error ?? "unknown error"}.`,
          );
        }
        return { summary: `Attached the file to ${party.display_name}.`, data: { file_id: raw } };
      },
    },
    create_task: {
      // Refused before the approval card when the value is malformed.
      validate: (raw: unknown) => {
        parseTaskDraft(raw);
      },
      apply: async (raw: unknown) => {
      if (!party) throw new Error("The record has not loaded yet.");
      const input = parseTaskDraft(raw);
      const task = await createTask({
        title: input.title,
        description: input.description ?? null,
        due_date: input.dueDate ?? null,
        organization_id: party.organization_id,
        origin: "agent",
        source_type: "party",
        source_id: party.id,
        source_label: party.display_name,
      });
      if (!task) throw new Error("The task could not be created.");
      // The registered edge is party → task (platform.association_types:
      // "Party attached to a task", the TASK is the container). The reverse
      // is refused by the database. The shared Tasks tile counts only
      // task → party, so it does not show these — reported as a shared defect.
      const linked = await getAssociationsStore().add({
        sourceType: "party",
        sourceId: party.id,
        targetType: "task",
        targetId: task.id,
        orgId: party.organization_id,
      });
      if (!linked.ok) {
        throw new Error(
          `Task "${task.title}" was created but could not be attached to ${party.display_name}: ${linked.error ?? "unknown error"}.`,
        );
      }
      return {
        summary: `Created task "${task.title}" and attached it to ${party.display_name}.`,
        data: { id: task.id, title: task.title },
      };
      },
    },
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
            {headingName && (
              <span className="ml-1 flex min-w-0 items-center gap-1.5">
                {headingIsPerson ? (
                  <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 truncate text-sm font-medium text-foreground">
                  {headingName}
                </span>
              </span>
            )}
          </>
        }
        right={
          party ? (
            isMobile ? (
              // PHONE: plain named actions, no menu of our own — RouteHeader
              // lists each one as a row under "This page" in the shell's ⋮
              // sheet (one tap, never a dropdown inside a sheet).
              <>
                {emailAction === "send" && (
                  <Button variant="ghost" size="sm" onClick={openCompose}>
                    <Send className="mr-1 h-3.5 w-3.5" />
                    Send email
                  </Button>
                )}
                {emailAction === "add" && (
                  <Button variant="ghost" size="sm" onClick={requestAddEmail}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add email
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => void copyLink()}>
                  <Link2 className="mr-1 h-3.5 w-3.5" />
                  Copy link
                </Button>
                <Button variant="ghost" size="sm" onClick={jumpToActivity}>
                  <History className="mr-1 h-3.5 w-3.5" />
                  Log an activity
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => void onDelete()}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Move to trash…
                </Button>
              </>
            ) : (
              // DESKTOP: the primary action first, then the record's one "…"
              // menu (secondary actions, destructive set apart). The email
              // action is icon-only below lg so the title keeps the row, which
              // leaves nothing for RouteHeader to fold — so there is never a
              // second "…" beside ours.
              <>
                {/* 🚨 EMAILING A PERSON IS A FIRST-CLASS ACTION ON THE RECORD
                    (VERIFY-B1-B2 A1): it opens the compose window over the
                    record, which stays readable behind it. */}
                {emailAction === "send" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={openCompose}
                    aria-label="Send email"
                    title="Send email"
                    className="h-7 px-2 text-xs"
                  >
                    <Send className="h-3.5 w-3.5 lg:mr-1" />
                    <span className="max-lg:sr-only">Send email</span>
                  </Button>
                )}
                {emailAction === "add" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={requestAddEmail}
                    aria-label="Add email"
                    title="Add email"
                    className="h-7 px-2 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5 lg:mr-1" />
                    <span className="max-lg:sr-only">Add email</span>
                  </Button>
                )}
                {emailAction === "blocked" && (
                  // Not a disabled-looking button: the sentence IS the state,
                  // and the Contact points card names each block.
                  <span
                    className="inline-flex items-center gap-1 px-2 text-xs text-muted-foreground"
                    title="Email blocked for this record"
                  >
                    <MailX className="h-3.5 w-3.5" />
                    <span className="max-lg:sr-only">Email blocked for this record</span>
                  </span>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <MoreHorizontalTapButton ariaLabel="More actions" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => void copyLink()}>
                      <Link2 className="mr-2 h-3.5 w-3.5" />
                      Copy link
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={jumpToActivity}>
                      <History className="mr-2 h-3.5 w-3.5" />
                      Log an activity
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => void onDelete()}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Move to trash…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )
          ) : initialHeading ? (
            // BEFORE THE RECORD LOADS (server HTML included): the phone row's
            // primary — "Log an activity", the one the phone set keeps in the
            // row — is drawn from the server-read heading, so the title never
            // re-truncates when the record lands. Desktop draws nothing here
            // (its actions arrive with the record, right of a title that
            // already has its room).
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={jumpToActivity}
            >
              <History className="mr-1 h-3.5 w-3.5" />
              Log an activity
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
            <span>This record couldn&apos;t be refreshed just now. <ErrorAlchemyMenu /></span>
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
                "matrx-touch-targets grid items-start gap-3",
                "lg:grid-cols-[minmax(280px,26rem)_1fr]",
              )}
            >
              {/* TWO COLUMNS ON A DESKTOP, ONE STACK ON A PHONE — AND THE STACK
                  IS ORDERED BY WHAT A PERSON DOES FIRST. Below lg the two column
                  wrappers are `display: contents`, so every card is a direct
                  item of this grid and `max-lg:order-*` orders the phone stack:
                  identity, contact points, then the actions (activity, notes),
                  then the rest of the record's data. `empty:hidden` drops the
                  wrapper of a card that renders nothing, so no gap is left. */}
              {/* Identity rail */}
              <div className="max-lg:contents lg:space-y-3">
                <div className="empty:hidden max-lg:order-1">
                  {/* Dedup status: merged-into banner, duplicate suggestions,
                      absorbed merges — renders nothing when clean. */}
                  <MergeStatusCard party={party} onChanged={refresh} />
                </div>
                <div className="max-lg:order-2">
                  <PartyIdentityCard party={party} onChanged={refresh} />
                </div>
                <div className="empty:hidden max-lg:order-3">
                  {/* Renders nothing unless this person is (or was proposed
                      as) an expert — see ExpertStatusCard. */}
                  <ExpertStatusCard party={party} onChanged={refresh} />
                </div>
                <div className="max-lg:order-4">
                  <ContactPointsCard
                    addEmailRequest={addEmailRequest}
                    partyId={party.id}
                    partyLabel={party.display_name}
                    orgId={party.organization_id}
                    points={detail.contactPoints}
                    onChanged={refresh}
                  />
                </div>
                <div className="max-lg:order-8">
                  <AddressesCard
                    partyId={party.id}
                    partyLabel={party.display_name}
                    orgId={party.organization_id}
                    addresses={detail.addresses}
                    onChanged={refresh}
                  />
                </div>
                {/* SPEC-UI-IA §6 — a CRM record and an employee record must
                    never look like two unrelated search results for the same
                    person. Renders NOTHING when this party is not an employee
                    here, or when HR is off for this org. */}
                {isPerson && (
                  <div className="empty:hidden max-lg:order-9">
                    <PartyEmployeeCard
                      partyId={party.id}
                      orgId={party.organization_id}
                    />
                  </div>
                )}
                <div className="max-lg:order-10">
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
                {/* Files and Tasks sit in the rail, where their tiles use the
                    full width. */}
                <div className="max-lg:order-18">
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

              {/* Activity main */}
              <div className="min-w-0 max-lg:contents lg:space-y-3">
                <div className="empty:hidden max-lg:order-5">
                  {/* "Why is this org in my CRM?" — the G1 provenance edge,
                      rendered as real doors, with "Add to my contacts".
                      Renders nothing for a record the user typed in. */}
                  <PartyProvenanceCard party={party} onChanged={refresh} />
                </div>
                <div className="empty:hidden max-lg:order-14">
                  {/* REC-34 / SCR-12 — the organization's OWN fields on this
                      standard entity. Absent until this org declares one. */}
                  <EntityCustomFields
                    entityToken="party"
                    recordId={party.id}
                    organizationId={party.organization_id}
                  />
                </div>
                {!isPerson && party.primary_domain && (
                  <div className="empty:hidden max-lg:order-13">
                    <OutreachContactCandidatesCard outletPartyId={party.id} />
                  </div>
                )}
                <div className="max-lg:order-12">
                  {/* The persisted candidate queue (IC-3): every producer
                      writes ONE ranked list, and none of it is contactable
                      until somebody confirms a row here. */}
                  <ContactCandidatesCard
                    partyId={party.id}
                    onChanged={refresh}
                    onStateChange={(rows, loadError) => {
                      setContactCandidates(rows);
                      setContactCandidatesLoadError(loadError);
                    }}
                  />
                </div>
                {isPerson && (
                  <div className="empty:hidden max-lg:order-15">
                    {/* Only for people: "is this journalist still there, and
                        what do they cover?" */}
                    <JournalistIntelligenceCard
                      partyId={party.id}
                      storedActivity={storedJournalistActivity(party)}
                    />
                  </div>
                )}
                <div className="max-lg:order-11">
                  {/* Deals with this person/company — the door goes both ways
                      (a deal names its party; the party names its deals). */}
                  <PartyDealsCard
                    party={party}
                    onStateChange={(rows, loadError) => {
                      setDeals(rows);
                      setDealsLoadError(loadError);
                    }}
                  />
                </div>
                <div className="empty:hidden max-lg:order-16">
                  {/* "Outputs about this customer" (DD-131 slice 3). Absent
                      until something was produced about them. */}
                  <PartyOutputsSection
                    partyId={party.id}
                    partyName={party.display_name}
                  />
                </div>
                <div className="empty:hidden max-lg:order-17">
                  {/* "Upcoming with this person" (PLAN §4.6). Renders NOTHING
                      when the record has no email address. */}
                  <PersonUpcomingCard
                    partyId={party.id}
                    partyName={party.display_name}
                  />
                </div>
                <div id="crm-record-activity" className="scroll-mt-16 max-lg:order-6">
                  <InteractionTimeline
                    partyId={party.id}
                    orgId={party.organization_id}
                    interactions={detail.interactions}
                    onChanged={refresh}
                    getApplicationScope={getScope}
                    writeSurfaceName={CRM_RECORD_SURFACE_NAME}
                    copyParent={copyParent}
                    partyLabel={party.display_name}
                    showSendEmail={false}
                    offerNoteChannel={false}
                  />
                </div>
                <div className="max-lg:order-7">
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
                </div>
              </div>
            </div>
          </NonEditableContextMenu>
        )}
      </div>
    </SurfaceRuntimeProvider>
  );
}

