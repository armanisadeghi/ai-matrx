"use client";

// lib/records/recordChanges.ts
//
// A LIST HEARS ABOUT A RECORD THE SAME PAGE JUST MADE. One in-page signal, keyed by registry
// token: a writer announces "a <token> was created / changed / archived", and every mounted list
// of that token re-asks the server. Found by lane 7 (2026-10-02, felt-it-fix-it): a person created
// from /crm did not appear on the CRM list until a reload, because the create lives in a window
// that knows nothing about the list behind it.
//
// Announce at the WRITE, not at one button: the service function that creates or changes the row
// announces, so every door that calls it (the form, an import, an agent's tool on the page)
// refreshes every list at once. In-page only; another tab or another person's write is realtime's
// job, not this.

import { useEffect, useRef } from "react";

export type RecordChangeKind = "created" | "updated" | "archived" | "restored";

export interface RecordChange {
  token: string;
  kind: RecordChangeKind;
  id?: string;
}

const EVENT = "matrx:record-change";
const bus: EventTarget | null = typeof window === "undefined" ? null : new EventTarget();

export function announceRecordChange(change: RecordChange): void {
  bus?.dispatchEvent(new CustomEvent<RecordChange>(EVENT, { detail: change }));
}

/** Call `onChange` whenever a record of `token` is announced (null = listen to nothing). */
export function useRecordChanges(token: string | null, onChange: (change: RecordChange) => void): void {
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  useEffect(() => {
    if (!bus || !token) return;
    const listener = (event: Event) => {
      const change = (event as CustomEvent<RecordChange>).detail;
      if (change?.token === token) latest.current(change);
    };
    bus.addEventListener(EVENT, listener);
    return () => bus.removeEventListener(EVENT, listener);
  }, [token]);
}
