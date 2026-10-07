"use client";

// features/mandates/record-next/RecordAdminPanels.tsx
//
// The admin-only tab bodies of the NEW mandate record (Test, Access's context
// gate, Usage, Health) — a COPY of `AdminControls` in
// the original admin mandate page (since removed).
//
// WHAT THESE BODIES ARE (register item 5, "two systems mixed"): each is a
// `section` of the OLD console drawer, `MandateDetailView`
// (features/mandates/admin/MandateDetailPanel.tsx), mounted unchanged:
//   test         → `MandateTestBench`: saved test cases, pinned vs latest
//                  comparison, run-now.
//   permissions  → `MandateContextGate`: the job's context gate and required
//                  context policies (shown under the binding's own Access panel).
//   source       → `MandateSourceUsage`: where the job is declared in code and
//                  every place that calls it.
//   diagnostics  → code-vs-agent facts (code inputs, agent variables, user text,
//                  contract check, variable flow) + the drift banner when the
//                  code and the agent disagree.
// Here they sit INSIDE this page's own tabs — no graft beneath a second tab
// system — so nothing is lost while the owner decides their future.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { onMandateCacheInvalidated } from "@ai-matrx/chat/mandates/service";
import { fetchAgentOutputSchemas } from "@ai-matrx/chat/mandates/output-contract";
import { buildRow, type MandateRow } from "@/features/mandates/admin/mandate-health";
import { MandateDetailView } from "@/features/mandates/admin/MandateDetailPanel";
import {
  fetchMandateCodeTruthReport,
  fetchMandateConsoleData,
  type MandateCodeTruth,
  type MandateCodeTruthReport,
  type MandateConsoleData,
} from "@/features/mandates/admin/service";
import type { AppDispatch } from "@/lib/redux/store";
import { readMandateAddress } from "@/features/mandates/mandate-address";
import type { RecordTabId } from "./record-tabs";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { MandateHealthSummary } from "./MandateHealthSummary";
import { usePathname } from "next/navigation";
import { isAdminLanePath } from "@/utils/supabase/adminLane";
import { MandateRunHistory } from "@/features/mandates/run-history/MandateRunHistory";
import { storedMandateKey, type AnyMandateKey } from "@ai-matrx/agents/mandates";
import { useAgentLineageIndex } from "@ai-matrx/chat/agents/identity/agent-catalog-lists";
import { ensureAgentCatalog } from "@ai-matrx/chat/agents/identity/agent-identity";

type AdminSection = "test" | "permissions" | "source" | "diagnostics";

export function adminSectionOf(tab: RecordTabId): AdminSection | null {
  return tab === "test" ||
    tab === "permissions" ||
    tab === "source" ||
    tab === "diagnostics"
    ? tab
    : null;
}

/**
 * The code-truth report is one registry-wide read. The window switches mandates
 * constantly; one read per page life is enough, and a failure is retried on the
 * next mount rather than cached.
 */
let codeTruthRead: Promise<MandateCodeTruthReport> | null = null;
function readCodeTruthOnce(
  dispatch: AppDispatch,
): Promise<MandateCodeTruthReport> {
  if (!codeTruthRead) {
    codeTruthRead = fetchMandateCodeTruthReport(dispatch).catch(
      (err: unknown) => {
        codeTruthRead = null;
        throw err;
      },
    );
  }
  return codeTruthRead;
}

