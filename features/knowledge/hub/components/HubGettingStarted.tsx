"use client";

/**
 * The hub's getting-started tips — the retired Knowledge home's "Common
 * workflows", now said where a person with nothing yet is looking (the
 * Everything view's empty state).
 */

import Link from "next/link";
import { HUB_LIBRARY_CATALOG_HREF } from "@/features/knowledge/hub/legacyRoutes";

export function HubGettingStarted() {
  return (
    <section className="mt-4 max-w-2xl rounded-md border border-border bg-muted/20 p-4" aria-label="Getting started">
      <h3 className="mb-2 text-sm font-semibold">Getting started</h3>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>
          <strong className="text-foreground">Add a Source:</strong> press Add (top right) → Upload a file, Paste a web
          address, Paste text, or Import a transcript. It processes, segments and embeds on its own; attach it to a data
          store, project or Library to make it retrievable there.
        </li>
        <li>
          <strong className="text-foreground">See what processed correctly:</strong> switch to the table layout and read
          each Source&apos;s Stage — Searchable means an agent can retrieve it; anything else says what is still running
          or what to do. Filter by Stage with <kbd>f</kbd>.
        </li>
        <li>
          <strong className="text-foreground">Inspect a Source:</strong> press ↵ on any item to peek at its text and where
          it is filed; ⌘↵ opens it in full.
        </li>
        <li>
          <strong className="text-foreground">Test retrieval:</strong> type in the search box — passages come back under
          Segments — or open ⌘K, type a question and press ⌘↵ to get an answer that cites them.
        </li>
        <li>
          <strong className="text-foreground">Shared knowledge:</strong> browse and subscribe to shared libraries in the{" "}
          <Link href={HUB_LIBRARY_CATALOG_HREF} className="underline">
            Library catalog
          </Link>
          .
        </li>
      </ol>
    </section>
  );
}
