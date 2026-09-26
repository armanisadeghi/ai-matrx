"use client";

/**
 * What a finished `seo.map_author` run says — rendered honestly.
 *
 * Three answers, none of them an error state:
 *   research_started  → the research IS the source and it has to finish first
 *                       (R8): say so, door to the research, offer the next step.
 *   applied           → the tree was WRITTEN (active or proposed by the knob).
 *   !applied, topics  → the tree was proposed back and nothing was written.
 *   !applied, 0 topics→ the author found nothing it could support: render its
 *                       own `coverage_notes` — the one behaviour we want, never
 *                       punished with a red box (see `AuthorTopicalMapResult`).
 *
 * THE TREE RENDERS THROUGH THE ONE KIND COMPONENT — `MapTopicProposalView`
 * (R12, "a shape has exactly ONE component"). This screen used to adapt the
 * payload onto `TopicTree` itself through a local `ProposalTree` +
 * `start/proposalRows.ts`, an explicit interim stand-in "until Lane G's kind
 * component lands". It landed; both are gone, and chat, the tool-result
 * renderer and this screen now draw a proposed tree with the same component.
 *
 * WHAT THE VIEW NEEDS FROM US: the map, and only when there IS one. Accept and
 * reject write to a map through `seo.patch_map_topics` / `seo.reject_map_topics`,
 * so a run that wrote nothing (`applied: false` — the tree was proposed back)
 * hands it `mapId: null` and `readOnly`, and the view says in its own words
 * that there is nothing here to accept or reject. Offering the controls over a
 * map that was never written is a click that does nothing.
 *
 * COST IS UNMEASURED HERE. Lane S landed `store=True` on the author's provider
 * calls in aidream (a `chat.request` row per call), but the result document
 * carries no cost and the ledger row has not been confirmed live on this build.
 * The line says "unmeasured" rather than implying the run was free.
 */

import Link from "next/link";
import { ExternalLink, FlaskConical, Info } from "lucide-react";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { TextWithDoors } from "@/components/official/entity-ref/TextWithDoors";
import { Button } from "@/components/ui/button";

import { useMapLinks } from "../links";
import type { AuthorTopicalMapResult } from "../map-author";
import { MapTopicProposalView } from "../proposals/MapTopicProposalView";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { AGENT_ICON } from "@/components/icons/domain-icons";

export function StartMapResult({
  result,
  onBuildFromResearch,
}: {
  result: AuthorTopicalMapResult;
  /** Switch the screen to `existing_research` with this topic preselected. */
  onBuildFromResearch?: (researchTopicId: string) => void;
}) {
  const links = useMapLinks();

  if (result.research_started) {
    return (
      <section
        className="rounded-xl border border-border bg-card p-4"
        aria-label="Research started"
      >
        <h3 className="flex items-center gap-2 font-medium">
          <FlaskConical className="h-4 w-4" aria-hidden />
          Research started — the map is not built yet
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The research is the source, so it has to finish first. Nothing was written to a map on
          this run.
        </p>
        {result.research_topic_id ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <EntityRef token="research_topic" id={result.research_topic_id} name="The research run" />
            {onBuildFromResearch ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onBuildFromResearch(result.research_topic_id as string)}
              >
                <AGENT_ICON className="h-4 w-4" aria-hidden />
                Build the map from it when it finishes
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-destructive" role="alert">
            The server reported the research started but returned no research id, so there is
            nothing to open. Check the research list.
            <ErrorAlchemyMenu className="ml-auto" />
          </p>
        )}
        <Notes notes={result.notes} />
      </section>
    );
  }

  const topics = result.proposal?.topics ?? [];
  const mapHref = result.map_id ? links.mapView(result.map_id, "outline") : null;
  const proposedMode = result.change_mode === "propose";

  return (
    <section className="grid gap-3" aria-label="Map author result">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-medium">
          {result.applied
            ? proposedMode
              ? "Topics written to the map as proposals"
              : "Topics written to the map"
            : topics.length === 0
              ? "The source did not support a map"
              : "Tree proposed — nothing written"}
        </h3>
        {result.summary ? (
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{result.summary}</p>
        ) : null}
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm sm:grid-cols-5">
          <Stat label="Source" value={result.source_kind.replace("_", " ")} />
          <Stat label="Mode" value={result.change_mode || "—"} />
          <Stat label="Created" value={String(result.created.length)} />
          <Stat label="Updated" value={String(result.updated.length)} />
          <Stat label="Unchanged" value={String(result.unchanged.length)} />
        </dl>
        {result.source_reference ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Source reference:{" "}
            <TextWithDoors text={result.source_reference} />
          </p>
        ) : null}
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" aria-hidden />
          Cost: unmeasured on this build — the author&apos;s usage row is not confirmed yet, so
          nothing here claims the run was free.
        </p>
        {mapHref ? (
          <div className="mt-3">
            <Button asChild size="sm">
              <Link href={mapHref} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden />
                Open the map
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      {topics.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4">
          <p className="font-medium">No topics — and that is the author&apos;s answer</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The author never invents an offering the source does not support. What it could not
            settle:
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm">
            {result.coverage_notes || result.proposal?.coverage_notes || "The author left no coverage notes."}
          </p>
        </div>
      ) : result.proposal ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <MapTopicProposalView
            proposal={result.proposal}
            mapId={result.applied ? result.map_id : null}
            readOnly={!result.applied}
            density="comfortable"
          />
        </div>
      ) : null}

      {/* The RUN's coverage notes. The proposal's own notes are rendered by the
          kind component; this block carries the run-level ones only when they
          say something different, so the same sentence is never printed twice. */}
      {topics.length > 0 &&
      result.coverage_notes &&
      result.coverage_notes !== result.proposal?.coverage_notes ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">Still to settle</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {result.coverage_notes}
          </p>
        </div>
      ) : null}

      <Notes notes={result.notes} />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-2 py-1.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="truncate text-sm tabular-nums">{value}</dd>
    </div>
  );
}

/** The server's own notes, verbatim, with ids turned into doors. */
function Notes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="grid gap-1 rounded-xl border border-border bg-muted/30 p-3 text-xs">
      {notes.map((note, i) => (
        <li key={i} className="whitespace-pre-wrap">
          <TextWithDoors text={note} />
        </li>
      ))}
    </ul>
  );
}
