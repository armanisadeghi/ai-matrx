"use client";

/**
 * features/surfaces/runtime/SurfaceRuntimeContext.tsx
 *
 * Live surface-scope registration for the universal Agents chrome.
 *
 * Why a module registry (not React Context alone): the header Agents button
 * lives in AppShell `<Header>`, while page content lives in `<main>` — they
 * are siblings. A Context provider under a route never reaches the header.
 * Pages still mount `<SurfaceRuntimeProvider>` in their tree; it registers
 * into this module store so the header panel can read it via
 * `useSurfaceRuntime()` / `getSurfaceRuntime()`.
 *
 *   <SurfaceRuntimeProvider
 *     surfaceName="matrx-user/notes"
 *     getScope={() => createNotesScope({ ...live })}
 *   >
 *     {children}
 *   </SurfaceRuntimeProvider>
 *
 * Pages without a provider still get list/bind; Run uses an empty scope.
 * Nested providers (e.g. split-pane notes) stack — the topmost wins.
 */

import { announceUndeclaredLoadedValues } from "@/features/surfaces/runtime/loaded-value-check";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useSyncExternalStore } from "react";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import {
  AlchemySurfaceBridge,
  useAlchemySurfaceHandle,
} from "@/components/agent-copy/AlchemySurfaceBridge";
import type { SurfaceHandle } from "@ai-matrx/kit/content-transfer";
import type { ApplySurfaceWriteOptions } from "./surface-writeback";

/**
 * What a write handler may RETURN so the caller (and, for an agent write, the
 * model) learns what landed without re-reading the page — ids, names, counts.
 * `summary` is one plain sentence; `data` is any JSON-serializable value.
 * Both are forwarded verbatim in the `apply_surface_write` tool result.
 */
export interface SurfaceWriteOutcome {
  summary?: string;
  data?: unknown;
}

/** Applies the value into the page. May throw; may return an outcome. */
export type SurfaceWriteApply = (
  value: unknown,
) => void | SurfaceWriteOutcome | Promise<void | SurfaceWriteOutcome>;

/**
 * The two-phase handler shape. `validate` runs BEFORE the person is shown the
 * approval card (after JSON-string parsing, anchored-patch resolution and the
 * declared `valueKind` contract): a throw is handed back to the agent as a
 * refusal with its message and no card is shown. `apply` runs only after
 * approval (or immediately for `auto` / user-origin writes).
 */
export interface SurfaceWriteHandlerEntry {
  validate?: (value: unknown) => void | Promise<void>;
  apply: SurfaceWriteApply;
}

/** A plain apply function, or `{ validate?, apply }`. */
export type SurfaceWriteHandler = SurfaceWriteApply | SurfaceWriteHandlerEntry;

/**
 * One write handler per declared `SurfaceWriteTarget.name`. A handler applies
 * the value into the page (draft state, canonical service write, or UI state
 * per the target's declared `mode`) and may throw — the writeback runtime
 * (`surface-writeback.ts`) wraps every call in a safe envelope.
 */
export type SurfaceWriteHandlers = Record<string, SurfaceWriteHandler>;

export interface SurfaceBeforeExecuteInput {
  conversationId: string;
  composerText: string;
}

export interface SurfaceBeforeExecuteResult {
  /** Current-turn context overlaid after the generic surface remap. */
  contextEntries?: Array<
    Omit<InstanceContextEntry, "slotMatched"> & { slotMatched?: boolean }
  >;
}

