/**
 * Session manager — one writer per stream identity, N readers, mechanically
 * enforced: a second `openParseSession` for a live identity THROWS. Readers
 * resolve sessions by identity and never gain write access.
 *
 * Identities: `"{requestId}:{blockId}"` for agent-stream regions; any unique
 * string for other hosts (demo runs, notes, one-shot upgrades).
 *
 * Ended sessions stay resolvable for late readers (reload happens via the
 * persisted envelope, but in-session remounts read here) until disposed.
 */

import { ParseSession, type ParseSessionOptions } from "./parse-session";

const sessions = new Map<string, ParseSession>();

export function openParseSession(options: ParseSessionOptions): ParseSession {
  const existing = sessions.get(options.identity);
  if (existing && !existing.isEnded) {
    throw new Error(
      `content-ir: a writer is already open for identity "${options.identity}". ` +
        "One writer per stream identity — everyone else reads.",
    );
  }
  existing?.dispose();

  const session = new ParseSession(options);
  sessions.set(options.identity, session);
  return session;
}

export function getParseSession(identity: string): ParseSession | null {
  return sessions.get(identity) ?? null;
}

export function disposeParseSession(identity: string): void {
  const session = sessions.get(identity);
  if (!session) return;
  session.dispose();
  sessions.delete(identity);
}
