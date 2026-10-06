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
import type { AnchorHTMLAttributes, ComponentType, ReactNode, Ref } from "react";
import type { AgentCatalog } from "@ai-matrx/agents/catalog";
import type { ChatDatabase } from "./db-types";
import type { ChatWindowId } from "./windows";
import type { CanvasJson } from "@ai-matrx/canvas";
import type { ChatCanvasTabKind } from "./canvas-tabs";
import type { ChatWindowOpeners } from "./window-openers";
import type { DefaultChatServerApi, DefaultChatServerTypes } from "./defaults/server-api";

/**
 * The connection contract (R10). Authenticated, RLS applies. Typed with the
 * package's own `ChatDatabase` (`./db-types`, generated: the schemas the
 * package reads); a client typed with the full platform `Database` passes
 * unchanged. Package code reaches it only through the db seam (`./db`).
 */
export type ChatDb = SupabaseClient<ChatDatabase>;

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
  /** The session's bearer token, or null. A sync read for transports that build headers. */
  accessToken: string | null;
  /** Has the host finished reading its session? False while the first read is in flight. */
  authReady: boolean;
  /** The guest fingerprint a signed-out visitor is known by, or null. */
  fingerprintId: string | null;
  /** Profile `name` as the person set it (display fallbacks compose from it). */
  name: string | null;
  preferredUsername: string | null;
  /** Profile picture URL, or null. */
  picture: string | null;
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

/** How `ChatOrgPort.require` may ask. */
export interface ChatOrgRequireOptions {
  /**
   * true: ask now. false: refuse without asking (background work).
   * Omitted: a write's default — ask only right after the person acted, so a
   * debounced autosave refuses instead of raising a picker mid-sentence.
   */
  interactive?: boolean;
  /** Choices a server refusal already carried (its memberships), so the picker opens at once. */
  prefetched?: readonly unknown[] | null;
}

/** Active org = where writes go and which org a server call runs in. NEVER a list filter. */
export interface ChatOrgPort {
  active(): ChatOrganization | null;
  subscribe(listener: () => void): () => void;
  /**
   * Hold-and-set gate: resolves an org id the person chose, or rejects as
   * cancelled (an error named `OrganizationSelectionCancelled`, "not now").
   * Never picks one on the person's behalf.
   */
  require(reason: string, options?: ChatOrgRequireOptions): Promise<string>;
}

/**
 * The host's server client and its types, REGISTERED by module augmentation —
 * the same TanStack `Register` pattern as `ChatStoreRegister`
 * (`../store/root-state.ts`). matrx-frontend registers its own `lib/api`
 * (`lib/api/chat-server-api.ts`), so every package call type-checks against
 * the app's signatures; a bare host registers nothing and gets the package
 * default over `@ai-matrx/agents/matrx` (`./defaults/server-api.ts`).
 *
 *   declare module "@ai-matrx/chat/host/contract" {
 *     interface ChatServerRegister { api: AppChatServerApi; types: AppChatServerTypes }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ChatServerRegister {}

/** Every server call the package makes (P9): the registered host client, else the package default. */
export type ChatServerApi = ChatServerRegister extends { api: infer A } ? A : DefaultChatServerApi;

/** The request/response types those calls use: the registered host's, else the package default's. */
export type ChatServerTypes = ChatServerRegister extends { types: infer T }
  ? T
  : DefaultChatServerTypes;

export interface ChatServerPort {
  baseUrl(): string;
  headers?(): Promise<Record<string, string>>;
  /**
   * Every server call the package makes. Absent: the package default — the
   * shared transport in `@ai-matrx/agents/matrx` over `baseUrl()` + `headers()`.
   */
  api?: ChatServerApi;
}

/** The server port as resolved: the client is always present. */
export interface ResolvedChatServerPort extends ChatServerPort {
  api: ChatServerApi;
}

/** One press offered with a notice (e.g. "Undo", "Use “Sales 2”"). */
export interface ChatNotifyAction {
  label: string;
  onClick: () => void;
}

