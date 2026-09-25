"use client";

// features/mandates/record-next/RecordAdminPanels.tsx
//
// The admin-only tab bodies of the NEW mandate record (Test, Access's context
// gate, Usage, Health) — a COPY of `AdminControls` in
// features/mandates/admin/AdminMandateWorkspacePage.tsx, which stays untouched.
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
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentLineageIndex } from "@/features/agents/redux/agent-definition/selectors";
import { onMandateCacheInvalidated } from "@/features/mandates/service";
import { fetchAgentOutputSchemas } from "@/features/mandates/output-contract";
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
import type { RecordTabId } from "./record-tabs";

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
}: {
  mandateKey: string;
  activeTab: RecordTabId;
}) {
  const dispatch = useAppDispatch();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const lineageIndex = useAppSelector(selectAgentLineageIndex);
  const [data, setData] = useState<MandateConsoleData | null>(null);
  const [codeTruthByKey, setCodeTruthByKey] = useState<
    Record<string, MandateCodeTruth>
  >({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [outputSchemas, setOutputSchemas] = useState<Record<
    string,
    unknown
  > | null>(null);

  const load = useCallback(() => {
    fetchMandateConsoleData({ mandateKeys: [mandateKey] })
      .then((next) =>
        // The address may be a row uuid rather than a key — same fallback as
        // the original: read unscoped rather than show an empty panel.
        next.mandates.length === 0 ? fetchMandateConsoleData() : next,
      )
      .then((next) => {
        setData(next);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        console.error("[mandate-record-next] admin load failed", err);
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

  useEffect(() => onMandateCacheInvalidated(() => load()), [load]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    readCodeTruthOnce(dispatch)
      .then((report) => {
        if (cancelled) return;
        setCodeTruthByKey(
          Object.fromEntries(report.mandates.map((m) => [m.mandate_key, m])),
        );
      })
      .catch((err: unknown) => {
        console.warn("[mandate-record-next] code truth unavailable", err);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, isSuperAdmin]);

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
    void fetchAgentOutputSchemas([holderAgentId]).then((byId) => {
      if (!cancelled) setOutputSchemas(byId);
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
  const section = adminSectionOf(activeTab);

  return (
    <div hidden={!section} className={section ? "mt-3" : "hidden"}>
      {loadError ? (
        <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
          {loadError}
          <Button variant="outline" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      ) : !data ? (
        <div
          className="h-24 animate-pulse rounded-lg bg-muted"
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
      )}
    </div>
  );
}
