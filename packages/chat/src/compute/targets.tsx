/**
 * compute/targets — the COMPUTE TARGETS registration (P21; PACKAGE-INDEPENDENCE.md §2.3).
 *
 * A compute target is a machine a conversation's tools can run on: an orchestrator sandbox
 * (ec2 / hosted) or a person's own PC through Matrx Local. The chat package reads the
 * conversation's binding, resolves the server it should talk to, and draws the target
 * picker — but the sandbox platform (orchestrator calls, token mint, liveness) is the
 * host's. The host hands it over once through `registerChatComputeTargets({...})`, keyed by
 * the host modules' own export names so call sites kept their shape.
 *
 * matrx-frontend registers `lib/sandbox`, `hooks/sandbox` and its sandbox dialogs in
 * `providers/chatContextSources.ts` (and lazily in jest.setup.ts).
 *
 * A host that registers nothing gets the generic default: NO compute target — every
 * conversation runs on the platform server, nothing is bound, the picker lists nothing —
 * and each default says so once (Law 4). Actions with no honest default (create, clone,
 * gate) throw, naming themselves.
 */

import type { ComponentType } from "react";
import { createRegisteredSource, type AnyComponent, type AnyFn } from "../host/registered-source";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Contract types ─────────────────────────────────────────────────────────

export type ComputeTargetKind = "ec2" | "hosted" | "local-pc";

export interface ComputeTarget {
  id: string;
  kind: ComputeTargetKind;
  name: string;
  status: string;
  is_online: boolean;
  is_this_device: boolean;
  sandbox_id: string | null;
  tier: "ec2" | "hosted" | null;
  template: string | null;
  expires_at: string | null;
  instance_id: string | null;
  tunnel_url: string | null;
  platform: string | null;
  last_seen: string | null;
}

export interface ResolvedSandboxRef {
  rowId: string;
  proxyUrl: string;
  tier?: "ec2" | "hosted";
  kind?: ComputeTargetKind;
  name?: string;
  source: "conversation" | "surface-seed" | "editor-seed";
}

export interface ConversationSandboxBinding {
  rowId: string;
  proxyUrl: string;
  tier?: "ec2" | "hosted";
  kind?: ComputeTargetKind;
  name?: string;
}

export type BoundTargetState = "checking" | "online" | "asleep" | "gone";

export interface BoundTargetView {
  rowId: string;
  name: string;
  kind: ComputeTargetKind;
  state: BoundTargetState;
  target: ComputeTarget | null;
}

export interface SandboxCreateDefaults {
  template?: string;
  tier?: "ec2" | "hosted";
  ttl_seconds?: number;
  labels: Record<string, string>;
}

/** A sandbox row as the host's sandbox API returns it (decorated DB row). */
export interface SandboxInstance {
  id: string;
  status: string;
  name?: string | null;
  sandbox_id?: string | null;
  tier?: "ec2" | "hosted" | null;
  expires_at?: string | null;
  proxy_url?: string | null;
  [field: string]: any;
}

export interface ChatComputeTargetsSource {
  // Binding resolution (active-binding)
  getEffectiveSandboxRef: (state: any, conversationId: string | null | undefined) => ResolvedSandboxRef | null;
  resolveAgentSandboxRef: (state: any, conversationId: string | null | undefined) => ResolvedSandboxRef | null;
  getConversationSandboxBinding: (state: any, conversationId: string | null | undefined) => ResolvedSandboxRef | null;
  getSurfaceSeedRef: (state: any, conversationId: string | null | undefined) => ResolvedSandboxRef | null;
  getActiveSandboxBinding: (stateOrGetState: any, conversationId?: string | null) => Promise<any | null>;
  resolveSandboxRefDetails: (sandboxRowId: string) => Promise<any | null>;
  clearSandboxBindingCache: (sandboxRowId?: string) => void;
  conversationSandboxBindingFromRow: (row: any) => ConversationSandboxBinding | null;
  resolveBindingScope: AnyFn;
  // Views
  resolveBoundTargetView: (input: any) => BoundTargetView | null;
  describeBoundTargetState: (view: BoundTargetView) => { label: string; remedy: string | null };
  sandboxDisplayName: (parts: any) => string;
  splitIdentifyingName: (label: string) => { head: string; tail: string };
  getEffectiveStatus(instance: SandboxInstance): string;
  statusPillClasses(status: string): string;
  STATUS_LABELS: Record<string, string>;
  ACTIVE_EFFECTIVE_STATUSES: string[];
  resolveSandboxCreateDefaults: (organizationId: string, userId: string | null) => Promise<SandboxCreateDefaults>;
  // Hooks
  useComputeTargets: () => {
    data: { targets: ComputeTarget[]; max_sandboxes: number; sandbox_count: number } | null;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
  };
  useSandboxInstances: () => {
    instances: SandboxInstance[];
    loading: boolean;
    error: string | null;
    fetchInstances: (opts?: { limit?: number; [option: string]: unknown }) => Promise<unknown>;
    createInstance: (request: {
      organization_id: string;
      template?: string;
      tier?: string;
      ttl_seconds?: number;
      labels?: Record<string, string>;
      [field: string]: unknown;
    }) => Promise<{ instance: SandboxInstance | null; error: string | null }>;
    renameInstance: (id: string, name: string) => Promise<SandboxInstance | null>;
    [extra: string]: unknown;
  };
  useVerifiedSandboxBinding: (conversationId: string | null) => {
    ref: { rowId: string; kind?: ComputeTargetKind; name?: string } | null;
    source: "override" | "surface" | null;
    status: string;
    target: ComputeTarget | null;
    isChecking: boolean;
    refresh: () => Promise<void>;
  };
  // Host actions + UI
  openSandboxGate: AnyFn;
  CloneRepoDialog: AnyComponent;
  SandboxDiagnosticsPanel: AnyComponent;
}

