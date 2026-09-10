"use client";

// features/mandates/admin/AdminMandateWorkspacePage.tsx
//
// ONE MANDATE UI, ADMIN DOOR (Arman, 2026-08-29: "what's the point of testing
// this UI when they're not the same?").
//
// The admin console's row click used to open its own drawer — a second, older
// mandate detail implementation that diverged from the rebuilt experience on
// /mandates/[key]. It now lands here, and here renders THE SAME
// `MandateWorkspace` — one component, THREE perspectives, chosen by the host
// (see `MandateWorkspace`'s census table). This host asks for `admin-route`,
// which IS the SYSTEM perspective: the job, what the platform assigns, whether
// that assignment is sound, and the admin's tools. Nothing about a user, an
// organization, or the reader.
//
// What the admin shell adds and the (core) route does not: the operational
// depth the console owns — health verdict and its fix, pin editing, the test
// bench, promote, remove — rendered by the SAME `MandateDetailView` the drawer
// used, ON THE SURFACE (2026-09-08, FIX-R4: it was behind an "Admin controls"
// fold, which is where Arman found "the actual things I need" hiding).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CrumbTrailHeader } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import AppLink from "@/components/navigation/AppLink";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { ArrowLeft, Loader2, Trash2, Wrench } from "lucide-react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentLineageIndex } from "@/features/agents/redux/agent-definition/selectors";
import {
  MandateWorkspace,
  type MandateWorkspaceTab,
} from "@/features/mandates/workspace/MandateWorkspace";
import { onMandateCacheInvalidated } from "@/features/mandates/service";
import {
  noSuchMandateFailure,
  notAnAddressFailure,
  readMandateAddress,
} from "@/features/mandates/mandate-address";
import { fetchAgentOutputSchemas } from "@/features/mandates/output-contract";
import { buildRow, type MandateRow } from "./mandate-health";
import { MandateDetailView } from "./MandateDetailPanel";
import { PromoteToSystemMandateButton } from "./mandate-actions";
import {
  fetchMandateCodeTruthReport,
  fetchMandateConsoleData,
  softDeleteMandate,
  type MandateCodeTruth,
  type MandateConsoleData,
} from "./service";
import { FieldHelp } from "@/components/official/ConfigurationFields";
import type { MandateWorkspaceData } from "../workspace/useMandateWorkspaceData";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { pushAppHref } from "@/lib/deployment/navigate";
import {
  SurfaceRuntimeProvider,
  getRegisteredSurfaceScopeContributions,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  MANDATE_WORKSPACE_SURFACE_NAME,
  createMandateWorkspaceScope,
} from "@/features/surfaces/manifests/mandate-workspace.manifest";

export interface AdminMandateWorkspacePageProps {
  /** Mandate key ("podcast.multihost_script") or the row uuid — both open. */
  mandateKey: string;
}

export function AdminMandateWorkspacePage({
  mandateKey,
}: AdminMandateWorkspacePageProps) {
  return (
    // THE SURFACE: `matrx-admin/mandate-workspace` (manifest beside the
    // console's). The provider owns identity; the goal editor inside the
    // workspace publishes the goal values and owns the ONE write target
    // (`TriadGoalSection` → `useSurfaceScopeContribution` +
    // `useSurfaceWriteHandlers`), which is how the goal writer's charge
    // lands in the editor from the chat window without this page parsing
    // any model output.
    <SurfaceRuntimeProvider
      surfaceName={MANDATE_WORKSPACE_SURFACE_NAME}
      getScope={() => ({
        ...createMandateWorkspaceScope({
          mandate_key: mandateKey,
          selection: window.getSelection()?.toString() || undefined,
        }),
        // The goal editor publishes its own values from below
        // (`useSurfaceScopeContribution`); contributions are merged HERE,
        // by the provider owner — the registry never merges them for you.
        ...getRegisteredSurfaceScopeContributions(
          MANDATE_WORKSPACE_SURFACE_NAME,
        ),
      })}
    >
      <div className="h-full overflow-y-auto pb-safe">
        <MandateWorkspace
          mandateKeyOrId={mandateKey}
          host="admin-route"
          routeHeader={(data, actions) => (
            <CrumbTrailHeader
              backHref="/administration/mandates"
              trail={[
                { label: "Administration", href: "/administration" },
                { label: "Mandates", href: "/administration/mandates" },
                {
                  label:
                    data.mandate.label?.trim() || "Display name unavailable",
                },
              ]}
              right={actions}
            />
          )}
          adminActions={(data, refresh) => (
            <div className="flex flex-wrap items-center gap-2">
              {data.mandate.organization_id !== SYSTEM_ORGANIZATION_ID ? (
                <PromoteToSystemMandateButton
                  mandate={data.mandate}
                  onPromoted={refresh}
                />
              ) : null}
              <RemoveMandate mandate={data.mandate} />
            </div>
          )}
          adminContent={(activeTab) => (
            <AdminControls mandateKey={mandateKey} activeTab={activeTab} />
          )}
        />
      </div>
    </SurfaceRuntimeProvider>
  );
}