export function RecordAdminPanels({
  mandateKey,
  activeTab,
  enabled = false,
}: {
  mandateKey: AnyMandateKey;
  activeTab: RecordTabId;
  /** Super admin, or the "mandate.system-seat" holder on a system mandate. */
  enabled?: boolean;
}) {
  const dispatch = useAppDispatch();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin) || enabled;
  const lineageIndex = useAgentLineageIndex();
  const [data, setData] = useState<MandateConsoleData | null>(null);
  const [codeTruthByKey, setCodeTruthByKey] = useState<
    Record<string, MandateCodeTruth>
  >({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [codeTruthFailed, setCodeTruthFailed] = useState(false);
  const [outputSchemas, setOutputSchemas] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [schemasFailed, setSchemasFailed] = useState(false);
  // Read nothing until an admin tab is actually opened: the window switches
  // mandates constantly, and most switches never visit Test/Access/Usage/Health.
  // Once opened, the data stays for this mandate (the host keys this panel to
  // the mandate), so moving between tabs never re-reads it.
  const section = adminSectionOf(activeTab);
  // The admin section reads every run on the platform; the same panel opened
  // in the window on a user page is an ordinary person's seat (the admin lane
  // is closed there), so it shows that person's own runs.
  const onAdminSeat = isAdminLanePath(usePathname() ?? "");
  const [opened, setOpened] = useState(false);
  if (isSuperAdmin && section !== null && !opened) setOpened(true);
  const wanted = opened;

  const load = useCallback(() => {
    fetchMandateConsoleData({ mandateKeys: [mandateKey] })
      .then((next) =>
        // The address may be a row uuid rather than a key — only then is the
        // whole registry read to find it (never for a key that simply is not
        // there).
        next.mandates.length === 0 && readMandateAddress(mandateKey) === "id"
          ? fetchMandateConsoleData()
          : next,
      )
      .then((next) => {
        setData(next);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        console.error("[mandate-record-next] admin load failed", err);
        setLoadError("The admin details could not be read.");
      });
  }, [mandateKey]);

  useEffect(() => {
    if (!wanted) return;
    load();
    ensureAgentCatalog();
  }, [dispatch, wanted, load]);

  useEffect(() => {
    if (!wanted) return;
    return onMandateCacheInvalidated(() => load());
  }, [wanted, load]);

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    readCodeTruthOnce(dispatch)
      .then((report) => {
        if (cancelled) return;
        setCodeTruthByKey(
          Object.fromEntries(report.mandates.map((m) => [m.mandate_key, m])),
        );
        setCodeTruthFailed(false);
      })
      .catch((err: unknown) => {
        console.warn("[mandate-record-next] code truth unavailable", err);
        if (!cancelled) setCodeTruthFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, wanted]);

  const mandate = useMemo(() => {
    if (!data) return null;
    return (
      data.mandates.find((m) => m.mandate_key === mandateKey) ??
      data.mandates.find((m) => m.id === mandateKey) ??
      null
    );
  }, [data, mandateKey]);

  const holderAgentId = useMemo(
    () => (mandate && data ? buildRow(mandate, data).agentId : null),
    [data, mandate],
  );

  useEffect(() => {
    if (!holderAgentId) return;
    let cancelled = false;
    setSchemasFailed(false);
    fetchAgentOutputSchemas([holderAgentId])
      .then((byId) => {
        if (!cancelled) setOutputSchemas(byId);
      })
      .catch((err: unknown) => {
        // The panels still render; the contract check says it was not read.
        console.warn("[mandate-record-next] output schemas unavailable", err);
        if (!cancelled) setSchemasFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [holderAgentId]);

  const row = useMemo<MandateRow | null>(() => {
    if (!data || !mandate) return null;
    return buildRow(
      mandate,
      data,
      codeTruthByKey[mandate.mandate_key],
      outputSchemas ?? undefined,
    );
  }, [codeTruthByKey, data, mandate, outputSchemas]);

  if (!isSuperAdmin) return null;

  return (
    <div hidden={!section} className={section ? "mt-3" : "hidden"}>
      {/* Health opens on the verdict — open problems against THIS job, or
          "No open problems" — before the code diagnostics below it. */}
      {section === "diagnostics" ? (
        <div className="mb-3">
          {/* key-is-the-subject: a key handed to the health summary's key prop, never rendered as a name */}
          <MandateHealthSummary mandateKey={(mandate ? storedMandateKey(mandate.mandate_key) : undefined) ?? mandateKey} />
        </div>
      ) : null}
      {/* RUN HISTORY — inside Health (the ten tabs are protected; no new tab
          on the admin route). Every run across the platform, filterable by
          organization or person, with no personal lane. */}
      {section === "diagnostics" ? (
        <MandateRunHistory
          mandateKey={(mandate ? storedMandateKey(mandate.mandate_key) : undefined) ?? mandateKey} // key-is-the-subject: a prop handed to the run-history query, never rendered as a name
          view={onAdminSeat ? "platform" : "mine"}
          audience={onAdminSeat ? "admin" : "product"}
          className="mb-4"
        />
      ) : null}
      {loadError ? (
        <div role="alert" className="flex items-center gap-2 type-body text-destructive">
          {loadError}
          <Button variant="outline" onClick={load}>
            Retry
          </Button>
          <ErrorAlchemyMenu className="ml-auto" />
        </div>
      ) : !data ? (
        <div
          className="h-24 animate-pulse rounded-lg bg-muted"
          aria-label="Reading administration details"
        />
      ) : !row ? (
        <p className="type-body text-destructive">Mandate unavailable</p>
      ) : (
        <>
        {codeTruthFailed ? (
          <p className="mb-2 type-secondary text-muted-foreground">
            What the code declares for this job could not be read, so the code
            diagnostics below are incomplete.
            <ErrorAlchemyMenu />
          </p>
        ) : null}
        {schemasFailed ? (
          <p className="mb-2 type-secondary text-muted-foreground">
            The agent&apos;s output contract could not be read, so the contract
            check below is incomplete.
            <ErrorAlchemyMenu />
          </p>
        ) : null}
        <MandateDetailView
          key={row.id}
          row={row}
          data={data}
          showGoal={false}
          showHolderAnswer={false}
          section={section ?? "diagnostics"}
          lineage={
            (row.agentId ? lineageIndex[row.agentId] : undefined) ?? {
              parent: null,
              children: [],
              systemTwin: null,
            }
          }
          onSaved={load}
        />
        </>
      )}
    </div>
  );
}
