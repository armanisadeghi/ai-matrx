// features/mandates/admin-list/store.ts
//
// THE ONE LOAD behind the admin mandate list preview.
//
// The list needs facts no single door carries — the console's health rows,
// the live code declarations, coverage, goals, shortcut/surface/app links,
// organization names and the impact grades — for the platform's ~800 rows. So
// it loads the whole authorized corpus ONCE per page visit into this module
// store and the entity-list service pages, sorts, filters and counts it in
// memory (./service.ts). Two phases: everything the columns and filters need
// first; the impact grades (the slowest read) second, bumping `version` so
// the shell re-asks and the Grade/Blocker cells fill in.
//
// A failed source is recorded in `failures` and its cells read as unknown —
// never as "none".

import type { AppDispatch } from "@/lib/redux/store";
import { supabase } from "@/utils/supabase/client";
import {
  fetchMandateCodeTruthReport,
  fetchMandateConsoleData,
  type MandateCodeTruth,
} from "@/features/mandates/admin/service";
import {
  fetchStandingImpact,
  type StandingImpact,
} from "@/features/mandates/admin/impact";
import { fetchMandateCatalogue } from "@/features/mandates/catalogue";
import { fetchMandateCoverage } from "@/features/mandates/coverage";
import { fetchProvisions } from "@/features/mandates/provisions";
import { ALL_HOMES } from "@/features/mandates/list-door";
import {
  agentHolderOfBinding,
  holderOfMandate,
} from "@/lib/supabase/mandateStorage";
import { fetchOrganizationNamesByIds } from "@/features/administration/kg-inspector/utils/organizationNames";
import {
  buildAdminRows,
  type MandateAdminSources,
  type MandateServeLink,
} from "./rows";
import type { MandateAdminRow } from "./types";

export interface MandateAdminListState {
  status: "idle" | "loading" | "ready" | "failed";
  rows: MandateAdminRow[];
  /** Provision key → offered value names, for the Inputs cell. */
  offersByProvision: Map<string, string[]>;
  /** Source name → its own error sentence. */
  failures: Record<string, string>;
  error: Error | null;
  /** Bumps on every change the list must re-ask for. */
  version: number;
}

let state: MandateAdminListState = {
  status: "idle",
  rows: [],
  offersByProvision: new Map(),
  failures: {},
  error: null,
  version: 0,
};
let inflight: Promise<MandateAdminRow[]> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function publish(next: Partial<MandateAdminListState>) {
  state = { ...state, ...next, version: state.version + 1 };
  for (const listener of listeners) listener();
}

