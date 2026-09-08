"use client";

// features/mandates/workspace/MandateWorkspace.tsx
//
// THE mandate workspace — the ONE core component every host wraps:
//   · the dedicated route  app/(core)/mandates/[mandateKey]
//   · the admin route      app/(admin)/administration/mandates/[mandateKey]
//   · the window panel     features/window-panels/windows/mandates/MandateWindow
// Identical functionality by construction (Arman's rule 3, 2026-08-26);
// divergence only where a HOST genuinely differs — the window's multi-mandate
// scope list, and the admin shell's header offset. There is no second mandate
// detail implementation anywhere: the admin console's row click lands HERE
// (2026-08-29), it no longer opens a drawer of its own.
//
// ORDER OF IMPORTANCE (the vision, verbatim doctrine in ../FEATURE.md):
//   §1 THE TRIAD — INPUT → GOAL → OUTPUT (TriadSections.tsx). Arman: "INPUT ->
//      Charge (Goal) -> Output. The UI should show this clearly and since the
//      goal lives ONLY HERE, it needs to be easy to read and quickly edit."
//   §2 How the system meets it now — the effective Holder, read from the ONE
//      resolver (the server verdict; this screen never resolves), view it /
//      duplicate it. It names the ACTIVE org, because the org rung IS the
//      active org (D-R1, Arman 2026-09-01).
//   §3 The ladder as the DATABASE tells it — `mandate.resolve`, one row per
//      rung, what each rung says and nothing about which one wins. This
//      surface is PERSONAL; org editing lives on the org route.
//   §4 Who fulfils this job — THE ONE BINDING UI (features/bindings/
//      OneBindingWorkspace): the rung as a control, the holder cell, and the
//      two-sides-and-a-middle mapping over the shared row component. It
//      replaced the four-step OverrideFlow wizard on 2026-08-31.
// Plus, ON THE ADMIN ROUTE ONLY (Arman, 2026-08-29 — mandate MANAGEMENT is
// admin-side; the user route is browse + their own override):
//   · goal editing and draft-input editing (§1)
//   · RUN THIS JOB — run the mandate you are looking at, agent holder or
//     workflow holder alike (also super-admin gated inside; the server
//     endpoints are `require_super_admin`, aidream 304fe1848).
//
// No prose paragraphs. Sections state facts; the data does the talking.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Copy,
  Expand,
  Layers,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { TextWithDoors } from "@/components/official/entity-ref/TextWithDoors";
import { cn } from "@/lib/utils";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { MandateResolutionRibbon } from "../components/MandateResolutionRibbon";
import { MandateNotesPanel } from "../components/MandateNotesPanel";
import { MandateLineageLine } from "../components/MandateLineageLine";
import {
  TriadFlowMark,
  TriadGoalSection,
  TriadInputSection,
  TriadOutputSection,
} from "./TriadSections";
import { useCopyMandateAgent } from "../useCopyMandateAgent";
import { splitMandateKey } from "../mandate-key";
import {
  agentHolderOfBinding,
  holderOfMandate,
  isFloatingBinding,
  isFloatingMandate,
} from "@/lib/supabase/mandateStorage";
import { OneBindingWorkspace } from "@/features/bindings/OneBindingWorkspace";
import { hasLiveGlobalBinding } from "@/features/bindings/system-answer-record";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertyRow } from "@/components/official/ConfigurationFields";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import { Section } from "./Section";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { systemRungHealth, type SystemRungHealth } from "./system-rung-health";
import {
  useMandateWorkspaceData,
  type MandateWorkspaceData,
  type WorkspaceAgentInfo,
} from "./useMandateWorkspaceData";
import { loadFailedFailure } from "../mandate-address";
import { useMandate } from "../useMandate";
import { MANDATE_WORKSPACE_SURFACE_NAME } from "@/features/surfaces/manifests/mandate-workspace.manifest";
import type { ResolvedMandate } from "../service";
import {
  ladderRowIsBroken,
  ladderRowWords,
  useMandateLadder,
  type MandateLadderRow,
} from "./useMandateLadder";

