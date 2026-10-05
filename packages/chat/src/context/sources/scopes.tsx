/**
 * context/sources/scopes — the scopes CONTEXT SOURCE (P21; PACKAGE-INDEPENDENCE.md §2.3, D5).
 *
 * Scopes (user-authored dimensions: organization, project, task, scope types and their
 * values, the active scope selection) are a platform primitive the chat package READS to
 * build what an agent receives. Until `@ai-matrx/scopes` exists (P17s1–s2), the host hands
 * them over through ONE registration, `registerChatScopes({...})`, keyed by the export names
 * that package will publish — so P17s3 swaps this module's import specifier for
 * `@ai-matrx/scopes` and deletes this file, with no call-site change.
 *
 * matrx-frontend registers its `features/scopes`, `features/agent-context` and
 * `appContextSlice` exports in `providers/chatContextSources.ts` (and lazily in jest.setup.ts).
 *
 * A host that registers nothing gets the generic default: NO scope context — nothing
 * selected, no tree, no values, scope UI drawn as nothing, the send never held for a scope
 * question — and each default says so once (host diagnostics, Law 4). Services and writes
 * have no honest default and throw, naming themselves.
 */

import type { ComponentType } from "react";
import type { ChatDatabase, Json } from "../../host/db-types";
import { createRegisteredSource, type AnyComponent, type AnyFn } from "../../host/registered-source";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Contract types (what @ai-matrx/scopes will export) ─────────────────────

export type ContextItemRow = ChatDatabase["context"]["Tables"]["context_items"]["Row"];
export type ContextItemValueType = ChatDatabase["public"]["Enums"]["context_value_type"];
export type ContextValueType = ContextItemValueType;

