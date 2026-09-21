"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { ContentTransferMenu } from "@ai-matrx/alchemy/react";
import { directSource, normalizeTransferJson, type Json, type Source } from "@ai-matrx/alchemy/core";
import { contractOfMandate, goalOfMandate } from "@/lib/supabase/mandateStorage";
import { resolveMandateGoal } from "../goal";
import { parseDraftInputs } from "../authoring/service";
import type { MandateWorkspaceData } from "./useMandateWorkspaceData";
import type { MandateWorkspaceTab, WorkspacePerspective } from "./MandateWorkspace";
import { outputConstraintsOf } from "./definition-output";

export type MandateAlchemyCapture =
  | { status: "ready"; data: Json; savedOnly?: boolean }
  | { status: "loading" }
  | { status: "error"; message: string };

type CaptureRegistry = Map<string, MandateAlchemyCapture>;
const CaptureContext = createContext<CaptureRegistry | null>(null);

export function MandateAlchemyCaptureProvider({ children }: { children: ReactNode }) {
  const registry = useRef<CaptureRegistry>(new Map());
  return <CaptureContext.Provider value={registry.current}>{children}</CaptureContext.Provider>;
}

/** A tab owns its asynchronous data and reports exactly whether it can be exported. */
export function useMandateAlchemyTabCapture(tab: MandateWorkspaceTab, capture: MandateAlchemyCapture, partId = "main"): void {
  const registry = useContext(CaptureContext);
  useEffect(() => {
    if (!registry) return;
    const key = `${tab}:${partId}`;
    registry.set(key, capture);
    return () => { registry.delete(key); };
  }, [capture, partId, registry, tab]);
}

function scopeLabel(perspective: WorkspacePerspective, organizationName: string | null): string {
  if (perspective === "system") return "System";
  if (perspective === "organization") return organizationName ?? "Organization";
  return "Personal";
}

export function buildMandateDefinitionCore(data: MandateWorkspaceData, perspective: WorkspacePerspective, organizationName: string | null): Json {
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
  const declaredProvision = provision.length > 0
    ? provision
    : data.contract.requiredVariables.map((name) => ({ name, description: "", kind: null, required: true }));
  return {
    scope: scopeLabel(perspective, organizationName),
    feature: data.mandate.mandate_key.split(".")[0] ?? data.mandate.mandate_key,
    enabled: data.mandate.is_enabled ?? null,
    goal,
    provision: normalizeTransferJson(declaredProvision),
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

function xml(value: Json, tag: string, depth = 0): string {
  const indent = "  ".repeat(depth);
  if (value === null) return `${indent}<${tag} null="true"/>`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${indent}<${tag}/>`;
    return `${indent}<${tag}>\n${value.map((item) => xml(item, "item", depth + 1)).join("\n")}\n${indent}</${tag}>`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return `${indent}<${tag}/>`;
    return `${indent}<${tag}>\n${entries.map(([key, item]) => xml(item, key, depth + 1)).join("\n")}\n${indent}</${tag}>`;
  }
  return `${indent}<${tag}>${escapeXml(String(value))}</${tag}>`;
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
  const core = buildMandateDefinitionCore(data, perspective, organizationName);
  const coreSource = () => {
    if (data.provisionKey && !data.offer) {
      throw new Error("The declared Provision has not loaded. Wait for it before exporting the saved definition Core.");
    }
    return core;
  };
  const captureTab = (tab: MandateWorkspaceTab): MandateAlchemyCapture => {
    const base = buildTab(tab);
    const parts = [...(registry?.entries() ?? [])].filter(([key]) => key.startsWith(`${tab}:`));
    if (parts.length === 0) return base;
    const blocked = parts.map(([, capture]) => capture).find((capture) => capture.status !== "ready");
    if (blocked) return blocked;
    if (base.status !== "ready") return base;
    const readyParts = parts as Array<[string, Extract<MandateAlchemyCapture, { status: "ready" }>] >;
    return { status: "ready", savedOnly: base.savedOnly === true && readyParts.every(([, capture]) => capture.savedOnly === true), data: { base: base.data, ...Object.fromEntries(readyParts.map(([key, capture]) => [key.slice(tab.length + 1), capture.data])) } };
  };
  const current = () => {
    const captured = captureTab(activeTab);
    if (captured.status === "loading") throw new Error(`${activeTab} is still loading. Wait for it to finish before exporting.`);
    if (captured.status === "error") throw new Error(`${activeTab} cannot be exported: ${captured.message}`);
    return { tab: activeTab, saved_only: captured.savedOnly === true, data: captured.data } as Json;
  };
  const all = () => {
    const entries = tabs.map((tab) => [tab, captureTab(tab)] as const);
    const blocked = entries.find(([, captured]) => captured.status !== "ready");
    if (blocked) throw new Error(`${blocked[0]} is ${blocked[1].status === "loading" ? "still loading" : "unavailable"}; all tabs cannot be exported yet.`);
    return { tabs: Object.fromEntries(entries.map(([tab, captured]) => [tab, (captured as Extract<MandateAlchemyCapture, { status: "ready" }>).data])) } as Json;
  };
  const key = data.mandate.mandate_key;
  const variants = [
    { id: "all-tabs", label: "All tabs", source: source(`mandate:${key}:all-tabs`, "All mandate tabs", all) },
    ...(activeTab === "definition" ? [
      { id: "core-json", label: "Core JSON", source: source(`mandate:${key}:core-json`, "Mandate definition core (JSON)", coreSource) },
      { id: "core-xml", label: "Core XML", source: source(`mandate:${key}:core-xml`, "Mandate definition core (XML)", () => xml(coreSource(), "mandate")) },
    ] : []),
  ];
  return <div className="ml-auto"><ContentTransferMenu label="Current tab" triggerVariant="transparent" triggerSize="compact" source={source(`mandate:${key}:tab:${activeTab}`, "Current mandate tab", current)} variants={variants} /></div>;
}