/**
 * Which principal a HOST speaks for. It PRE-SELECTS the rung in the binding
 * section; it no longer decides it. The rung is a control on the screen
 * (UI-STANDARD P13, D1 resolved 2026-08-31) — the routes stay as entry points.
 */
export type WorkspacePrincipal =
  { kind: "user" } | { kind: "org"; orgId: string };

/**
 * ── THE HOST DECIDES THE PERSPECTIVE ─────────────────────────────────────────
 * (Arman, 2026-09-08, FIX-R4 — the top-priority order behind this whole file.)
 *
 * One workspace, three questions, and a host may only ever ask ONE of them:
 *
 *  | Host                                            | perspective    |
 *  |-------------------------------------------------|----------------|
 *  | `/mandates/[key]` (core route)                  | `person`       |
 *  | the window panel (`MandateWindow`, Yours pane)  | `person`       |
 *  | `/organizations/[id]/settings/mandates/[key]`   | `organization` |
 *  | `/administration/mandates/[key]` (admin route)  | `system`       |
 *
 * `system` is the admin panel, and Arman's rule for it is absolute: *"it should
 * never show ANYTHING related to a user or an org … the ONLY thing it should
 * ever show is the things we assign from the system."* So on that host there is
 * no personal verdict, no ladder, no rung selector, no "for you" — the page IS
 * the system rung: what the platform assigns, whether that assignment is sound,
 * and the admin's own tools for changing it.
 *
 * The table above is the census, and it is mirrored in `../FEATURE.md`.
 */
export type WorkspacePerspective = "person" | "organization" | "system";

export type MandateWorkspaceTab =
  | "definition"
  | "holder"
  | "overrides"
  | "display"
  | "test"
  | "permissions"
  | "diagnostics"
  | "notes";

const WORKSPACE_TABS: {
  id: MandateWorkspaceTab;
  label: string;
  admin?: boolean;
}[] = [
  { id: "definition", label: "Definition" },
  { id: "holder", label: "Holder" },
  { id: "overrides", label: "Overrides" },
  { id: "display", label: "Display Options" },
  { id: "test", label: "Test", admin: true },
  { id: "permissions", label: "Permissions" },
  { id: "diagnostics", label: "Diagnostics", admin: true },
  { id: "notes", label: "Notes" },
];

export interface MandateWorkspaceProps {
  adminContent?: (tab: MandateWorkspaceTab) => ReactNode;
  adminActions?: (
    data: MandateWorkspaceData,
    onChanged: () => void,
  ) => ReactNode;
  /** Mandate key ("podcast.multihost_script") or the row uuid — both open. */
  mandateKeyOrId: string;
  /**
   * Which shell wraps this workspace. `route` is the (core) page (its own
   * `<PageHeader>` floats, so the body owns the offset); `admin-route` is the
   * same page inside the admin shell, where content already sits below the
   * header; `window` is the draggable panel. Chrome only — every host renders
   * the identical workspace.
   */
  host: "route" | "admin-route" | "window";
  /** Whose binding §4 edits. Defaults to the personal principal. */
  principal?: WorkspacePrincipal;
}

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
  rung: "system" | "global" | "org" | "user" | "run" | null;
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
    case "global":
      return "A global binding overrides this job for everyone on the platform.";
    case "run":
      return "A choice made for this run decides the job — just for that run.";
    case "system":
      return `No override applies in ${activeOrgLabel} — this job runs the system default.`;
  }
}