export interface ScopeNode {
  id: string;
  scope_type_id: string;
  organization_id: string;
  name: string;
  description: string;
  parent_scope_id: string | null;
  settings: Json;
  slug: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScopeTypeNode {
  id: string;
  organization_id: string;
  label_singular: string;
  label_plural: string;
  icon: string;
  color: string;
  max_assignments_per_entity: number | null;
  sort_order: number;
  parent_type_id: string | null;
  default_variable_keys: string[];
  slug: string | null;
  description: string;
  created_at: string;
  updated_at: string;
  scopes: ScopeNode[];
}

export interface ScopeTreeOrganization {
  id: string;
  name: string;
  scope_types: ScopeTypeNode[];
}

export interface ContextItemValue {
  context_item_id: string;
  id: string;
  version: number;
  is_current: boolean;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_json: Json | null;
  value_document_url: string | null;
  value_document_size_bytes: number | null;
  value_timestamp?: string | null;
  value_time?: string | null;
  value_reference_id: string | null;
  value_reference_type: string | null;
  source_type: string;
  authored_by: string | null;
  created_at: string;
  value_incomplete?: unknown;
}

export interface ResolvedValue {
  context_item_id: string;
  key: string;
  display_name: string;
  value_type: ContextItemValueType;
  value: string | number | boolean | Json | null;
  document_url?: string | null;
  reference_id?: string | null;
  reference_type?: string | null;
  version: number;
}

/** One context item (a column of a scope type), as the scope screens use it. */
export interface ContextItem {
  id: string;
  scope_type_id: string;
  key: string;
  slug?: string | null;
  display_name: string;
  description: string;
  category: string | null;
  value_type: ContextValueType;
  custom_component?: any;
  fetch_hint: any;
  sensitivity: any;
  status: string;
  tags: string[];
  sort_order?: number;
  status_note?: string | null;
  review_interval_days?: number | null;
  allowed_reference_types?: string[] | null;
  max_items?: number;
  allowed_scope_type_ids?: string[] | null;
  reference_source?: any;
  system_item_class?: any;
}

export interface ReferenceItemConfig {
  allowed_reference_types: string[] | null;
  max_items: number;
  allowed_scope_type_ids: string[] | null;
}

export interface DrillPath {
  orgId: string | null;
  typeId: string | null;
  scopeId: string | null;
  itemId: string | null;
}

/** A task as the agent-context layer reads it (thin list row). */
export interface TaskRecord {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  assignee_id: string | null;
  project_id: string | null;
  parent_task_id: string | null;
  organization_id: string;
  description?: string | null;
  [field: string]: unknown;
}

export type ScopesRpcErrorCode =
  | "unauthorized"
  | "forbidden_org"
  | "forbidden_role"
  | "not_found"
  | "conflict_in_use"
  | "invalid_argument"
  | "version_conflict"
  | "quota_exceeded"
  | "template_missing"
  | "demanded_schema_violation"
  | "internal";

export interface ScopesRpcError {
  code: ScopesRpcErrorCode;
  message: string;
  hint?: string;
  detail?: unknown;
}

export type ScopesRpcResult<T> = { ok: true; data: T } | { ok: false; error: ScopesRpcError };

/** Narrow a {@link ScopesRpcResult} to its failure (strictNullChecks-off safe). */
export function isScopesRpcErr<T>(r: ScopesRpcResult<T>): r is { ok: false; error: ScopesRpcError } {
  return r.ok === false;
}

type Selector<R> = (state: any, ...args: any[]) => R;

/** The registration: every export chat reads from scopes, by its future package name. */
export interface ChatScopesSource {
  // Active selection (scopes + appContext scope selections)
  selectActiveOrganizationId: Selector<string | null>;
  selectActiveOrganizationName: Selector<string | null>;
  selectActiveProjectId: Selector<string | null>;
  selectActiveTaskId: Selector<string | null>;
  selectActiveScopeIds: Selector<string[]>;
  selectActiveScopeIdsByType: Selector<Record<string, string[]>>;
  selectHasActiveContext: Selector<boolean>;
  selectScopeSelectionsContext: Selector<Record<string, string | null>>;
  selectActiveScopeTypeIds: Selector<string[]>;
  selectProjectId: Selector<string | null>;
  selectTaskId: Selector<string | null>;
  selectProjectName: Selector<string | null>;
  selectTaskName: Selector<string | null>;
  selectAppContext: Selector<any>;
  addActiveScope: (scopeId: string) => { type: string; payload?: unknown };
  removeActiveScope: (scopeId: string) => { type: string; payload?: unknown };
  // Tree, catalog, values
  selectScopeById: Selector<ScopeNode | undefined>;
  selectScopesByType: Selector<ScopeNode[]>;
  selectScopesLoadedForType: Selector<boolean>;
  makeSelectResolvedContext: () => Selector<any>;
  makeSelectScopeTypeLabelMapForOrg: () => Selector<Record<string, string>>;
  selectAllContextItems: Selector<ContextItem[]>;
  selectLoadedCatalogTypeIds: Selector<string[]>;
  selectTaskById: Selector<TaskRecord | undefined>;
  // Thunks
  listScopeTypeItems: AnyFn;
  ensureContextValues: AnyFn;
  ensureScopeTree: AnyFn;
  ensureConversationScopesOrAsk: AnyFn;
  syncConversationScopes: AnyFn;
  setScopeContextValue: AnyFn;
  // Hooks
  useScopeTree: () => {
    organizations: ScopeTreeOrganization[];
    status: string;
    error: string | null;
    fetchedAt: number | null;
    refresh: () => Promise<void>;
  };
  useContextValues: (scopeId: string | null | undefined) => {
    values: Record<string, ContextItemValue>;
    drafts: Record<string, Partial<ContextItemValue>>;
    status: "idle" | "loading" | "ready" | "error";
    error: string | null;
    refresh: () => Promise<void>;
  };
  useUniverse: AnyFn;
  useDrillPathEngine: AnyFn;
  // Services
  scopesService: any;
  associationsService: any;
  favoritesService: any;
  getAssociationsStore: AnyFn;
  readFavoriteIds: AnyFn;
  writeFavorite: AnyFn;
  // Entities
  resolveEntityToken: AnyFn;
  tryGetEntityInfo: AnyFn;
  getCachedEntityTitle: (token: string, id: string) => string | null;
  entityTitleFallback: (token: string) => string;
  fetchEntityTitles: (token: string, ids: string[]) => Promise<Map<string, string>>;
  // Utilities
  referenceConfigFromItem: (item: any) => ReferenceItemConfig;
  buildScopeValuePayload: AnyFn;
  slugifyKey: (name: string) => string;
  drillPathForScope: AnyFn;
  // Components
  ActiveContextButton: AnyComponent;
  ActiveContextLensChip: AnyComponent;
  ActiveContextTree: AnyComponent;
  ContextLensBar: AnyComponent;
  MillerColumnsCore: AnyComponent;
  ContextValueInput: AnyComponent;
  ContextValueRow: AnyComponent;
}

const NONE: string[] = [];
const NO_SELECTIONS: Record<string, string | null> = {};
const NO_IDS_BY_TYPE: Record<string, string[]> = {};
const NO_LABELS: Record<string, string> = {};
const NO_ITEMS: ContextItem[] = [];
const NO_SCOPES: ScopeNode[] = [];
const NO_APP_CONTEXT = Object.freeze({
  organization_id: null,
  project_id: null,
  task_id: null,
  scope_selections: NO_SELECTIONS,
  active_scope_type_ids: NONE,
});
const NO_TREE = Object.freeze({
  organizations: [] as ScopeTreeOrganization[],
  status: "idle",
  error: null,
  fetchedAt: null,
  refresh: async () => undefined,
});
const NO_VALUES = Object.freeze({
  values: {},
  drafts: {},
  status: "idle" as const,
  error: null,
  refresh: async () => undefined,
});
const noAction = (scopeId: string) => ({ type: "chat/scopes-source-unregistered", payload: scopeId });
const noThunk = () => async () => undefined;

/** The generic default: a host with no scopes has no scope context. */
const GENERIC_SCOPES: Partial<ChatScopesSource> = {
  selectActiveOrganizationId: () => null,
  selectActiveOrganizationName: () => null,
  selectActiveProjectId: () => null,
  selectActiveTaskId: () => null,
  selectActiveScopeIds: () => NONE,
  selectActiveScopeIdsByType: () => NO_IDS_BY_TYPE,
  selectHasActiveContext: () => false,
  selectScopeSelectionsContext: () => NO_SELECTIONS,
  selectActiveScopeTypeIds: () => NONE,
  selectProjectId: () => null,
  selectTaskId: () => null,
  selectProjectName: () => null,
  selectTaskName: () => null,
  selectAppContext: () => NO_APP_CONTEXT,
  addActiveScope: noAction,
  removeActiveScope: noAction,
  selectScopeById: () => undefined,
  selectScopesByType: () => NO_SCOPES,
  selectScopesLoadedForType: () => true,
  makeSelectResolvedContext: () => () => null,
  makeSelectScopeTypeLabelMapForOrg: () => () => NO_LABELS,
  selectAllContextItems: () => NO_ITEMS,
  selectLoadedCatalogTypeIds: () => NONE,
  selectTaskById: () => undefined,
  listScopeTypeItems: noThunk,
  ensureContextValues: noThunk,
  ensureScopeTree: noThunk,
  ensureConversationScopesOrAsk: () => async () => ({ blocked: false }),
  syncConversationScopes: noThunk,
  useScopeTree: () => NO_TREE,
  useContextValues: () => NO_VALUES,
  resolveEntityToken: (token: string) => token,
  tryGetEntityInfo: () => null,
  getCachedEntityTitle: () => null,
  entityTitleFallback: (token: string) => token,
  fetchEntityTitles: async () => new Map<string, string>(),
  slugifyKey: (name: string) =>
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, ""),
};

