/**
 * packages/chat/src/host/contract.ts — THE host contract (PACKAGE-INDEPENDENCE §2.1, slice P1).
 *
 * One host object, every port defaulted, `db` the ONLY required value. A bare
 * host passes an authenticated Supabase client and gets the whole product; a
 * host with more (matrx-frontend) overrides identity, org, notify, diagnostics,
 * navigation, windows and catalog with what it already has
 * (`providers/ChatHostAdapter.tsx`).
 *
 * Types only: no React, no Redux, no `window` at import. Server-only package
 * files take a `ChatHost` / `ResolvedChatHost` as an argument and never read
 * the module global (no cross-request leak).
 *
 * Port names follow aidream's `@ai-matrx/chat` rewrite (`ChatPrefsPort`,
 * `ChatNotifierPort`, `ChatErrorSinkPort`, `ChatIdentityPort`) so the §4 merge
 * is additive, not a rename.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ComponentType, ReactNode } from "react";
import type { AgentCatalog } from "@ai-matrx/agents/catalog";

/**
 * The connection contract (R10). Authenticated, RLS applies. P6 narrows this to
 * `SupabaseClient<ChatDatabase>` once the generated subset exists.
 */
export type ChatDb = SupabaseClient;

/**
 * The closed list `log_client_error` accepts for `p_source_app`
 * (migrations/log_client_error_names_the_feature_too.sql). A value outside it
 * makes the database refuse the row, so the diagnostics default checks it first.
 */
export const CHAT_SOURCE_APPS = [
  "matrx-frontend",
  "matrx-extend",
  "matrx-local",
  "matrx-mobile",
] as const;
export type ChatSourceApp = (typeof CHAT_SOURCE_APPS)[number];

export type ChatAdminLevel = "developer" | "senior_admin" | "super_admin";

export interface ChatIdentity {
  userId: string | null;
  isAuthenticated: boolean;
  adminLevel: ChatAdminLevel | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ChatOrganization {
  id: string;
  name: string | null;
}

/** Who is signed in. `current()` returns the SAME object until something changes. */
export interface ChatIdentityPort {
  current(): ChatIdentity;
  subscribe(listener: () => void): () => void;
  getAccessToken(): Promise<string | null>;
}

/** Active org = where writes go and which org a server call runs in. NEVER a list filter. */
export interface ChatOrgPort {
  active(): ChatOrganization | null;
  subscribe(listener: () => void): () => void;
  /** Hold-and-set gate: resolves an org id the person chose, or rejects as cancelled. */
  require(reason: string): Promise<string>;
}

export interface ChatServerPort {
  baseUrl(): string;
  headers?(): Promise<Record<string, string>>;
}

export interface ChatNotifyOptions {
  description?: string;
  /** What the person can do about it — shown with the sentence. */
  remedy?: string;
  /** Same id replaces an earlier notice instead of stacking. */
  id?: string | number;
  durationMs?: number;
}

/** The platform's record reference (`CONTEXT_MENU_ENTITY_KEY` shape). */
export interface ChatRecordRef {
  type: string;
  id: string;
  title?: string | null;
}

export type ChatNotifyLevel = "success" | "info" | "warning" | "error";

export interface ChatPromiseLabels<T> {
  loading: string;
  success: string | ((value: T) => string);
  error: string | ((error: unknown) => string);
}

/** Toast-shaped so the P4 codemod is import-path only. */
export interface ChatNotifyPort {
  success(message: string, options?: ChatNotifyOptions): void;
  info(message: string, options?: ChatNotifyOptions): void;
  warning(message: string, options?: ChatNotifyOptions): void;
  error(message: string, options?: ChatNotifyOptions): void;
  promise<T>(work: Promise<T>, labels: ChatPromiseLabels<T>): Promise<T>;
  /** A notice that names a record — dismissed when that record changes or leaves the screen. */
  record(
    level: ChatNotifyLevel,
    ref: ChatRecordRef,
    message: string,
    options?: ChatNotifyOptions,
  ): void;
}

export interface ChatDiagnosticContext {
  /** The package area that failed, e.g. "stream", "inbox", "catalog". */
  area: string;
  /** Stable machine code for the failure class. */
  code: string;
  detail?: unknown;
}

/** Every background failure lands here. */
export interface ChatDiagnosticsPort {
  capture(error: unknown, ctx: ChatDiagnosticContext): void;
}

/** Drafts, density, knobs, debug flags. String values, same as the rewrite's port. */
export interface ChatPrefsPort {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  subscribe(listener: (key: string) => void): () => void;
  /** A typed knob: the stored value when it parses, the platform default otherwise. */
  knob<T extends string | number | boolean>(key: string, fallback: T): T;
}

export interface ChatLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
}

