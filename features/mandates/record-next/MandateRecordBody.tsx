"use client";

// features/mandates/record-next/MandateRecordBody.tsx
//
// THE NEW MANDATE RECORD BODY — a copy of `OneMandateWorkspace`
// (features/mandates/workspace/MandateWorkspace.tsx, untouched) built beside it
// per common-docs/systems/intelligence/mandates/UI-REGISTER.md ("Duplicate before changing").
//
// What is the SAME: every tab body is the same imported component the old
// workspace mounts (TriadSections, OneBindingWorkspace, EffectiveConfigLayers,
// MandateLineageLine, MandateProvenancePanel, MandateNotesPanel, the old
// drawer's sections via RecordAdminPanels), with the same props.
//
// What CHANGED (register 6b), and only in the glue around those bodies:
//   · the HOST owns the tab (`activeTab` / `onTabChange`) — the page keeps it
//     in the URL, the window in its own state; there is no tab bar in here;
//   · no name heading and no "Open full page" line — the host shows the name
//     once, in its own header;
//   · the export menu is handed to the host (`renderChrome`) instead of
//     sitting in the tab row;
//   · "Scope: / Feature: / Enabled:" rows became one compact line; scope comes
//     from the mandate's HOME (a system job never reads "Personal"), and
//     Enabled is a switch for a super admin, a "Disabled" mark otherwise;
//   · "Holder" alone is never printed by this file ("Mandate Holder").
//   · the admin tab bodies render inside this body's own tabs (no graft).

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { TextWithDoors } from "@/components/official/entity-ref/TextWithDoors";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import styles from "@/features/mandates/workspace/MandateWorkspace.module.css";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { storedMandateKey } from "@/features/mandates/mandate-key";
import { mandateDisplayName } from "@/features/mandates/mandate-words";
import { featureLabelOf } from "@/features/mandates/admin-list/rows";
import { MandateNotesPanel } from "@/features/mandates/components/MandateNotesPanel";
import { MandateLineageLine } from "@/features/mandates/components/MandateLineageLine";
import {
  TriadGoalSection,
  TriadInputSection,
  TriadOutputSection,
} from "@/features/mandates/workspace/TriadSections";
import { useCopyMandateAgent } from "@/features/mandates/useCopyMandateAgent";
import {
  OneBindingWorkspace,
  type BindingWorkspaceSection,
} from "@/features/bindings/OneBindingWorkspace";
import {
  ConfigurationTable,
  ConfigurationTableRow,
  FieldHelp,
  StatusToken,
  PropertyRow,
} from "@/components/official/ConfigurationFields";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import { Section } from "@/features/mandates/workspace/Section";
import { EffectiveConfigLayers } from "@/features/mandates/components/EffectiveConfigLayers";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import type { SystemRungHealth } from "@/features/mandates/workspace/system-rung-health";
import { MandateCoverageAlert } from "@/features/mandates/workspace/MandateCoverageAlert";
import { MandateProvenancePanel } from "@/features/mandates/workspace/MandateProvenancePanel";
import {
  useMandateWorkspaceData,
  type MandateWorkspaceData,
  type WorkspaceAgentInfo,
} from "@/features/mandates/workspace/useMandateWorkspaceData";
import {
  loadFailedFailure,
  readMandateAddress,
} from "@/features/mandates/mandate-address";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { useMandate } from "@/features/mandates/useMandate";
import { MANDATE_WORKSPACE_SURFACE_NAME } from "@/features/surfaces/manifests/mandate-workspace.manifest";
import { normalizeTransferJson } from "@ai-matrx/alchemy/core";
import {
  useMandateAlchemyTabCapture,
  MandateAlchemy,
  MandateAlchemyCaptureProvider,
  buildMandateDefinitionCore,
  type MandateAlchemyCapture,
} from "@/features/mandates/workspace/MandateAlchemy";
import type { ResolvedMandate } from "@/features/mandates/service";
import { updateMandateDefinition } from "@/features/mandates/admin/service";
import {
  ladderRowChangesHolder,
  ladderRowIsBroken,
  ladderRowWords,
  useMandateLadder,
  type MandateLadderRow,
} from "@/features/mandates/workspace/useMandateLadder";
import {
  hasGlobalBinding,
  resolvedHolderForBannerOf,
  systemRungHealthOf,
  type WorkspacePerspective,
  type WorkspacePrincipal,
} from "@/features/mandates/workspace/MandateWorkspace";
import {
  MandateOverridesSimple,
  type ResolvedHolderForOverrides,
} from "@/features/mandates/overrides-simple/MandateOverridesSimple";
import type { MandateWorkspaceTab } from "@/features/mandates/workspace/MandateWorkspace";
import { RecordAdminPanels } from "./RecordAdminPanels";
import { MandateTryPanel } from "./MandateTryPanel";
import {
  OwnerDefinitionEditor,
  useDefinitionRights,
} from "./OwnerDefinitionEditor";
import { RequestAccess } from "@/features/access-gate/components/RequestAccess";
import {
  visibleRecordTabs,
  type RecordTab,
  type RecordTabId,
} from "./record-tabs";