export interface SurfaceRuntimeValue {
  /**
   * Canonical `ui_surface.name` this page is emitting. Display labels are
   * NEVER passed here — THE NAMING LAW: chrome derives the one canonical
   * label via `getSurfaceDisplayLabel(surfaceName)` (manifest-owned).
   */
  surfaceName: string;
  /**
   * Build the live ApplicationScope / SurfaceScopePayload at Run time.
   * Called only when the user hits ▶ — never on mount.
   */
  getScope: () => SurfaceScopePayload | Promise<SurfaceScopePayload>;
  /**
   * Optional submit-time preparation owned by the live surface. It runs before
   * scope refresh and before the input is snapshotted, so failures preserve the
   * draft and make no request. Use for current-turn evidence, never UI effects.
   */
  beforeExecute?: (
    input: SurfaceBeforeExecuteInput,
  ) =>
    | SurfaceBeforeExecuteResult
    | void
    | Promise<SurfaceBeforeExecuteResult | void>;
  /** Pass-through for editable surfaces (default contracts). */
  isEditable?: boolean;
  /**
   * Live write handlers for this surface's declared `writeTargets` (the
   * read/write manifest v1). Called only through `applySurfaceWrite` in
   * `surface-writeback.ts` — never invoked directly by chrome or components.
   */
  getWriteHandlers?: () => SurfaceWriteHandlers;
  /**
   * True when this runtime sits inside a LAYER — a dialog, window, sheet,
   * drawer or panel open over a page (`<SurfaceLayerBoundary>`, which every
   * overlay-controller layer gets automatically). Set by the registry from
   * the boundary, never by hand. A layer is what the person is looking at
   * while it is open: it becomes the primary surface, and the page it sits on
   * stays in the agent's context as a level of the surface chain
   * (`surface-chain.ts`).
   */
  layer?: boolean;
  /**
   * The conversation this page ITSELF runs, when it has one: the main chat's
   * open conversation, the agent builder's test run, the runner's run, each
   * battle lane. That conversation IS the page, so it must never receive the
   * page as context or be offered the page's tools. Every OTHER agent on the
   * screen (a window, sidebar, overlay) still gets both. Read live on every
   * launch and every turn, so a conversation loaded from history is covered
   * exactly like a freshly launched one. See `isPageOwnConversation`.
   */
  ownConversationId?: string | null;
  /**
   * For a page that runs SEVERAL conversations of its own (each battle lane,
   * a builder's test panel whose id lives in Redux): true for any of them.
   * Same meaning as `ownConversationId`; either may be given.
   */
  isOwnConversation?: (conversationId: string) => boolean;
  /** Registry-internal live reader for `ownConversationId`; set by the provider. */
  getOwnConversationId?: () => string | null | undefined;
}

type SurfaceScopeContribution = {
  id: number;
  owner: string;
  getScope: () => SurfaceScopePayload;
};

type RegistryEntry = { id: number; depth: number; value: SurfaceRuntimeValue };

/**
 * One handler per declared `SurfaceClientTool.name`. A handler executes the
 * tool against the live page (moves focus, stages a draft, runs the page's
 * canonical write) and returns the tool OUTPUT the agent receives (any
 * JSON-serializable value, or nothing). It may throw — the client-tool
 * runtime (`surface-client-tools.ts`) wraps every call in a safe, loud
 * envelope and never lets a throw escape to the delegation loop.
 *
 * `call` is present when an AGENT made the call: a handler that writes on the
 * agent's behalf spreads `call.agentWrite` into `applySurfaceWrite`, so the
 * write carries `origin: "agent"`, the agent's name and THIS call's approval
 * card — exactly as the agent's own `apply_surface_write` would.
 */
export type SurfaceClientToolHandlers = Record<
  string,
  (input: unknown, call?: SurfaceToolCall) => Promise<unknown> | unknown
>;

/** What the delegation seam knows about one agent tool call. */
export interface SurfaceToolCall {
  conversationId: string;
  callId: string;
  toolName: string;
  /**
   * Spread into `applySurfaceWrite` for any write made on the agent's behalf
   * during this call: `origin: "agent"`, the actor label, provenance and the
   * inline approval-card bridge bound to this call.
   */
  agentWrite: Pick<
    ApplySurfaceWriteOptions,
    "origin" | "actorLabel" | "requestApproval" | "conversationId" | "agentId"
  >;
  /** True once the person approved an approval card raised during this call. */
  approvedByUser: () => boolean;
}

/**
 * A SURFACE REGISTRY — where mounted surfaces register their runtime, write
 * handlers, client-tool handlers and descendant scope contributions.
 *
 * There is ONE global registry: it is what every agent, the header Agents
 * chrome and the surface chain read, and it obeys the ONE-live-registration
 * law (FOUND_DEFECTS D194). Every module function below without a registry
 * argument (`getSurfaceRuntimeStack`, `getRegisteredWriteHandlers`, …) reads
 * it, unchanged.
 *
 * A CAPTURE (`createSurfaceCapture`) is a private registry for ONE copy of a
 * surface-owning subtree — a board tile. `<SurfaceActivity capture={…}>`
 * routes every registration inside the subtree into it, live or dormant, so
 * the host can read and act on a DORMANT copy (its scope, its handlers, its
 * tools) without it ever entering the global stack. The capture is read only
 * through the canonical runtimes with an explicit `source`
 * (`applySurfaceWrite`, `executeSurfaceClientTool`), so validation, apply
 * policy and the approval card are identical to acting on a page.
 */
