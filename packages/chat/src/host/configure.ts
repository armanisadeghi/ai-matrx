/**
 * Resolve a `ChatHost` into a host with every port present, and hold the one
 * configured host for non-React code paths (thunks, services, middlewares).
 *
 * - `resolveChatHost(host)` is pure: no global read or write. Server-only files
 *   use it (or take a resolved host as an argument) so nothing leaks across
 *   requests.
 * - `configureChat(host)` resolves and installs it; `getChatHost()` reads it
 *   and throws a named, remedied error when nothing was configured.
 *
 * Defaults are wired through getters, so a default port that needs another
 * port (identity → diagnostics, server → identity + org) always reaches the
 * resolved one — the host's override when it gave one.
 */

import type { AgentCatalog } from "@ai-matrx/agents/catalog";
import type {
  ChatHost,
  ChatPortName,
  ChatRegistrations,
  ChatRoutes,
  ResolvedChatHost,
} from "./contract";
import {
  ChatHostInvalidError,
  ChatHostNotConfiguredError,
  announceOnce,
} from "./errors";
import {
  createLogClientErrorDiagnostics,
  isChatSourceApp,
} from "./defaults/diagnostics";
import { createDbIdentity } from "./defaults/identity";
import { createNoPickerOrg } from "./defaults/org";
import { createDefaultServer } from "./defaults/server";
import { createDomNotifier } from "./defaults/notify";
import { createWebPrefs } from "./defaults/prefs";
import { createWindowNavigation } from "./defaults/navigation";
import { createUnhostedWindows } from "./defaults/windows";
import { createDbCatalogGetter } from "./defaults/catalog";
import { createDefaultChrome } from "./defaults/chrome";
import { createDbFeedback } from "./defaults/feedback";
import { createUnhostedCanvas } from "./defaults/canvas";

/** The platform's production addresses — the default `routes`. */
export const DEFAULT_CHAT_ROUTES: ChatRoutes = Object.freeze({
  workflowStudio: "https://workflows.aimatrx.com",
});

const PORTS: readonly ChatPortName[] = [
  "identity",
  "org",
  "server",
  "notify",
  "diagnostics",
  "prefs",
  "navigation",
  "windows",
  "catalog",
  "registry",
  "chrome",
  "feedback",
  "routes",
  "canvas",
];

const EMPTY_REGISTRATIONS: ChatRegistrations = Object.freeze({});

function assertDb(host: ChatHost | null | undefined): void {
  const db = host?.db as
    { auth?: unknown; rpc?: unknown; from?: unknown } | undefined;
  if (!db) throw new ChatHostInvalidError("`db` is missing");
  if (
    typeof db.rpc !== "function" ||
    typeof db.from !== "function" ||
    !db.auth
  ) {
    throw new ChatHostInvalidError(
      "`db` is not a Supabase client (no auth/rpc/from)",
    );
  }
}

export function resolveChatHost(host: ChatHost): ResolvedChatHost {
  assertDb(host);
  const { db } = host;
  const overridden = new Set<ChatPortName>(
    PORTS.filter((name) => host[name] !== undefined),
  );

  // Late-bound references so every default reaches the final ports.
  const ref = {} as ResolvedChatHost;
  const diagnostics =
    host.diagnostics ??
    createLogClientErrorDiagnostics(db, { sourceApp: host.sourceApp });
  const notify = host.notify ?? createDomNotifier();
  const identity = host.identity ?? createDbIdentity(db, () => ref.diagnostics);
  const org =
    host.org ??
    createNoPickerOrg(
      () => ref.notify,
      () => ref.diagnostics,
    );
  const server =
    host.server ??
    createDefaultServer(
      () => ref.identity,
      () => ref.org,
    );
  const prefs = host.prefs ?? createWebPrefs();
  const navigation = host.navigation ?? createWindowNavigation();
  const windows = host.windows ?? createUnhostedWindows(() => ref.diagnostics);
  const catalogSource = host.catalog;
  const catalog: () => AgentCatalog =
    typeof catalogSource === "function"
      ? catalogSource
      : catalogSource
        ? () => catalogSource
        : createDbCatalogGetter(
            db,
            () => ref.identity,
            () => ref.diagnostics,
          );

  Object.assign(ref, {
    db,
    sourceApp: isChatSourceApp(host.sourceApp) ? host.sourceApp : null,
    identity,
    org,
    server,
    notify,
    diagnostics,
    prefs,
    navigation,
    windows,
    catalog,
    registry: host.registry ?? EMPTY_REGISTRATIONS,
    chrome: { ...createDefaultChrome(), ...host.chrome },
    feedback: host.feedback ?? createDbFeedback(db, () => ref.identity),
    routes: { ...DEFAULT_CHAT_ROUTES, ...host.routes },
    canvas: host.canvas ?? createUnhostedCanvas(() => ref.diagnostics),
    overridden,
  } satisfies ResolvedChatHost);
  return ref;
}

let configured: { host: ChatHost; resolved: ResolvedChatHost } | null = null;

/** Install `host` for non-React code. Same host object again is a no-op. */
export function configureChat(host: ChatHost): ResolvedChatHost {
  if (configured?.host === host) return configured.resolved;
  if (configured && configured.host.db !== host.db) {
    announceOnce(
      "configure-replaced-db",
      "configureChat was called again with a different `db`; the newest host replaces the first. " +
        "Configure the chat host once per page.",
    );
  }
  const resolved = resolveChatHost(host);
  configured = { host, resolved };
  for (const listener of configuredListeners) {
    try {
      listener();
    } catch {
      /* a listener must never break configuration */
    }
  }
  return resolved;
}

const configuredListeners = new Set<() => void>();

/** Call `listener` each time a host is configured (e.g. to deliver work held before one existed). */
export function onChatHostConfigured(listener: () => void): () => void {
  configuredListeners.add(listener);
  return () => configuredListeners.delete(listener);
}

/** The configured host. Throws `ChatHostNotConfiguredError` (with the remedy) when there is none. */
export function getChatHost(): ResolvedChatHost {
  if (!configured) throw new ChatHostNotConfiguredError();
  return configured.resolved;
}

/** True once `configureChat` (or `<ChatProvider>` in a browser) has run. */
export function isChatHostConfigured(): boolean {
  return configured !== null;
}

/** Test-only: forget the configured host. */
export function _resetChatHostForTests(): void {
  configured = null;
}