/** Tabs `BindingSection` renders — one mounted draft owner across them. */
const BINDING_TABS: readonly string[] = [
  "holder",
  "create-agent",
  "overrides",
  "display",
  "permissions",
];

export interface MandateRecordChrome {
  /** The mandate's name as a person reads it. */
  name: string;
  /** The loaded record (for host actions such as promote/remove). */
  data: MandateWorkspaceData;
  /** The "copy / export this tab" menu — the host places it. */
  exportMenu: ReactNode;
  /** Re-read the record after a host action changed it. */
  refresh: () => void;
}

export interface MandateRecordBodyProps {
  /** Mandate key or row uuid — both open. */
  mandateKeyOrId: string;
  /**
   * `admin-route` = system perspective + authoring; `window` = the window
   * panel; `route` = a member page (/mandates/record-preview,
   * /organizations/<org>/mandates/<key>) whose perspective is the principal's.
   */
  host: "admin-route" | "window" | "route";
  activeTab: RecordTabId;
  onTabChange: (tab: RecordTabId) => void;
  /** Where the host puts the name, the export menu and its actions. */
  renderChrome?: (chrome: MandateRecordChrome) => ReactNode;
  /** Where "All mandates" goes when the address cannot be read. */
  listHref: string;
  principal?: WorkspacePrincipal;
  /**
   * The tab set the host shows (the export menu speaks the same set). Absent →
   * the admin tabs follow `showAdminPanels`.
   */
  tabs?: readonly RecordTab[];
  /**
   * Mount the admin tab bodies (Test, Usage, Health). Absent → the admin route,
   * or a super admin in the window. A member page passes `false`: its admin
   * tabs are absent whoever is looking.
   */
  showAdminPanels?: boolean;
  /**
   * A seat that may look but not change (an organization member who does not
   * manage it): no binding editor and no overrides are mounted at all.
   */
  readOnly?: boolean;
}

/** Keyed to the job, exactly like the original (R-O6). */
export function MandateRecordBody(props: MandateRecordBodyProps) {
  return (
    <MandateAlchemyCaptureProvider>
      <OneMandateRecordBody
        key={`${props.mandateKeyOrId}:${props.host}`}
        {...props}
      />
    </MandateAlchemyCaptureProvider>
  );
}