/** THE PERSONAL ANSWER — read off the server verdict, never recomputed. */
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
  // A verdict that reached this screen is FLOATING by construction: the client
  // door refuses a version-pinned winner (it has no channel to run one), so the
  // refusal branch above owns that case and there is no pin to drift from here.
  return {
    rung: verdict.provenance,
    sentence: verdictSentence(verdict.provenance, activeOrgLabel),
    agent,
    agentId: verdict.agentId,
    useLatest: true,
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

/**
 * THE ORGANIZATION'S ANSWER — for every member of the route's org, personal
 * bindings excluded. Only the route's own org may decide here; an org admin
 * with a personal override must not see their own agent on a page that binds
 * for everyone.
 */
function resolveForOrgPrincipal(
  data: MandateWorkspaceData,
  orgId: string,
  orgName: string | null,
): FulfillmentView {
  const orgBinding =
    data.bindings.find((b) => {
      if (b.principal_type !== "org") return false;
      if (b.organization_id !== orgId) return false;
      if (!b.is_enabled) return false;
      const holder = agentHolderOfBinding(b);
      return holder.holderId !== null || holder.versionId !== null;
    }) ?? null;

  // The WINNING layer answers alone: a binding that wins supplies its own
  // Holder and its own float/pin state, and the mandate default is consulted
  // only when no binding won at all.
  const systemHolder = holderOfMandate(data.mandate);
  const winnerHolder = orgBinding ? agentHolderOfBinding(orgBinding) : null;
  const versionId = winnerHolder
    ? winnerHolder.versionId
    : systemHolder.versionId;
  const agentIdRaw = winnerHolder
    ? winnerHolder.holderId
    : systemHolder.holderId;
  const useLatest = orgBinding
    ? isFloatingBinding(orgBinding)
    : isFloatingMandate(data.mandate);

  const version = versionId ? (data.versionsById[versionId] ?? null) : null;
  const agentId = version?.agentId ?? agentIdRaw;
  const agent = agentId ? (data.agentsById[agentId] ?? null) : null;

  const pinned = version?.versionNumber ?? null;
  const latest = agent?.latestVersion ?? null;
  const drift =
    pinned !== null && latest !== null && latest > pinned
      ? `v${pinned} → v${latest}`
      : null;

  const who = orgName ?? "This organization";
  return {
    rung: orgBinding ? "org" : "system",
    sentence: orgBinding
      ? `${who} overrides this job for everyone in it.`
      : `${who} has no override — its members run the system default.`,
    agent,
    agentId,
    useLatest,
    pinned,
    drift,
    loading: false,
    refusal: null,
    freshness: null,
    // This view answers "what does this ORG get", straight from the binding
    // rows — it asks the server for no verdict, so it has no drop to report.
    // The server's own answer, drops included, is the one above.
    droppedRungs: [],
  };
}

/**
 * 🚨 THE WHOLE SCREEN IS ABOUT ONE JOB, SO IT IS KEYED TO THAT JOB (R-O6).
 *
 * The closing lens navigated from one mandate to another WITHOUT a reload and
 * the first job's refusal was still on screen. `OneBindingWorkspace` was the
 * instance it caught, and it is keyed at its own boundary now — but it is not
 * the only slot on this page holding a verdict about one mandate:
 * `RunThisJobSection` holds a run's `result` and `failure`, `TriadSections`
 * hold an unsaved edit, and `useMandateWorkspaceData` holds the previous job's
 * rows until the next fetch lands. Every one of them is wrong the instant the
 * job changes, and none of them opted in to noticing.
 *
 * A key on the whole workspace is the one statement that covers them all, and
 * covers whatever is added below it tomorrow.
 */
export function MandateWorkspace(props: MandateWorkspaceProps) {
  return <OneMandateWorkspace key={props.mandateKeyOrId} {...props} />;
}

function OneMandateWorkspace({
  mandateKeyOrId,
  host,
  principal = { kind: "user" },
  adminContent,
  adminActions,
}: MandateWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<MandateWorkspaceTab>("definition");
  useEffect(() => {
    const openHolder = () => setActiveTab("holder");
    window.addEventListener("matrx:open-mandate-pin", openHolder);
    if (window.location.hash === "#bind") openHolder();
    return () =>
      window.removeEventListener("matrx:open-mandate-pin", openHolder);
  }, []);
  const { data, loading, failure, refresh } =
    useMandateWorkspaceData(mandateKeyOrId);
  const { organizations } = useUserOrganizations();
  // The ACTIVE org — the org rung IS this one, and only this one (D-R1).
  const activeOrganizationId = useAppSelector(selectOrganizationId);
  const nameOfOrg = useMemo(() => {
    const byId = new Map(organizations.map((o) => [o.id, o.name]));
    return (id: string) => byId.get(id) ?? null;
  }, [organizations]);

  // THE HOST'S PERSPECTIVE, decided once and read everywhere below.
  const perspective: WorkspacePerspective =
    host === "admin-route"
      ? "system"
      : principal.kind === "org"
        ? "organization"
        : "person";

  // ONE ASK, ONE VIEW. The personal principal's answer is the server verdict;
  // the ladder beside it is the database's own rung list. The empty key is the
  // documented disabled sentinel for both, so the org route asks for neither —
  // and neither does the SYSTEM perspective, whose question is not "what runs
  // for me". Asking would be worse than useless: it is the wrong answer,
  // rendered as if it were this page's subject.
  const personalKey =
    perspective === "person" && data ? data.mandate.mandate_key : "";
  const verdict = useMandate(personalKey);
  /**
   * 🚨 ONE DOOR, TWO QUESTIONS — and the SYSTEM host asks only one of them.
   *
   * `mandate.resolve` returns one row per rung. The person's route reads the
   * whole ladder ("how is this decided for me"). The admin route reads exactly
   * ONE ROW — the `system` rung — because FIX-R1 judges that rung against the
   * mandate's HOME organization, not against whoever is looking: it is a fact
   * about the platform's own answer, which is this host's entire subject. No
   * other row is read here, and no organization is passed.
   */
  const ladderKey =
    data && (perspective === "person" || perspective === "system")
      ? data.mandate.mandate_key
      : "";
  const ladder = useMandateLadder(
    ladderKey,
    perspective === "person" ? activeOrganizationId : null,
  );

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center py-24">
        <SuspenseLoader />
      </div>
    );
  }
  if (failure || !data) {
    // 🚨 ONLY THE CONTROL THAT CAN WORK (V2-6). A wrong address and a mandate
    // nothing answers to are not failed reads: retrying them re-runs a query
    // whose answer cannot change. Retry survives for the one state where it
    // can succeed. Both other states get the door that can — the list.
    const verdict = failure ?? loadFailedFailure("Unknown error.");
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
        <p
          className={
            verdict.kind === "load-failed"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {verdict.message}
        </p>
        {verdict.retryable ? (
          <Button variant="outline" size="sm" onClick={refresh}>
            Retry
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link
              href={
                host === "admin-route"
                  ? "/administration/mandates"
                  : "/mandates"
              }
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              All mandates
            </Link>
          </Button>
        )}
      </div>
    );
  }

  // The SYSTEM perspective has no `FulfillmentView` at all — "fulfilled by" is
  // a per-caller question, and its own answer rides with the three controls.
  const resolution: FulfillmentView | null =
    perspective === "system"
      ? null
      : principal.kind === "org"
        ? resolveForOrgPrincipal(
            data,
            principal.orgId,
            nameOfOrg(principal.orgId),
          )
        : viewFromVerdict(
            data,
            verdict.mandate,
            verdict.loading,
            verdict.error,
            nameOfOrg,
          );
  const feature = splitMandateKey(data.mandate.mandate_key).feature;
  // WHERE, not who: a mandate's goal, its declared inputs and running it are
  // SYSTEM management, so they exist only on the admin route. The user route
  // and the window panel show the same triad, read-only, and keep the one
  // thing that is genuinely the user's: their own override.
  const authoring = host === "admin-route";

  return (
    <div
      className={cn(
        // The admin shell's page owns the scroll (the workspace shares that
        // page with the Admin controls section), so it must not open a second
        // scroll container of its own here.
        host !== "admin-route" && "h-full overflow-y-auto",
        host === "route" && "pt-[calc(var(--shell-header-h)+0.5rem)]",
      )}
    >
      <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-3 sm:px-6">
        <header className="mb-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={authoring ? "/administration/mandates" : "/mandates"}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                All mandates
              </Link>
              <h2 className="mt-1 break-words text-xl font-semibold tracking-tight text-foreground">
                {data.mandate.label?.trim() || "Display name unavailable"}
              </h2>
            </div>
            {authoring ? adminActions?.(data, refresh) : null}
          </div>
          <div className="rounded-lg border border-border bg-card px-3">
            <PropertyRow
              label="Scope"
              value={
                perspective === "system"
                  ? "System"
                  : perspective === "organization"
                    ? (nameOfOrg(
                        principal.kind === "org" ? principal.orgId : "",
                      ) ?? "Organization unavailable")
                    : "Personal"
              }
            />
            <PropertyRow
              label="Feature"
              value={formatVariableDisplayName(feature)}
            />
            <PropertyRow
              label="Enabled"
              value={
                data.mandate.is_enabled == null
                  ? "Unknown"
                  : data.mandate.is_enabled
                    ? "Yes"
                    : "No"
              }
            />
          </div>
          {host === "window" ? (
            <Link
              href={`/mandates/${encodeURIComponent(data.mandate.mandate_key)}`}
              className="text-xs text-muted-foreground underline"
            >
              Open full page
            </Link>
          ) : null}
        </header>
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            const next = WORKSPACE_TABS.find((item) => item.id === value);
            if (next && (!next.admin || authoring)) setActiveTab(next.id);
          }}
        >
          <TabsList
            aria-label="Mandate sections"
            className="mb-5 grid h-auto w-full grid-cols-2 gap-1 bg-muted/60 p-1 sm:flex sm:flex-wrap sm:justify-start"
          >
            {WORKSPACE_TABS.filter((item) => !item.admin || authoring).map(
              (item) => (
                <TabsTrigger
                  key={item.id}
                  value={item.id}
                  id={`mandate-tab-${item.id}`}
                  aria-controls={`mandate-panel-${item.id}`}
                  className="min-h-10 whitespace-normal px-3 text-xs sm:min-h-9 sm:flex-1"
                >
                  {item.label}
                </TabsTrigger>
              ),
            )}
          </TabsList>
          {/* Draft owners remain mounted across tab changes; no duplicate editors. */}
          <div
            role="tabpanel"
            id="mandate-panel-definition"
            aria-labelledby="mandate-tab-definition"
            hidden={activeTab !== "definition"}
            className={activeTab === "definition" ? "space-y-5" : "hidden"}
          >
            <TriadGoalSection
              data={data}
              onChanged={refresh}
              authoring={authoring}
            />
            <TriadInputSection
              data={data}
              onChanged={refresh}
              authoring={authoring}
            />
            <TriadOutputSection data={data} />
            <MandateLineageLine
              mandateId={data.mandate.id}
              sourceMandateId={data.mandate.source_mandate_id ?? null}
              host={host}
            />
          </div>
          {perspective !== "system" ? (
            <div
              hidden={activeTab !== "holder"}
              className={activeTab === "holder" ? "mb-4 space-y-3" : "hidden"}
            >
              <FulfillmentSection
                data={data}
                resolution={resolution as FulfillmentView}
                onChanged={refresh}
                authoring={authoring}
              />
              {perspective === "person" ? (
                <LadderSection
                  ladder={ladder}
                  agentsById={data.agentsById}
                  nameOfOrg={nameOfOrg}
                  activeOrganizationId={activeOrganizationId}
                />
              ) : null}
            </div>
          ) : null}
          <div
            role="tabpanel"
            id={
              ["holder", "overrides", "display", "permissions"].includes(
                activeTab,
              )
                ? `mandate-panel-${activeTab}`
                : undefined
            }
            aria-labelledby={`mandate-tab-${activeTab}`}
            hidden={
              !["holder", "overrides", "display", "permissions"].includes(
                activeTab,
              )
            }
            className={
              ["holder", "overrides", "display", "permissions"].includes(
                activeTab,
              )
                ? "space-y-4"
                : "hidden"
            }
          >
            <BindingSection
              data={data}
              principal={principal}
              perspective={perspective}
              authoring={authoring}
              activeSection={
                activeTab === "overrides" ||
                activeTab === "display" ||
                activeTab === "permissions"
                  ? activeTab
                  : "holder"
              }
              healthNote={
                perspective === "system"
                  ? systemRungHealthOf(data, ladder, nameOfOrg)
                  : null
              }
              onChanged={refresh}
            />
          </div>
          {authoring ? adminContent?.(activeTab) : null}
          <div
            role="tabpanel"
            id="mandate-panel-notes"
            aria-labelledby="mandate-tab-notes"
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
                    : authoring
                      ? MANDATE_WORKSPACE_SURFACE_NAME
                      : "matrx-user/mandate-workspace"
                }
              />
            </Section>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