export interface SurfaceRegistry {
  readonly kind: "global" | "capture";
  /** Register a live runtime at `depth`. Returns an unregister for this entry only. */
  register: (value: SurfaceRuntimeValue, depth?: number) => () => void;
  /** All registered runtimes, DEEPEST first (ties broken by registration recency). */
  stack: () => readonly SurfaceRuntimeValue[];
  /** The deepest registered runtime, or null. */
  primary: () => SurfaceRuntimeValue | null;
  /** Handlers registered by descendants for `surfaceName` (later wins per name). */
  writeHandlers: (surfaceName: string) => SurfaceWriteHandlers;
  /** Client-tool handlers registered by descendants for `surfaceName`. */
  clientTools: (surfaceName: string) => SurfaceClientToolHandlers;
  addWriteHandlers: (surfaceName: string, handlers: SurfaceWriteHandlers) => () => void;
  addClientTools: (surfaceName: string, handlers: SurfaceClientToolHandlers) => () => void;
  addScopeContribution: (
    surfaceName: string,
    owner: string,
    getScope: () => SurfaceScopePayload,
  ) => () => void;
  /** Descendant scope fragments for `surfaceName`, merged (duplicates are a loud error). */
  scopeContributions: (surfaceName: string) => SurfaceScopePayload;
  /** `getScope` plus this registry's contributions (see `withScopeContributions`). */
  withScopeContributions: (
    surfaceName: string,
    getScope: () => SurfaceScopePayload | Promise<SurfaceScopePayload>,
  ) => () => SurfaceScopePayload | Promise<SurfaceScopePayload>;
  /** Called after every registration change. */
  subscribe: (listener: () => void) => () => void;
}

let nextId = 0;

function createRegistry(
  kind: SurfaceRegistry["kind"],
  onRegister?: (value: SurfaceRuntimeValue) => void,
): SurfaceRegistry {
  let stack: RegistryEntry[] = [];
  const listeners = new Set<() => void>();
  const contributions = new Map<string, SurfaceScopeContribution[]>();
  const writeHandlerLists = new Map<
    string,
    Array<{ id: number; handlers: SurfaceWriteHandlers }>
  >();
  const clientToolLists = new Map<
    string,
    Array<{ id: number; handlers: SurfaceClientToolHandlers }>
  >();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  function addTo<H>(
    lists: Map<string, Array<{ id: number; handlers: H }>>,
    surfaceName: string,
    handlers: H,
  ): () => void {
    const id = ++nextId;
    lists.set(surfaceName, [...(lists.get(surfaceName) ?? []), { id, handlers }]);
    emit();
    return () => {
      const next = (lists.get(surfaceName) ?? []).filter((entry) => entry.id !== id);
      if (next.length === 0) lists.delete(surfaceName);
      else lists.set(surfaceName, next);
      emit();
    };
  }

  function mergedFrom<H extends object>(
    lists: Map<string, Array<{ id: number; handlers: H }>>,
    surfaceName: string,
  ): H {
    const merged = {} as H;
    // Later registrations win: iterate oldest→newest and overwrite.
    for (const entry of lists.get(surfaceName) ?? []) Object.assign(merged, entry.handlers);
    return merged;
  }

  const scopeContributions = (surfaceName: string): SurfaceScopePayload => {
    const merged: SurfaceScopePayload = {};
    const owners = new Map<string, string>();
    for (const contribution of contributions.get(surfaceName) ?? []) {
      const fragment = contribution.getScope();
      for (const [name, value] of Object.entries(fragment)) {
        const priorOwner = owners.get(name);
        if (priorOwner) {
          throw new Error(
            `[surfaces] scope value "${name}" for "${surfaceName}" is emitted by both "${priorOwner}" and "${contribution.owner}"`,
          );
        }
        owners.set(name, contribution.owner);
        merged[name] = value;
      }
    }
    return merged;
  };

  const withContributions: SurfaceRegistry["withScopeContributions"] = (
    surfaceName,
    getScope,
  ) => {
    const merge = (own: SurfaceScopePayload): SurfaceScopePayload => {
      const contributed = scopeContributions(surfaceName);
      for (const name of Object.keys(contributed)) {
        if (name in own) {
          throw new Error(
            `[surfaces] a descendant contribution to "${surfaceName}" tried to replace the provider-owned value "${name}"`,
          );
        }
      }
      const loaded = { ...own, ...contributed };
      announceUndeclaredLoadedValues(surfaceName, loaded);
      return loaded;
    };
    return () => {
      const own = getScope();
      return own && typeof (own as Promise<SurfaceScopePayload>).then === "function"
        ? (own as Promise<SurfaceScopePayload>).then(merge)
        : merge(own as SurfaceScopePayload);
    };
  };

  const sortedStack = (): readonly SurfaceRuntimeValue[] =>
    [...stack].sort((a, b) => b.depth - a.depth || b.id - a.id).map((entry) => entry.value);

  return {
    kind,
    register(value, depth = 0) {
      const id = ++nextId;
      onRegister?.(value);
      const registered: SurfaceRuntimeValue = {
        ...value,
        getScope: withContributions(value.surfaceName, value.getScope),
      };
      stack = [...stack, { id, depth, value: registered }];
      emit();
      return () => {
        stack = stack.filter((entry) => entry.id !== id);
        emit();
      };
    },
    stack: sortedStack,
    primary() {
      let winner: RegistryEntry | null = null;
      for (const entry of stack) {
        if (
          !winner ||
          entry.depth > winner.depth ||
          (entry.depth === winner.depth && entry.id > winner.id)
        ) {
          winner = entry;
        }
      }
      return winner?.value ?? null;
    },
    writeHandlers: (surfaceName) => mergedFrom(writeHandlerLists, surfaceName),
    clientTools: (surfaceName) => mergedFrom(clientToolLists, surfaceName),
    addWriteHandlers: (surfaceName, handlers) => addTo(writeHandlerLists, surfaceName, handlers),
    addClientTools: (surfaceName, handlers) => addTo(clientToolLists, surfaceName, handlers),
    addScopeContribution(surfaceName, owner, getScope) {
      const entry = { id: ++nextId, owner, getScope };
      contributions.set(surfaceName, [...(contributions.get(surfaceName) ?? []), entry]);
      return () => {
        const remaining = (contributions.get(surfaceName) ?? []).filter(
          (candidate) => candidate.id !== entry.id,
        );
        if (remaining.length === 0) contributions.delete(surfaceName);
        else contributions.set(surfaceName, remaining);
      };
    },
    scopeContributions,
    withScopeContributions: withContributions,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Every surface that has had a live provider in this page session. */
const mountedThisSession = new Set<string>();

const globalRegistry = createRegistry("global", (value) =>
  mountedThisSession.add(value.surfaceName),
);

/** The ONE global registry — what agents and chrome read. */
export function getGlobalSurfaceRegistry(): SurfaceRegistry {
  return globalRegistry;
}

/**
 * A private registry for one copy of a surface-owning subtree (a board tile).
 * Pass it to `<SurfaceActivity capture={…}>`; read it through the canonical
 * runtimes with `{ source: capture }`. See `SurfaceRegistry`.
 */
export function createSurfaceCapture(): SurfaceRegistry {
  return createRegistry("capture");
}

/**
 * Resolves with the capture's primary runtime once one has registered — a
 * tile just brought back onto the board mounts its surface on its next
 * render. Null when none registers within `timeoutMs`.
 */
export function waitForCapturedRuntime(
  capture: SurfaceRegistry,
  timeoutMs: number,
): Promise<SurfaceRuntimeValue | null> {
  const now = capture.primary();
  if (now) return Promise.resolve(now);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(capture.primary());
    }, timeoutMs);
    const unsubscribe = capture.subscribe(() => {
      const runtime = capture.primary();
      if (!runtime) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(runtime);
    });
  });
}

