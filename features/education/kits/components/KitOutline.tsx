"use client";

// features/education/kits/components/KitOutline.tsx
//
// The kit page's living-kit pieces:
//   - KitOutlineCard: the kit's Outline (sections, summaries, key facts; open a
//     section to read it) with Build / Rebuild. A build in flight is one status
//     line in this card plus "Watch" (the run's floating window) — never a
//     top-of-page live block, and a refresh reattaches (useKitOutline).
//   - KitCoverageSection: one row per section (cards, questions, a bar) with
//     "Make more" and "Go deeper", plus "Not mapped" for older items.
//   - KitMemberAddMore: "Add more" on a deck or quiz of the kit — loads the aid
//     on the press and opens THE existing top-up dialog with the kit's Sources.

import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, ListTree, Plus, RefreshCw } from "lucide-react";
import { Button, Chip } from "@ai-matrx/design-system/controls";
import { Skeleton } from "@ai-matrx/design-system";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useOpenWorkflowRunWindow } from "@/features/overlays/openers/workflowRunWindow";
import { fcService } from "@/features/flashcards/data/fcService";
import { assessmentService } from "@/features/education/assessment/data/assessmentService";
import { AddMoreCardsButton, originToDraft } from "@/features/flashcards/components/set-detail/AddMoreCardsButton";
import { AddMoreQuestionsButton } from "@/features/education/assessment/components/AddMoreQuestionsButton";
import type { GeneratedArtifact } from "@/features/education/convert/lineage";
import type { AssessmentWithItems } from "@/features/education/assessment/data/types";
import type { SetWithCards } from "@/features/flashcards/data/types";
import type { SourceDraft } from "@ai-matrx/agents/sources/runtime";
import type { KitSource } from "../kitScope";
import { OUTLINE_LABEL, type OutlineSection } from "../outline/types";
import type { KitOutlineState } from "../outline/useKitOutline";
import type { KitCoverage } from "../outline/coverage";

// ─── Outline ─────────────────────────────────────────────────────────────────

