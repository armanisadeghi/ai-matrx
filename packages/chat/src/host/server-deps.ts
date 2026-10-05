/**
 * host/server-deps — the host's SERVER-ONLY doors (no "use client": server components and server
 * services call these). The host registers them once from a server module
 * (matrx-frontend: providers/chatServerRegistration.ts, imported by app/layout.tsx).
 * A call before registration throws, naming the door.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyFn = (...args: any[]) => any;

export interface ChatServerDeps {
  /** The host's server-side database client (`await createClient()`). */
  createClient: AnyFn;
  /** One agent definition by id for server rendering. */
  getAgent: AnyFn;
}

const deps: Partial<ChatServerDeps> = {};

export function registerChatServerDeps(next: Partial<ChatServerDeps>): void {
  Object.assign(deps, next);
}

function door<K extends keyof ChatServerDeps>(name: K): ChatServerDeps[K] {
  return ((...args: unknown[]) => {
    const fn = deps[name] as AnyFn | undefined;
    if (!fn) throw new Error(`The host registered no server door "${name}" for the chat package (registerChatServerDeps).`);
    return fn(...args);
  }) as ChatServerDeps[K];
}

export const createClient = door("createClient");
export const getAgent = door("getAgent");
