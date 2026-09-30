// alchemy-session — open the canonical Alchemy transfer session for ANY source
// from code that is not a React component (a menu handler, a thunk).
//
// A handler cannot mount <ContentTransferMenu>, and the capabilities the
// preparation workspace and the destinations need (AI preparation, Save to
// Notes, Create a task, Open in a new chat, Email) live in React context under
// <AlchemyHost>. This is the one door between them: a handler files a request
// here; <AlchemySessionPortal> (mounted once inside AlchemyHost, app/Providers.tsx) runs it with the
// app's real capabilities. Never a second transfer menu, preparation workspace
// or destination list.

import type { FormatAdapter, Payload, Source } from "@ai-matrx/kit/content-transfer";
import type { EnvelopeMeta, TransferMenuVariant } from "@ai-matrx/design-system/content-transfer";

export type AlchemySessionIntent =
  /**
   * The preparation workspace (trim, choose, AI preparation, destinations). `forDestination`: the
   * person pressed this to SEND the content somewhere (a chat, an assistant, a note) — every
   * destination is filed under an organization, so with none chosen the one write helper asks first
   * (cancel = the workspace opens anyway, without destinations), exactly as the `action` intent does.
   */
  | { kind: "prepare"; variantId?: string; forDestination?: boolean }
  /** One destination action by id (`matrx:notes`, `matrx:task`, `email-markdown`, …). */
  | { kind: "action"; actionId: string; label: string };

export interface AlchemySessionRequest {
  /** Unique per request: a new key mounts a fresh session. */
  key: string;
  label: string;
  source: Source | Payload;
  formatSources?: Record<string, Source | Payload>;
  /** Source-specific engines for built-in format names (e.g. a conversation's JSON = its chosen messages). */
  formats?: readonly FormatAdapter[];
  variants?: readonly TransferMenuVariant[];
  /**
   * Who the primary source is, for the AI envelope ("Copy as: For AI" and the AI preparation): its
   * kind, location, description, summary, attributes. Without it the workspace falls back to a
   * generic "Captured content" envelope, which says nothing about where the content came from.
   */
  envelope?: EnvelopeMeta;
  intent: AlchemySessionIntent;
}

type Listener = () => void;

function store(): { current: AlchemySessionRequest | null; listeners: Set<Listener> } {
  const key = Symbol.for("ai-matrx.alchemy-session");
  const g = globalThis as unknown as Record<symbol, ReturnType<typeof store> | undefined>;
  let s = g[key];
  if (!s) {
    s = { current: null, listeners: new Set() };
    g[key] = s;
  }
  return s;
}

/**
 * File a request; the mounted portal runs it. Returns false when no portal is
 * mounted (outside <AlchemyHost>) — the caller says so, never a silent no-op.
 */
export function openAlchemySession(request: AlchemySessionRequest): boolean {
  const s = store();
  if (s.listeners.size === 0) return false;
  s.current = request;
  for (const l of [...s.listeners]) l();
  return true;
}

export function currentAlchemySession(): AlchemySessionRequest | null {
  return store().current;
}

export function subscribeAlchemySession(listener: Listener): () => void {
  const s = store();
  s.listeners.add(listener);
  return () => {
    s.listeners.delete(listener);
  };
}