const source = createRegisteredSource<ChatScopesSource>("scopes", "registerChatScopes", GENERIC_SCOPES);

/** The host's scopes registration (replaces any earlier one; `null` = the generic default). */
export function registerChatScopes(next: Partial<ChatScopesSource> | null): void {
  source.register(next);
}

/** True when the host registered this scopes export (diagnostics, tests). */
export function hasChatScopes(key: keyof ChatScopesSource): boolean {
  return source.has(key);
}

// ─── Exports, by the names @ai-matrx/scopes will publish ────────────────────

export const selectActiveOrganizationId = source.fn("selectActiveOrganizationId");
export const selectActiveOrganizationName = source.fn("selectActiveOrganizationName");
export const selectActiveProjectId = source.fn("selectActiveProjectId");
export const selectActiveTaskId = source.fn("selectActiveTaskId");
export const selectActiveScopeIds = source.fn("selectActiveScopeIds");
export const selectActiveScopeIdsByType = source.fn("selectActiveScopeIdsByType");
export const selectHasActiveContext = source.fn("selectHasActiveContext");
export const selectScopeSelectionsContext = source.fn("selectScopeSelectionsContext");
export const selectActiveScopeTypeIds = source.fn("selectActiveScopeTypeIds");
export const selectProjectId = source.fn("selectProjectId");
export const selectTaskId = source.fn("selectTaskId");
export const selectProjectName = source.fn("selectProjectName");
export const selectTaskName = source.fn("selectTaskName");
export const selectAppContext = source.fn("selectAppContext");
export const addActiveScope = source.fn("addActiveScope");
export const removeActiveScope = source.fn("removeActiveScope");
export const selectScopeById = source.fn("selectScopeById");
export const selectScopesByType = source.fn("selectScopesByType");
export const selectScopesLoadedForType = source.fn("selectScopesLoadedForType");
export const makeSelectResolvedContext = source.fn("makeSelectResolvedContext");
export const makeSelectScopeTypeLabelMapForOrg = source.fn("makeSelectScopeTypeLabelMapForOrg");
export const selectAllContextItems = source.fn("selectAllContextItems");
export const selectLoadedCatalogTypeIds = source.fn("selectLoadedCatalogTypeIds");
export const selectTaskById = source.fn("selectTaskById");
/** The System Context Items catalog key — a wire value of the scopes contract. */
export const SYSTEM_ITEMS_KEY = "__system__";