function OneMandateRecordBody({
  mandateKeyOrId,
  host,
  activeTab,
  onTabChange,
  renderChrome,
  listHref,
  principal = { kind: "user" },
  tabs,
  showAdminPanels,
  readOnly = false,
}: MandateRecordBodyProps) {
  useEffect(() => {
    const openHolder = () => onTabChange("holder");
    window.addEventListener("matrx:open-mandate-pin", openHolder);
    return () =>
      window.removeEventListener("matrx:open-mandate-pin", openHolder);
  }, [onTabChange]);
  const { data, loading, failure, refresh } =
    useMandateWorkspaceData(mandateKeyOrId);
  const { organizations } = useUserOrganizations();
  const activeOrganizationId = useAppSelector(selectOrganizationId);
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const nameOfOrg = useMemo(() => {
    const byId = new Map(organizations.map((o) => [o.id, o.name]));
    return (id: string) => byId.get(id) ?? null;
  }, [organizations]);

  const perspective: WorkspacePerspective =
    host === "admin-route"
      ? "system"
      : principal.kind === "org"
        ? "organization"
        : "person";
  const authoring = host === "admin-route";
  // Admin tab bodies: the admin route, or a super admin in the window (this
  // replaces the old window's separate "Admin" pane — no toggle).
  const showAdmin = showAdminPanels ?? (authoring || isSuperAdmin);

  const personalKey =
    perspective === "person" && data
      ? storedMandateKey(data.mandate.mandate_key)
      : "";
  const verdict = useMandate(personalKey);
  // THE OWNER'S RIGHTS (member seats only; the admin route already authors).
  // The server's answer decides every definition pencil on this page — a
  // soft mandate its creator / its organization's managers own is editable,
  // a code-backed or platform one is not, and a pencil that would 403 is
  // never shown.
  const rights = useDefinitionRights(
    !authoring && data && !readOnly ? data.mandate.mandate_key : null,
  );
  const ownerCanEdit = Boolean(rights?.can_edit);
  const ladderKey = data ? data.mandate.mandate_key : "";
  const ladder = useMandateLadder(
    ladderKey,
    principal.kind === "org"
      ? principal.orgId
      : perspective === "person"
        ? activeOrganizationId
        : null,
  );

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center py-16">
        <SuspenseLoader />
      </div>
    );
  }
  if (failure || !data) {
    const failed = failure ?? loadFailedFailure("Unknown error.");
    if (
      failed.kind === "no-such-mandate" &&
      readMandateAddress(mandateKeyOrId) === "id"
    ) {
      return (
        <AccessGate
          token="mandate"
          id={mandateKeyOrId.trim()}
          fallbackHref={listHref}
          fallbackLabel="All mandates"
        />
      );
    }
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
        <p
          className={
            failed.kind === "load-failed"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {/* A key nothing answers to is simply not found — never the dotted
              key read back at the person. */}
          {failed.kind === "load-failed" ? failed.message : "Mandate not found"}
        </p>
        {failed.retryable ? (
          <Button variant="outline" size="sm" onClick={refresh}>
            Retry
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href={listHref}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              All mandates
            </Link>
          </Button>
        )}
      </div>
    );
  }

  const resolution =
    perspective === "person"
      ? viewFromVerdict(
          data,
          verdict.mandate,
          verdict.loading,
          verdict.error,
          nameOfOrg,
        )
      : null;
  // The list's and dashboard's own feature words ("SEO", "Shortcuts").
  const feature = featureLabelOf(data.mandate.mandate_key, null);
  // The export menu speaks the workspace's tab ids; the simple Overrides tab
  // is this page's addition, so it exports as the Overrides tab it mirrors.
  const tabIds = (tabs ?? visibleRecordTabs(showAdmin))
    .map((tab) => tab.id)
    .filter((id): id is MandateWorkspaceTab => id !== "overrides-simple");
  const exportTab: MandateWorkspaceTab =
    activeTab === "overrides-simple" ? "overrides" : activeTab;
  const orgName =
    perspective === "organization" && principal.kind === "org"
      ? nameOfOrg(principal.orgId)
      : null;
  const exportMenu = (
    <MandateAlchemy
      data={data}
      activeTab={exportTab}
      tabs={tabIds}
      perspective={perspective}
      organizationName={orgName}
      buildTab={(tab): MandateAlchemyCapture =>
        tab === "definition"
          ? {
              status: "ready",
              savedOnly: true,
              data: {
                saved_definition: buildMandateDefinitionCore(
                  data,
                  perspective,
                  orgName,
                ),
                pins: normalizeTransferJson(data.pins),
                pinned_context: data.pinnedContext,
              },
            }
          : {
              status: "error",
              message: "This tab has not finished publishing its saved data.",
            }
      }
    />
  );

  return (
    <>
      {renderChrome?.({
        // The same name every mandate surface shows (label, else the key's
        // last segment in words) — the window, the list and the dashboard.
        name: mandateDisplayName(data.mandate.mandate_key, data.mandate.label),
        data,
        exportMenu,
        refresh,
      })}
      <MandateCoverageAlert
        className="mb-3"
        mandateKey={data.mandate.mandate_key}
        // A read-only seat gets the verdict without a button it cannot use.
        onAssignHolder={readOnly ? undefined : () => onTabChange("holder")}
        resolvedHolder={resolvedHolderForBannerOf(
          perspective,
          data,
          ladder,
          nameOfOrg,
          resolution,
        )}
      />
      <div
        role="tabpanel"
        id="mandate-panel-definition"
        hidden={activeTab !== "definition"}
        className={activeTab === "definition" ? "space-y-4" : "hidden"}
      >
        <MandateFactsLine
          data={data}
          feature={feature}
          homeName={nameOfOrg(data.mandate.organization_id)}
          canToggle={isSuperAdmin}
          onChanged={refresh}
        />
        <TriadGoalSection
          data={data}
          onChanged={refresh}
          authoring={authoring || ownerCanEdit}
        />
        <TriadInputSection
          data={data}
          onChanged={refresh}
          authoring={authoring || ownerCanEdit}
        />
        <TriadOutputSection data={data} authoring={authoring} />
        {ownerCanEdit ? (
          <OwnerDefinitionEditor data={data} onChanged={refresh} />
        ) : null}
        <div>
          <EffectiveConfigLayers
            pinsOnly
            pins={data.pins}
            bindingOverrides={null}
          />
          <MandateLineageLine
            mandateId={data.mandate.id}
            sourceMandateId={data.mandate.source_mandate_id ?? null}
            host={host}
          />
        </div>
        <MandateProvenancePanel mandateKey={data.mandate.mandate_key} />
      </div>
      {perspective !== "system" ? (
        <div
          hidden={activeTab !== "holder"}
          className={activeTab === "holder" ? "mb-3 space-y-3" : "hidden"}
        >
          {resolution ? <FulfillmentSection resolution={resolution} /> : null}
          <LadderSection
            ladder={
              principal.kind === "org"
                ? {
                    ...ladder,
                    rows: ladder.rows.filter((row) => row.rung !== "user"),
                  }
                : ladder
            }
            agentsById={data.agentsById}
            allowCopy={perspective === "organization"}
            nameOfOrg={nameOfOrg}
            activeOrganizationId={
              principal.kind === "org" ? principal.orgId : activeOrganizationId
            }
          />
        </div>
      ) : null}
      <div
        role="tabpanel"
        id={
          BINDING_TABS.includes(activeTab)
            ? `mandate-panel-${activeTab}`
            : undefined
        }
        hidden={!BINDING_TABS.includes(activeTab)}
        className={
          BINDING_TABS.includes(activeTab)
            ? cn(styles.mobileTouchTargets, "space-y-4")
            : "hidden"
        }
      >
        {readOnly ? (
          // A member who does not manage the organization cannot change its
          // binding: no controls, one way to ask the admins who can.
          principal.kind === "org" ? (
            <RequestAccess
              target={{
                action: "Change binding",
                resource: {
                  kind: "Mandate",
                  name: data.mandate.label?.trim() || data.mandate.mandate_key,
                  type: "mandate",
                  id: data.mandate.id,
                },
                owner: {
                  organizationId: principal.orgId,
                  organizationName: nameOfOrg(principal.orgId),
                },
                manageHref: `/organizations/${encodeURIComponent(principal.orgId)}/settings/mandates/${encodeURIComponent(data.mandate.mandate_key)}`,
              }}
            />
          ) : null
        ) : (
        <BindingSection
          data={data}
          principal={principal}
          perspective={perspective}
          authoring={authoring}
          activeSection={
            activeTab === "overrides" ||
            activeTab === "display" ||
            activeTab === "permissions" ||
            activeTab === "create-agent"
              ? activeTab
              : "holder"
          }
          onRequestSection={(section) => onTabChange(section)}
          healthNote={
            perspective === "system"
              ? systemRungHealthOf(data, ladder, nameOfOrg)
              : null
          }
          onChanged={refresh}
        />
        )}
      </div>
      {/* THE TEST TAB AT YOUR OWN LEVEL — a member seat tries the job as
          itself (the admin route keeps the admin bench below). */}
      {!showAdmin && perspective !== "system" ? (
        <div
          role="tabpanel"
          id="mandate-panel-test"
          hidden={activeTab !== "test"}
          className={activeTab === "test" ? "space-y-3" : "hidden"}
        >
          {activeTab === "test" ? (
            <MandateTryPanel
              mandateKey={data.mandate.mandate_key}
              outputKind={data.mandate.output_kind ?? null}
              organizationId={principal.kind === "org" ? principal.orgId : null}
            />
          ) : null}
        </div>
      ) : null}
      {showAdmin ? (
        <RecordAdminPanels
          mandateKey={data.mandate.mandate_key}
          activeTab={activeTab}
        />
      ) : null}
      {/* The simple Overrides redesign, BESIDE the protected Overrides tab
          (register: "Suggestions go beside them, never in place of them"). */}
      <div
        role="tabpanel"
        id="mandate-panel-overrides-simple"
        hidden={activeTab !== "overrides-simple"}
        className={activeTab === "overrides-simple" ? "space-y-3" : "hidden"}
      >
        {activeTab === "overrides-simple" && !readOnly ? (
          <MandateOverridesSimple
            data={data}
            level={perspective}
            organizationId={principal.kind === "org" ? principal.orgId : null}
            onChanged={refresh}
            resolvedHolder={
              perspective === "person"
                ? resolvedHolderOfVerdict(
                    verdict.mandate,
                    verdict.loading,
                    verdict.error,
                  )
                : null
            }
          />
        ) : null}
      </div>
      <div
        role="tabpanel"
        id="mandate-panel-notes"
        hidden={activeTab !== "notes"}
        className={activeTab === "notes" ? "space-y-3" : "hidden"}
      >
        <Section title="Notes">
          <MandateNotesPanel
            mandateId={data.mandate.id}
            mandateKey={data.mandate.mandate_key}
            surfaceName={
              host === "window"
                ? undefined
                : MANDATE_WORKSPACE_SURFACE_NAME
            }
          />
        </Section>
      </div>
    </>
  );
}