// ── §4 The binding ───────────────────────────────────────────────────────────
//
// The workspace's own section around `OneBindingWorkspace`. Two things live
// here rather than inside the workspace component, because they are the HOST's
// concerns: which rung the route pre-selects, and the "Bind an agent to this
// job" jump. That button (and the `matrx:open-mandate-pin` event any surface
// may fire) now scrolls to THIS section — the one place a holder is chosen.

/**
 * ── THE VERDICT ON THE PLATFORM'S OWN ANSWER, TAKEN FROM THE DOOR ────────────
 *
 * One row (`system`) of `mandate.resolve`, turned into one sentence by
 * `systemRungHealth`. Nothing here judges: `dropped_code` says WHETHER the rung
 * decides and `dropped_reason` says why, both in the database's own words — the
 * F2 class, closed by consuming the column instead of re-deriving it. The scope
 * half comes from the mandate's HOME (F3), never from a hardcoded "every user
 * on the platform".
 */
export function systemRungHealthOf(
  data: MandateWorkspaceData,
  ladder: ReturnType<typeof useMandateLadder>,
  nameOfOrg: (id: string) => string | null,
): SystemRungHealth {
  const home = data.mandate.organization_id ?? null;
  const scope = {
    systemHomed:
      home !== null &&
      home.toLowerCase() === SYSTEM_ORGANIZATION_ID.toLowerCase(),
    organizationName: home ? nameOfOrg(home) : null,
  };
  const row = ladder.rows.find((r) => r.rung === "system") ?? null;
  const holder = holderOfMandate(data.mandate);
  const globalBinding = data.bindings.find(
    (b) => b.principal_type === "global" && b.is_enabled !== false,
  );
  const holderId = globalBinding
    ? agentHolderOfBinding(globalBinding).holderId
    : holder.holderId;
  const holderIsWorkflow =
    (globalBinding
      ? (globalBinding as { holder_type?: string | null }).holder_type
      : data.mandate.default_holder_type) === "workflow";

  return systemRungHealth({
    status: ladder.loading
      ? "reading"
      : ladder.error || !row
        ? "unreadable"
        : "read",
    droppedCode: row?.dropped_code ?? null,
    droppedReason: row?.dropped_reason ?? null,
    holderName: holderId ? (data.agentsById[holderId]?.name ?? null) : null,
    holderIsWorkflow,
    holderSet: holderId !== null || holderIsWorkflow,
    home: scope,
  });
}