/**
 * DORMANT subtrees register nothing GLOBALLY: no runtime, no write handlers,
 * no client tools, no scope contributions. A screen that shows several copies
 * of one surface-owning component — the tiles of a board, a list of live
 * previews — marks every copy but the one the person is working in as
 * dormant, so the ONE-live-registration-per-surface law holds (FOUND_DEFECTS
 * D194: two same-name registrations are a coin flip, and an agent's write
 * lands in whichever mounted last). Flipping `active` registers / unregisters
 * live.
 *
 * `capture` (optional) additionally routes every registration in the subtree
 * — dormant OR active — into that private registry, so the host can still
 * reach this copy (`createSurfaceCapture`). A nested `SurfaceActivity`
 * without its own `capture` inherits its parent's.
 */
const SurfaceDormantContext = createContext(false);
const SurfaceCaptureContext = createContext<SurfaceRegistry | null>(null);

export function SurfaceActivity({
  active,
  capture,
  children,
}: {
  active: boolean;
  capture?: SurfaceRegistry;
  children: ReactNode;
}) {
  const parentDormant = useContext(SurfaceDormantContext);
  const parentCapture = useContext(SurfaceCaptureContext);
  return (
    <SurfaceDormantContext.Provider value={parentDormant || !active}>
      <SurfaceCaptureContext.Provider value={capture ?? parentCapture}>
        {children}
      </SurfaceCaptureContext.Provider>
    </SurfaceDormantContext.Provider>
  );
}

/** Where registrations in this subtree go: the global registry unless dormant, and the enclosing capture. */
function useRegistrationTargets(): {
  live: SurfaceRegistry | null;
  capture: SurfaceRegistry | null;
} {
  const dormant = useContext(SurfaceDormantContext);
  return {
    live: dormant ? null : globalRegistry,
    capture: useContext(SurfaceCaptureContext),
  };
}