/**
 * One line instead of three "Label: value" rows (register 6b). Where the job
 * lives comes from its HOME organization — a system job reads "System" on
 * every host — then its feature. Enabled is only mentioned when it is off, and
 * a super admin gets the switch that changes it.
 */
function MandateFactsLine({
  data,
  feature,
  homeName,
  canToggle,
  onChanged,
}: {
  data: MandateWorkspaceData;
  feature: string;
  homeName: string | null;
  canToggle: boolean;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const home = data.mandate.organization_id;
  // Say what is true: the platform, a named organization, one the viewer is
  // not a member of, or no home at all — never a generic "Organization".
  const homeLabel = !home
    ? "No home organization"
    : home.toLowerCase() === SYSTEM_ORGANIZATION_ID.toLowerCase()
      ? "System"
      : (homeName ?? "An organization you are not in");
  const enabled = data.mandate.is_enabled !== false;

  const toggle = async (next: boolean) => {
    setSaving(true);
    try {
      await updateMandateDefinition(data.mandate.id, { is_enabled: next });
      toast.success(next ? "Mandate enabled." : "Mandate disabled.");
      onChanged();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "That change was not saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{homeLabel}</span>
      <span aria-hidden>·</span>
      <span>{feature}</span>
      {canToggle ? (
        <label className="ml-auto inline-flex items-center gap-1.5">
          <Switch
            checked={enabled}
            disabled={saving}
            onCheckedChange={(next) => void toggle(next)}
            aria-label="Enabled"
          />
          {enabled ? "Enabled" : "Disabled"}
        </label>
      ) : !enabled ? (
        <StatusToken status="neutral" label="Disabled" />
      ) : null}
    </div>
  );
}

// ── Copied verbatim from MandateWorkspace.tsx (only "Holder" wording changed) ──

/**
 * ── WHAT THE "FULFILLED BY" SECTION RENDERS ──────────────────────────────────
 *
 * One shape, two honest sources, because the two hosts answer two DIFFERENT
 * questions:
 *
 *  · the personal principal asks *"what runs for ME, right now"* — and that
 *    answer comes from the SERVER VERDICT (`useMandate` → `resolveMandate` →
 *    `GET /mandates/{key}/resolution`), the same verdict the runtime executes.
 *    It is never recomputed here: this screen used to walk a third hand-written
 *    ladder that took `orgBindings[0]` across ANY org the caller belonged to —
 *    the exact lie the one-resolution campaign exists to kill (D-R1/D-R2,
 *    Arman 2026-09-01).
 *  · the ORG principal asks *"what runs for every member of THIS org"*, which
 *    no per-caller door can answer (`mandate.resolve` resolves for `auth.uid()`
 *    and would fold in the viewing admin's own personal binding). That answer
 *    is computed below from the route's org rows alone — deliberate, and the
 *    reason `resolveForOrgPrincipal` still exists.
 */
interface FulfillmentView {
  /** The rung that decides. `null` while it is still being asked for. */
  rung: "system" | "org" | "user" | "run" | null;
  /** One sentence naming WHO decides — the active org by name, never by id. */
  sentence: string;
  agent: WorkspaceAgentInfo | null;
  agentId: string | null;
  useLatest: boolean;
  pinned: number | null;
  drift: string | null;
  loading: boolean;
  /**
   * The one resolver refused, in its own words. Shown as-is: a refusal that
   * names the rung and the pin is the honest answer to "what runs for you", and
   * the ladder beneath it shows which row to go fix.
   */
  refusal: string | null;
  /** The server's published staleness bound, when the answer came from it. */
  freshness: string | null;
  /**
   * 🚨 EVERY RUNG THE SERVER SET ASIDE, in its own words (2026-09-08, FIX-R1c).
   *
   * Not a refusal — the job DID resolve — but the answer above is not the one
   * somebody chose, and that is exactly what this screen exists to say. Until
   * the server grew `dropped_rungs`, an organization could bind an agent its
   * members could not open and every one of them would be shown the platform
   * default as if nothing had happened (V-CORRECTNESS §5).
   */
  droppedRungs: { rung: string; reason: string }[];
}

/** How a rung is spoken about on a screen claiming "this is what runs for you". */
function verdictSentence(
  rung: NonNullable<FulfillmentView["rung"]>,
  activeOrgLabel: string,
): string {
  switch (rung) {
    case "user":
      return "Your own binding decides this job — it wins in every organization you work in.";
    case "org":
      return `${activeOrgLabel} overrides this job.`;
    case "run":
      return "A choice made for this run decides the job — just for that run.";
    case "system":
      return `No override applies in ${activeOrgLabel} — this job runs the system default.`;
  }
}

/** THE PERSONAL ANSWER — read off the server verdict, never recomputed. */
/**
 * The server's verdict, in the shape the simple Overrides tab reads: who runs
 * this job for the viewer when their own level names nobody.
 */
function resolvedHolderOfVerdict(
  verdict: ResolvedMandate | null,
  loading: boolean,
  error: string | null,
): ResolvedHolderForOverrides {
  if (loading) return { status: "loading" };
  if (!verdict || error || verdict.holderType !== "agent") {
    return {
      status: "unavailable",
      message: "No agent runs this job for you right now.",
    };
  }
  return {
    status: "ready",
    agentId: verdict.agentId,
    versionId: verdict.isVersion ? verdict.versionId : null,
  };
}

function viewFromVerdict(
  data: MandateWorkspaceData,
  verdict: ResolvedMandate | null,
  loading: boolean,
  error: string | null,
  nameOfOrg: (id: string) => string | null,
): FulfillmentView {
  const empty = {
    agent: null,
    agentId: null,
    useLatest: true,
    pinned: null,
    drift: null,
  };
  if (loading) {
    return {
      ...empty,
      rung: null,
      sentence: "Asking the server what runs for you…",
      loading: true,
      refusal: null,
      freshness: null,
      droppedRungs: [],
    };
  }
  if (error || !verdict) {
    return {
      ...empty,
      rung: null,
      sentence: "This job has no answer for you right now.",
      loading: false,
      refusal: error ?? "The server returned no verdict for this job.",
      freshness: null,
      droppedRungs: [],
    };
  }

  const orgName = verdict.organizationId
    ? nameOfOrg(verdict.organizationId)
    : null;
  const activeOrgLabel = verdict.organizationId
    ? orgName
      ? `${orgName} (your active org)`
      : "your active organization"
    : // A verdict resolved with NO organization in play is a platform default,
      // not an answer for a workspace — and it must never be printed as one.
      "no organization (a platform default, not a workspace answer)";

  const agent = data.agentsById[verdict.agentId] ?? null;
  return {
    rung: verdict.provenance,
    sentence: verdictSentence(verdict.provenance, activeOrgLabel),
    agent,
    agentId: verdict.agentId,
    useLatest: !verdict.isVersion,
    pinned: null,
    drift: null,
    loading: false,
    refusal: null,
    freshness: verdict.freshness,
    droppedRungs: verdict.droppedRungs.map((d) => ({
      rung: d.rung,
      reason: d.reason,
    })),
  };
}


const SYSTEM_PERSPECTIVE_RUNGS_DEFAULT_FIRST = ["system", "global"] as const;
const SYSTEM_PERSPECTIVE_RUNGS_GLOBAL_FIRST = ["global", "system"] as const;

function BindingSection({
  data,
  principal,
  perspective,
  authoring,
  healthNote,
  activeSection,
  onRequestSection,
  onChanged,
}: {
  activeSection: BindingWorkspaceSection;
  /** The host owns the tab; the workspace asks it to move ("+ Agent" → back). */
  onRequestSection: (section: BindingWorkspaceSection) => void;
  data: MandateWorkspaceData;
  principal: WorkspacePrincipal;
  perspective: WorkspacePerspective;
  authoring: boolean;
  /** The door's verdict on the rung this host manages — system host only. */
  healthNote: SystemRungHealth | null;
  onChanged: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const jump = () =>
      requestAnimationFrame(() =>
        ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    window.addEventListener("matrx:open-mandate-pin", jump);
    // The creation handoff (`NewMandatePage` → `…/mandates/<key>#bind`) lands
    // a brand-new mandate here, on the one thing it still needs.
    if (window.location.hash === "#bind") jump();
    return () => window.removeEventListener("matrx:open-mandate-pin", jump);
  }, []);

  return (
    <div id="bind" ref={ref}>
      {/* 🚨 ONE TITLE, ONE PLACE. The admin page's holder used to be described
          under "The system answer" and set again under "Assign the system
          holder" — Arman: *"repeating it in the bottom … that's stupid."* */}
      <Section
        title={
          {
            holder: "Mandate Holder",
            "create-agent": "Create the agent that holds this job",
            overrides: "Execution overrides",
            display: "Display Options",
            permissions: "Permissions",
          }[activeSection]
        }
      >
        <OneBindingWorkspace
          data={data}
          activeSection={activeSection}
          onRequestSection={onRequestSection}
          perspective={perspective}
          healthNote={healthNote}
          // Ignored under the system perspective — `fixedRung` names the
          // rungs and its first entry is where the page opens.
          initialRung={principal.kind === "org" ? "org" : "user"}
          initialOrganizationId={
            principal.kind === "org" ? principal.orgId : null
          }
          // The admin door offers the system rung; the server's super-admin
          // gate is the authority and the workspace re-checks it too.
          allowGlobal={authoring}
          // 🚨 THE ADMIN PANEL IS THE PLATFORM'S OWN RUNGS AND NOTHING ELSE.
          // Two rungs decide for everybody: the job's OWN default holder
          // (`mandate.definition.default_holder_*`, holder-only) and the
          // platform-wide binding above it (which also carries the map, the
          // settings and auto-run). Pinning to that pair states each by name
          // and offers no User/Org — an admin managing what the platform
          // assigns is never one click away from writing a personal override.
          // The rung that ACTUALLY decides today is first, so the page opens on
          // the answer it just described above.
          fixedRung={
            perspective === "system"
              ? hasGlobalBinding(data)
                ? SYSTEM_PERSPECTIVE_RUNGS_GLOBAL_FIRST
                : SYSTEM_PERSPECTIVE_RUNGS_DEFAULT_FIRST
              : perspective === "organization"
                ? ["org"]
                : undefined
          }
          onChanged={onChanged}
        />
      </Section>
    </div>
  );
}

// ── §2 Current fulfillment ───────────────────────────────────────────────────
//
// "Fulfilled by" answers ONE question — what runs — and it answers it from the
// one resolver. Everything it can say is in `FulfillmentView`; this component
// only paints it, so there is no place left for a second opinion to grow.

function FulfillmentSection({ resolution }: { resolution: FulfillmentView }) {
  useMandateAlchemyTabCapture("holder", resolution.loading
    ? { status: "loading" }
    : { status: "ready", data: normalizeTransferJson({
        holder: resolution.agent ? { id: resolution.agentId, name: resolution.agent.name, archived: resolution.agent.isArchived } : null,
        source: resolution.rung,
        explanation: resolution.sentence,
        version: resolution.useLatest ? "Latest" : resolution.pinned,
        refusal: resolution.refusal,
        freshness: resolution.freshness,
        drift: resolution.drift,
        dropped_rungs: resolution.droppedRungs,
      }) }, "effective_holder");
  const { copying, copyAndOpen } = useCopyMandateAgent();
  const {
    agent,
    agentId,
    rung,
    sentence,
    useLatest,
    pinned,
    drift,
    loading,
    refusal,
    freshness,
    droppedRungs,
  } = resolution;
  return (
    <Section title="Effective Mandate Holder">
      <div className="rounded-lg border border-border bg-card px-3">
        <PropertyRow
          label="Mandate Holder"
          value={
            loading ? (
              <SuspenseLoader />
            ) : agentId ? (
              <EntityRef
                token="agent"
                id={agentId}
                name={agent?.name ?? "Display name unavailable"}
              />
            ) : (
              "Not available"
            )
          }
        />
        <PropertyRow
          label="Source"
          value={
            rung
              ? {
                  user: "Personal",
                  org: "Organization",
                  global: "System binding",
                  system: "System default",
                  run: "This run",
                }[rung]
              : "Unknown"
          }
          help={sentence}
        />
        <PropertyRow
          label="Version"
          value={
            loading || refusal
              ? "Unknown"
              : useLatest
                ? "Latest"
                : pinned !== null
                  ? `Version ${pinned}`
                  : "Pinned"
          }
        />
        <PropertyRow
          label="Status"
          value={
            <StatusToken
              status={loading ? "unknown" : refusal ? "error" : "ok"}
              label={loading ? "Reading" : refusal ? "Unavailable" : "Resolved"}
            />
          }
          help={
            refusal ? (
              <TextWithDoors text={refusal} defaultToken="agent" />
            ) : (
              (freshness ?? undefined)
            )
          }
        />
        <PropertyRow
          label="Archived"
          value={agent ? (agent.isArchived ? "Yes" : "No") : "Unknown"}
        />
        {drift ? <PropertyRow label="Newer version" value={drift} /> : null}
        {droppedRungs.map((dropped) => (
          <PropertyRow
            key={`${dropped.rung}:${dropped.reason}`}
            label={`${formatVariableDisplayName(dropped.rung)} binding`}
            value={<StatusToken status="caution" label="Not applied" />}
            help={<TextWithDoors text={dropped.reason} defaultToken="agent" />}
          />
        ))}
        {agent ? (
          <div className="flex items-center gap-2 py-2">
            <Button
              variant="outline"
              size="sm"
              disabled={copying}
              className="gap-1.5"
              onClick={() =>
                void copyAndOpen({
                  defaultAgentId: agentId,
                  defaultAgentVersionId: null,
                })
              }
            >
              <Copy className="h-3.5 w-3.5" />
              {copying ? "Duplicating…" : "Duplicate & customize"}
            </Button>
            <FieldHelp label="Duplicate & customize">
              Copies this resolved agent into your account and opens the
              builder. Assign the copy on the Binding tab to use it for this mandate.
            </FieldHelp>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

// ── §3 The ladder, as the database tells it ──────────────────────────────────
//
// WHAT THIS REPLACED, 2026-09-07, and must never come back: an "N of your
// organizations override this job" fold. It listed org bindings from ANY org
// the caller belonged to and told the reader they were what applies to THEM —
// "the first matching organization above". Under D-R1 only the ACTIVE org has a
// rung, so that line was a lie about other people's organizations.
//
// What stands here instead is the one ladder, read from `mandate.resolve`: the
// rungs that exist for this person in the org they are actually in. It states
// what each rung SAYS and never which one wins — the verdict above owns that,
// and a second opinion computed here would be the fourth ladder.

function LadderSection({
  ladder,
  agentsById,
  nameOfOrg,
  activeOrganizationId,
  allowCopy = false,
}: {
  allowCopy?: boolean;
  ladder: ReturnType<typeof useMandateLadder>;
  agentsById: Record<string, WorkspaceAgentInfo>;
  nameOfOrg: (id: string) => string | null;
  activeOrganizationId: string | null;
}) {
  useMandateAlchemyTabCapture("holder", ladder.loading
    ? { status: "loading" }
    : { status: "ready", data: normalizeTransferJson({
        error: ladder.error,
        organization: activeOrganizationId ? nameOfOrg(activeOrganizationId) : null,
        rows: ladder.error ? null : ladder.rows.map((row) => ({
          ...ladderRowWords(row, row.rung === "org" && row.organization_id ? nameOfOrg(row.organization_id) : null),
          holder_id: row.holder_id,
          holder_name: row.holder_id ? agentsById[row.holder_id]?.name ?? null : null,
          holder_type: row.holder_type,
          version: row.holder_version_id,
          enabled: row.is_enabled,
          dropped_reason: row.dropped_reason ?? null,
        })),
      }) }, "configured_holders");
  if (ladder.loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-2">
        <SuspenseLoader />
      </div>
    );
  }
  if (ladder.error) {
    return (
      <p className="flex items-start gap-1.5 px-1 text-[12px] leading-relaxed text-destructive">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        The rungs behind this job could not be read: {ladder.error}
      </p>
    );
  }

  return (
    <Section title="Configured Mandate Holders">
      <ConfigurationTable
        label="Configured Mandate Holders"
        columns={HOLDER_LADDER_COLUMNS}
      >
        {ladder.rows.map((row) => (
          <LadderRow
            key={`${row.rung}:${row.binding_id ?? "default"}`}
            row={row}
            allowCopy={allowCopy}
            agentsById={agentsById}
            nameOfOrg={nameOfOrg}
          />
        ))}
      </ConfigurationTable>
    </Section>
  );
}

const HOLDER_LADDER_COLUMNS = [
  { key: "scope", label: "Scope" },
  { key: "holder", label: "Mandate Holder" },
  { key: "version", label: "Version" },
  { key: "status", label: "Status" },
];

function LadderRow({
  row,
  agentsById,
  nameOfOrg,
  allowCopy = false,
}: {
  allowCopy?: boolean;
  row: MandateLadderRow;
  agentsById: Record<string, WorkspaceAgentInfo>;
  nameOfOrg: (id: string) => string | null;
}) {
  const words = ladderRowWords(
    row,
    row.rung === "org" && row.organization_id
      ? nameOfOrg(row.organization_id)
      : null,
  );
  const { copying, copyAndOpen } = useCopyMandateAgent();
  const changesHolder = ladderRowChangesHolder(row);
  const broken = ladderRowIsBroken(row);
  const agent = row.holder_id ? (agentsById[row.holder_id] ?? null) : null;

  return (
    <ConfigurationTableRow
      columns={HOLDER_LADDER_COLUMNS}
      cells={{
        scope: words.title,
        holder:
          !broken && agent ? (
            <EntityRef
              token="agent"
              id={agent.id}
              name={agent.name}
              showIcon={false}
            />
          ) : row.holder_type === "workflow" ? (
            "Workflow"
          ) : changesHolder ? (
            row.holder_version_id ? (
              "Pinned Mandate Holder"
            ) : (
              "Unavailable"
            )
          ) : (
            "Inherited"
          ),
        version: row.holder_version_id
          ? "Pinned"
          : changesHolder
            ? "Latest"
            : "Inherited",
        status: (
          <span className="inline-flex items-center gap-1">
            <StatusToken
              status={
                broken ? "error" : !row.is_enabled ? "neutral" : "neutral"
              }
              label={
                broken ? "Not applied" : row.is_enabled ? "Enabled" : "Disabled"
              }
            />
            <FieldHelp label={`${words.title} status`}>
              {words.detail}
            </FieldHelp>
            {allowCopy &&
            !broken &&
            row.holder_type !== "workflow" &&
            (row.holder_id || row.holder_version_id) ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Duplicate ${words.title} Mandate Holder`}
                disabled={copying}
                onClick={() =>
                  void copyAndOpen({
                    defaultAgentId: row.holder_id,
                    defaultAgentVersionId: row.holder_version_id,
                  })
                }
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </span>
        ),
      }}
    />
  );
}
