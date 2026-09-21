"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { ContentTransferMenu } from "@ai-matrx/alchemy/react";
import { directSource, normalizeTransferJson, type Json, type Source } from "@ai-matrx/alchemy/core";
import { contractOfMandate, goalOfMandate } from "@/lib/supabase/mandateStorage";
import { resolveMandateGoal } from "../goal";
import { parseDraftInputs } from "../authoring/service";
import type { MandateWorkspaceData } from "./useMandateWorkspaceData";
import type { MandateWorkspaceTab, WorkspacePerspective } from "./MandateWorkspace";
import { outputConstraintsOf } from "./TriadSections";

export type MandateAlchemyCapture =
  | { status: "ready"; data: Json; savedOnly?: boolean }
  | { status: "loading" }
  | { status: "error"; message: string };

type CaptureRegistry = Map<MandateWorkspaceTab, MandateAlchemyCapture>;
const CaptureContext = createContext<CaptureRegistry | null>(null);

export function MandateAlchemyCaptureProvider({ children }: { children: ReactNode }) {
  const registry = useRef<CaptureRegistry>(new Map());
  return <CaptureContext.Provider value={registry.current}>{children}</CaptureContext.Provider>;
}

/** A tab owns its asynchronous data and reports exactly whether it can be exported. */
export function useMandateAlchemyTabCapture(tab: MandateWorkspaceTab, capture: MandateAlchemyCapture): void {
  const registry = useContext(CaptureContext);
  useEffect(() => {
    if (!registry) return;
    registry.set(tab, capture);
    return () => { registry.delete(tab); };
  }, [capture, registry, tab]);
}

function scopeLabel(perspective: WorkspacePerspective, organizationName: string | null): string {
  if (perspective === "system") return "System";
  if (perspective === "organization") return organizationName ?? "Organization";
  return "Personal";
}

function definitionCore(data: MandateWorkspaceData, perspective: WorkspacePerspective, organizationName: string | null): Json {
  const definition = contractOfMandate(data.mandate) as Record<string, unknown>;
  const goal = resolveMandateGoal({ stored: goalOfMandate(data.mandate) }).goal ?? "";
  const provision = data.offer
    ? data.offer.values.map((value) => ({
        name: value.name,
        description: value.description ?? "",
        kind: value.kind ?? null,
        guaranteed: value.guaranteed,
        lazy: value.lazy,
        example: value.example ?? null,
      }))
    : parseDraftInputs((data.mandate as { draft_inputs?: unknown }).draft_inputs).map((value) => ({
        name: value.name ?? "",
        description: value.description ?? "",
        kind: value.kind ?? null,
        required: value.required ?? null,
      }));
  return {
    scope: scopeLabel(perspective, organizationName),
    feature: data.mandate.mandate_key.split(".")[0] ?? data.mandate.mandate_key,
    enabled: data.mandate.is_enabled ?? null,
    goal,
    provision: normalizeTransferJson(provision),
    human_input: definition.accepts_user_input === true,
    output: {
      format: data.mandate.output_kind ?? null,
      required_fields: data.contract.requiredOutputKeys,
      constraints: outputConstraintsOf(data.mandate),
    },
  };
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

function xml(value: Json, tag: string): string {
  if (value === null) return `<${tag} null="true"/>`;
  if (Array.isArray(value)) return `<${tag}>${value.map((item) => xml(item, "item")).join("")}</${tag}>`;
  if (typeof value === "object") return `<${tag}>${Object.entries(value).map(([key, item]) => xml(item, key)).join("")}</${tag}>`;
  return `<${tag}>${escapeXml(String(value))}</${tag}>`;
}

function source(id: string, label: string, getPayload: () => Json | string): Source {
  return {
    id,
    label,
    capture: async ({ signal }) => {
      signal.throwIfAborted();
      const payload = getPayload();
      return directSource(typeof payload === "string" ? { kind: "text", text: payload } : { kind: "json", value: payload }, { id, sourceId: id, revision: JSON.stringify(payload), label });
    },
  };
}

export function MandateAlchemy({
  data, activeTab, tabs, perspective, organizationName, buildTab,
}: {
  data: MandateWorkspaceData;
  activeTab: MandateWorkspaceTab;
  tabs: readonly MandateWorkspaceTab[];
  perspective: WorkspacePerspective;
  organizationName: string | null;
  buildTab: (tab: MandateWorkspaceTab) => MandateAlchemyCapture;
}) {
  const registry = useContext(CaptureContext);
  const core = definitionCore(data, perspective, organizationName);
  const current = () => {
    const captured = registry?.get(activeTab) ?? buildTab(activeTab);
    if (captured.status === "loading") throw new Error(`${activeTab} is still loading. Wait for it to finish before exporting.`);
    if (captured.status === "error") throw new Error(`${activeTab} cannot be exported: ${captured.message}`);
    return { tab: activeTab, saved_only: captured.savedOnly === true, data: captured.data } as Json;
  };
  const all = () => {
    const entries = tabs.map((tab) => [tab, registry?.get(tab) ?? buildTab(tab)] as const);
    const blocked = entries.find(([, captured]) => captured.status !== "ready");
    if (blocked) throw new Error(`${blocked[0]} is ${blocked[1].status === "loading" ? "still loading" : "unavailable"}; all tabs cannot be exported yet.`);
    return { tabs: Object.fromEntries(entries.map(([tab, captured]) => [tab, (captured as Extract<MandateAlchemyCapture, { status: "ready" }>).data])) } as Json;
  };
  const key = data.mandate.mandate_key;
  return <div className="ml-auto flex items-center gap-1">
    <ContentTransferMenu label="Current tab" triggerVariant="transparent" triggerSize="compact" source={source(`mandate:${key}:tab:${activeTab}`, "Current mandate tab", current)} variants={[{ id: "all-tabs", label: "All tabs", source: source(`mandate:${key}:all-tabs`, "All mandate tabs", all) }]} />
    <ContentTransferMenu label="Core" triggerVariant="transparent" triggerSize="compact" source={source(`mandate:${key}:core-json`, "Mandate definition core (JSON)", () => core)} variants={[{ id: "core-xml", label: "Core XML", source: source(`mandate:${key}:core-xml`, "Mandate definition core (XML)", () => xml(core, "mandate")) }]} />
  </div>;
}