export interface ChatNotifyOptions {
  description?: string;
  /** What the person can do about it — shown with the sentence. */
  remedy?: string;
  /** Same id replaces an earlier notice instead of stacking. */
  id?: string | number;
  durationMs?: number;
  /** A rendered control (e.g. an entity door) is passed through to a host toaster that renders React. */
  action?: ChatNotifyAction | ReactNode;
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
  /** A neutral notice — no level. */
  message(message: string, options?: ChatNotifyOptions): void;
  /** Stays until a notice with the same id replaces it; returns that id. */
  loading(message: string, options?: ChatNotifyOptions): string | number;
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

/**
 * Where a structured diagnostic came from. The closed list of classes the
 * package files today; "chat" is the package's own failures reported through
 * `capture(error, ctx)`. A host maps each to its own error store
 * (matrx-frontend: the Error Inspector's `CapturedErrorSource`).
 */
export type ChatDiagnosticSource =
  | "chat"
  | "agent-json-result"
  | "agent-stop-save-shorter"
  | "agent-stream-client-error"
  | "agent-stream-provider-retry"
  | "agent-stream-terminal-guard"
  | "agent-stream-warning"
  | "api-http"
  | "content-ir"
  | "context-truth"
  | "data-shape"
  | "mandate-fast-path"
  | "react-render"
  | "reasoning-leak"
  | "record-unavailable"
  | "supabase-postgrest"
  | "surface-registration"
  | "surface-writeback"
  | "unsaved-work";

/** A Supabase DML verb, or "rpc" for a function call. */
export type ChatDiagnosticOperation =
  | "select"
  | "insert"
  | "update"
  | "upsert"
  | "delete"
  | "rpc"
  | "unknown";

/** One structured diagnostic — what a capture site knows; the host fills the rest. */
export interface ChatDiagnosticEntry {
  source: ChatDiagnosticSource;
  operation?: ChatDiagnosticOperation;
  schema?: string;
  relation?: string;
  code?: string;
  message: string;
  details?: string;
  hint?: string;
  status?: number;
  /** The sentence the person saw, when one was shown. */
  userMessage?: string;
  /** The run survived this. */
  recoverable?: boolean;
  /** Producer-declared level, e.g. "low" | "medium" | "high". */
  level?: string;
  requestId?: string;
  conversationId?: string;
  name?: string;
  stack?: string;
  callSite?: string;
  raw?: unknown;
  sessionState?: string;
  /** false only for expected, successfully handled diagnostics. Default true. */
  durable?: boolean;
  /** Separates failures that share a signature but belong to distinct server requests. */
  dedupeDiscriminator?: string;
}

/** The kinds of network work the package reports to a host's connection-health view. */
export type ChatNetRequestKind = "agent-run" | "agent-init" | "chat" | "crud" | "api";

export type ChatNetRequestPhase =
  | "connecting"
  | "streaming"
  | "heartbeat-stalled"
  | "completed"
  | "error"
  | "timed-out"
  | "cancelled";

export interface ChatNetRequestStart {
  id: string;
  kind: ChatNetRequestKind;
  label: string;
  recoveryId?: string;
  groupKey?: string;
}

export interface ChatNetRequestFinish {
  id: string;
  phase: "completed" | "error" | "timed-out" | "cancelled";
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
}

/** In-flight network work, for a host's connection-health view. */
export interface ChatNetRequestsPort {
  start(request: ChatNetRequestStart): void;
  phase(id: string, phase: ChatNetRequestPhase): void;
  heartbeat(id: string): void;
  finish(result: ChatNetRequestFinish): void;
}

/** Every background failure lands here. */
export interface ChatDiagnosticsPort {
  capture(error: unknown, ctx: ChatDiagnosticContext): void;
  /**
   * A structured diagnostic (the seam's `captureError`). Returns the host's id
   * for it, so a later resolver can reconcile the same row. Absent: the entry
   * goes to `capture` with `area` = its source.
   */
  record?(entry: ChatDiagnosticEntry): string;
  /** True when the host's own transport already recorded this thrown value. */
  wasCaptured?(error: unknown): boolean;
  /** In-flight network work for the host's connection-health view. Absent: not tracked. */
  requests?: ChatNetRequestsPort;
}

/** How a directive the agent proposes is applied (the person's choice). */
export type ChatDirectiveApplyPolicy = "default" | "auto" | "ask" | "off";

/** The sandbox a surface's input is bound to (one per surface, never global). */
export interface ChatSandboxBinding {
  rowId: string;
  proxyUrl: string;
  tier?: "ec2" | "hosted";
  /** Undefined / "ec2" / "hosted" → orchestrator sandbox; "local-pc" → a matrx-local PC. */
  kind?: "ec2" | "hosted" | "local-pc";
  /** Display label latched at selection. */
  name?: string;
}

/** One surface's conversation-history source filter. */
export interface ChatConversationSurfaceFilter {
  includeFeatures: string[];
  includeApps: string[];
  includeEmptySource: boolean;
}

/** The creator's own run chrome settings. */
export interface ChatCreatorSettings {
  showRawIds: boolean;
  showBuildAffordances: boolean;
  showDrafts: boolean;
  /** Emergency brake: declare no client surface, so no surface/default tools are attached. */
  disableToolInjection: boolean;
}

/**
 * The person's preferences and the debug flags the package reads, typed
 * (PACKAGE-INDEPENDENCE §2.3, P8). The host keeps them; the package's
 * `chatHost` slice holds a copy (`chatHost.preferences`). Every field has a
 * platform default (`DEFAULT_CHAT_PREFERENCES`), which is what a host that
 * keeps none of them gets.
 */
export interface ChatPreferences {
  /** False until the host's stored preferences loaded — an earlier read is the default, not a choice. */
  loaded: boolean;
  /** Debug tooling for a super admin, on every page (never admin POWER — that is identity's lane-aware level). */
  superAdminDebugger: boolean;
  /** The admin debug-mode switch. */
  debugMode: boolean;
  /** The inline creator run panel is shown (also: machine frames are visible). */
  showCreatorPanel: boolean;
  creatorSettings: ChatCreatorSettings;
  /** Admin override: the matrx-local engine delegated desktop tools run on; null = automatic. */
  desktopTargetInstanceId: string | null;
  directiveApplyPolicy: ChatDirectiveApplyPolicy;
  /** Unsent composer drafts come back after a reload. */
  restoreUnsentDrafts: boolean;
  /** surface (`sourceFeature`) → its bound sandbox. */
  sandboxBySurface: Readonly<Record<string, ChatSandboxBinding>>;
  /** Reveal the sandbox in the canvas the first time the agent works in it. */
  sandboxCanvasAutoOpen: boolean;
  /** History lane toggles; undefined = never chosen (the default lanes). */
  conversationLanes: readonly string[] | undefined;
  /** surfaceId → source filter override; undefined = every surface uses its default. */
  conversationSurfaces: Readonly<Record<string, ChatConversationSurfaceFilter>> | undefined;
  /** The person's active scratchpad; null until one exists. */
  activeScratchpadId: string | null;
}

/**
 * One change to the person's preferences or debug state. It travels as a store
 * action (`chatPreferenceWritten`): the package's `chatHost` reducer applies it
 * to `chatHost.preferences`, and a host that keeps its own preference state
 * (matrx-frontend's root reducer) turns it into its own action in the same
 * reduction — so a write works in every store, with or without a provider.
 */
export type ChatPreferenceWrite =
  /** A stored preference: `module.preference = value` (matrx-frontend's `setPreference`). */
  | { kind: "preference"; module: string; preference: string; value: unknown }
  /** Whether the person owns the agent in context (creator authority — never a UI toggle). */
  | { kind: "creator-ownership"; isCreator: boolean }
  /** Flip the inline creator run panel (`showCreatorPanel`). */
  | { kind: "creator-panel-toggled" }
  /** Flip the admin debug-mode switch (`debugMode`). */
  | { kind: "debug-mode-toggled" }
  /** Merge namespaced values into the admin debug panel ("Namespace:Label" keys). */
  | { kind: "debug-data"; data: Readonly<Record<string, unknown>> }
  /** Drop every "Namespace:*" key from the admin debug panel. */
  | { kind: "debug-namespace-cleared"; namespace: string };

/** A settings-register knob: the register's `{ feature, key }` pair, or its dotted form. */
export type ChatKnobRef = string | { feature: string; key: string };

/** An entity rung a knob is resolved for (beyond org → user → device). */
export interface ChatKnobScope {
  kind: string;
  id: string;
}

export interface ChatKnobOverrideInput {
  feature: string;
  key: string;
  scopeKind: string;
  scopeId: string;
  organizationId: string;
  /** null clears the override. */
  value: unknown;
  note?: string;
}

/** A refusal is a result, never a throw: `{ ok: false, reason, detail }`. */
export interface ChatKnobOverrideResult {
  ok: boolean;
  reason?: string | null;
  detail?: string | null;
  [extra: string]: unknown;
}

/**
 * The settings register (org → user → device, nearest wins). `undefined` is
 * never a value: it means "not answered yet", and every reader uses its own
 * default until an answer lands. Default: no register — nothing is ever
 * answered and overrides are refused, said once.
 */
export interface ChatKnobsPort {
  /** React: the effective value for these principals; re-renders when it lands or changes. */
  useEffective(
    organizationId: string | null | undefined,
    userId: string | null | undefined,
    ref: ChatKnobRef,
    scopes?: readonly ChatKnobScope[],
  ): unknown;
  /** React: the effective value for this session (the signed-in person in the active org). */
  useSession(ref: ChatKnobRef): unknown;
  /** Outside React: the cached session value, warming the cache when cold. */
  peekSession(ref: ChatKnobRef): unknown;
  /** The effective value, awaited. */
  ensure(
    organizationId: string | null,
    userId: string | null,
    ref: ChatKnobRef,
    scopes?: readonly ChatKnobScope[],
  ): Promise<unknown>;
  /** Write (or clear, `value: null`) one override at one rung. */
  setOverride(input: ChatKnobOverrideInput): Promise<ChatKnobOverrideResult>;
}

export type ChatSettingDoorId = "live-conversation-voice";

export interface ChatSettingDoorProps {
  setting: ChatSettingDoorId;
  label?: string;
  variant?: "link" | "outline" | "ghost";
  size?: "sm" | "default";
}

/** Drafts, density, knobs, debug flags. String values, same as the rewrite's port. */
export interface ChatPrefsPort {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  subscribe(listener: (key: string) => void): () => void;
  /** A typed knob: the stored value when it parses, the platform default otherwise. */
  knob<T extends string | number | boolean>(key: string, fallback: T): T;
  /** Every stored key and value, for the `chatHost` slice's first-render snapshot. Optional. */
  snapshot?(): Readonly<Record<string, string>>;
  /**
   * The typed preferences and debug flags, when the host keeps them. Returns the
   * SAME object until one changes. Absent: the package keeps them itself in
   * `chatHost.preferences` — `DEFAULT_CHAT_PREFERENCES`, changed by writes, for
   * this session only (said once on the first write).
   */
  preferences?(): ChatPreferences;
  /** Called whenever `preferences()` may have changed. */
  subscribePreferences?(listener: () => void): () => void;
  /** The settings register. Absent: no register (see `ChatKnobsPort`). */
  knobs?: ChatKnobsPort;
  /** The host control that governs a setting. Absent: no door is drawn. */
  SettingDoor?: ComponentType<ChatSettingDoorProps>;
}

/**
 * A link's props: an anchor's, `href` a string. `prefetch` / `replace` /
 * `scroll` are routing hints a router-backed host honours (Next's `<Link>`);
 * the default anchor drops them.
 */
export interface ChatLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  children?: ReactNode;
  ref?: Ref<HTMLAnchorElement>;
  prefetch?: boolean | null;
  replace?: boolean;
  scroll?: boolean;
}

