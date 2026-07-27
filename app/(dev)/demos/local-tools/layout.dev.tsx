import { MatrxLocalProvider } from './_lib/MatrxLocalContext';
import type { ReactNode } from 'react';

// This layout mounts the engine connection exactly once.
// All sub-pages (scraper, files, shell, terminal, etc.) share
// the same WebSocket session — no reconnect when navigating between pages.
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/local-tools", {
  title: "Local Tools",
  description: "Interactive demo: Local Tools. AI Matrx demo route.",
});

export default function LocalToolsLayout({ children }: { children: ReactNode }) {
    return (
        <MatrxLocalProvider>
            {children}
        </MatrxLocalProvider>
    );
}
