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
// 🚨 LANE 7 W5 — ONE WAY ONLY: the section asks the store for the row's organization
// (`custom.entity_record_home(token, id)`, SECURITY INVOKER, so the table's own row rules
// decide), never takes it as a prop. Windows, peeks and the generic Detail host hold only
// (token, id), so a prop would have meant a second way in. A record that cannot show custom
// fields (no organization column, a personal row, a row she cannot read) says the store's
// sentence in one line — never silently absent. Every state carries
// `data-section="custom-fields"` + `data-state`, which G1's live check reads
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
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";
import { mayReadAsMember } from "@/features/organizations/organizationsIAmIn";
import {
  CUSTOM_FIELDS_VALUE_NAME,
  customFieldsScopeValue,
  registerCustomFieldsDoor,
} from "@ai-matrx/chat/surfaces/runtime/custom-field-targets";
import {
  useSurfaceDormant,
  useSurfaceRuntime,
  useSurfaceScopeContribution,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
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
  /** The heading. Defaults to the section's own. */
  title?: string;
  className?: string;
}

type RecordHome =
  | { state: "loading" }
  | { state: "home"; organizationId: string }
  | { state: "refused"; sentence: string; reason: string | null }
  | { state: "error" };

interface RecordHomeAnswer {
  organization_id?: string;
  refused?: string;
  reason?: string;
}

interface RecordHomeCaller {
  schema(name: "custom"): {
    rpc(
      fn: "entity_record_home",
      args: { p_token: string; p_record_id: string },
    ): PromiseLike<{ data: RecordHomeAnswer | null; error: { message: string } | null }>;
  };
}

/** The row's organization, asked as the person. Never the active organization. */
function useRecordHome(token: string, recordId: string): { home: RecordHome; retry: () => void } {
  const [home, setHome] = useState<RecordHome>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setHome({ state: "loading" });
    const client = createClient() as unknown as RecordHomeCaller;
    void Promise.resolve(
      client.schema("custom").rpc("entity_record_home", { p_token: token, p_record_id: recordId }),
    ).then(
      ({ data, error }) => {
        if (!live) return;
        if (error || !data) {
          console.error("[EntityCustomFields] custom.entity_record_home failed", { token, recordId, error });
          setHome({ state: "error" });
        } else if (data.organization_id) setHome({ state: "home", organizationId: data.organization_id });
        else
          setHome({
            state: "refused",
            sentence: data.refused ?? "This record takes no custom fields.",
            reason: data.reason ?? null,
          });
      },
      (error: unknown) => {
        if (!live) return;
        console.error("[EntityCustomFields] custom.entity_record_home threw", { token, recordId, error });
        setHome({ state: "error" });
      },
    );
    return () => {
      live = false;
    };
  }, [token, recordId, attempt]);
  return { home, retry: () => setAttempt((n) => n + 1) };
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
}: EntityCustomFieldsProps) {
  const { home, retry: retryHome } = useRecordHome(entityToken, recordId);
  // T1.2 (Doctrine R8): a person who may not change this table makes her own, in the ONE New table
  // dialog both data homes open (features/make/MakeMount.tsx), right here on the record page.
  const [makingTable, setMakingTable] = useState(false);
  // THE WORD THIS APP ALREADY USES FOR THE TOKEN ("People & Companies", "Deals"): the entity
  // registry's plural label, read once here for every page — never a per-page prop. The store's
  // own label is the registry row's (`Party`), a machine word on screen.
  const entityLabel = tryGetEntityInfo(entityToken)?.labelPlural || undefined;
  const userId = useAppSelector(selectUserId);
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
  const declares = Boolean(
    runtime && getManifest(runtime.surfaceName)?.values?.some((v) => v.name === CUSTOM_FIELDS_VALUE_NAME),
  );
  useSurfaceScopeContribution(declares ? runtime!.surfaceName : null, "custom-fields-section", () => ({
    [CUSTOM_FIELDS_VALUE_NAME]: customFieldsScopeValue(),
  }));
  const organizationId = home.state === "home" ? home.organizationId : null;
  // Whether she is a member of the ROW's organization: `null` until asked.
  const [member, setMember] = useState<boolean | null>(null);
  // ONE switch: does this organization keep its data in the record store? Set
  // once, for everybody, on the unified data ramp screen (lane NAV-FIX).
  const campaign = useUnifiedDataCampaign({
    organizationId,
    // Member-only door: a record shared from an organization she is not in is
    // not asked about (it was a 403 on every load), and that answer is kept apart
    // from "switched off" so the section never claims a switch nobody read.
    storeSwitch: async (organization) => {
      const isMember = organization ? await mayReadAsMember(organization) : true;
      setMember(isMember);
      // `check`, never `enabled`: `enabled` folds "could not read" into "off", and this section
      // says those two differently.
      return isMember ? UNIFIED_DATA_CAMPAIGN.check(organization) : false;
    },
  });
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
  // 🚨 ITEM 13 (lane 7 STANDARD-TABLES): the section never silently vanishes because the
  // organization's store switch is off or could not be read — it says which, in one line.
  // (Retiring the switch itself is lane 6's.)
  if (campaign.state === "off" || campaign.state === "unavailable") {
    return (
      <SectionLine state={campaign.state} title={title} className={className}>
        <span className="text-muted-foreground">
          {campaign.state === "off" ? "Off for this organization" : "Couldn't check this organization"}
        </span>
        {campaign.state === "unavailable" ? (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={campaign.retry}>
            Retry
          </Button>
        ) : null}
      </SectionLine>
    );
  }
  if (!campaign.on) return null;
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
        onMakeOwnTable={() => setMakingTable(true)}
        agentDoor={(door) => registerCustomFieldsDoor({ ...door, isLive: () => liveRef.current })}
      />
      </div>
      <NewTableDialog what={makingTable ? "create" : null} onClose={() => setMakingTable(false)} />
    </RecordsMount>
  );
}