export interface ChatNavigationPort {
  push(href: string): void;
  replace(href: string): void;
  back(): void;
  Link: ComponentType<ChatLinkProps>;
}

export interface ChatWindowShellProps {
  id: string;
  instanceId?: string;
  title?: string;
  onClose(): void;
  children: ReactNode;
}

/** Window/overlay port (CPM-009c). */
export interface ChatWindowsPort {
  open(id: string, data?: unknown, instanceId?: string): void;
  close(id: string, instanceId?: string): void;
  Shell?: ComponentType<ChatWindowShellProps>;
}

/**
 * Host registrations (R5). All optional. Each family is keyed by the id the
 * package looks up; P20/P21/P19 narrow the value types per family.
 */
export interface ChatRegistrations {
  toolRenderers?: Readonly<Record<string, unknown>>;
  contextItemBodies?: Readonly<Record<string, unknown>>;
  messageWidgets?: Readonly<Record<string, unknown>>;
  surfaceManifests?: readonly unknown[];
  contextSources?: readonly unknown[];
  computeTargets?: readonly unknown[];
  builderDoors?: Readonly<Record<string, unknown>>;
}

export interface ChatHost {
  /** R10 connection contract — the ONLY required value. Authenticated, RLS applies. */
  db: ChatDb;
  /**
   * Which client this is, for the platform errors system (`log_client_error`'s
   * closed `p_source_app` list). Absent or off the list: diagnostics stay on the
   * console and say so once.
   */
  sourceApp?: ChatSourceApp;
  /** Default: from db.auth (getSession + onAuthStateChange); admin level from admin.admins. */
  identity?: ChatIdentityPort;
  /** Default: no active org; `require` refuses loudly (never auto-picks). */
  org?: ChatOrgPort;
  /** Default: https://server.app.matrxserver.com; headers carry the bearer + org. */
  server?: ChatServerPort;
  /** Default: the package's own minimal DOM toaster (console when there is no document). */
  notify?: ChatNotifyPort;
  /**
   * Default: the platform errors system — the `log_client_error` RPC (lands in
   * `system_error`, the surface the `errors` tool reads) plus console. No new table.
   */
  diagnostics?: ChatDiagnosticsPort;
  /** Default: localStorage (memory, announced once, when storage is unavailable). */
  prefs?: ChatPrefsPort;
  /** Default: window.location + <a>. matrx-frontend passes next/navigation + next/link. */
  navigation?: ChatNavigationPort;
  /** Default: announces once that no window host exists here (P18 ships the floating host). */
  windows?: ChatWindowsPort;
  /**
   * Default: the registered catalog, else one built over db. A function defers
   * the read until first use (the app's catalog is created by its own host).
   */
  catalog?: AgentCatalog | (() => AgentCatalog);
  /** Host registrations (R5). */
  registry?: ChatRegistrations;
}

export type ChatPortName =
  | "identity"
  | "org"
  | "server"
  | "notify"
  | "diagnostics"
  | "prefs"
  | "navigation"
  | "windows"
  | "catalog"
  | "registry";

/** Every port present. `overridden` names the ports the host supplied itself. */
export interface ResolvedChatHost {
  db: ChatDb;
  sourceApp: ChatSourceApp | null;
  identity: ChatIdentityPort;
  org: ChatOrgPort;
  server: ChatServerPort;
  notify: ChatNotifyPort;
  diagnostics: ChatDiagnosticsPort;
  prefs: ChatPrefsPort;
  navigation: ChatNavigationPort;
  windows: ChatWindowsPort;
  catalog(): AgentCatalog;
  registry: ChatRegistrations;
  overridden: ReadonlySet<ChatPortName>;
}