/**
 * Keep ONE registration in `registry` while `identity` holds (null = none).
 * `add` is read through a ref, so it always registers the latest closure and
 * a new function identity never re-registers. Each hook calls this once for
 * the global registry and once for its capture, so flipping dormancy never
 * disturbs the capture's registration.
 */
function useRegistrationIn(
  registry: SurfaceRegistry | null,
  identity: string | null,
  add: (registry: SurfaceRegistry) => () => void,
): void {
  const addRef = useRef(add);
  useEffect(() => {
    addRef.current = add;
  });
  useEffect(() => {
    if (!registry || identity === null) return;
    return addRef.current(registry);
  }, [registry, identity]);
}

/**
 * Register a live partial scope owned by a descendant of the page provider.
 * This is the READ twin of `useSurfaceWriteHandlers`: complex surfaces often
 * keep tab/card state below the component that owns the single provider.
 */
export function registerSurfaceScopeContribution(
  surfaceName: string,
  owner: string,
  getScope: () => SurfaceScopePayload,
): () => void {
  return globalRegistry.addScopeContribution(surfaceName, owner, getScope);
}

/**
 * Merge descendant-owned scope fragments. Duplicate value names are a loud
 * contract error: two UI regions cannot both claim to be the source of truth
 * for one Surface Value.
 */
export function getRegisteredSurfaceScopeContributions(
  surfaceName: string,
): SurfaceScopePayload {
  return globalRegistry.scopeContributions(surfaceName);
}

/**
 * The provider's own scope plus every descendant contribution, merged by the
 * REGISTRY — so a component deep inside a page (a tab, a card, a dialog's
 * editor) adds its values with `useSurfaceScopeContribution` and they reach
 * every reader with zero wiring in the provider. A contribution may never
 * replace a provider-owned value: two owners of one Surface Value is a loud
 * contract error, never a silent override.
 */
export function withScopeContributions(
  surfaceName: string,
  getScope: () => SurfaceScopePayload | Promise<SurfaceScopePayload>,
): () => SurfaceScopePayload | Promise<SurfaceScopePayload> {
  return globalRegistry.withScopeContributions(surfaceName, getScope);
}

/** Register a descendant's latest scope fragment without re-registering it. */
export function useSurfaceScopeContribution(
  surfaceName: string | null,
  owner: string,
  getScope: () => SurfaceScopePayload,
): void {
  const { live, capture } = useRegistrationTargets();
  const getScopeRef = useRef(getScope);
  useEffect(() => {
    getScopeRef.current = getScope;
  });
  const identity = surfaceName ? `${surfaceName}|${owner}` : null;
  const add = (registry: SurfaceRegistry) =>
    registry.addScopeContribution(surfaceName ?? "", owner, () => getScopeRef.current());
  useRegistrationIn(live, identity, add);
  useRegistrationIn(capture, identity, add);
}

/**
 * Imperative read — the DEEPEST registered runtime wins (registration
 * recency breaks ties). Depth, not recency, decides: React fires passive
 * effects child-first, so on any commit where a page-level provider and an
 * ancestor layout provider both (re)register, the ancestor registers LAST —
 * pure "latest wins" would let the layout's generic scope shadow the page's
 * rich one (the exact inversion of the nested-provider contract).
 */
export function getSurfaceRuntime(): SurfaceRuntimeValue | null {
  return globalRegistry.primary();
}

/**
 * True when `conversationId` is a mounted page's OWN conversation (declared
 * via `ownConversationId`). Such a conversation gets no page context and no
 * surface tools: the main chat has no awareness of itself, while any agent
 * opened over it (a window, a sidebar) sees and works on the page.
 */
export function isPageOwnConversation(
  conversationId: string | null | undefined,
): boolean {
  if (!conversationId) return false;
  return getSurfaceRuntimeStack().some(
    (runtime) =>
      (runtime.getOwnConversationId?.() ?? runtime.ownConversationId) ===
        conversationId || runtime.isOwnConversation?.(conversationId) === true,
  );
}

/**
 * Read the deepest live provider for one canonical surface name.
 *
 * Submit-time execution refreshes must follow the surface stamped onto the
 * conversation, not an unrelated overlay that happens to be the registry's
 * current global winner. Within the requested surface the normal provider
 * law still applies: deepest wins, registration recency breaks ties.
 */
export function getSurfaceRuntimeForName(
  surfaceName: string,
): SurfaceRuntimeValue | null {
  return (
    getSurfaceRuntimeStack().find(
      (runtime) => runtime.surfaceName === surfaceName,
    ) ?? null
  );
}