const NO_STATUSES: string[] = [];
const NO_LABELS: Record<string, string> = {};
const NO_TARGETS = Object.freeze({
  data: { targets: [] as ComputeTarget[], max_sandboxes: 0, sandbox_count: 0 },
  loading: false,
  error: null,
  refetch: async () => undefined,
});
const NOTHING_BOUND = Object.freeze({
  ref: null,
  source: null,
  status: "none",
  target: null,
  isChecking: false,
  refresh: async () => undefined,
});

/** The generic default: a host with no compute targets runs every conversation on the platform server. */
const GENERIC_COMPUTE: Partial<ChatComputeTargetsSource> = {
  getEffectiveSandboxRef: () => null,
  resolveAgentSandboxRef: () => null,
  getConversationSandboxBinding: () => null,
  getSurfaceSeedRef: () => null,
  getActiveSandboxBinding: async () => null,
  resolveSandboxRefDetails: async () => null,
  clearSandboxBindingCache: () => undefined,
  conversationSandboxBindingFromRow: () => null,
  resolveBoundTargetView: () => null,
  sandboxDisplayName: (parts: { name?: string | null; id?: string }) => parts?.name?.trim() || parts?.id?.slice(0, 8) || "",
  splitIdentifyingName: (label: string) => ({ head: label, tail: "" }),
  getEffectiveStatus: (instance: SandboxInstance) => instance.status,
  statusPillClasses: () => "",
  STATUS_LABELS: NO_LABELS,
  ACTIVE_EFFECTIVE_STATUSES: NO_STATUSES,
  useComputeTargets: () => NO_TARGETS,
  useVerifiedSandboxBinding: () => NOTHING_BOUND,
};

const source = createRegisteredSource<ChatComputeTargetsSource>(
  "computeTargets",
  "registerChatComputeTargets",
  GENERIC_COMPUTE,
);

/** The host's compute-targets registration (replaces any earlier one; `null` = the generic default). */
export function registerChatComputeTargets(next: Partial<ChatComputeTargetsSource> | null): void {
  source.register(next);
}

export const getEffectiveSandboxRef = source.fn("getEffectiveSandboxRef");
export const resolveAgentSandboxRef = source.fn("resolveAgentSandboxRef");
export const getConversationSandboxBinding = source.fn("getConversationSandboxBinding");
export const getSurfaceSeedRef = source.fn("getSurfaceSeedRef");
export const getActiveSandboxBinding = source.fn("getActiveSandboxBinding");
export const resolveSandboxRefDetails = source.fn("resolveSandboxRefDetails");
export const clearSandboxBindingCache = source.fn("clearSandboxBindingCache");
export const conversationSandboxBindingFromRow = source.fn("conversationSandboxBindingFromRow");
export const resolveBindingScope = source.fn("resolveBindingScope");
export const resolveBoundTargetView = source.fn("resolveBoundTargetView");
export const describeBoundTargetState = source.fn("describeBoundTargetState");
export const sandboxDisplayName = source.fn("sandboxDisplayName");
export const splitIdentifyingName = source.fn("splitIdentifyingName");
export const getEffectiveStatus = source.fn("getEffectiveStatus");
export const statusPillClasses = source.fn("statusPillClasses");
export const STATUS_LABELS = source.constant("STATUS_LABELS");
export const ACTIVE_EFFECTIVE_STATUSES = source.constant("ACTIVE_EFFECTIVE_STATUSES");
export const resolveSandboxCreateDefaults = source.fn("resolveSandboxCreateDefaults");
export const useComputeTargets = source.fn("useComputeTargets");
export const useSandboxInstances = source.fn("useSandboxInstances");
export const useVerifiedSandboxBinding = source.fn("useVerifiedSandboxBinding");
export const openSandboxGate = source.fn("openSandboxGate");
export const CloneRepoDialog: ComponentType<any> = source.component("CloneRepoDialog");
export const SandboxDiagnosticsPanel: ComponentType<any> = source.component("SandboxDiagnosticsPanel");

/* eslint-enable @typescript-eslint/no-explicit-any */
