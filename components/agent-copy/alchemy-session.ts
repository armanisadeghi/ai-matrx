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

import type { Payload, Source } from "@ai-matrx/kit/content-transfer";
import type { TransferMenuVariant } from "@ai-matrx/design-system/content-transfer";

export type AlchemySessionIntent =
  /** The preparation workspace (trim, choose, AI preparation, destinations). */
  | { kind: "prepare"; variantId?: string }
  /** One destination action by id (`matrx:notes`, `matrx:task`, `email-markdown`, …). */
  | { kind: "action"; actionId: string; label: string };

export interface AlchemySessionRequest {
  /** Unique per request: a new key mounts a fresh session. */
  key: string;
  label: string;
  source: Source | Payload;
  formatSources?: Record<string, Source | Payload>;
  variants?: readonly TransferMenuVariant[];
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