export const listScopeTypeItems = source.fn("listScopeTypeItems");
export const ensureContextValues = source.fn("ensureContextValues");
export const ensureScopeTree = source.fn("ensureScopeTree");
export const ensureConversationScopesOrAsk = source.fn("ensureConversationScopesOrAsk");
export const syncConversationScopes = source.fn("syncConversationScopes");
export const setScopeContextValue = source.fn("setScopeContextValue");

export const useScopeTree = source.fn("useScopeTree");
export const useContextValues = source.fn("useContextValues");
export const useUniverse = source.fn("useUniverse");
export const useDrillPathEngine = source.fn("useDrillPathEngine");

/** Service objects resolve per property read, so a late registration still lands. */
function serviceProxy<K extends "scopesService" | "associationsService" | "favoritesService">(key: K): any {
  return new Proxy(
    {},
    {
      get: (_t, prop) => {
        const service = source.get(key);
        const member = service?.[prop as string];
        return typeof member === "function" ? member.bind(service) : member;
      },
    },
  );
}
export const scopesService = serviceProxy("scopesService");
export const associationsService = serviceProxy("associationsService");
export const favoritesService = serviceProxy("favoritesService");
export const getAssociationsStore = source.fn("getAssociationsStore");
export const readFavoriteIds = source.fn("readFavoriteIds");
export const writeFavorite = source.fn("writeFavorite");

export const resolveEntityToken = source.fn("resolveEntityToken");
export const tryGetEntityInfo = source.fn("tryGetEntityInfo");
export const getCachedEntityTitle = source.fn("getCachedEntityTitle");
export const entityTitleFallback = source.fn("entityTitleFallback");
export const fetchEntityTitles = source.fn("fetchEntityTitles");

export const referenceConfigFromItem = source.fn("referenceConfigFromItem");
export const buildScopeValuePayload = source.fn("buildScopeValuePayload");
export const slugifyKey = source.fn("slugifyKey");
export const drillPathForScope = source.fn("drillPathForScope");

export const ActiveContextButton: ComponentType<any> = source.component("ActiveContextButton");
export const ActiveContextLensChip: ComponentType<any> = source.component("ActiveContextLensChip");
export const ActiveContextTree: ComponentType<any> = source.component("ActiveContextTree");
export const ContextLensBar: ComponentType<any> = source.component("ContextLensBar");
export const MillerColumnsCore: ComponentType<any> = source.component("MillerColumnsCore");
export const ContextValueInput: ComponentType<any> = source.component("ContextValueInput");
export const ContextValueRow: ComponentType<any> = source.component("ContextValueRow");

/* eslint-enable @typescript-eslint/no-explicit-any */