export function subscribeMandateAdminList(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMandateAdminListState(): MandateAdminListState {
  return state;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchServeLinks(
  mandateIds: Map<string, string>,
): Promise<MandateServeLink[]> {
  const [shortcuts, roles, apps] = await Promise.all([
    supabase
      .schema("mandate")
      .from("vw_shortcut")
      .select("mandate_key, label, surface_name")
      .is("deleted_at", null)
      .not("mandate_key", "is", null),
    supabase
      .schema("ui")
      .from("ui_surface_agent_role")
      .select("mandate_key, surface_name, label")
      .not("mandate_key", "is", null),
    supabase
      .schema("app")
      .from("definition")
      .select("mandate_id, name")
      .is("deleted_at", null)
      .not("mandate_id", "is", null),
  ]);
  if (shortcuts.error) throw new Error(`Shortcuts: ${shortcuts.error.message}`);
  if (roles.error) throw new Error(`Surfaces: ${roles.error.message}`);
  if (apps.error) throw new Error(`Agent apps: ${apps.error.message}`);
  const links: MandateServeLink[] = [];
  for (const row of shortcuts.data ?? []) {
    if (!row.mandate_key) continue;
    links.push({
      mandateKey: row.mandate_key,
      kind: "Shortcut",
      detail: row.surface_name
        ? `${row.label ?? "Shortcut"} (${row.surface_name})`
        : (row.label ?? "Shortcut"),
    });
  }
  for (const row of roles.data ?? []) {
    if (!row.mandate_key) continue;
    links.push({
      mandateKey: row.mandate_key,
      kind: "Surface",
      detail: row.surface_name,
    });
  }
  for (const row of apps.data ?? []) {
    const key = row.mandate_id ? mandateIds.get(row.mandate_id) : undefined;
    if (!key) continue;
    links.push({ mandateKey: key, kind: "Agent app", detail: row.name });
  }
  return links;
}

async function loadAll(
  dispatch: AppDispatch,
  myGeneration: number,
): Promise<MandateAdminRow[]> {
  const consoleData = await fetchMandateConsoleData({ home: ALL_HOMES });
  const failures: Record<string, string> = {};

  const mandateIds = new Map(
    consoleData.mandates.map((m) => [m.id, m.mandate_key]),
  );
  const orgIds = new Set<string>();
  for (const mandate of consoleData.mandates) {
    if (mandate.organization_id) orgIds.add(mandate.organization_id);
  }
  for (const bindings of Object.values(consoleData.bindingsByMandateId)) {
    for (const binding of bindings) {
      if (binding.organization_id) orgIds.add(binding.organization_id);
    }
  }

  const [truth, coverage, catalogue, links, names] = await Promise.allSettled([
    fetchMandateCodeTruthReport(dispatch),
    fetchMandateCoverage(dispatch),
    fetchMandateCatalogue(dispatch),
    fetchServeLinks(mandateIds),
    fetchOrganizationNamesByIds([...orgIds]),
  ]);
  if (truth.status === "rejected") failures.codeTruth = describe(truth.reason);
  if (coverage.status === "rejected")
    failures.coverage = describe(coverage.reason);
  if (catalogue.status === "rejected")
    failures.catalogue = describe(catalogue.reason);
  if (links.status === "rejected") failures.serves = describe(links.reason);

  const sources: MandateAdminSources = {
    console: consoleData,
    codeTruth:
      truth.status === "fulfilled"
        ? Object.fromEntries(
            truth.value.mandates.map((s): [string, MandateCodeTruth] => [
              s.mandate_key,
              s,
            ]),
          )
        : null,
    coverage: coverage.status === "fulfilled" ? coverage.value : null,
    catalogue: catalogue.status === "fulfilled" ? catalogue.value : null,
    impact: null,
    impactFailed: false,
    serveLinks: links.status === "fulfilled" ? links.value : null,
    organizationNames: names.status === "fulfilled" ? names.value : {},
  };
  const rows = buildAdminRows(sources);
  if (myGeneration !== generation) return rows;
  publish({ status: "ready", rows, failures, error: null });

  // ── Phase two: impact grades + provision offers. ─────────────────────────
  const agentIds = new Set<string>();
  for (const mandate of consoleData.mandates) {
    const holder = holderOfMandate(mandate);
    const agentId =
      holder.holderType === "agent"
        ? (holder.holderId ??
          (holder.versionId
            ? consoleData.versionsById[holder.versionId]?.agentId
            : null))
        : null;
    if (agentId) agentIds.add(agentId);
    for (const binding of consoleData.bindingsByMandateId[mandate.id] ?? []) {
      const bh = agentHolderOfBinding(binding);
      const id =
        bh.holderId ??
        (bh.versionId ? consoleData.versionsById[bh.versionId]?.agentId : null);
      if (id) agentIds.add(id);
    }
  }
  const provisionKeys = [
    ...new Set(rows.map((r) => r.provisionKey).filter((k): k is string => !!k)),
  ];
  void fetchProvisions(provisionKeys)
    .then((offers) => {
      if (myGeneration !== generation) return;
      const next = new Map<string, string[]>();
      for (const [key, offer] of offers) {
        next.set(key, offer.values.map((value) => value.name));
      }
      publish({ offersByProvision: next });
    })
    .catch((error: unknown) => {
      if (myGeneration !== generation) return;
      publish({ failures: { ...state.failures, inputs: describe(error) } });
    });

  let impact: StandingImpact | null = null;
  let impactFailed = false;
  try {
    impact =
      agentIds.size > 0
        ? await fetchStandingImpact(dispatch, [...agentIds].sort())
        : null;
  } catch (error) {
    impactFailed = true;
    failures.impact = describe(error);
  }
  if (myGeneration !== generation) return rows;
  const graded = buildAdminRows({ ...sources, impact, impactFailed });
  publish({
    rows: graded,
    failures: { ...state.failures, ...failures },
  });
  return graded;
}

/**
 * The loaded rows, loading them if nobody has yet. The promise resolves after
 * PHASE ONE — the list renders then; phase two lands through `version`.
 */
export function ensureMandateAdminList(
  dispatch: AppDispatch,
): Promise<MandateAdminRow[]> {
  if (state.status === "ready") return Promise.resolve(state.rows);
  if (inflight) return inflight;
  const myGeneration = ++generation;
  publish({ status: "loading", error: null });
  inflight = new Promise<MandateAdminRow[]>((resolve, reject) => {
    let settled = false;
    const unsubscribe = subscribeMandateAdminList(() => {
      if (settled || myGeneration !== generation) return;
      if (state.status === "ready") {
        settled = true;
        unsubscribe();
        resolve(state.rows);
      }
    });
    loadAll(dispatch, myGeneration).catch((error: unknown) => {
      unsubscribe();
      inflight = null;
      if (myGeneration !== generation) return;
      const failure = error instanceof Error ? error : new Error(describe(error));
      publish({ status: "failed", error: failure });
      if (!settled) {
        settled = true;
        reject(failure);
      }
    });
  }).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Drop the loaded corpus; the next read loads it fresh. */
export function invalidateMandateAdminList(): void {
  generation += 1;
  inflight = null;
  publish({ status: "idle" });
}
