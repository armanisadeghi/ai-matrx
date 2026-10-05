/**
 * The diagnostics seam — the ONE place package code records a failure (P5).
 *
 * Same names and shapes the call sites used when they imported the host app's
 * Error Inspector helpers (`captureError`, `recordUnavailable`,
 * `captureReactRenderError`, `captureStreamClientError`), so moving a call
 * site onto the diagnostics port changed only its import specifier. Every
 * call goes to the configured host's `diagnostics` port at call time, never at
 * import: matrx-frontend maps it to its Error Inspector store
 * (providers/ChatHostAdapter.tsx); a bare host gets the package default — the
 * platform errors system through `log_client_error` (defaults/diagnostics.ts).
 *
 * Recording never throws and never breaks the caller. Before any host is
 * configured an entry is held (bounded) and handed to the host the moment one
 * is configured; the first such entry says so once on the console (Law 4).
 */

import {
  isRecordUnavailableError,
  RecordUnavailableError,
  recordUnavailableMessage,
  type RecordUnavailableReason,
} from "@ai-matrx/data/db";
import { extractErrorMessage } from "@ai-matrx/data/net";
import { getChatHost, isChatHostConfigured, onChatHostConfigured } from "./configure";
import type {
  ChatDiagnosticEntry,
  ChatDiagnosticsPort,
  ChatNetRequestFinish,
  ChatNetRequestPhase,
  ChatNetRequestStart,
} from "./contract";
import { announceOnce } from "./errors";

export {
  isRecordUnavailableError,
  RecordUnavailableError,
  recordUnavailableMessage,
  type RecordUnavailableReason,
};

/** Entries held before a host exists; the oldest drop first past this. */
export const EARLY_DIAGNOSTICS_LIMIT = 100;

let early: ChatDiagnosticEntry[] = [];
let localIds = 0;

function nextLocalId(): string {
  localIds += 1;
  return `chat-diagnostic-${localIds}`;
}

function errorOf(entry: ChatDiagnosticEntry): Error {
  const error = new Error(entry.message);
  if (entry.name) error.name = entry.name;
  if (entry.stack) error.stack = entry.stack;
  return error;
}

/** Hand one entry to a port: its structured `record` when it has one, else `capture`. */
function deliver(port: ChatDiagnosticsPort, entry: ChatDiagnosticEntry): string {
  if (port.record) return port.record(entry);
  // An expected, handled diagnostic is not an incident for a capture-only port.
  if (entry.durable === false) return nextLocalId();
  port.capture(errorOf(entry), {
    area: entry.source,
    code: entry.code ?? entry.source,
    detail: entry,
  });
  return nextLocalId();
}

function flushEarly(): void {
  if (early.length === 0 || !isChatHostConfigured()) return;
  const held = early;
  early = [];
  const port = getChatHost().diagnostics;
  for (const entry of held) {
    try {
      deliver(port, entry);
    } catch {
      /* a host sink that throws must never break the package */
    }
  }
}

onChatHostConfigured(flushEarly);

/**
 * Record one structured diagnostic. Returns the host's id for it (the Error
 * Inspector's row id in matrx-frontend), or a local id when the host keeps none.
 */
export function captureError(entry: ChatDiagnosticEntry): string {
  try {
    if (!isChatHostConfigured()) {
      announceOnce(
        "diagnostics-before-host",
        `A diagnostic was recorded before the chat host was configured ("${entry.source}: ${entry.message}"). ` +
          "It is held and delivered once <ChatProvider host={...}> (or configureChat) runs.",
      );
      early.push(entry);
      if (early.length > EARLY_DIAGNOSTICS_LIMIT) early.shift();
      return nextLocalId();
    }
    flushEarly();
    return deliver(getChatHost().diagnostics, entry);
  } catch {
    /* recording must never break the caller */
    return nextLocalId();
  }
}

/** The host's connection-health view, or nothing when the host keeps none. */
export const netRequests = {
  start(request: ChatNetRequestStart): void {
    try {
      if (isChatHostConfigured()) getChatHost().diagnostics.requests?.start(request);
    } catch {
      /* never break the run */
    }
  },
  phase(id: string, phase: ChatNetRequestPhase): void {
    try {
      if (isChatHostConfigured()) getChatHost().diagnostics.requests?.phase(id, phase);
    } catch {
      /* never break the run */
    }
  },
  heartbeat(id: string): void {
    try {
      if (isChatHostConfigured()) getChatHost().diagnostics.requests?.heartbeat(id);
    } catch {
      /* never break the run */
    }
  },
  finish(result: ChatNetRequestFinish): void {
    try {
      if (isChatHostConfigured()) getChatHost().diagnostics.requests?.finish(result);
    } catch {
      /* never break the run */
    }
  },
};

