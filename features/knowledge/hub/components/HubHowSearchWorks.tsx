"use client";

/**
 * "How search works" — the `?` in the hub's search box. It carries the explanations the
 * retired Knowledge pages held (the home's Common workflows, the data stores page's
 * "What is a data store?", the library catalog's "The Matrx Library"), so nothing they
 * taught is lost now that the hub is the one place to search.
 */

import Link from "next/link";
import { CircleHelp, Eye, Library } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { HUB_SOURCES_HREF } from "@/features/knowledge/hub/legacyRoutes";

export function HowSearchWorksContent() {
  return (
    <div className="space-y-4 text-sm text-muted-foreground" data-testid="how-search-works">
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Eye className="h-4 w-4" /> Common workflows
        </h3>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            <strong className="text-foreground">Add a Source:</strong> open{" "}
            <Link href={HUB_SOURCES_HREF} className="underline">
              Sources
            </Link>{" "}
            → Add → Upload a file, Paste a web address, Paste text, or Import a transcript. It processes, segments, and
            embeds on its own; attach it to a data store to make it retrievable.
          </li>
          <li>
            <strong className="text-foreground">See what processed correctly:</strong> open{" "}
            <Link href={HUB_SOURCES_HREF} className="underline">
              Sources
            </Link>{" "}
            and read each row&apos;s stage — Searchable means an agent can retrieve it; anything else says what is still
            running or what went wrong.
          </li>
          <li>
            <strong className="text-foreground">Inspect a Source:</strong> click any row on Sources — its text,{" "}
            {RAG_VOCAB.segmentsShort.toLowerCase()}, and where it&apos;s attached are all there.
          </li>
          <li>
            <strong className="text-foreground">Test retrieval:</strong> use{" "}
            <Link href="/knowledge/search" className="underline">
              Search
            </Link>{" "}
            with a data-store filter to see exactly what an agent would retrieve.
          </li>
        </ol>
      </section>
      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold text-foreground">What is a data store?</h3>
        <p>
          A named, curated bucket of documents. Agents can search inside one. Bind any indexed PDF, note, code file, or
          library doc; the agent then sees only that bucket when it retrieves.
        </p>
      </section>
      <section className="space-y-1.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Library className="h-4 w-4" /> The Matrx Library
        </h3>
        <p>
          Expertise curated for a whole industry, a specific organization, or everyone. The chip on each row tells you
          whether — and why — your organization already has it.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="font-medium text-foreground">Data stores</span> — you SUBSCRIBE. The documents stay in the
            Library and become searchable alongside your own content.
          </li>
          <li>
            <span className="font-medium text-foreground">SEO starter packs</span> — you USE ONE ON A SITE. Its
            defaults are copied onto the website you choose, and every row stays yours to edit.
          </li>
          <li>
            <span className="font-medium text-foreground">Rulebooks</span> — you ADD ONE TO YOURS. An expert&apos;s
            method arrives as your own Rulebook, and every rule stays yours to edit.
          </li>
        </ul>
      </section>
      <p className="text-xs">
        Under a search, the line above the results says how many passages came back, how many were looked at, and how
        many of your words each one contains. &ldquo;Why matched&rdquo; under a passage says which words landed and
        whether it was found by meaning, by words, or both.
      </p>
    </div>
  );
}

/** The `?` button in the search box; opens the explanation beside it. */
export function HowSearchWorksButton() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="How search works"
          title="How search works"
          data-testid="how-search-works-button"
        >
          <CircleHelp className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        /* sizing: fixed — explanatory reading text; a steady measure keeps the lines readable */
        align="end"
        className="max-h-[var(--radix-popover-content-available-height)] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto p-4"
      >
        <p className="mb-3 text-sm font-semibold text-foreground">How search works</p>
        <HowSearchWorksContent />
      </PopoverContent>
    </Popover>
  );
}
