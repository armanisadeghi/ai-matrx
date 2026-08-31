"use client";

// features/mandates/admin/AdminMandateWorkspacePage.tsx
//
// ONE MANDATE UI, ADMIN DOOR (Arman, 2026-08-29: "what's the point of testing
// this UI when they're not the same?").
//
// The admin console's row click used to open its own drawer — a second, older
// mandate detail implementation that diverged from the rebuilt experience on
// /mandates/[key]. It now lands here, and here renders THE SAME
// `MandateWorkspace` the (core) route and the window panel render: the triad
// (INPUT → GOAL → OUTPUT, goal editable), RUN THIS JOB, fulfillment, override,
// notes. Zero divergent detail implementations — this file is a SHELL.
//
// What the admin shell adds and the (core) route does not: the operational
// depth the console owns — health verdict and its fix, pin editing, rebind,
// the test bench, per-principal bindings — kept in ONE collapsed section below
// the workspace, rendered by the SAME `MandateDetailView` the drawer used.
// It is no longer the first thing an admin sees, and it is no longer a drawer.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Loader2, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentLineageIndex } from "@/features/agents/redux/agent-definition/selectors";
import { MandateWorkspace } from "@/features/mandates/workspace/MandateWorkspace";
import { onMandateCacheInvalidated } from "@/features/mandates/service";
import { buildRow, type MandateRow } from "./mandate-health";
import { MandateDetailView } from "./MandateDetailPanel";
import {
  fetchMandateCodeTruthReport,
  fetchMandateConsoleData,
  type MandateCodeTruth,
  type MandateConsoleData,
} from "./service";

export interface AdminMandateWorkspacePageProps {
  /** Mandate key ("podcast.multihost_script") or the row uuid — both open. */
  mandateKey: string;
}

export function AdminMandateWorkspacePage({
  mandateKey,
}: AdminMandateWorkspacePageProps) {
  return (
    <div className="h-[calc(100dvh-2.5rem)] overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 pt-3 sm:px-6">
        <Link
          href="/administration/mandates"
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All mandates
        </Link>
      </div>
      {/* THE ONE workspace — identical to /mandates/[key]. */}
      <MandateWorkspace mandateKeyOrId={mandateKey} host="admin-route" />
      <AdminControls mandateKey={mandateKey} />
    </div>
  );
}

/**
 * The console's operational depth, collapsed. Loads only this mandate's row
 * (`fetchMandateConsoleData({ mandateKeys })`), and only once opened — an
 * admin reading the triad pays for nothing.
 */
function AdminControls({ mandateKey }: { mandateKey: string }) {
  const dispatch = useAppDispatch();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const lineageIndex = useAppSelector(selectAgentLineageIndex);

  const [open, setOpen] = useState(false);
  // "Bind an agent to this job" used to open THIS fold, because the rebind
  // editor lived in it. It no longer does: the one binding UI is a section of
  // the workspace above, and it listens for `matrx:open-mandate-pin` itself.
  // This panel keeps only the depth the console owns.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<MandateConsoleData | null>(null);
  const [codeTruthByKey, setCodeTruthByKey] = useState<
    Record<string, MandateCodeTruth>
  >({});
  const [loadError, setLoadError] = useState<string | null>(null);

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
    if (!open || !isSuperAdmin) return;
    load();
    dispatch(fetchAgentsListFull());
  }, [dispatch, isSuperAdmin, load, open]);

  // Any mandate write anywhere refreshes this — the same bus the console and
  // the window subscribe to, so a rebind made elsewhere never leaves a stale pin.
  useEffect(() => {
    if (!open) return;
    return onMandateCacheInvalidated(() => load());
  }, [load, open]);

  useEffect(() => {
    if (!open || !isSuperAdmin) return;
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
  }, [dispatch, isSuperAdmin, open]);

  const row = useMemo<MandateRow | null>(() => {
    if (!data) return null;
    const mandate =
      data.mandates.find((m) => m.mandate_key === mandateKey) ??
      data.mandates.find((m) => m.id === mandateKey) ??
      null;
    if (!mandate) return null;
    return buildRow(mandate, data, codeTruthByKey[mandate.mandate_key]);
  }, [codeTruthByKey, data, mandateKey]);

  if (!isSuperAdmin) return null;

  return (
    <div ref={panelRef} className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6">
      <div className="rounded-xl border border-border/60 bg-card">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
        >
          <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="flex-1 text-[13px] font-medium text-foreground">
            Admin controls
          </span>
          <span className="text-[11.5px] text-muted-foreground">
            Health, pin, rebind, test bench, bindings
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        {open ? (
          <div className="border-t border-border/40 p-4">
            {loadError ? (
              <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {loadError}
              </p>
            ) : !data ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            ) : !row ? (
              <p className="text-xs text-muted-foreground">
                No mandate row matches {mandateKey}.
              </p>
            ) : (
              <MandateDetailView
                key={row.id}
                row={row}
                data={data}
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
        ) : null}
      </div>
    </div>
  );
}
