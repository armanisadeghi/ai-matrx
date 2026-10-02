/**
 * Default diagnostics port: the platform errors system.
 *
 * Writes through the existing `log_client_error` RPC (it lands in
 * `ops.system_error`, the surface the `errors` tool and the admin dashboard
 * read) — never a new table — and always to the console. Same rules as
 * matrx-frontend `lib/diagnostics/persistCapturedErrors.ts`:
 *
 *   - production only: dev/local failures never reach the shared store;
 *   - deduped: each distinct failure is persisted at most once per page;
 *   - throttled: debounced flush, capped per flush;
 *   - signed-in only: the RPC needs a user, so a signed-out page stays on the
 *     console and says so once;
 *   - never persists its own RPC failure (no loop), never throws.
 *
 * `sourceApp` must be on the RPC's closed list; anything else would be refused
 * by the database, so it is refused here first — loudly, once — and the port
 * stays on the console.
 */

import {
  CHAT_SOURCE_APPS,
  type ChatDb,
  type ChatDiagnosticContext,
  type ChatDiagnosticsPort,
  type ChatSourceApp,
} from "../contract";
import { announceOnce } from "../errors";
import type { ChatDatabase } from "../db-types";

export const DIAGNOSTICS_FLUSH_DELAY_MS = 1500;
export const DIAGNOSTICS_MAX_PER_FLUSH = 20;
/** `p_source_feature` for every row this package files. */
export const CHAT_SOURCE_FEATURE = "chat";

export interface LogClientErrorDiagnosticsOptions {
  sourceApp: string | null | undefined;
  /** Default: `process.env.NODE_ENV === "production"`. */
  persist?: boolean;
  flushDelayMs?: number;
}

/** The `log_client_error` overload that names the client (`p_source_app`). */
type LogClientErrorArgs = Extract<
  ChatDatabase["public"]["Functions"]["log_client_error"]["Args"],
  { p_source_app: string }
>;

interface Pending {
  key: string;
  args: LogClientErrorArgs;
}

export function isChatSourceApp(value: unknown): value is ChatSourceApp {
  return (
    typeof value === "string" &&
    (CHAT_SOURCE_APPS as readonly string[]).includes(value)
  );
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

function toJson(value: unknown): unknown {
  try {
    return value === undefined ? null : JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function currentRoute(): string | undefined {
  try {
    return typeof window !== "undefined" ? window.location.pathname : undefined;
  } catch {
    return undefined;
  }
}

export function createLogClientErrorDiagnostics(
  db: ChatDb,
  options: LogClientErrorDiagnosticsOptions,
): ChatDiagnosticsPort {
  const persist = options.persist ?? process.env.NODE_ENV === "production";
  const flushDelayMs = options.flushDelayMs ?? DIAGNOSTICS_FLUSH_DELAY_MS;
  const sourceApp = isChatSourceApp(options.sourceApp)
    ? options.sourceApp
    : null;
  const persisted = new Set<string>();
  const queue: Pending[] = [];
  let scheduled = false;

  function sourceAppUsable(): boolean {
    if (sourceApp) return true;
    announceOnce(
      `diagnostics-source-app:${String(options.sourceApp)}`,
      options.sourceApp == null
        ? "Chat diagnostics are on the console only: the host did not name its app. " +
            `Pass sourceApp (one of ${CHAT_SOURCE_APPS.join(", ")}) to the chat host.`
        : `Chat diagnostics are on the console only: sourceApp "${String(options.sourceApp)}" ` +
            `is not one the errors system accepts (${CHAT_SOURCE_APPS.join(", ")}).`,
      "error",
    );
    return false;
  }

  function schedule(): void {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      void flush();
    }, flushDelayMs);
  }

  async function flush(): Promise<void> {
    scheduled = false;
    if (queue.length === 0) return;
    let signedIn = false;
    try {
      const { data } = await db.auth.getSession();
      signedIn = Boolean(data.session?.user);
    } catch {
      signedIn = false;
    }
    if (!signedIn) {
      queue.length = 0;
      announceOnce(
        "diagnostics-signed-out",
        "Chat diagnostics are on the console only while nobody is signed in " +
          "(the errors system records signed-in failures).",
        "info",
      );
      return;
    }
    const batch = queue.splice(0, DIAGNOSTICS_MAX_PER_FLUSH);
    if (queue.length > 0) schedule();
    for (const item of batch) {
      try {
        const { error } = await db.rpc("log_client_error", item.args);
        if (error) {
          // Never captured back into this port — that would loop.
          console.error(
            "[ai-matrx/chat] log_client_error refused a chat diagnostic; it stays on the console.",
            error,
          );
        }
      } catch (thrown) {
        console.error(
          "[ai-matrx/chat] log_client_error could not be reached; the chat diagnostic stays on the console.",
          thrown,
        );
      }
    }
  }

  return {
    capture(error: unknown, ctx: ChatDiagnosticContext): void {
      const message = messageOf(error);
      console.error(
        `[ai-matrx/chat] ${ctx.area}/${ctx.code}: ${message}`,
        ctx.detail ?? "",
      );
      // `!sourceApp` never decides (sourceAppUsable already said no); it narrows the type.
      if (!persist || !sourceAppUsable() || !sourceApp) return;
      const key = `${ctx.area}|${ctx.code}|${message}`;
      if (persisted.has(key)) return;
      persisted.add(key);
      const stack = error instanceof Error ? error.stack : undefined;
      const route = currentRoute();
      queue.push({
        key,
        args: {
          p_source_app: sourceApp,
          p_source_feature: CHAT_SOURCE_FEATURE,
          p_source: `chat-${ctx.area}`,
          p_message: message,
          p_code: ctx.code,
          ...(route ? { p_route: route } : {}),
          ...(stack ? { p_stack: stack } : {}),
          p_context: toJson({
            area: ctx.area,
            code: ctx.code,
            detail: ctx.detail,
          }),
        },
      });
      schedule();
    },
  };
}