function SectionRow({ section }: { section: OutlineSection }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-2.5">
      <button
        type="button"
        className="flex w-full items-start gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-foreground">{section.title}</span>
          {section.summary && !open ? (
            <span className="mt-0.5 line-clamp-2 block type-secondary text-muted-foreground">{section.summary}</span>
          ) : null}
        </span>
        {section.facts.length > 0 ? (
          <span className="shrink-0 type-secondary text-muted-foreground">{`${section.facts.length} facts`}</span>
        ) : null}
      </button>
      {open ? (
        <div className="mt-2 space-y-3 pl-6">
          {section.facts.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4 type-body text-foreground">
              {section.facts.map((f, i) => (
                <li key={i}>{f.statement}</li>
              ))}
            </ul>
          ) : null}
          {section.body ? (
            <div className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 type-body leading-relaxed text-foreground">
              {section.body}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function KitOutlineCard({
  outline,
  onMoved,
}: {
  outline: KitOutlineState;
  /** A legacy kit was promoted to its own record to build: go there. */
  onMoved: (kitId: string) => void;
}) {
  const openRunWindow = useOpenWorkflowRunWindow();
  const { sections, activeRunId } = outline;
  const has = (sections?.length ?? 0) > 0;
  const building = activeRunId !== null || outline.starting;

  const onBuild = async () => {
    if (has) {
      const accepted = await confirm({
        title: `Rebuild the ${OUTLINE_LABEL.toLowerCase()}?`,
        description: "Re-reads every source. Sections that still exist keep their cards.",
        confirmLabel: "Rebuild",
      });
      if (!accepted) return;
    }
    await outline.build(onMoved);
  };

  return (
    <section aria-labelledby="kit-outline-heading" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <ListTree className="h-5 w-5 text-primary" />
        <h2 id="kit-outline-heading" className="text-lg font-semibold text-foreground">
          {OUTLINE_LABEL}
        </h2>
        {has ? <span className="type-secondary text-muted-foreground">{`${sections!.length} sections`}</span> : null}
        {outline.stale && !building ? <Chip tone="warning" label="Sources changed" /> : null}
        <span className="ml-auto flex items-center gap-1.5">
          {activeRunId ? (
            <Button variant="quiet" icon={<Eye />} onClick={() => openRunWindow({ runId: activeRunId, workflowName: OUTLINE_LABEL })}>
              Watch
            </Button>
          ) : null}
          <Button
            variant={has ? "outline" : "primary"}
            icon={<RefreshCw />}
            disabled={building}
            onClick={() => void onBuild()}
          >
            {building ? "Building" : has ? "Rebuild" : "Build outline"}
          </Button>
        </span>
      </div>
      {building ? (
        <p className="mt-2 truncate type-secondary text-muted-foreground" role="status">
          {outline.progress ? `Building · ${outline.progress}` : "Building · reading your sources"}
        </p>
      ) : null}
      {outline.runError ? (
        <p className="mt-2 type-secondary text-destructive" role="alert">
          {outline.runError} <ErrorAlchemyMenu error={outline.runError} />
        </p>
      ) : null}
      {outline.readError ? (
        <p className="mt-2 type-secondary text-destructive" role="alert">
          {outline.readError}{" "}
          <Button variant="quiet" onClick={outline.reload}>
            Try again
          </Button>
        </p>
      ) : sections === null ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : has ? (
        <ol className="mt-2 divide-y divide-border">
          {sections.map((s) => (
            <SectionRow key={s.id} section={s} />
          ))}
        </ol>
      ) : !building ? (
        <p className="mt-2 type-secondary text-muted-foreground">No outline yet.</p>
      ) : null}
    </section>
  );
}

// ─── Coverage ────────────────────────────────────────────────────────────────

export function KitCoverageSection({
  coverage,
  sections,
  onMakeMore,
  onGoDeeper,
}: {
  coverage: KitCoverage;
  sections: OutlineSection[];
  onMakeMore: (section: OutlineSection) => void;
  onGoDeeper: (section: OutlineSection) => void;
}) {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const unmapped = coverage.unmapped.cards + coverage.unmapped.questions;
  return (
    <section aria-labelledby="kit-coverage-heading" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 id="kit-coverage-heading" className="text-lg font-semibold text-foreground">
        Coverage
      </h2>
      <ul className="mt-2 divide-y divide-border">
        {coverage.rows.map((row) => {
          const section = byId.get(row.sectionId);
          const total = row.cards + row.questions;
          const width = coverage.max > 0 ? Math.round((total / coverage.max) * 100) : 0;
          return (
            <li key={row.sectionId} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{row.title}</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted sm:w-32" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                  </div>
                  <span className="type-secondary text-muted-foreground">
                    {`${row.cards} cards · ${row.questions} questions`}
                  </span>
                </div>
              </div>
              {section ? (
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="outline" icon={<Plus />} onClick={() => onMakeMore(section)}>
                    Make more
                  </Button>
                  <Button variant="quiet" onClick={() => onGoDeeper(section)}>
                    Go deeper
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
        {unmapped > 0 ? (
          <li className="py-2.5">
            <p className="font-medium text-muted-foreground">Not mapped</p>
            <p className="type-secondary text-muted-foreground">
              {`${coverage.unmapped.cards} cards · ${coverage.unmapped.questions} questions`}
            </p>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

// ─── "Add more" on a deck / quiz of the kit ─────────────────────────────────

/** The kit's Sources as ready drafts for a top-up's Source input. */
export function kitSourceDrafts(sources: readonly KitSource[]): SourceDraft[] {
  return sources
    .map((s) => originToDraft({ edgeId: s.edgeId, entityType: s.type, entityId: s.id, href: s.href ?? undefined, title: s.title }))
    .filter((d): d is SourceDraft => !!d?.ref);
}

export function KitMemberAddMore({
  artifact,
  sources,
  onAdded,
}: {
  artifact: GeneratedArtifact;
  sources: readonly KitSource[];
  onAdded: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [deck, setDeck] = useState<SetWithCards | null>(null);
  const [quiz, setQuiz] = useState<AssessmentWithItems | null>(null);
  const drafts = kitSourceDrafts(sources);

  if (deck) {
    return (
      <AddMoreCardsButton
        setId={deck.set.id}
        deckName={deck.set.name}
        deckOrganizationId={deck.set.organization_id}
        existingCards={deck.cards.map((c) => ({ front: c.front, back: c.back ?? "" }))}
        extraDrafts={drafts}
        initialOpen
        label="Add more"
        onAdded={onAdded}
      />
    );
  }
  if (quiz) {
    return (
      <AddMoreQuestionsButton
        assessment={quiz.assessment}
        items={quiz.items}
        extraDrafts={drafts}
        initialOpen
        onAdded={onAdded}
      />
    );
  }
  const load = async () => {
    setLoading(true);
    try {
      if (artifact.artifactType === "fc_set") {
        const res = await fcService.getSetWithCards(artifact.artifactId);
        if (!res.data) throw new Error("This deck could not be opened.");
        setDeck(res.data);
      } else {
        const res = await assessmentService.getAssessmentWithItems(artifact.artifactId);
        if (!res.data) throw new Error("This quiz could not be opened.");
        setQuiz(res.data);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "It could not be opened.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button variant="outline" icon={<Plus />} disabled={loading} onClick={() => void load()}>
      Add more
    </Button>
  );
}