export interface ChatNavigateOptions {
  scroll?: boolean;
}

/** What `useRouter()` gives a package component (the app router's shape). */
export interface ChatRouter {
  push(href: string, options?: ChatNavigateOptions): void;
  replace(href: string, options?: ChatNavigateOptions): void;
  back(): void;
  forward(): void;
  refresh(): void;
  prefetch(href: string): void;
}

/** The current URL's query, read-only by contract (Next's `ReadonlyURLSearchParams` is one). */
export type ChatSearchParams = URLSearchParams;

/**
 * Navigation port (R10, slice P10). Package code reaches it only through the
 * `host/navigation` seam (`useRouter`, `usePathname`, `useSearchParams`,
 * `Link`) — never `next/*`. The three `use*` members are React hooks the seam
 * calls during render: a host passes the same functions for the life of the
 * page. Default: `window.location` + a plain anchor (`defaults/navigation`).
 * matrx-frontend passes the package's Next binding (`next/navigation`).
 */
export interface ChatNavigationPort {
  /** Imperative navigation for non-React code. */
  push(href: string): void;
  replace(href: string): void;
  back(): void;
  useRouter(): ChatRouter;
  usePathname(): string;
  useSearchParams(): ChatSearchParams;
  Link: ComponentType<ChatLinkProps>;
}