/**
 * Build the zero-row error AND record it. Never construct
 * `RecordUnavailableError` directly at a read site — the record is the loud
 * half of the contract. `captureId` is the host's id, so the host can later
 * reconcile the same row with the resolved truth.
 */
export function recordUnavailable(input: {
  entity: string;
  reason: RecordUnavailableReason;
  recordId?: string;
  /** Canonical entity token, so the surface can ask instead of describing. */
  token?: string;
  /** Table/view the zero-row read hit. */
  relation?: string;
}): RecordUnavailableError {
  const error = new RecordUnavailableError(input);
  error.captureId = captureError({
    source: "record-unavailable",
    operation: "select",
    relation: input.relation ?? input.entity,
    message: `Zero-row read for ${input.entity}${input.recordId ? ` ${input.recordId}` : ""} (${input.reason})`,
    userMessage: error.message,
    name: error.name,
    raw: {
      entity: input.entity,
      reason: input.reason,
      recordId: input.recordId,
      token: input.token,
    },
  });
  return error;
}

export interface ReactErrorContext {
  /** A name for the boundary that caught it (e.g. "MessageErrorBoundary"). */
  boundary?: string;
  /** React's component stack from `ErrorInfo`. */
  componentStack?: string | null;
  /** For lazy pieces: the dynamic-import module path that failed. */
  modulePath?: string | null;
  /** What failed — e.g. a message id, route name, or `tool:<name>`. */
  relation?: string;
}

/**
 * A React render error an error boundary caught (boundaries swallow the error,
 * so nothing global sees it — a boundary opts in from `componentDidCatch`).
 */
export function captureReactRenderError(
  error: unknown,
  ctx: ReactErrorContext = {},
): void {
  captureError({
    source: "react-render",
    relation: ctx.relation ?? ctx.boundary ?? ctx.modulePath ?? undefined,
    message: extractErrorMessage(error) || "React render error",
    name: error instanceof Error ? error.name : undefined,
    stack: error instanceof Error ? error.stack : undefined,
    // The component stack is the "where in the tree" answer — the call site.
    callSite: ctx.componentStack ?? undefined,
    raw: {
      boundary: ctx.boundary,
      modulePath: ctx.modulePath,
      componentStack: ctx.componentStack,
      name: error instanceof Error ? error.name : undefined,
      message: extractErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
    },
  });
}

export interface StreamClientErrorInput {
  errorType: string;
  message: string;
  userMessage?: string;
  name?: string;
  /** "turn" | "resume" — which stream path died. */
  kind?: string;
  conversationId?: string;
  requestId?: string;
  /** Original throw, used to skip a duplicate of what the transport already recorded. */
  cause?: unknown;
}

/**
 * A client-side stream death (heartbeat loss, total-timeout, fetch failure) —
 * these never arrive as a stream event, so the run's catch synthesizes the
 * shape. Skipped when the host's transport already recorded the same throw.
 */
export function captureStreamClientError(input: StreamClientErrorInput): void {
  try {
    if (
      isChatHostConfigured() &&
      getChatHost().diagnostics.wasCaptured?.(input.cause) === true
    ) {
      return;
    }
  } catch {
    /* fall through and record it */
  }
  const { cause: _cause, ...capturedInput } = input;
  captureError({
    source: "agent-stream-client-error",
    relation: input.kind ? `stream:${input.kind}` : "stream",
    code: input.errorType,
    message: input.message || "Stream connection failed",
    userMessage: input.userMessage,
    name: input.name,
    conversationId: input.conversationId,
    requestId: input.requestId,
    raw: capturedInput,
  });
}

/** Test-only: drop held entries and restart local ids. */
export function _resetDiagnosticsForTests(): void {
  early = [];
  localIds = 0;
}

/**
 * A host registration (UI slot, usage gate, model-class hooks) was never made, so a stand-in
 * is running: say so ONCE, to the console and the host's diagnostics port (Law 4).
 */
export function reportUnregisteredHostSlot(name: string, degraded: string): void {
  const message = `The host registered no "${name}" for the chat package, so ${degraded}.`;
  if (!announceOnce(`chat-host-slot:${name}`, message)) return;
  captureError({
    source: "surface-registration",
    code: "chat-host-slot-unregistered",
    message,
    hint: "Register it before the first chat render (matrx-frontend: providers/chatUiRegistration.ts, imported by ChatHostAdapter).",
    recoverable: true,
    level: "high",
    callSite: `chat-host-slot:${name}`,
  });
}