function getServerSnapshot(): SurfaceRuntimeValue | null {
  return null;
}

/**
 * All registered runtimes, DEEPEST first (ties broken by registration
 * recency). The writeback runtime walks this to find the innermost surface
 * that handles a given write target — e.g. the open node panel wins over the
 * workspace behind it, but a workspace-level target still resolves while a
 * panel is open.
 */
export function getSurfaceRuntimeStack(): readonly SurfaceRuntimeValue[] {
  return globalRegistry.stack();
}

/**
 * True when `surfaceName` had a live provider at some point in this page
 * session. A conversation stamped with such a surface whose provider is gone
 * now means the screen CLOSED (a window shut, the person navigated away) —
 * unlike a server-emitted surface, which never mounts one at all.
 */
export function wasSurfaceMountedThisSession(surfaceName: string): boolean {
  return mountedThisSession.has(surfaceName);
}

/**
 * Register a live runtime. Returns an unregister that only clears this entry
 * (safe under nested providers / remounts). `depth` is the provider's nesting
 * depth in the React tree (see `SurfaceRuntimeDepthContext`); deeper wins.
 */
export function registerSurfaceRuntime(
  value: SurfaceRuntimeValue,
  depth = 0,
): () => void {
  return globalRegistry.register(value, depth);
}

/** Hook for the header panel (and any other chrome outside the page tree). */
export function useSurfaceRuntime(): SurfaceRuntimeValue | null {
  return useSyncExternalStore(
    globalRegistry.subscribe,
    getSurfaceRuntime,
    getServerSnapshot,
  );
}

// ---------------------------------------------------------------------------
// Composable write handlers — a DEEP CHILD can service its surface's targets.
// ---------------------------------------------------------------------------

/**
 * The provider's `getWriteHandlers` prop assumes ONE component owns both the
 * surface and every write target on it. Real surfaces do not work that way: a
 * window owns the surface and publishes its scope, while a tab several levels
 * down owns the state a target writes. Threading that state up just to satisfy
 * the prop is the kind of plumbing that gets skipped, and a declared target
 * with no handler fails loudly at apply time.
 *
 * So handlers are additionally registered by NAME against a surface, from
 * anywhere in the tree. `applySurfaceWrite` consults both sources; a
 * registered handler wins over the provider's (the deeper, more specific
 * owner registered it).
 */

/** Handlers registered by descendants for `surfaceName`, most recent first. */
export function getRegisteredWriteHandlers(
  surfaceName: string,
): SurfaceWriteHandlers {
  return globalRegistry.writeHandlers(surfaceName);
}

/**
 * Register write handlers for the surface this component sits inside.
 *
 * ```ts
 * useSurfaceWriteHandlers("matrx-user/keyword-intelligence", {
 *   keyword_selection: (value) => toggleKeyword(value),
 * });
 * ```
 *
 * The handlers object is held in a ref, so an inline literal is fine — it does
 * not thrash the registry. Handlers may throw; the writeback runtime wraps
 * every call in a safe, loud envelope.
 */
export function useSurfaceWriteHandlers(
  surfaceName: string | null,
  handlers: SurfaceWriteHandlers,
): void {
  const { live, capture } = useRegistrationTargets();
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  // Indirect through the ref so the registered handlers always call the
  // LATEST closure (fresh page state), never the one from mount. The proxy is
  // always the two-phase shape so a handler may switch between a plain
  // function and `{ validate, apply }` across renders without re-registering.
  const add = (registry: SurfaceRegistry) => {
    const name = surfaceName ?? "";
    const proxied: SurfaceWriteHandlers = {};
    for (const key of Object.keys(handlersRef.current)) {
      proxied[key] = {
        validate: async (value: unknown) => {
          const current = handlersRef.current[key];
          if (current && typeof current !== "function") {
            await current.validate?.(value);
          }
        },
        apply: (value: unknown) => {
          const current = handlersRef.current[key];
          if (!current) {
            throw new Error(
              `The handler for "${key}" on ${name} was unregistered before it could run.`,
            );
          }
          return typeof current === "function"
            ? current(value)
            : current.apply(value);
        },
      };
    }
    return registry.addWriteHandlers(name, proxied);
  };
  // The KEY SET is the registration identity — a stable set of target names
  // registers once for the component's life, while values stay fresh via the
  // ref above.
  const identity = surfaceName
    ? `${surfaceName}|${Object.keys(handlers).sort().join("|")}`
    : null;
  useRegistrationIn(live, identity, add);
  useRegistrationIn(capture, identity, add);
}

// ---------------------------------------------------------------------------
// Surface client-tool handlers — the ACTION twin of the write handlers above.
// ---------------------------------------------------------------------------