/**
 * THE ADMIN'S OWN TOOLS, ON THE SURFACE — not behind a disclosure.
 *
 * 🚨 Arman, 2026-09-08: *"it's missing the actual things I need."* The health
 * verdict and its fix, pin editing, the test bench, promote and remove were all
 * here — inside a collapsed "Admin controls" fold, under a page whose visible
 * half was a ladder about the reader. On a page that exists to manage what the
 * platform assigns, these ARE the page. The fold is gone and the data loads
 * with the page: an admin who opened `/administration/mandates/<key>` has
 * already said what they came for.
 */
function AdminControls({
  mandateKey,
  activeTab,
}: {
  mandateKey: string;
  activeTab: MandateWorkspaceTab;
}) {
  const dispatch = useAppDispatch();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const lineageIndex = useAppSelector(selectAgentLineageIndex);
  // "Bind an agent to this job" used to open a fold, because the rebind editor
  // lived in it. It no longer does: the one binding UI is a section of the
  // workspace above, and it listens for `matrx:open-mandate-pin` itself. This
  // panel keeps only the depth the console owns.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<MandateConsoleData | null>(null);
  const [codeTruthByKey, setCodeTruthByKey] = useState<
    Record<string, MandateCodeTruth>
  >({});
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * 🚨 THE OUTPUT HALF OF THE CONTRACT, READ FOR THIS ONE MANDATE (walk of
   * v0.4.1720). Without it `buildRow` reported `ok` and this panel printed
   * "Healthy" three inches under the system answer's red "the assignment fails
   * at run time" — one screen, two verdicts about one holder. `null` means
   * UNREAD, so the verdict stays exactly what it was rather than becoming a
   * guess.
   */
  const [outputSchemas, setOutputSchemas] = useState<Record<
    string,
    unknown
  > | null>(null);

  const load = useCallback(() => {
    fetchMandateConsoleData({ mandateKeys: [mandateKey] })
      .then((next) => {
        // The segment also accepts a row uuid, which is not a mandate_key —
        // fall back to the unscoped read rather than showing an empty panel.
        if (next.mandates.length === 0) return fetchMandateConsoleData();
        return next;
      })
      .then((next) => {
        setData(next);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        // LOUD: an unreadable mandate is a failure, never an empty section.
        console.error("[admin-mandate] load failed", err);
        setLoadError(
          err instanceof Error ? err.message : "Could not load this mandate.",
        );
      });
  }, [mandateKey]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    load();
    dispatch(fetchAgentsListFull());
  }, [dispatch, isSuperAdmin, load]);

  // Any mandate write anywhere refreshes this — the same bus the console and
  // the window subscribe to, so a rebind made elsewhere never leaves a stale pin.
  useEffect(() => onMandateCacheInvalidated(() => load()), [load]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    fetchMandateCodeTruthReport(dispatch)
      .then((report) => {
        if (cancelled) return;
        setCodeTruthByKey(
          Object.fromEntries(report.mandates.map((m) => [m.mandate_key, m])),
        );
      })
      .catch((err: unknown) => {
        console.warn("[admin-mandate] code truth unavailable", err);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, isSuperAdmin]);

  // The holder behind this ONE mandate's own default, read by id. Derived from
  // the loaded row rather than from a second lookup, and re-read whenever the
  // holder moves.
  const holderAgentId = useMemo(() => {
    if (!data) return null;
    const mandate =
      data.mandates.find((m) => m.mandate_key === mandateKey) ??
      data.mandates.find((m) => m.id === mandateKey) ??
      null;
    if (!mandate) return null;
    return buildRow(mandate, data).agentId;
  }, [data, mandateKey]);

  useEffect(() => {
    if (!holderAgentId) return;
    let cancelled = false;
    void fetchAgentOutputSchemas([holderAgentId]).then((byId) => {
      // An agent absent from the answer is UNREADABLE, not schema-less — and
      // `buildRow` only judges ids the map actually contains, so an unreadable
      // holder keeps its existing verdict instead of gaining a false one.
      if (!cancelled) setOutputSchemas(byId);
    });
    return () => {
      cancelled = true;
    };
  }, [holderAgentId]);

  const row = useMemo<MandateRow | null>(() => {
    if (!data) return null;
    const mandate =
      data.mandates.find((m) => m.mandate_key === mandateKey) ??
      data.mandates.find((m) => m.id === mandateKey) ??
      null;
    if (!mandate) return null;
    return buildRow(
      mandate,
      data,
      codeTruthByKey[mandate.mandate_key],
      outputSchemas ?? undefined,
    );
  }, [codeTruthByKey, data, mandateKey, outputSchemas]);

  if (!isSuperAdmin) return null;

  const visible =
    activeTab === "source" ||
    activeTab === "diagnostics" ||
    activeTab === "test" ||
    activeTab === "permissions";
  const section =
    activeTab === "test" ||
    activeTab === "permissions" ||
    activeTab === "source"
      ? activeTab
      : "diagnostics";
  return (
    <div
      ref={panelRef}
      role={activeTab === "permissions" ? undefined : "tabpanel"}
      id={
        visible && activeTab !== "permissions"
          ? `mandate-panel-${activeTab}`
          : undefined
      }
      aria-labelledby={`mandate-tab-${activeTab}`}
      hidden={!visible}
      className={visible ? "mt-4" : "hidden"}
    >
      {loadError ? (
        <div role="alert" className="text-sm text-destructive">
          {loadError}
          <Button variant="outline" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      ) : !data ? (
        <div
          className="h-32 animate-pulse rounded-lg bg-muted"
          aria-label="Reading administration details"
        />
      ) : !row ? (
        <p className="text-sm text-destructive">Mandate unavailable</p>
      ) : (
        <MandateDetailView
          key={row.id}
          row={row}
          data={data}
          showGoal={false}
          showHolderAnswer={false}
          section={section}
          lineage={
            (row.agentId ? lineageIndex[row.agentId] : undefined) ?? {
              parent: null,
              children: [],
              systemTwin: null,
            }
          }
          onSaved={load}
        />
      )}
    </div>
  );
}

