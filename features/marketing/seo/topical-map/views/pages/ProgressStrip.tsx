"use client";

// features/marketing/seo/topical-map/views/pages/ProgressStrip.tsx
//
// "How far along is this?" in one dense line, from two different places:
//
//   * THE SITE'S LEDGER (`seo.page_mapping_status`) — how much of the site is
//     on the map at all. It is SITE-scoped, never map-scoped, so it is simply
//     absent when no site is in scope, and the strip says to pick one rather
//     than printing zeros for a question nobody asked.
//   * THE LOADED ROWS — how many of the intents in front of the person are
//     proposed, accepted or done. This one counts ONLY what is loaded and says
//     "(of the N loaded)" every time, because the read is paged: a bare
//     "12 proposed" over page 3 of 20 is a number that means nothing.
//
// 🚨 ABSENT IS NEVER ZERO HERE. While the ledger is loading, or when it
// refused, the site half renders the loading / failed state inline. Rendering
// `0 / 0 mapped` for an unread ledger would tell somebody their site is
// entirely unmapped at the exact moment we do not know.

import { TopicalMapFailed, TopicalMapLoading } from "../../components/TopicalMapStates";
import { usePageMappingStatus } from "../../hooks";
import type { PageIntentItem } from "../../types";
import { loadedIntentProgress } from "./pageRows";

export interface ProgressStripProps {
  siteId: string | null;
  /**
   * The rows currently loaded — what the intent counts are over. NULL while the
   * read has not answered: `[]` would count three honest zeros over a list
   * nobody has seen yet, which is the same lie as `pages ?? 0`.
   */
  items: readonly PageIntentItem[] | null;
  /** Set when the read is already narrowed to one topic; labels the counts. */
  topicSlug: string | null;
}

function Stat({
  value,
  label,
  title,
}: {
  value: string;
  label: string;
  title: string;
}) {
  return (
    <span className="whitespace-nowrap" title={title}>
      <span className="tabular-nums font-medium">{value}</span>{" "}
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function Dot() {
  return (
    <span aria-hidden className="text-muted-foreground/50">
      ·
    </span>
  );
}

function SiteProgress({ siteId }: { siteId: string }) {
  const status = usePageMappingStatus(siteId);

  if (status.isPending) {
    return (
      <span className="text-xs">
        <TopicalMapLoading what="this site's mapping progress" />
      </span>
    );
  }
  if (status.isError) {
    return <TopicalMapFailed what="this site's mapping progress" error={status.error} />;
  }
  const row = status.data;
  if (!row) {
    // `RETURNS TABLE` answering with no row is not a zero — it is a site the
    // ledger has never seen. Say that instead of inventing 0 / 0.
    return (
      <span className="text-xs text-muted-foreground">
        This site has no mapping ledger yet — nothing has been enrolled.
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      <Stat
        value={`${row.pages_mapped} / ${row.pages}`}
        label="pages mapped"
        title={`${row.pages_mapped} of this site's ${row.pages} active pages sit on a live topic of the map it uses.`}
      />
      <Dot />
      <Stat
        value={`${row.clicks_mapped} / ${row.clicks}`}
        label="clicks mapped"
        title={`${row.clicks_mapped} of the ${row.clicks} clicks this site earned in the demand window land on mapped pages.`}
      />
      <Dot />
      <Stat
        value={String(row.queue_pending)}
        label="pending"
        title="Pages enrolled in the mapping queue that the mapper has not settled yet."
      />
      <Dot />
      <Stat
        value={String(row.queue_no_topic)}
        label="on no topic"
        title="Pages the mapper looked at and could not place on any live topic of this map."
      />
      <Dot />
      <Stat
        value={String(row.wanted_topics)}
        label="wanted topics"
        title="Subjects the mapper says this map is missing, because unplaceable pages kept naming them."
      />
    </span>
  );
}

export function ProgressStrip({ siteId, items, topicSlug }: ProgressStripProps) {
  const progress = items === null ? null : loadedIntentProgress(items);
  const scope = topicSlug === null ? "" : ` on ${topicSlug}`;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-0.5">
      {siteId === null ? (
        <span className="text-xs text-muted-foreground">
          Pick a site for site progress
        </span>
      ) : (
        <SiteProgress siteId={siteId} />
      )}

      {progress === null ? (
        <span className="text-xs text-muted-foreground">
          Counting the intents once the pages load…
        </span>
      ) : (
      <span className="flex flex-wrap items-center gap-x-2 text-xs">
        {/* The read is already narrowed to `topicSlug` when one is set, so the
            counts ARE that topic's — and they say so rather than reading as
            the whole map's. */}
        <Stat
          value={String(progress.proposed)}
          label={`proposed${scope}`}
          title={`${progress.proposed} of the ${progress.loaded} loaded pages carry an intent somebody still has to accept.`}
        />
        <Dot />
        <Stat
          value={String(progress.accepted)}
          label="accepted"
          title={`${progress.accepted} of the ${progress.loaded} loaded pages carry an accepted intent that has not been carried out yet.`}
        />
        <Dot />
        <Stat
          value={String(progress.done)}
          label="done"
          title={`${progress.done} of the ${progress.loaded} loaded pages carry an intent that has been carried out.`}
        />
        <span className="text-muted-foreground">
          (of the {progress.loaded} loaded)
        </span>
      </span>
      )}
    </div>
  );
}
