"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
// features/unified-data/components/EntityCustomFields.tsx
//
// THE ONE LINE A STANDARD ENTITY PAGE ADDS (SCR-12 / REC-40 / REC-34).
//
//   <EntityCustomFields entityToken="crm_deal" recordId={deal.id} />
//
// 🚨 THE ORGANIZATION IS THE ROW'S, NEVER THE PERSON'S (lane ACCESS-IS-PERSONAL, owner's law
// 2026-09-23: "for any RECORD I try to see, the active org is meaningless"). This read the
// organization the person was working in, so a deal of Rincon opened from another of her
// organizations showed that OTHER organization's custom fields — or none.
//
// 🚨 LANE 7 W5 — THE ROW'S ORGANIZATION, FROM THE STORE FIRST. The section asks the store
// (`custom.entity_record_home(token, id)`, SECURITY INVOKER, so the table's own row rules decide).
// A page that holds the row MAY pass `organizationId` (the row's, never the active organization):
// it is used ONLY while that door is not on the database (the chair's apply), announced once. A
// surface with neither (Detail window, /detail, a peek) shows no section until the door lands. The
// section's own first read is asked before it mounts, so a store refusal is never printed raw.
// A record that cannot show fields once the door exists says why in one line. Every shown state
// carries `data-section="custom-fields"` + `data-state`, which G1's live check reads
// (features/unified-data/every-record-view-has-custom-fields.test.ts).
//
// That is the whole contract, and it is the same line on all 643 tables the
// registry types Entity or Detail. There is no per-entity code here, on the
// page, or in `@ai-matrx/records-ui`: which fields extend `crm_deal`, what they
// hold, who may add one, and "render nothing when this organization has added
// none" are all the store's answers, asked through the token.
//
// WHY THIS WRAPPER EXISTS AT ALL, AND WHEN IT GOES AWAY. The packages plan
// allows exactly ONE line per standard entity page, and a page that had to mount
// the provider pair itself would be twenty. So the provider pair and the
// organization's own store switch live here, once, and every page adds the one
// line. When the campaign is on platform-wide this file collapses to a re-export
// of `<CustomFieldsSection />`.
//
// It was extracted from `PartyRecordPage`'s private `PartyUnifiedCustomFields`,
// which was the same twenty lines: the second page to want them would have
// copied them, and the third would have copied them differently.