/**
 * Client-tool handlers registered by descendants for `surfaceName`, most
 * recent registration winning per name (mirror of
 * `getRegisteredWriteHandlers`).
 */
export function getRegisteredSurfaceClientTools(
  surfaceName: string,
): SurfaceClientToolHandlers {
  return globalRegistry.clientTools(surfaceName);
}

/**
 * Register client-tool handlers for the surface this component sits inside —
 * the exact registration shape of `useSurfaceWriteHandlers`, for the tools
 * the surface declares in `SurfaceManifest.clientTools`.
 *
 * ```ts
 * useSurfaceClientTools("matrx-user/content-plan", {
 *   content_plan_focus_node: (input) => focusNode(input),
 * });
 * ```
 *
 * The handlers object is held in a ref, so an inline literal is fine and the
 * registered functions always call the LATEST closure (fresh page state).
 * Handlers may throw; the client-tool runtime wraps every call in a safe,
 * loud envelope.
 */
export function useSurfaceClientTools(
  surfaceName: string | null,
  handlers: SurfaceClientToolHandlers,
): void {
  const { live, capture } = useRegistrationTargets();
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const add = (registry: SurfaceRegistry) => {
    const proxied: SurfaceClientToolHandlers = {};
    for (const key of Object.keys(handlersRef.current)) {
      proxied[key] = (input: unknown, call?: SurfaceToolCall) =>
        handlersRef.current[key]?.(input, call);
    }
    return registry.addClientTools(surfaceName ?? "", proxied);
  };
  // The KEY SET is the registration identity — same contract as
  // useSurfaceWriteHandlers above.
  const identity = surfaceName
    ? `${surfaceName}|${Object.keys(handlers).sort().join("|")}`
    : null;
  useRegistrationIn(live, identity, add);
  useRegistrationIn(capture, identity, add);
}

/**
 * Nesting depth of the current provider subtree. Each SurfaceRuntimeProvider
 * publishes `ownDepth = parentDepth + 1` so nested providers always register
 * DEEPER than their ancestors — the registry resolves by depth, immune to
 * effect-firing order (child effects run before parent effects).
 */
const SurfaceRuntimeDepthContext = createContext(0);

/** True below a `<SurfaceLayerBoundary>`. */
const SurfaceLayerContext = createContext(false);

/**
 * Depth every layer starts from. A page nests its providers a few deep (a
 * layout provider, the page, a panel), so a layer mounted at the app root by
 * the overlay controller — outside the page's tree, at provider depth 1 —
 * used to LOSE to a depth-2 page and its surface never became primary while
 * it was open (register ARE-012). Layers start far above any page.
 */
export const SURFACE_LAYER_DEPTH_BASE = 1000;

/**
 * Marks everything inside as a LAYER over the page: a dialog, window, sheet,
 * drawer or panel. Providers below register as `layer: true` and rank above
 * every page provider, wherever they mount. The overlay controller wraps
 * every layer it opens in one (`lazyOverlay`); a dialog rendered inside a
 * page's own tree wraps its content itself. Renders no DOM.
 */
export function SurfaceLayerBoundary({ children }: { children: ReactNode }) {
  const parentDepth = useContext(SurfaceRuntimeDepthContext);
  return (
    <SurfaceLayerContext.Provider value={true}>
      <SurfaceRuntimeDepthContext.Provider
        value={Math.max(parentDepth, SURFACE_LAYER_DEPTH_BASE)}
      >
        {children}
      </SurfaceRuntimeDepthContext.Provider>
    </SurfaceLayerContext.Provider>
  );
}

/**
 * Page-tree registration. Renders children unchanged aside from the depth
 * context. The registered getter is stable, while its scope-builder ref is
 * refreshed during render so a chrome read between commit and passive effects
 * cannot observe a previous account's closure.
 */