/** The two rungs that decide for everybody, ordered by which one answers now. */
const SYSTEM_PERSPECTIVE_RUNGS_DEFAULT_FIRST = ["system", "global"] as const;
const SYSTEM_PERSPECTIVE_RUNGS_GLOBAL_FIRST = ["global", "system"] as const;

/** Does a live platform-wide binding sit above this job's own default? */
export function hasGlobalBinding(data: MandateWorkspaceData): boolean {
  // ONE predicate, shared with the thing that picks which record the system
  // answer is written to (FIX-R13/A) — two readings of the same row cannot
  // disagree if there is only one reading.
  return hasLiveGlobalBinding(data.bindings);
}

function BindingSection({
  data,
  principal,
  perspective,
  authoring,
  healthNote,
  activeSection,
  onChanged,
}: {
  activeSection: "holder" | "overrides" | "display" | "permissions";
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
            holder: "Holder",
            overrides: "Execution overrides",
            display: "Display Options",
            permissions: "Permissions",
          }[activeSection]
        }
      >
        <OneBindingWorkspace
          data={data}
          activeSection={activeSection}
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

function FulfillmentSection({
  data,
  resolution,
  onChanged,
  authoring = false,
}: {
  data: MandateWorkspaceData;
  resolution: FulfillmentView;
  onChanged: () => void;
  authoring?: boolean;
}) {
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
  // A mandate may exist before its intelligence does (user-created, no Holder
  // yet). That is a normal state, not a read failure — say so plainly.
  const holderless =
    agentId === null && holderOfMandate(data.mandate).versionId === null;

  return (
    <Section title="Fulfilled by">
      <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
        {/* The ribbon carries the four PRECEDENCE layers. `global` is a real
            rung of its own and is deliberately NOT one of them — relabelling it
            `system` is exactly the lie this campaign closes — so a global
            verdict highlights nothing here and the sentence below names it. */}
        <MandateResolutionRibbon
          provenance={
            rung === "user" ||
            rung === "org" ||
            rung === "system" ||
            rung === "run"
              ? rung
              : undefined
          }
        />
        <p className="text-[13px] leading-relaxed text-foreground">
          {sentence}
        </p>
        {refusal ? (
          <p className="flex items-start gap-1.5 text-[12.5px] leading-relaxed text-destructive">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {/* The refusal NAMES records — "resolved system agent <id> breaks
                the mandate contract". THE DOOR LAW applies to a sentence as
                much as to a cell: the reader opens the accused agent from
                here, verbatim words intact. */}
            <span>
              <TextWithDoors text={refusal} defaultToken="agent" />
            </span>
          </p>
        ) : null}
        {/* A rung the server SET ASIDE. The job still runs — so this is amber,
            not destructive — but somebody's deliberate choice is not the thing
            running, and that has to be on the screen and not only in a log. */}
        {droppedRungs.map((dropped) => (
          <p
            key={`${dropped.rung}:${dropped.reason}`}
            className="flex items-start gap-1.5 text-[12.5px] leading-relaxed text-amber-700 dark:text-amber-400"
          >
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <TextWithDoors text={dropped.reason} defaultToken="agent" />
            </span>
          </p>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          {loading ? (
            <SuspenseLoader />
          ) : refusal ? null : agent ? (
            <EntityRef
              token="agent"
              id={agent.id}
              name={agent.name}
              className="text-[13.5px] font-medium"
            />
          ) : agentId ? (
            // The verdict named an agent this page did not load a name for —
            // the door still opens, and inventing "could not be read" would be
            // a different, false statement.
            <EntityRef
              token="agent"
              id={agentId}
              className="text-[13.5px] font-medium"
            />
          ) : holderless ? (
            authoring ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[13px] text-muted-foreground">
                  No Holder bound yet — this job is waiting for its
                  intelligence.
                </span>
                {/* THE action for a new mandate — never buried in a fold. */}
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("matrx:open-mandate-pin"),
                    )
                  }
                >
                  Bind an agent to this job
                </Button>
              </div>
            ) : (
              <span className="text-[13px] text-muted-foreground">
                No Holder bound yet — this job is waiting for its intelligence.
                You can set a personal one in the override section below.
              </span>
            )
          ) : (
            <span className="text-[13px] text-destructive">
              The effective agent could not be read — it may be deleted or not
              shared with you.
            </span>
          )}
          {agent?.agentType === "builtin" ? (
            <Badge
              variant="outline"
              className="gap-1 py-0 text-[10px] text-muted-foreground"
            >
              <ShieldCheck className="h-2.5 w-2.5" />
              System agent
            </Badge>
          ) : null}
          {agent?.isArchived ? (
            <Badge
              variant="outline"
              className="py-0 text-[10px] text-rose-600 dark:text-rose-400"
            >
              Archived
            </Badge>
          ) : null}
          {loading || refusal ? null : (
            <Badge variant="outline" className="py-0 font-mono text-[10px]">
              {useLatest ? "latest" : pinned !== null ? `v${pinned}` : "pinned"}
            </Badge>
          )}
          {drift ? (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 py-0 font-mono text-[10px] text-amber-700 dark:text-amber-400"
            >
              {drift}
            </Badge>
          ) : null}
        </div>
        {drift ? (
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            This job runs the pinned version; the agent has moved on. Updating
            the pin is {rung === "system" ? "an admin decision" : "yours"} —
            nothing changes until it is made deliberately.
          </p>
        ) : null}
        {freshness ? (
          // The server publishes its own staleness bound with the answer. Print
          // it rather than implying the verdict is instantaneous.
          <p className="text-[11px] text-muted-foreground/80">
            Answered by the server, {freshness}.
          </p>
        ) : null}
        {agent ? (
          <div>
            <Button
              variant="outline"
              size="sm"
              disabled={copying}
              className="gap-1.5"
              onClick={() => {
                void copyAndOpen(
                  {
                    defaultAgentId: holderOfMandate(data.mandate).holderId,
                    defaultAgentVersionId: holderOfMandate(data.mandate)
                      .versionId,
                  },
                  { connect: () => onChanged() },
                );
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              {copying ? "Duplicating…" : "Duplicate & customize"}
            </Button>
            <p className="mt-1.5 text-[11.5px] text-muted-foreground/80">
              Copies the running agent into your own editable version and opens
              the builder — modify it, then swap it in below.
            </p>
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
}: {
  ladder: ReturnType<typeof useMandateLadder>;
  agentsById: Record<string, WorkspaceAgentInfo>;
  nameOfOrg: (id: string) => string | null;
  activeOrganizationId: string | null;
}) {
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
  if (!activeOrganizationId) {
    return (
      <p className="flex items-start gap-1.5 px-1 text-[12px] leading-relaxed text-muted-foreground">
        <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        No workspace is selected, so this job has no organization rung to show —
        pick a workspace to see how it is decided for you.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 bg-card/50">
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[12.5px] text-foreground">
          How this job is decided for you
        </span>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        {ladder.rows.map((row) => (
          <LadderRow
            key={`${row.rung}:${row.binding_id ?? "default"}`}
            row={row}
            agentsById={agentsById}
            nameOfOrg={nameOfOrg}
          />
        ))}
      </div>
    </div>
  );
}

function LadderRow({
  row,
  agentsById,
  nameOfOrg,
}: {
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
  const broken = ladderRowIsBroken(row);
  const agent = row.holder_id ? (agentsById[row.holder_id] ?? null) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
      <span className="font-medium text-foreground">{words.title}</span>
      {broken ? (
        <Badge
          variant="outline"
          className="gap-1 py-0 text-[10px] text-destructive"
        >
          <TriangleAlert className="h-2.5 w-2.5" />
          Broken
        </Badge>
      ) : null}
      <span className={broken ? "text-destructive" : "text-muted-foreground"}>
        {words.detail}
      </span>
      {!broken && agent ? (
        <EntityRef
          token="agent"
          id={agent.id}
          name={agent.name}
          showIcon={false}
        />
      ) : null}
    </div>
  );
}
