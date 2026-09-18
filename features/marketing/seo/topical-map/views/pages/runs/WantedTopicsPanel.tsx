"use client";

// features/marketing/seo/topical-map/views/pages/runs/WantedTopicsPanel.tsx
//
// WHAT THE MAPPER SAYS THIS MAP IS MISSING — `seo.page_mapping_wanted_topics`,
// plus the suggestions the bar held back
// (`seo.page_mapping_wanted_topics_held_back`).
//
// 🚨 THE HELD-BACK LIST IS NOT OPTIONAL. A suggestion the system is sitting on
// is a decision a person is entitled to see, and `held_back_because` is the
// server's own sentence saying what would promote it — printed unaltered, one
// per row. A screen that renders only the wanted list hides the decision.
//
// 🚨 ADDING ONE WRITES A `proposed` TOPIC, NOT A LIVE ONE. `MapTopicTreeNode`
// carries `status`, and `seo.upsert_map_topics` takes it, so the button writes
// one root topic at `status: "proposed"` — the map's own review path picks it up
// from there. (Checked against `../../../types.ts` `MapTopicTreeNode.status?:
// string` and `data.ts` `upsertMapTopics`, which passes the tree through
// untouched; the honest-refusal branch the brief allows for is therefore not
// needed.) The upsert is ALL-OR-NOTHING and raises 22023 with the whole error
// list, so a refusal is shown in the function's own words.
//
// NOT THIS FILE'S JOB: the same wanted rows also feed the proposal review deck
// (lane G). This panel writes one topic at a time from the run popover; it does
// not own, duplicate or pre-empt that review surface.

import { useState } from "react";
import { ExternalLink, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { toast } from "@/lib/toast";
import { convertToKebabCase } from "@/utils/text/stringUtils";

import { TopicalMapFailed } from "../../../components/TopicalMapStates";
import { topicalMapErrorText } from "../../../errors";
import {
  usePageMappingWantedTopics,
  usePageMappingWantedTopicsHeldBack,
  useUpsertMapTopics,
} from "../../../hooks";
import type {
  PageMappingWantedTopic,
  PageMappingWantedTopicHeldBack,
} from "../../../types";

/** How many rows either list asks for. The function clamps to 1..200. */
const WANTED_TOPIC_LIMIT = 20;

export interface WantedTopicsPanelProps {
  mapId: string;
  siteId: string;
}

export function WantedTopicsPanel({ mapId, siteId }: WantedTopicsPanelProps) {
  const wanted = usePageMappingWantedTopics(siteId, WANTED_TOPIC_LIMIT);
  const heldBack = usePageMappingWantedTopicsHeldBack(siteId, WANTED_TOPIC_LIMIT);
  const upsert = useUpsertMapTopics(mapId);
  const [heldBackOpen, setHeldBackOpen] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  async function addAsProposed(name: string): Promise<void> {
    const slug = convertToKebabCase(name);
    const ok = await confirm({
      title: `Add “${name}” to this map as a proposed topic?`,
      description:
        `It lands at the root of the map as “${slug}”, marked proposed — nothing ` +
        "covers it and no page moves until someone accepts it. Re-run the mapper " +
        "afterwards to place the pages that asked for it.",
      confirmLabel: "Add as proposed",
    });
    if (!ok) return;
    setAdding(name);
    try {
      await upsert.mutateAsync([{ name, slug, status: "proposed" }]);
      toast.success(`“${name}” is on the map as a proposed topic.`);
    } catch (error) {
      // The function writes its refusals for the person making the change.
      toast.error(topicalMapErrorText(error));
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="space-y-2 border-t border-border pt-2">
      <p className="font-medium">The map is missing this</p>

      {wanted.isPending ? (
        <SuspenseLoader
          size="xs"
          centered={false}
          message="Reading what the mapper could not place…"
        />
      ) : wanted.isError ? (
        <TopicalMapFailed
          what="the subjects this map is missing"
          error={wanted.error}
        />
      ) : wanted.data.length === 0 ? (
        <p className="text-muted-foreground">
          Nothing so far. The mapper adds a subject here when two pages ask for
          it, or when one page we have actually crawled does.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {wanted.data.map((row) => (
            <WantedRow
              key={row.suggested_topic_name}
              row={row}
              busy={adding === row.suggested_topic_name}
              disabledReason={
                adding !== null && adding !== row.suggested_topic_name
                  ? "Another topic is being added."
                  : null
              }
              onAdd={() => void addAsProposed(row.suggested_topic_name)}
            />
          ))}
        </ul>
      )}

      <div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-1 text-xs"
          aria-expanded={heldBackOpen}
          onClick={() => setHeldBackOpen((open) => !open)}
        >
          {heldBackOpen ? "Hide held back" : "Held back"}
          {heldBack.isSuccess ? ` (${heldBack.data.length})` : ""}
        </Button>
        {heldBackOpen ? (
          heldBack.isPending ? (
            <SuspenseLoader
              size="xs"
              centered={false}
              message="Reading the suggestions the bar held back…"
            />
          ) : heldBack.isError ? (
            <TopicalMapFailed
              what="the held-back suggestions"
              error={heldBack.error}
            />
          ) : heldBack.data.length === 0 ? (
            <p className="mt-1 text-muted-foreground">
              Nothing is being held back on this site.
            </p>
          ) : (
            <ul className="mt-1 space-y-1.5">
              {heldBack.data.map((row) => (
                <HeldBackRow key={row.suggested_topic_name} row={row} />
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}

function WantedRow({
  row,
  busy,
  disabledReason,
  onAdd,
}: {
  row: PageMappingWantedTopic;
  busy: boolean;
  /** Why the button cannot act right now — said, never rendered as a dead control. */
  disabledReason: string | null;
  onAdd: () => void;
}) {
  return (
    <li className="rounded border border-border p-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{row.suggested_topic_name}</p>
          <p className="text-muted-foreground">
            {row.pages} page(s) · {row.clicks} clicks · {row.impressions}{" "}
            impressions
          </p>
        </div>
        {disabledReason ? (
          <p className="shrink-0 text-muted-foreground">{disabledReason}</p>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 shrink-0 gap-1 text-xs"
            onClick={onAdd}
          >
            <Plus className="h-3 w-3" aria-hidden />
            {busy ? "Adding…" : "Add as proposed topic"}
          </Button>
        )}
      </div>
      {/* The mapper's own words for why these pages asked for this subject. */}
      {row.example_reason ? (
        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
          {row.example_reason}
        </p>
      ) : null}
      <ExampleUrls urls={row.example_urls} />
    </li>
  );
}

function HeldBackRow({ row }: { row: PageMappingWantedTopicHeldBack }) {
  return (
    <li className="rounded border border-dashed border-border p-1.5">
      <p className="truncate font-medium">{row.suggested_topic_name}</p>
      <p className="text-muted-foreground">
        {row.pages} page(s) · {row.clicks} clicks · {row.impressions} impressions
      </p>
      {/* Verbatim: this sentence says exactly what would promote the suggestion. */}
      <p className="mt-1 whitespace-pre-wrap">{row.held_back_because}</p>
      {row.example_reason ? (
        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
          {row.example_reason}
        </p>
      ) : null}
      <ExampleUrls urls={row.example_urls} />
    </li>
  );
}

/**
 * The pages that asked. They are URLs on the customer's own website, not
 * platform records, so the door is the web itself — a real new tab, never a
 * label.
 */
function ExampleUrls({ urls }: { urls: string[] | null }) {
  if (!urls || urls.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {urls.map((url) => (
        <li key={url} className="min-w-0">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1 truncate text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{url}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