export function SurfaceRuntimeProvider({
  children,
  surfaceName,
  getScope,
  beforeExecute,
  isEditable,
  getWriteHandlers,
  ownConversationId,
  isOwnConversation,
}: SurfaceRuntimeValue & { children: ReactNode }) {
  const depth = useContext(SurfaceRuntimeDepthContext) + 1;
  const layer = useContext(SurfaceLayerContext);
  const { live, capture } = useRegistrationTargets();
  const getScopeRef = useRef(getScope);
  // This is a local ref assignment, not a registry mutation. Registration
  // remains effect-owned, but its already-registered callback sees the current
  // render immediately (before passive effects have a chance to run).
  // This ref is intentionally the commit-visible bridge for an already-
  // registered external callback.
  // eslint-disable-next-line react-hooks/refs
  getScopeRef.current = getScope;
  const stableGetScope = useCallback(() => getScopeRef.current(), []);
  // What every reader sees — the provider's scope plus descendant
  // contributions — so an Alchemy transfer carries the same values an agent does.
  const mergedGetScope = useCallback(
    () => withScopeContributions(surfaceName, () => getScopeRef.current())(),
    [surfaceName],
  );
  const beforeExecuteRef = useRef(beforeExecute);
  const getWriteHandlersRef = useRef(getWriteHandlers);
  const ownConversationIdRef = useRef(ownConversationId);
  const isOwnConversationRef = useRef(isOwnConversation);
  useEffect(() => {
    beforeExecuteRef.current = beforeExecute;
    getWriteHandlersRef.current = getWriteHandlers;
    ownConversationIdRef.current = ownConversationId;
    isOwnConversationRef.current = isOwnConversation;
  });

  const add = (registry: SurfaceRegistry) =>
    registry.register(
      {
        surfaceName,
        isEditable,
        layer,
        getScope: stableGetScope,
        beforeExecute: (input) => beforeExecuteRef.current?.(input),
        getWriteHandlers: () => getWriteHandlersRef.current?.() ?? {},
        getOwnConversationId: () => ownConversationIdRef.current,
        isOwnConversation: (id) => isOwnConversationRef.current?.(id) === true,
      },
      depth,
    );
  const identity = JSON.stringify([surfaceName, isEditable ?? null, layer, depth]);
  useRegistrationIn(live, identity, add);
  useRegistrationIn(capture, identity, add);

  return (
    <SurfaceRuntimeDepthContext.Provider value={depth}>
      <AlchemySurfaceBridge surfaceName={surfaceName} getScope={mergedGetScope}>
        {children}
      </AlchemySurfaceBridge>
    </SurfaceRuntimeDepthContext.Provider>
  );
}

/**
 * Hook-shaped twin of `<SurfaceRuntimeProvider>` — registers a live runtime
 * from INSIDE a hook, at the same depth a provider mounted there would get.
 *
 * Use it when the component that owns the surface's live state has early
 * returns (loading, gates, override branches) or exposes its state through a
 * hook rather than a subtree. Wrapping such a component's JSX in a provider
 * would unregister and re-register the surface on every branch flip; this
 * registers once for the hook's lifetime.
 *
 * Pass `null` to register nothing (the surface is inherited from an ancestor
 * provider, or the host is not on a declared surface). `getScope` is held in a
 * ref, so an inline arrow is fine — identity churn never thrashes the
 * registry, and the registered getter always calls the LATEST closure.
 *
 * ONE live registration per surface still applies: two siblings registering
 * the same surface at the same depth is a coin flip (FOUND_DEFECTS D194).
 */
export function useSurfaceRuntimeRegistration(
  value: SurfaceRuntimeValue | null,
): SurfaceHandle | null {
  const depth = useContext(SurfaceRuntimeDepthContext) + 1;
  const layer = useContext(SurfaceLayerContext);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });

  const surfaceName = value?.surfaceName ?? null;
  const { live, capture } = useRegistrationTargets();
  const transferHandle = useAlchemySurfaceHandle(
    surfaceName ?? "__unbound_surface_runtime__",
    () => {
      const current = valueRef.current;
      if (!current) {
        throw new Error(
          "Alchemy transfer was requested after its hook-only surface unmounted.",
        );
      }
      return current.getScope();
    },
  );
  const isEditable = value?.isEditable;
  const add = (registry: SurfaceRegistry) => {
    const name = surfaceName ?? "";
    const runtime: SurfaceRuntimeValue = {
      surfaceName: name,
      isEditable,
      layer,
      getScope: () => {
        const current = valueRef.current;
        if (!current) {
          // Unreachable while registered (the registration is torn down in
          // the same effect that could clear the value) — loud rather than
          // a silent empty scope if that ever stops being true.
          throw new Error(
            `[surfaces] runtime for "${name}" was read after its owner stopped emitting`,
          );
        }
        return current.getScope();
      },
      beforeExecute: (input) => valueRef.current?.beforeExecute?.(input),
      getWriteHandlers: () => valueRef.current?.getWriteHandlers?.() ?? {},
      getOwnConversationId: () => valueRef.current?.ownConversationId,
      isOwnConversation: (id) =>
        valueRef.current?.isOwnConversation?.(id) === true,
    };
    return registry.register(runtime, depth);
  };
  const identity = surfaceName
    ? JSON.stringify([surfaceName, isEditable ?? null, layer, depth])
    : null;
  useRegistrationIn(live, identity, add);
  useRegistrationIn(capture, identity, add);
  return surfaceName ? transferHandle : null;
}
