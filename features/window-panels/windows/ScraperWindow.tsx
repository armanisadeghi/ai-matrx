"use client";

import { ScraperFloatingWorkspace } from "@/features/scraper/parts/ScraperFloatingWorkspace";
import type { ScraperWindowMode } from "@/features/overlays/openers/scraperWindow";

interface ScraperWindowProps {
  isOpen: boolean;
  onClose: () => void;
  /** Seed URL forwarded from the opener `data` (the "Read" affordance). */
  initialUrl?: string;
  /** Seed workspace mode forwarded from the opener `data`. */
  initialMode?: ScraperWindowMode;
}

/**
 * Thin shell: floating window chrome is provided by {@link ScraperFloatingWorkspace}
 * in `features/scraper` so scraper logic stays in the scraper feature. The
 * optional `initialUrl` / `initialMode` (carried on the overlay's `data`) let an
 * opener — e.g. the search renderer's "Read" button — open the scraper pre-aimed
 * at a page.
 */
export default function ScraperWindow({
  isOpen,
  onClose,
  initialUrl,
  initialMode,
}: ScraperWindowProps) {
  if (!isOpen) return null;
  return (
    <ScraperFloatingWorkspace
      onClose={onClose}
      initialUrl={initialUrl}
      initialMode={initialMode}
    />
  );
}
