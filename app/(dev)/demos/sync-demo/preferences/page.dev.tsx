/**
 * app/(a)/sync-demo/preferences/page.tsx
 *
 * Phase 2 demo route. Exercises the sync engine end-to-end for the
 * `userPreferences` warm-cache policy: Dexie IDB write, localStorage
 * fallback mirror, debounced Supabase upsert, cross-tab broadcast, and
 * REHYDRATE on boot.
 *
 * Acts as the manual verification harness for phase-2-verification.md.
 *
 * Server component shell — all interactivity lives in the client component.
 */

import type { Metadata } from "next";
import { PreferencesDemoClient } from "./_client";

export const metadata: Metadata = {
    title: "Sync Demo — Preferences",
};

export default function Page() {
    return <PreferencesDemoClient />;
}
