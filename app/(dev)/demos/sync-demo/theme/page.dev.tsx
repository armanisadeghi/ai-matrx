/**
 * app/(a)/sync-demo/theme/page.tsx
 *
 * Phase 1 demo route. Exercises the sync engine end-to-end for the theme
 * policy: localStorage persistence, cross-tab broadcast, rehydrate on reload.
 *
 * Acts as the manual verification harness for phase-1-verification.md §1–9.
 *
 * Server component shell — all interactivity lives in the client component.
 */

import type { Metadata } from "next";
import { ThemeDemoClient } from "./_client";

export const metadata: Metadata = {
    title: "Sync Demo — Theme",
};

export default function Page() {
    return <ThemeDemoClient />;
}