import { CustomFieldsSection, RecordsMount, personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { Button } from "@/components/ui/button";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { NewTableDialog } from "@/features/make/MakeMount";
import { entityRecordHome } from "@/features/unified-data/hub/doors";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { chooseActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { useStoreRead } from "@/lib/redux/store-reads/useStoreRead";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import { mayReadAsMember } from "@/features/organizations/organizationsIAmIn";
import {
  CUSTOM_FIELDS_VALUE_NAME,
  customFieldsScopeValue,
  providerOwnsCustomFields,
  registerCustomFieldsDoor,
} from "@ai-matrx/chat/surfaces/runtime/custom-field-targets";
import {
  useSurfaceDormant,
  useSurfaceRuntime,
  useSurfaceScopeContribution,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import {
  readRecordReadable,
  recordReadableKey,
  type RecordReadableAnswer,
} from "@/features/unified-data/customFieldsRead";
import { getManifest } from "@/features/surfaces/manifests/registry";

export interface EntityCustomFieldsProps {
  /** The standard table's registry token (REC-33) — `party`, `crm_deal`, `crm_interaction`. */
  entityToken: string;
  /** The id of the row this page is showing. */
  recordId: string;
  /**
   * A host that renders this for EVERY record type (the Detail host port) sets this: a token whose
   * table takes no custom fields at all (Reference, Ledger, …) shows no section, as the Detail body
   * shows no section that does not apply. A standard record that cannot show fields still says why.
   */
  absentWhenNotApplicable?: boolean;
  /**
   * The row's organization as the PAGE already holds it (`row.organization_id`). Used ONLY while the
   * store door `custom.entity_record_home` is not on the database (it ships with the chair's apply):
   * the section falls back to it and says so once in the console. With neither, the section says it
   * could not read the record. Never the active organization.
   */
  organizationId?: string | null;
  /** The heading. Defaults to the section's own. */
  title?: string;
  className?: string;
}

type RecordHome =
  | { state: "loading" }
  | { state: "home"; organizationId: string }
  | { state: "refused"; sentence: string; reason: string | null }
  | { state: "error" }
  | { state: "absent" };

/** What the home door answered, as kept in the store (plain JSON). A failed read is never kept. */
type HomeAnswer =
  | { kind: "home"; organizationId: string }
  | { kind: "door-absent" }
  | { kind: "refused"; sentence: string; reason: string | null };

/** PostgREST (PGRST202) / Postgres (42883) say the FUNCTION is not on this database — nothing else. */
function doorIsAbsent(error: { message: string; sqlstate?: string | undefined }): boolean {
  return error.sqlstate === "PGRST202" || error.sqlstate === "42883";
}
let announcedFallback = false;
let announcedAbsent = false;

/** Said once per tab: the home door is not on this database yet (and what the section does instead). */
function announceDoorAbsent(withPageOrganization: boolean): void {
  if (withPageOrganization ? announcedFallback : announcedAbsent) return;
  if (withPageOrganization) announcedFallback = true;
  else announcedAbsent = true;
  console.warn(
    withPageOrganization
      ? "[EntityCustomFields] custom.entity_record_home is not on this database yet (lane7w5 SQL, chair's apply); using the organization the page holds for the record."
      : "[EntityCustomFields] custom.entity_record_home is not on this database yet (lane7w5 SQL, chair's apply); surfaces without a page organization show no custom-fields section until it is.",
  );
}

type Readable = "checking" | "ok" | "absent" | "error";

/**
 * 🚨 READ ONCE PER RECORD PER TAB (the remount law, 2026-10-03). Both of the section's own reads —
 * the row's organization and whether the row reads — are kept in the store by record
 * (`useStoreRead`): a board tile that sleeps and wakes, a Remove + Undo, or a second view of the
 * same record renders the kept answer and reads nothing. A failed read is never kept.
 * The readable read is shared with a surface provider that owns `custom_fields`
 * (`features/unified-data/customFieldsRead.ts`): same key, one request.
 */
export const recordHomeKey = (token: string, recordId: string) => `unified-data.record-home:${token}:${recordId}`;
export { recordReadableKey };

function useRecordReadable(token: string, recordId: string, organizationId: string | null) {
  const read = useStoreRead<RecordReadableAnswer>(
    organizationId ? recordReadableKey(organizationId, token, recordId) : null,
    () => readRecordReadable(organizationId!, token, recordId),
  );
  const readable: Readable = !organizationId
    ? "checking"
    : read.status === "error"
      ? "error"
      : read.hasData && read.data
        ? read.data.state === "ok"
          ? "ok"
          : "absent"
        : "checking";
  return { readable, retry: () => void read.refresh() };
}

function useRecordHome(
  token: string,
  recordId: string,
  pageOrganizationId: string | null,
): { home: RecordHome; retry: () => void } {
  const read = useStoreRead<HomeAnswer>(recordHomeKey(token, recordId), async () => {
    let answer: Awaited<ReturnType<typeof entityRecordHome>>;
    try {
      answer = await entityRecordHome(recordsDataSource(createClient()), token, recordId);
    } catch (error) {
      console.error("[EntityCustomFields] custom.entity_record_home threw", { token, recordId, error });
      throw error;
    }
    if (!answer.ok) {
      if (doorIsAbsent(answer.error)) return { kind: "door-absent" };
      console.error("[EntityCustomFields] custom.entity_record_home failed", { token, recordId, error: answer.error });
      throw new Error(answer.error.message);
    }
    if (answer.data.organization_id) return { kind: "home", organizationId: answer.data.organization_id };
    return {
      kind: "refused",
      sentence: answer.data.refused ?? "This record takes no custom fields.",
      reason: answer.data.reason ?? null,
    };
  });
  const retry = () => void read.refresh();
  if (read.status === "error" && !read.hasData) return { home: { state: "error" }, retry };
  const answer = read.hasData ? read.data : undefined;
  if (!answer) return { home: read.status === "error" ? { state: "error" } : { state: "loading" }, retry };
  if (answer.kind === "home") return { home: { state: "home", organizationId: answer.organizationId }, retry };
  if (answer.kind === "refused") return { home: { state: "refused", sentence: answer.sentence, reason: answer.reason }, retry };
  if (pageOrganizationId) {
    announceDoorAbsent(true);
    return { home: { state: "home", organizationId: pageOrganizationId }, retry };
  }
  // No door yet and no page organization (Detail window, /detail, a peek): these surfaces never had
  // a section before this door, so the section is ABSENT — never a box blaming the person's record
  // for a door we have not applied.
  announceDoorAbsent(false);
  return { home: { state: "absent" }, retry };
}

/** One line in the section's place: the heading and why nothing more shows. */
function SectionLine({
  state,
  title,
  className,
  children,
}: {
  state: string;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("flex min-w-0 items-center gap-2 text-xs", className)}
      data-section="custom-fields"
      data-state={state}
      data-entity-custom-fields={state}
    >
      <h3 className="shrink-0 text-sm font-medium">{title ?? "Custom fields"}</h3>
      {children}
    </section>
  );
}

export function EntityCustomFields({
  entityToken,
  recordId,
  title,
  className,
  absentWhenNotApplicable,
  organizationId: pageOrganizationId,
}: EntityCustomFieldsProps) {
  const { home, retry: retryHome } = useRecordHome(entityToken, recordId, pageOrganizationId ?? null);
  // T1.2 (Doctrine R8): a person who may not change this table makes her own, in the ONE New table
  // dialog both data homes open (features/make/MakeMount.tsx), right here on the record page.
  const [makingTable, setMakingTable] = useState(false);
  // THE WORD THIS APP ALREADY USES FOR THE TOKEN ("People & Companies", "Deals"): the entity
  // registry's plural label, read once here for every page — never a per-page prop. The store's
  // own label is the registry row's (`Party`), a machine word on screen.
  const entityLabel = tryGetEntityInfo(entityToken)?.labelPlural || undefined;
  const userId = useAppSelector(selectUserId);
  // org-filter: write-target "Make your own table" saves the new table in the RECORD's organization
  const activeOrganizationId = useAppSelector(selectOrganizationId);
  const dispatch = useAppDispatch();
  // Her organizations as the shell already holds them (no request of its own on every record page).
  const { organizations: myOrganizations } = useScopeTree();
  // A dormant copy (a board tile that is not live) keeps its door registered
  // but out of the page's agent offer.
  const dormant = useSurfaceDormant();
  const liveRef = useRef(!dormant);
  // Registration is consumed during the same render transition; an effect is
  // one paint late and briefly offers a dormant field door as live.
  // eslint-disable-next-line react-hooks/refs
  liveRef.current = !dormant;
  // WHAT THE AGENT SEES: the fields and this record's values, contributed as the
  // `custom_fields` value of the surface this page is on — when that surface
  // declares it (`pickBaseline("custom_fields")`); a surface that does not keeps
  // the targets but no value (an undeclared value is a contract error).
  const runtime = useSurfaceRuntime();
  // ONE OWNER PER VALUE: a surface whose provider answers `custom_fields` itself (notes) is
  // never also contributed to — the registry refuses a contribution that replaces a provider value.
  const declares = Boolean(
    runtime &&
      !providerOwnsCustomFields(runtime.surfaceName) &&
      getManifest(runtime.surfaceName)?.values?.some((v) => v.name === CUSTOM_FIELDS_VALUE_NAME),
  );
  useSurfaceScopeContribution(declares ? runtime!.surfaceName : null, "custom-fields-section", () => ({
    [CUSTOM_FIELDS_VALUE_NAME]: customFieldsScopeValue(),
  }));
  const organizationId = home.state === "home" ? home.organizationId : null;
  const { readable, retry: retryRead } = useRecordReadable(entityToken, recordId, organizationId);
  // Whether she is a member of the ROW's organization: `null` until asked. A record shared from
  // an organization she is not in shows that organization's fields as not hers (no store switch
  // is asked any more — the record store is never off, CHAIR-ALWAYS-ON 2026-10-03).
  const [membership, setMembership] = useState<{ organizationId: string; isMember: boolean } | null>(null);
  useEffect(() => {
    if (!organizationId) return undefined;
    let live = true;
    void mayReadAsMember(organizationId).then((isMember) => {
      if (live) setMembership({ organizationId, isMember });
    });
    return () => {
      live = false;
    };
  }, [organizationId]);
  const member = membership && membership.organizationId === organizationId ? membership.isMember : null;
  if (home.state === "absent") return null;
  if (home.state === "refused" && absentWhenNotApplicable && home.reason === "no_table") return null;
  if (home.state === "refused") {
    return (
      <SectionLine state="refused" title={title} className={className}>
        <span className="min-w-0 truncate text-muted-foreground" title={home.sentence}>
          {home.sentence}
        </span>
      </SectionLine>
    );
  }
  if (home.state === "error") {
    return (
      <SectionLine state="error" title={title} className={className}>
        <span className="text-muted-foreground">Couldn&apos;t read this record</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={retryHome}>
          Retry
        </Button>
      </SectionLine>
    );
  }
  if (!organizationId) return null;
  // A record shared from an organization she is not in: its fields are that organization's.
  if (member === false) {
    return (
      <SectionLine state="not-member" title={title} className={className}>
        <span className="text-muted-foreground">Shared from an organization you&apos;re not in</span>
      </SectionLine>
    );
  }
  if (member === null) return null;
  if (readable === "absent" || readable === "checking") return null;
  if (readable === "error") {
    return (
      <SectionLine state="error" title={title} className={className}>
        <span className="text-muted-foreground">Couldn&apos;t read this record</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={retryRead}>
          Retry
        </Button>
      </SectionLine>
    );
  }
  return (
    <RecordsMount
      letTheStoreDecideRights
      config={{ dataSource: recordsDataSource(createClient()), actor: personActor(userId), organizationId }}
    >
      {/* THE AGENT TWIN OF "ADD FIELD": the section hands its door to the
          platform write target \`custom_fields_add\`, so every page that embeds
          this line offers it to its agents (surfaces/runtime/custom-field-targets.ts). */}
      <div data-section="custom-fields" data-state="ready" className="min-w-0">
      <CustomFieldsSection
        entityToken={entityToken}
        recordId={recordId}
        title={title}
        className={className}
        entityLabel={entityLabel}
        onMakeOwnTable={() => {
          // T1.2: her own table starts in the organization this record belongs to — the place new
          // things are saved is set to it (the dialog shows it and she can change it), never asked
          // again from a list of every organization she is in.
          const home = myOrganizations.find((org) => org.id === organizationId);
          if (home && activeOrganizationId !== organizationId) {
            void dispatch(chooseActiveOrganization({ id: home.id, name: home.name }));
          }
          setMakingTable(true);
        }}
        agentDoor={(door) => registerCustomFieldsDoor({ ...door, isLive: () => liveRef.current })}
      />
      </div>
      <NewTableDialog what={makingTable ? "create" : null} onClose={() => setMakingTable(false)} />
    </RecordsMount>
  );
}