/**
 * The job's own REMOVE control. Destructive, confirmed with the consequence
 * rather than "are you sure?", and honest about what survives — the same
 * `softDeleteMandate` the console's row menu calls, so the two can never
 * disagree about what removing a job does.
 */
function RemoveMandate({
  mandate,
}: {
  mandate: MandateWorkspaceData["mandate"];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${mandate.label?.trim() || "this mandate"}?`,
      description:
        `This mandate will disappear from pickers and stop resolving. ` +
        `Anything bound to it — every rung's holder and mapping — stops applying with it. ` +
        `This is a soft removal: the record and its history are kept, so an admin can restore it if this was a mistake.`,
      confirmLabel: "Remove it",
      cancelLabel: "Keep it",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await softDeleteMandate(mandate.id);
      toast.success("Mandate removed.");
      // The page it was on describes a job that no longer exists; go back to
      // the list rather than leaving a screen about a removed thing.
      pushAppHref(router, "/administration/mandates");
    } catch (error: unknown) {
      // The service's own sentence (RLS refusal, already removed) reaches the
      // person; nothing is invented here.
      toast.error(
        error instanceof Error ? error.message : "That job was not removed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="h-7 w-7 shrink-0 gap-1.5 p-0 text-[12px] sm:w-auto sm:px-2"
        aria-label={busy ? "Removing mandate" : "Remove mandate"}
        disabled={busy}
        onClick={() => void remove()}
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only">
          {busy ? "Removing…" : "Remove"}
        </span>
      </Button>
      {/* THE CONSEQUENCE, BESIDE THE BUTTON — not only inside the dialog.
          `816ea88701` compacted this to "Stops this mandate from resolving",
          which drops the two facts that make the control safe to press: what
          else stops working, and that it is reversible. */}
      <FieldHelp label="Remove mandate">
        Stops every rung from finding it. Soft — the record is kept and an admin
        can restore it.
      </FieldHelp>
    </div>
  );
}
