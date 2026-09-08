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
import { MandateWorkspace } from "@/features/mandates/workspace/MandateWorkspace";
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
      <div className="h-[calc(100dvh-2.5rem)] overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pt-3 sm:px-6">
          <AppLink
            href="/administration/mandates"
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All mandates
          </AppLink>
        </div>
        {/* THE ONE workspace — identical to /mandates/[key]. */}
        <MandateWorkspace mandateKeyOrId={mandateKey} host="admin-route" />
        <AdminControls mandateKey={mandateKey} />
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
function AdminControls({ mandateKey }: { mandateKey: string }) {
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

  return (
    <div ref={panelRef} className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6">
      <div className="rounded-xl border border-border/60 bg-card">
        <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2.5">
          <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="flex-1 text-[13px] font-medium text-foreground">
            Platform tools
          </span>
          <span className="text-[11.5px] text-muted-foreground">
            Health, pin, test bench, promote, remove
          </span>
        </div>
        <div className="p-4">
            {loadError ? (
              <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {loadError}
              </p>
            ) : !data ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            ) : !row ? (
              // Same class as the workspace's own wrong-address state (V2-6):
              // say what the address IS, never imply a mandate that was.
              <p className="text-xs text-muted-foreground">
                {readMandateAddress(mandateKey) === "not-an-address"
                  ? notAnAddressFailure(mandateKey).message
                  : noSuchMandateFailure(mandateKey).message}
              </p>
            ) : (
              <>
                <MandateDetailView
                  key={row.id}
                  row={row}
                  data={data}
                  // The workspace above renders the triad (INPUT → GOAL →
                  // OUTPUT), so a second goal block here is a duplicate — and
                  // its org-admitted read printed a refusal about choosing an
                  // organization on the platform's own page.
                  showGoal={false}
                  // 🚨 ONE HOLDER ANSWER PER SCREEN (FIX-R9-UI round 2). The
                  // Holder section above IS this page's answer — three controls
                  // and one verdict. This panel used to render a second one:
                  // an Agent fact, a Version fact, the same defect sentence and
                  // an "Assign a different holder" button. What it keeps is the
                  // health no holder control can state — the code declaration
                  // against the stored contract.
                  showHolderAnswer={false}
                  lineage={
                    (row.agentId ? lineageIndex[row.agentId] : undefined) ?? {
                      parent: null,
                      children: [],
                      systemTwin: null,
                    }
                  }
                  onSaved={load}
                />
                {/* 🚨 REMOVE — A VISIBLE CONTROL, not only a right-click item
                    (walk, 2026-08-31). The delete first shipped ONLY into the
                    console's context menu, and an independent walk could not
                    find it anywhere on the live surface: a right-click-only
                    affordance is invisible, and "it is in the context menu" is
                    not an answer to "a creator can never remove a job". This
                    is the discoverable one, on the job's own page, where
                    someone who wants it gone will actually look. */}
                {/* PROMOTE THE JOB. `MandateDetailView` above already offers
                    the AGENT promotion ("Create system twin + rebind"); this
                    is its sibling for the MANDATE — the job's own home is its
                    scope (D-R3), so an agent twin alone still leaves the job
                    deciding for one organization. Super-admin gated inside,
                    and the door's own refusal is what prints. */}
                <PromoteToSystemMandateButton mandate={row.mandate} onPromoted={load} />
                <RemoveMandate row={row} />
              </>
            )}
        </div>
      </div>
    </div>
  );
}

/**
 * The job's own REMOVE control. Destructive, confirmed with the consequence
 * rather than "are you sure?", and honest about what survives — the same
 * `softDeleteMandate` the console's row menu calls, so the two can never
 * disagree about what removing a job does.
 */
function RemoveMandate({ row }: { row: MandateRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    const ok = await confirm({
      title: `Remove "${row.mandateKey}"?`,
      description:
        `Everywhere that runs this job stops finding it: the console, the pickers, and any call that names the key "${row.mandateKey}" will report it missing. ` +
        `Anything bound to it — every rung's holder and mapping — stops applying with it. ` +
        `This is a soft removal: the record and its history are kept, so an admin can restore it if this was a mistake.`,
      confirmLabel: "Remove it",
      cancelLabel: "Keep it",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await softDeleteMandate(row.id);
      toast.success(`Removed "${row.mandateKey}" — nothing runs it now.`);
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
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="h-7 gap-1.5 text-[12px]"
        disabled={busy}
        onClick={() => void remove()}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {busy ? "Removing…" : "Remove this job"}
      </Button>
      <span className="text-[11px] leading-snug text-muted-foreground">
        Stops every rung from finding it. Soft — the record is kept and an admin
        can restore it.
      </span>
    </div>
  );
}
