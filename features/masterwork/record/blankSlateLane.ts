"use client";

// features/masterwork/record/blankSlateLane.ts
//
// WHICH RULEBOOK IS BEING INTERVIEWED BLIND, RIGHT NOW.
//
// A `<SurfaceRuntimeProvider>` publishes its scope on EVERY turn, not once at
// launch — that is the whole point of it, and it is why the Scout's view of the
// rules stays current while the Expert reviews them mid-session. It is also how
// a blank-slate interview, launched with an empty scope and a payload proven to
// carry no source text, got the entire rendered Rulebook handed back to it one
// turn later (found live 2026-09-15, driving the lane as a non-technical user).
//
// The lane route owns the provider; the interview panel knows the mode. They are
// in different files with no prop path between them, so the mode is declared
// here — the same shape as `features/audio/recordingOrigin.ts`, which solves the
// identical "a deep child knows something a distant parent must honour" problem
// for dictation. A module-level register, not React context, because
// `buildSurfaceScope` is a plain callback the surface runtime invokes.
//
// 🚨 THE DEFAULT IS "NOT BLANK SLATE". Forgetting to declare withholds nothing,
// which shows the Expert a primed interview when she asked for one and a primed
// interview when she asked for a blank slate — visibly wrong in the second case
// the moment the interviewer quotes something. Forgetting the CLEAR would be
// worse (a primed interview silently starved of the Rulebook), so every declare
// returns its own undo and the panel calls it on unmount.

const blind = new Set<string>();
const listeners = new Set<() => void>();

/**
 * Declare that the interview open on this Rulebook is a blank-slate one.
 * Returns the undo — call it when the interview unmounts or its mode changes.
 */
export function declareBlankSlateInterview(rulebookId: string): () => void {
  blind.add(rulebookId);
  notify();
  return () => {
    blind.delete(rulebookId);
    notify();
  };
}

/** Is this Rulebook's open interview a blank-slate one? */
export function isBlankSlateInterview(rulebookId: string): boolean {
  return blind.has(rulebookId);
}

/**
 * Re-publish when the answer changes: the surface provider caches nothing, but
 * a host that memoises its `getScope` callback has to be told to rebuild it.
 */
export function subscribeBlankSlate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only — a module-level register outlives a component tree. */
export function resetBlankSlateInterviews(): void {
  blind.clear();
  notify();
}

function notify(): void {
  for (const listener of listeners) listener();
}