export interface ChatWindowShellProps {
  id: ChatWindowId;
  instanceId?: string;
  title?: string;
  onClose(): void;
  children: ReactNode;
}

/**
 * Window/overlay port (CPM-009c). Ids are the package's own registry
 * (`CHAT_WINDOWS` in `./windows`) — never a bare string.
 */
export interface ChatWindowsPort {
  open(id: ChatWindowId, data?: unknown, instanceId?: string): void;
  close(id: ChatWindowId, instanceId?: string): void;
  /** Whether that window instance is open now. Absent: nothing is ever open here. */
  isOpen?(id: ChatWindowId, instanceId?: string): boolean;
  /**
   * Keys of every window the host's window manager holds right now (open or
   * minimized to its tray). Absent: the host has no window manager.
   */
  managedWindowKeys?(): readonly string[];
  /** Restore and focus a window the manager already holds, by its key. */
  bringToFront?(key: string): void;
  /** Called whenever `isOpen` or `managedWindowKeys` may have changed. */
  subscribe?(listener: () => void): () => void;
  /**
   * Openers for host windows the package opens with typed options (agent
   * builder windows, notes, tasks …). One left out opens nothing and says so.
   */
  openers?: Partial<ChatWindowOpeners>;
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

// ── Chrome (P22): the app shell around the package ─────────────────────────

export interface ChatHeaderPortalProps {
  desktop?: ReactNode;
  mobile?: ReactNode;
  children?: ReactNode;
  /** Yield to any page-specific header mounted deeper in the route tree. */
  fallback?: boolean;
}

export interface ChatHeaderSlotProps {
  children: ReactNode;
  className?: string;
}

export interface ChatRouteHeaderProps {
  left?: ReactNode;
  center?: ReactNode;
  /** Contextual actions, lowest priority first. */
  right?: ReactNode;
  fallback?: boolean;
  /** Keep the center in the row on a phone (default: the ⋮ sheet). */
  centerOnPhone?: "sheet" | "row";
}

export interface ChatIconButtonProps {
  icon: ReactNode;
  onClick?: () => void;
  label: string;
  asLabel?: boolean;
  htmlFor?: string;
  active?: boolean;
  className?: string;
  glassClassName?: string;
  disabled?: boolean;
}

export interface ChatNavItemTooltipProps {
  label: string;
  description?: string;
  contentClassName?: string;
  disabled?: boolean;
  children: ReactNode;
}

/** Where a header's actions go on a phone (the shell's ⋮ sheet), if anywhere. */
export interface ChatPhonePageActions {
  host: HTMLElement | null;
  count: number;
}

/** The shell's visual tokens for header mode navs and route menus. */
export interface ChatChromeStyles {
  navItemSelected: string;
  navItemUnselected: string;
  routeMenuNavItem: string;
  routeMenuIconSize: number;
  routeMenuIconStrokeWidth: number;
}

/**
 * Host chrome (P22): header slots, the phone ⋮ sheet, the navigation drawer,
 * canvas chrome, full-screen layers. Default: header pieces render in place,
 * shell-only pieces render nothing (`defaults/chrome.ts`).
 */
export interface ChatChromePort {
  HeaderCenter: ComponentType<ChatHeaderPortalProps>;
  HeaderRight: ComponentType<{ children: ReactNode }>;
  HeaderActionsSlot: ComponentType<ChatHeaderSlotProps>;
  RouteHeader: ComponentType<ChatRouteHeaderProps>;
  /** The host's permanent header icons, for a page that draws its own header. */
  HeaderControlSet: ComponentType<{ isAuthenticated: boolean }>;
  /** Mounted by a page that draws its own chrome; the shell steps aside. */
  CanvasChromeMode: ComponentType<{ mode: "canvas" }>;
  IconButton: ComponentType<ChatIconButtonProps>;
  NavTooltipProvider: ComponentType<{ children: ReactNode }>;
  NavItemTooltip: ComponentType<ChatNavItemTooltipProps>;
  usePhonePageActions(): ChatPhonePageActions;
  useCanvasFullScreen(fullScreen: boolean): void;
  openMobileMenu(): void;
  closeMobileMenu(): void;
  /** One Escape leaves only the top layer. Returns the pop. */
  pushFullScreenLayer(exit: () => void): () => void;
  styles: ChatChromeStyles;
}

// ── Feedback (P22): the platform's triage table ────────────────────────────

/** `users.user_feedback.feedback_type`. */
export type ChatFeedbackType =
  | "bug"
  | "feature"
  | "suggestion"
  | "other"
  | "request"
  | "page_story";

/** A JSON value (the Supabase `Json` shape). */
export type ChatJson =
  | string
  | number
  | boolean
  | null
  | { [key: string]: ChatJson | undefined }
  | ChatJson[];

export interface ChatFeedbackInput {
  feedback_type: ChatFeedbackType;
  route: string;
  description: string;
  /** The organization the person is acting in — carried, never re-resolved. */
  organization_id: string;
  image_file_ids?: string[];
  metadata?: Record<string, ChatJson> | null;
}

export interface ChatFeedbackResult {
  success: boolean;
  error?: string;
  data?: { id: string };
}

export interface ChatFeedbackPort {
  submit(input: ChatFeedbackInput): Promise<ChatFeedbackResult>;
}

// ── Routes (P22): other platform apps the package links to ─────────────────

export interface ChatRoutes {
  /** Workflow Studio, the workflow authoring app. */
  workflowStudio: string;
}

// ── Canvas: the host's docked workspace column ─────────────────────────────

/**
 * What the package puts on the host's canvas. The host owns the content
 * vocabulary (`type`) and its renderers; the package only names a type it
 * expects the host to know ("sandbox", "code", …) and a pointer in `data`. A
 * type the host does not know is refused by the host, loudly. A conversation's
 * documents and the scratchpad are not content: each is one named tab
 * (`./canvas-tabs.ts`) opened through the windows port.
 */
export interface ChatCanvasContent {
  type: string;
  data: unknown;
  metadata?: {
    title?: string;
    conversationId?: string;
    /** The producer's stable identity for its tab — opening twice reuses it. */
    sourceMessageId?: string;
    /** A saved artifact (`canvas_items.id`) the tab shows. */
    canvasItemId?: string;
  };
}

/** A saved artifact opened by pointer — the row is the truth, never a copy. */
export interface ChatCanvasPointer {
  artifactId: string;
  type: string;
  metadata?: ChatCanvasContent["metadata"];
}

/** What the canvas holds right now, read as strings. */
export interface ChatCanvasView {
  /** Is the canvas column showing? */
  readonly isOpen: boolean;
  /** Source ids of every tab (a tab with no source contributes its own id). */
  readonly sourceIds: readonly string[];
  /** Source id of the tab the person is looking at, or null. */
  readonly activeSourceId: string | null;
  /** The saved artifact (`canvas_items.id`) on screen, or null. */
  readonly activeArtifactId: string | null;
}

/** Verbs on the canvas. Each returns false (and the host says why) when it cannot. */
export interface ChatCanvasOpeners {
  /** A canvas column exists on this screen. */
  readonly isAvailable: boolean;
  /** Shows the content now. */
  open(content: ChatCanvasContent): boolean;
  /** Adds a tab without revealing the canvas or stealing focus. */
  offer(content: ChatCanvasContent): boolean;
  openPointer(pointer: ChatCanvasPointer): boolean;
  hide(): void;
  toggle(): void;
}

/** A tab the package names (`./canvas-tabs.ts`): one per kind + key. */
export interface ChatCanvasTabRef {
  kind: ChatCanvasTabKind;
  key: string;
}

/** What a toggle opens when the tab is absent (an open tab keeps its own). */
export interface ChatCanvasTabOpen {
  title: string;
  /** Plain JSON the host's body for this kind reads. */
  data: Readonly<Record<string, CanvasJson>>;
  /**
   * Replace an open tab's data with `data` (a chip host's item list moved on).
   * Absent: an open tab keeps its own data and only `selected` moves.
   */
  replaceData?: boolean;
  /**
   * The value to show. Absent: a launcher press (absent → open · behind →
   * focus · in front → close). Present: in front on this value → close;
   * otherwise open or focus on it.
   */
  selected?: string;
}

/** A launcher's view of one named tab, plus its press. */
export interface ChatCanvasTab {
  /** A canvas column exists on this screen. */
  readonly isAvailable: boolean;
  /** In front with the canvas showing — the launcher shows pressed. */
  readonly isVisible: boolean;
  /** The tab's `selected` field, or null. */
  readonly selected: string | null;
  toggle(open: ChatCanvasTabOpen): void;
}

/**
 * Canvas port. Every member is a React hook, called during render.
 * `useOpeners` must return referentially stable functions and must NOT
 * subscribe to canvas state (headless openers call it from effects);
 * `useTab` subscribes to its one tab.
 * Default: no canvas — every verb refuses and says so (`defaults/canvas.ts`).
 */
export interface ChatCanvasPort {
  useView(): ChatCanvasView;
  useOpeners(): ChatCanvasOpeners;
  useTab(tab: ChatCanvasTabRef): ChatCanvasTab;
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
  /** Default: window.location + <a>. matrx-frontend passes the package's Next binding (`next/navigation`). */
  navigation?: ChatNavigationPort;
  /** Default: announces once that no window host exists here (a floating-window host is not built yet). */
  windows?: ChatWindowsPort;
  /**
   * Default: the registered catalog, else one built over db. A function defers
   * the read until first use (the app's catalog is created by its own host).
   */
  catalog?: AgentCatalog | (() => AgentCatalog);
  /** Host registrations (R5). */
  registry?: ChatRegistrations;
  /** Default: header pieces render in place; shell-only pieces render nothing. Members override singly. */
  chrome?: Partial<ChatChromePort>;
  /** Default: an RLS-bound insert into `users.user_feedback` over db. */
  feedback?: ChatFeedbackPort;
  /** Default: the platform's production addresses (`DEFAULT_CHAT_ROUTES`). */
  routes?: Partial<ChatRoutes>;
  /** Default: no canvas here — every open refuses and says so. */
  canvas?: ChatCanvasPort;
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
  | "registry"
  | "chrome"
  | "feedback"
  | "routes"
  | "canvas";

/** Every port present. `overridden` names the ports the host supplied itself. */
export interface ResolvedChatHost {
  db: ChatDb;
  sourceApp: ChatSourceApp | null;
  identity: ChatIdentityPort;
  org: ChatOrgPort;
  server: ResolvedChatServerPort;
  notify: ChatNotifyPort;
  diagnostics: ChatDiagnosticsPort;
  prefs: ChatPrefsPort;
  navigation: ChatNavigationPort;
  windows: ChatWindowsPort;
  catalog(): AgentCatalog;
  registry: ChatRegistrations;
  chrome: ChatChromePort;
  feedback: ChatFeedbackPort;
  routes: ChatRoutes;
  canvas: ChatCanvasPort;
  overridden: ReadonlySet<ChatPortName>;
}
