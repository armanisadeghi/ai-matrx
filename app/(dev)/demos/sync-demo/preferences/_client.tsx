/**
 * app/(a)/sync-demo/preferences/_client.tsx
 *
 * Phase 2 verification harness for the `userPreferences` warm-cache policy.
 *
 * Shows — in real time:
 *   - A compact view of Redux state (representative field from `prompts`)
 *   - `_meta.hasUnsavedChanges` + `_meta.lastSaved` (cosmetic UI state)
 *   - The Dexie IDB record at `matrx-sync.slices[${identity}:userPreferences:1]`
 *     (proves warm-cache is persisting)
 *   - The localStorage idbFallback mirror at `matrx:idbFallback:userPreferences`
 *     (the mirror written alongside IDB so we can survive IDB-quota failures)
 *   - A log of inbound BroadcastChannel messages (cross-tab propagation)
 *   - The live `identityKey` (swap it at runtime to prove isolation)
 *
 * Controls:
 *   - Mutate a preference (bumps `prompts.defaultTemperature` 0.1 → cheap
 *     dial for watching debounced Supabase upserts fire in dev tools)
 *   - Reset the prompts module (proves `REHYDRATE` handler shallow-merges)
 *   - Wipe the IDB slice (proves cold-boot fetch path)
 *   - Force reload — reboots the engine from persisted state
 *   - Identity swap (same control as theme demo)
 *
 * Use alongside the manual checklist in `phase-2-verification.md`.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Dexie, { type Table } from "dexie";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  setModulePreferences,
  resetModulePreferences,
} from "@/lib/redux/preferences/userPreferencesSlice";
import type { RootState } from "@/lib/redux/store";
import type { IdentityKey } from "@/lib/sync/types";

// Shape of a slice record written by the engine's IDB persistence layer. Kept
// local to the demo — production code imports the type from `lib/sync/persistence/idb`
// but the demo is a read-only observer, so duplicating the three fields we
// actually render keeps the deep import out of the public surface.
interface ObservedIdbRecord {
  key: string;
  identityKey: string;
  sliceName: string;
  version: number;
  body: unknown;
  persistedAt: number;
}

interface DemoDexie extends Dexie {
  slices: Table<ObservedIdbRecord, string>;
}

const IDB_NAME = "matrx-sync";
const IDB_SCHEMA_VERSION = 1;
const SLICE_NAME = "userPreferences";
const LS_FALLBACK_KEY = `matrx:idbFallback:${SLICE_NAME}`;

interface BroadcastEvent {
  at: number;
  raw: string;
}

// Open a *read-only* Dexie handle for inspection. Dexie multiplexes handles
// against the same DB name safely, so this does not interfere with the engine.
function openObserverDb(): DemoDexie {
  const db = new Dexie(IDB_NAME) as DemoDexie;
  db.version(IDB_SCHEMA_VERSION).stores({
    slices: "key, identityKey, sliceName",
  });
  return db;
}

export function PreferencesDemoClient() {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  // Representative Redux state. Pick one field that's cheap to dial.
  const defaultTemperature = useAppSelector(
    (s: RootState) => s.userPreferences.prompts.defaultTemperature,
  );
  const hasUnsavedChanges = useAppSelector(
    (s: RootState) => s.userPreferences._meta.hasUnsavedChanges,
  );
  const lastSaved = useAppSelector(
    (s: RootState) => s.userPreferences._meta.lastSaved,
  );
  const isLoading = useAppSelector(
    (s: RootState) => s.userPreferences._meta.isLoading,
  );

  // Live persisted-data observers.
  const [idbRecord, setIdbRecord] = useState<ObservedIdbRecord | null>(null);
  const [lsFallbackRaw, setLsFallbackRaw] = useState<string | null>(null);
  const [events, setEvents] = useState<BroadcastEvent[]>([]);

  // Hydration-safe display gate. SSR renders "—" for any values that depend
  // on window/Dexie so the client's first paint lines up with the server.
  const [mounted, setMounted] = useState(false);

  const [identityKey, setIdentityKey] = useState<string>("");
  const [identityInput, setIdentityInput] = useState<string>("guest:fake-xyz");

  // Live identity poll (same pattern as theme demo — `setIdentity` mutates
  // a closure so there's no Redux selector to subscribe to).
  useEffect(() => {
    setMounted(true);
    const read = () => setIdentityKey(store._sync.getIdentity().key);
    read();
    const id = window.setInterval(read, 500);
    return () => window.clearInterval(id);
  }, [store]);

  // Poll IDB + localStorage fallback. 250ms matches the slice's debounce —
  // slow enough not to thrash, fast enough to watch writes settle.
  useEffect(() => {
    if (!mounted) return;
    const db = openObserverDb();
    const read = async () => {
      try {
        const currentIdentity = store._sync.getIdentity().key;
        const compoundKey = `${currentIdentity}:${SLICE_NAME}:${IDB_SCHEMA_VERSION}`;
        const rec = await db.slices.get(compoundKey);
        setIdbRecord(rec ?? null);
      } catch {
        setIdbRecord(null);
      }
      setLsFallbackRaw(window.localStorage.getItem(LS_FALLBACK_KEY));
    };
    void read();
    const id = window.setInterval(() => void read(), 250);
    return () => {
      window.clearInterval(id);
      db.close();
    };
  }, [mounted, store]);

  // Broadcast observer — independent of the engine's listener.
  useEffect(() => {
    if (!mounted || typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel("matrx-sync");
    bc.onmessage = (e) => {
      setEvents((prev) =>
        [{ at: Date.now(), raw: JSON.stringify(e.data) }, ...prev].slice(0, 20),
      );
    };
    return () => bc.close();
  }, [mounted]);

  const bumpTemperature = useCallback(() => {
    // Dial temperature up by 0.1, wrapping at 2.0 → 0.0. Exercises
    // `setModulePreferences`, which the policy's broadcast list covers, so
    // every click triggers an IDB write, a localStorage fallback write, a
    // cross-tab broadcast, and (for signed-in users) a debounced Supabase
    // upsert within ≤250ms.
    const current = store.getState().userPreferences.prompts.defaultTemperature;
    const next = Math.round((current + 0.1) * 100) / 100;
    const wrapped = next > 2 ? 0 : next;
    dispatch(
      setModulePreferences({
        module: "prompts",
        preferences: { defaultTemperature: wrapped },
      }),
    );
  }, [dispatch, store]);

  const resetPromptsModule = useCallback(() => {
    dispatch(resetModulePreferences("prompts"));
  }, [dispatch]);

  const wipeIdbSlice = useCallback(async () => {
    // Dev-only: delete the current identity's record, and the idbFallback
    // mirror, so the next reload cold-boots from Supabase.
    const db = openObserverDb();
    try {
      const currentIdentity = store._sync.getIdentity().key;
      const compoundKey = `${currentIdentity}:${SLICE_NAME}:${IDB_SCHEMA_VERSION}`;
      await db.slices.delete(compoundKey);
    } finally {
      db.close();
    }
    window.localStorage.removeItem(LS_FALLBACK_KEY);
  }, [store]);

  function swapIdentity(key: string): void {
    if (!key.trim()) return;
    const next: IdentityKey = key.startsWith("auth:")
      ? {
          type: "auth",
          userId: key.slice("auth:".length),
          key: key as `auth:${string}`,
        }
      : {
          type: "guest",
          fingerprintId: key.startsWith("guest:")
            ? key.slice("guest:".length)
            : key,
          key: (key.startsWith("guest:")
            ? key
            : `guest:${key}`) as `guest:${string}`,
        };
    store._sync.setIdentity(next);
    setIdentityKey(next.key);
  }

  const savedLabel = lastSaved
    ? new Date(lastSaved).toISOString().slice(11, 23)
    : "(never)";

  return (
    <div className="flex h-[calc(100dvh-2.5rem)] flex-col gap-4 overflow-y-auto bg-textured p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">
          Sync Engine — Preferences Demo
        </h1>
        <p className="text-sm text-muted-foreground">
          Phase 2 verification harness. Warm-cache preset: Dexie IDB +
          localStorage fallback + debounced Supabase upsert + cross-tab
          broadcast. Open in two tabs to watch broadcast propagation.
        </p>
      </header>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Current state
        </h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">
            Redux prompts.defaultTemperature:
          </dt>
          <dd className="font-mono">{defaultTemperature}</dd>
          <dt className="text-muted-foreground">_meta.hasUnsavedChanges:</dt>
          <dd className="font-mono">{String(hasUnsavedChanges)}</dd>
          <dt className="text-muted-foreground">_meta.isLoading:</dt>
          <dd className="font-mono">{String(isLoading)}</dd>
          <dt className="text-muted-foreground">_meta.lastSaved:</dt>
          <dd className="font-mono text-xs">{mounted ? savedLabel : "—"}</dd>
          <dt className="text-muted-foreground">live identityKey:</dt>
          <dd className="font-mono text-xs">{mounted ? identityKey : "—"}</dd>
        </dl>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Dexie IDB record — <code className="text-xs">matrx-sync.slices</code>
        </h2>
        <p className="mb-2 text-xs text-muted-foreground">
          Compound key:{" "}
          <code>
            {mounted
              ? `${identityKey}:${SLICE_NAME}:${IDB_SCHEMA_VERSION}`
              : "—"}
          </code>
        </p>
        {mounted && idbRecord ? (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">persistedAt:</dt>
            <dd className="font-mono">
              {new Date(idbRecord.persistedAt).toISOString().slice(11, 23)}
            </dd>
            <dt className="text-muted-foreground">version:</dt>
            <dd className="font-mono">{idbRecord.version}</dd>
            <dt className="text-muted-foreground">bytes (approx):</dt>
            <dd className="font-mono">
              {JSON.stringify(idbRecord.body).length}
            </dd>
            <dt className="text-muted-foreground">
              body.prompts.defaultTemperature:
            </dt>
            <dd className="font-mono">
              {String(
                (
                  idbRecord.body as {
                    prompts?: { defaultTemperature?: number };
                  }
                )?.prompts?.defaultTemperature ?? "(missing)",
              )}
            </dd>
          </dl>
        ) : (
          <p className="text-xs text-muted-foreground">
            {mounted ? "No record for the current identity." : "—"}
          </p>
        )}
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          localStorage fallback mirror —{" "}
          <code className="text-xs">{LS_FALLBACK_KEY}</code>
        </h2>
        <pre className="max-h-32 overflow-y-auto rounded-md bg-muted/30 p-2 text-xs font-mono whitespace-pre-wrap break-all">
          {mounted ? (lsFallbackRaw ?? "(null)") : "—"}
        </pre>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Identity swap (dev only)
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Same control as the theme demo. Format:{" "}
          <code>auth:&lt;userId&gt;</code> or{" "}
          <code>guest:&lt;fingerprint&gt;</code>.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="rounded-md border border-border bg-background px-2 py-1 text-xs font-mono"
            value={identityInput}
            onChange={(e) => setIdentityInput(e.target.value)}
            placeholder="guest:fake-xyz"
          />
          <button
            className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent"
            onClick={() => swapIdentity(identityInput)}
          >
            swap
          </button>
          <button
            className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent"
            onClick={() => swapIdentity(`guest:fake-${Date.now()}`)}
          >
            random guest
          </button>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Controls
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent"
            onClick={bumpTemperature}
          >
            bump temperature (+0.1, wraps)
          </button>
          <button
            className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent"
            onClick={resetPromptsModule}
          >
            reset prompts module
          </button>
          <button
            className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent"
            onClick={() => void wipeIdbSlice()}
          >
            wipe IDB slice
          </button>
          <button
            className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent"
            onClick={() => window.location.reload()}
          >
            force reload
          </button>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Broadcast log (most recent first, latest 20)
        </h2>
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No messages yet. Open another tab of this page and bump the
            temperature.
          </p>
        ) : (
          <ul className="space-y-1 text-xs font-mono">
            {events.map((e) => (
              <li key={e.at} className="whitespace-pre-wrap break-all">
                <span className="text-muted-foreground">
                  {new Date(e.at).toISOString().slice(11, 23)}
                </span>{" "}
                {e.raw}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
