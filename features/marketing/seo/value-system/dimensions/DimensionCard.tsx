"use client";

/**
 * One dimension, with its allowed answers.
 *
 * NOTHING IS DELETED BLIND — AND EVERYTHING CAN BE DELETED. Until 2026-08-24
 * this screen had no delete button at all, on the reasoning that a row can
 * disappear while the classifications naming it cannot, so a delete would
 * silently orphan facts. The reasoning was right about the danger and wrong
 * about the remedy. Arman's ruling: *"Make sure you can delete the entire
 * thing and for everything delete by default = remove matches (One thing)."*
 *
 * So an answer and a whole dimension both delete, and each takes what it was
 * keeping with it — its matches and the answers it put on keywords — in ONE
 * server transaction (`seo.facet_value_archive` / `seo.facet_dimension_archive`,
 * which re-derive the touched keywords through the one matcher engine). What
 * survives from the old rule is the HONESTY: every count on this card is the
 * blast radius, the confirm states it in words before anything happens, and
 * nothing is ever left behind for the user to go clean up.
 *
 * Two things still refuse, with a sentence the DB writes for the reader: the
 * "not clear" option (the AI picks it instead of guessing) and the last real
 * answer on a dimension (a question with no answers cannot be asked).
 *
 * Platform dimensions render with the same anatomy but locked: they are facts
 * every tenant shares, and comparability across sites is the reason.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Gavel,
  ListFilter,
  Lock,
  Pencil,
  Trash2,
  Plus,
  RefreshCw,
  Tag,
  Timer,
  Users,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/styles/themes/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCount } from "@/features/marketing/search-console/types";
import { formatRelativeTime } from "@/utils/datetime";
import { useDigStampMutations } from "@/features/marketing/search-console/hooks/useDigRules";
import { useOpenGscDrilldownWindow } from "@/features/overlays/openers/gscDrilldownWindow";
import { DimensionForm, type DimensionFormValue } from "./DimensionForm";
import { ValueForm, type ValueFormValue } from "./ValueForm";
import { MatcherEditor } from "./MatcherEditor";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  archiveFacetDimension,
  archiveFacetValue,
  getMatcherCounts,
  upsertFacetDimension,
  upsertFacetValue,
  type FacetDimension,
  type FacetValue,
} from "./data";

function CountChip({
  icon: Icon,
  value,
  label,
  title,
  onOpen,
}: {
  icon: typeof Tag;
  value: number;
  label: string;
  title: string;
  /**
   * NO DEAD ENDS — a count that names records the app can show is a door, not
   * a label. Omit it only when nothing can be opened (a zero count).
   */
  onOpen?: () => void;
}) {
  const body = (
    <>
      <Icon className="h-3 w-3 shrink-0" />
      {formatCount(value)} {label}
    </>
  );
  if (!onOpen) {
    return (
      <span
        title={title}
        className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground"
      >
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      title={title}
      onClick={onOpen}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
    >
      {body}
    </button>
  );
}

function ValueRow({
  value,
  editable,
  siteId,
  dimensionSlug,
  dimensionLabel,
  situational,
  focused = false,
  matcherCount,
  autoOpenMatchers = false,
  onSaved,
  onMatchersChanged,
}: {
  value: FacetValue;
  editable: boolean;
  siteId: string;
  dimensionSlug: string;
  dimensionLabel: string;
  situational: boolean;
  /** Arrived here from a value receipt's "change what this is worth" link. */
  focused?: boolean;
  /** From the card's one grouped read — `undefined` while it is still loading. */
  matcherCount: number | undefined;
  /** A receipt's "matcher" step landed here with `?matcher=` set — open it. */
  autoOpenMatchers?: boolean;
  onSaved: () => void;
  /** Fires on any matcher add/toggle/delete — refreshes just the count read. */
  onMatchersChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [matchersOpen, setMatchersOpen] = useState(autoOpenMatchers);
  const openKeywordsWithAnswer = useOpenGscDrilldownWindow();
  const remove = useMutation({
    mutationFn: () =>
      archiveFacetValue({
        dimensionSlug,
        valueKey: value.key,
        siteId,
      }),
    onSuccess: (result) => {
      toast.success(
        `“${value.label}” is gone`,
        {
          description:
            result.factsDropped > 0 || result.matchersRemoved > 0
              ? `Removed ${formatCount(result.matchersRemoved)} match${
                  result.matchersRemoved === 1 ? "" : "es"
                } and took the answer off ${formatCount(result.factsDropped)} keyword${
                  result.factsDropped === 1 ? "" : "s"
                }.`
              : "It was not stamped on anything.",
        },
      );
      onSaved();
      onMatchersChanged();
    },
    // A governance refusal is a SENTENCE written for this reader — the
    // not-clear option, the last answer, a rule still naming it. Never
    // replaced with a generic message.
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const askAndDelete = async () => {
    const stamped = value.keyword_count;
    const matchers = matcherCount ?? 0;
    const consequences = [
      matchers > 0
        ? `${formatCount(matchers)} match${matchers === 1 ? "" : "es"} that find it`
        : null,
      stamped > 0
        ? `the answer on ${formatCount(stamped)} keyword${stamped === 1 ? "" : "s"}`
        : null,
    ].filter(Boolean) as string[];
    const ok = await confirm({
      title: `Delete “${value.label}”?`,
      description:
        consequences.length > 0
          ? `This also removes ${consequences.join(" and ")}. It happens in one step — nothing is left behind for you to clean up afterwards.`
          : "Nothing carries this answer yet, so nothing else changes.",
      variant: "destructive",
      confirmLabel: "Delete it",
    });
    if (ok) remove.mutate();
  };

  const save = useMutation({
    mutationFn: (draft: ValueFormValue) =>
      upsertFacetValue({
        dimension: dimensionSlug,
        value: value.key,
        label: draft.label,
        description: draft.description || null,
        siteId,
      }),
    onSuccess: () => {
      setEditing(false);
      toast.success(`Saved “${value.label}”`);
      onSaved();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  if (editing) {
    return (
      <li>
        <ValueForm
          mode="edit"
          initial={{
            value: value.key,
            label: value.label,
            description: value.description ?? "",
          }}
          pending={save.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(draft) => save.mutate(draft)}
        />
      </li>
    );
  }

  return (
    <li
      id={`facet-value-${value.value_id}`}
      className={cn(
        "flex flex-wrap items-start gap-x-2 gap-y-1 rounded-md border bg-card px-2.5 py-2",
        focused ? "border-primary ring-1 ring-primary/40" : "border-border",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold text-foreground">
            {value.label}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {value.key}
          </span>
        </div>
        {value.description ? (
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            {value.description}
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground/70">
            No meaning written yet — an agent sorting a borderline keyword has
            only the name to go on.
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* NO DEAD ENDS — this row states how many keywords carry this answer;
            clicking the count opens exactly those, through the SAME drilldown
            window and the SAME `stamps` filter the rest of the value system
            uses (`dimension:value`). No second list, no bespoke route. */}
        <CountChip
          icon={Tag}
          value={value.keyword_count}
          label="keywords"
          title={
            value.keyword_count > 0
              ? // Deliberately NOT "open all N": the drilldown is the Search
                // Console view, so it shows the ones with demand in the
                // period, which is fewer than the total carrying the stamp.
                "See the keywords that carry this answer"
              : "No keyword carries this answer yet"
          }
          onOpen={
            value.keyword_count > 0
              ? () =>
                  openKeywordsWithAnswer({
                    siteId,
                    dimension: "query",
                    filters: { stamps: `${dimensionSlug}:${value.key}` },
                    title: `${dimensionLabel}: ${value.label}`,
                  })
              : undefined
          }
        />
        {/* P20 — a situational answer never shows a count without the moment
            it was worked out. A present-tense number with no time behind it
            reads as permanent when it is a snapshot. */}
        {situational ? (
          <span
            className="whitespace-nowrap text-[11px] text-muted-foreground"
            title={
              value.as_of
                ? new Date(value.as_of).toLocaleString()
                : "This segment has never been evaluated."
            }
          >
            {value.as_of
              ? `as of ${formatRelativeTime(value.as_of, { style: "long" })}`
              : "never evaluated"}
          </span>
        ) : null}
        {/* KI-008 — the door onto every matcher hung on this answer. Every
            value gets one, owned or shared: matchers are site-scoped writes
            regardless of which dimension a value belongs to (traffic_class's
            values are platform-shared, but each site's brand/class matchers
            live here). */}
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-1.5 text-[11px]"
          onClick={() => setMatchersOpen(true)}
          title="What finds this answer, and what it would catch"
        >
          <ListFilter className="mr-1 h-3 w-3" />
          {matcherCount === undefined
            ? "Matchers"
            : matcherCount === 0
              ? "No matchers"
              : `${formatCount(matcherCount)} matcher${matcherCount === 1 ? "" : "s"}`}
        </Button>
        {editable ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px]"
            onClick={() => setEditing(true)}
          >
            <Pencil className="mr-1 h-3 w-3" /> Edit
          </Button>
        ) : null}
        {/* DELETE IS ONE THING (Arman, 2026-08-24). The confirm states the
            whole blast radius up front — matchers and stamped keywords — and
            pressing it removes all of it server-side in one transaction. There
            is no "now re-run the matchers" step, because a delete that leaves
            its stamps behind is the bug this replaced. */}
        {/* The honest-decline option is never deletable — the DB refuses it
            with a sentence, and a button that can only refuse is noise on the
            row. Hidden, not disabled. */}
        {editable && !value.abstain ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-destructive"
            disabled={remove.isPending}
            title={`Delete “${value.label}” and everything it stamped`}
            onClick={() => void askAndDelete()}
          >
            {remove.isPending ? (
              <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="mr-1 h-3 w-3" />
            )}
            Delete
          </Button>
        ) : null}
      </div>
      {matchersOpen ? (
        <MatcherEditor
          open={matchersOpen}
          onOpenChange={setMatchersOpen}
          siteId={siteId}
          dimensionLabel={dimensionLabel}
          value={value}
          onChanged={onMatchersChanged}
        />
      ) : null}
    </li>
  );
}

export function DimensionCard({
  dimension,
  siteId,
  defaultExpanded,
  focusValueId = null,
  focusMatcher = false,
  onSaved,
}: {
  dimension: FacetDimension;
  siteId: string;
  defaultExpanded: boolean;
  /**
   * A value receipt sent the reader straight here. The card opens regardless
   * of the collapse default and the row is ringed — arriving on a collapsed
   * card would make the link look broken.
   */
  focusValueId?: string | null;
  /** The receipt's "matcher" step (`?matcher=`) — open the editor, not just ring the row. */
  focusMatcher?: boolean;
  onSaved: () => void;
}) {
  const focusedHere =
    !!focusValueId &&
    dimension.values.some((value) => value.value_id === focusValueId);
  const [expanded, setExpanded] = useState(defaultExpanded || focusedHere);
  const [editingDimension, setEditingDimension] = useState(false);
  const [addingValue, setAddingValue] = useState(false);
  /**
   * AN ANSWER WITH NO MATCH DOES NOTHING (Arman, 2026-08-24: *"you shouldn't
   * need to click matcher — clicking okay should just run it automatically"*).
   * Adding an answer used to end with a toast and a row stamped on zero
   * keywords, and the one thing that would change that — writing a match —
   * was three clicks away behind a button labelled with a count. The new
   * answer's matcher editor now opens on its own, so the flow ends where the
   * work actually is.
   */
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const owned = dimension.scope === "site";
  const situational = dimension.nature === "situational";
  // Re-derivation is the DB's job — this button only asks for it, scoped to
  // this dimension, over the site's current window (THE SCOPE RULE).
  const stampMutations = useDigStampMutations(siteId);

  // ONE grouped read for every value's matcher count — never a query per row.
  const valueIds = dimension.values.map((value) => value.value_id);
  const matcherCountsKey = [
    "marketing",
    "seo",
    "matcher-counts",
    siteId,
    dimension.dimension_id,
  ] as const;
  const matcherCounts = useQuery({
    queryKey: matcherCountsKey,
    queryFn: ({ signal }) => getMatcherCounts(siteId, valueIds, signal),
    enabled: expanded && valueIds.length > 0,
    staleTime: 30_000,
  });
  const queryClient = useQueryClient();
  const refreshMatcherCounts = () => {
    void queryClient.invalidateQueries({ queryKey: matcherCountsKey });
    onSaved();
  };

  const saveDimension = useMutation({
    mutationFn: (draft: DimensionFormValue) =>
      upsertFacetDimension({
        slug: dimension.slug,
        label: draft.label,
        description: draft.description || null,
        cardinality: dimension.cardinality,
        siteId,
      }),
    onSuccess: () => {
      setEditingDimension(false);
      toast.success(`Saved “${dimension.label}”`);
      onSaved();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const removeDimension = useMutation({
    mutationFn: () =>
      archiveFacetDimension({ dimensionSlug: dimension.slug, siteId }),
    onSuccess: (result) => {
      toast.success(`“${dimension.label}” is retired`, {
        description: `Removed ${formatCount(result.valuesRetired)} answer${
          result.valuesRetired === 1 ? "" : "s"
        }, ${formatCount(result.matchersRemoved)} match${
          result.matchersRemoved === 1 ? "" : "es"
        } and ${formatCount(result.factsDropped)} keyword answer${
          result.factsDropped === 1 ? "" : "s"
        }.`,
      });
      onSaved();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const askAndRetireDimension = async () => {
    const ok = await confirm({
      title: `Retire “${dimension.label}”?`,
      description: `This removes the question, its ${formatCount(
        dimension.value_count,
      )} answer${dimension.value_count === 1 ? "" : "s"}, every match that fills them, and the answer currently on ${formatCount(
        dimension.keyword_count,
      )} keyword${dimension.keyword_count === 1 ? "" : "s"}. It happens in one step. ${
        dimension.rule_count > 0
          ? `${formatCount(dimension.rule_count)} value rule${
              dimension.rule_count === 1 ? "" : "s"
            } still read this dimension — point ${
              dimension.rule_count === 1 ? "it" : "them"
            } somewhere else first or this will be refused.`
          : "Nothing about worth points at it, so no rule breaks."
      }`,
      variant: "destructive",
      confirmLabel: "Retire it",
    });
    if (ok) removeDimension.mutate();
  };

  const addValue = useMutation({
    mutationFn: (draft: ValueFormValue) =>
      upsertFacetValue({
        dimension: dimension.slug,
        value: draft.value,
        label: draft.label,
        description: draft.description || null,
        siteId,
        position: dimension.values.length + 1,
      }),
    onSuccess: (valueId) => {
      setAddingValue(false);
      setExpanded(true);
      setJustAdded(typeof valueId === "string" ? valueId : null);
      toast.success("Answer added — now say what finds it");
      onSaved();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  return (
    <article
      className={cn(
        "rounded-lg border bg-card",
        owned ? "border-border" : "border-border/70",
      )}
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={expanded ? "Hide answers" : "Show answers"}
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
          />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              {dimension.label}
            </h3>
            <span className="font-mono text-[10px] text-muted-foreground">
              {dimension.slug}
            </span>
            {owned ? (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                Yours
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="h-4 gap-1 px-1.5 text-[10px]"
                title="A fact every site shares, so results stay comparable. Only a super admin can change its wording."
              >
                <Lock className="h-2.5 w-2.5" /> Shared
              </Badge>
            )}
            {dimension.cardinality === "multi" ? (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                Several answers allowed
              </Badge>
            ) : null}
            {situational ? (
              <Badge
                variant="outline"
                className="h-4 gap-1 px-1.5 text-[10px]"
                title="Worked out from this site's own data on a cadence, not from the words. Every answer carries when it was last worked out."
              >
                <Timer className="h-2.5 w-2.5" /> Right now
              </Badge>
            ) : null}
            {/* A dimension that is not being applied must SAY so here. The
                whole reason this screen exists is that a setting which
                silently does nothing looked exactly like one that works. */}
            {!dimension.is_ready ? (
              <Badge
                variant="outline"
                className="h-4 gap-1 border-amber-500/40 px-1.5 text-[10px] text-amber-700 dark:text-amber-400"
              >
                Not being applied yet
              </Badge>
            ) : !dimension.can_abstain ? (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-muted-foreground">
                No “not clear” option
              </Badge>
            ) : null}
          </div>

          {dimension.readiness_note && (!dimension.is_ready || !dimension.can_abstain) ? (
            <p className="mt-1 text-[11px] leading-4 text-amber-700 dark:text-amber-400">
              {dimension.readiness_note}
            </p>
          ) : null}

          {dimension.description ? (
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {dimension.description}
            </p>
          ) : owned ? (
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground/70">
              No reason written yet — say why this matters and every agent reads
              it before sorting a keyword.
            </p>
          ) : null}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <CountChip
              icon={Users}
              value={dimension.value_count}
              label={dimension.value_count === 1 ? "answer" : "answers"}
              title="Allowed answers on this dimension"
            />
            <CountChip
              icon={Tag}
              value={dimension.keyword_count}
              label="keywords sorted"
              title="Keywords that currently carry one of these answers"
            />
            <CountChip
              icon={Gavel}
              value={dimension.rule_count}
              label={dimension.rule_count === 1 ? "value rule" : "value rules"}
              title="Value rules that decide worth using this dimension. Changing what an answer means changes what those rules pay out."
            />
            {situational ? (
              <CountChip
                icon={Timer}
                value={dimension.condition_matcher_count}
                label={
                  dimension.condition_matcher_count === 1
                    ? "Dig Here rule"
                    : "Dig Here rules"
                }
                title="Dig Here rules that fill this dimension's segments. Re-evaluate to bring them up to date."
              />
            ) : null}
            {situational ? (
              <span
                className="whitespace-nowrap text-[11px] text-muted-foreground"
                title={
                  dimension.situational_as_of
                    ? new Date(dimension.situational_as_of).toLocaleString()
                    : "Nothing here has been evaluated yet."
                }
              >
                {dimension.situational_as_of
                  ? `as of ${formatRelativeTime(dimension.situational_as_of, { style: "long" })}`
                  : "never evaluated"}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {situational && dimension.condition_matcher_count > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              disabled={stampMutations.evaluate.isPending}
              title="Run this dimension's Dig Here rules again over the current window and update what every keyword carries."
              onClick={() => {
                stampMutations.evaluate.mutate(
                  { dimensionId: dimension.dimension_id },
                  {
                    onSuccess: (result) => {
                      toast.success(
                        result.stamped === 0 && result.removed === 0
                          ? `${dimension.label}: already up to date (${result.window.start} → ${result.window.end}).`
                          : `${dimension.label}: ${result.stamped.toLocaleString()} stamped, ${result.removed.toLocaleString()} released (${result.window.start} → ${result.window.end}).`,
                      );
                      onSaved();
                    },
                    onError: (error) => toast.error(extractErrorMessage(error)),
                  },
                );
              }}
            >
              <RefreshCw
                className={cn(
                  "mr-1 h-3 w-3",
                  stampMutations.evaluate.isPending && "animate-spin",
                )}
              />
              {stampMutations.evaluate.isPending
                ? "Re-evaluating…"
                : "Re-evaluate"}
            </Button>
          ) : null}
          {owned && !editingDimension ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-1.5 text-[11px]"
              onClick={() => setEditingDimension(true)}
            >
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
          ) : null}
          {/* Retiring a whole question takes every answer, every match and
              every stamp with it — one confirm, one server transaction. Only
              offered on a dimension this site owns: a shared one is a fact
              every site depends on, and the DB refuses it for anyone below
              super admin anyway. */}
          {owned && !editingDimension ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-1.5 text-[11px] text-muted-foreground hover:text-destructive"
              disabled={removeDimension.isPending}
              title={`Retire “${dimension.label}” and everything under it`}
              onClick={() => void askAndRetireDimension()}
            >
              {removeDimension.isPending ? (
                <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3 w-3" />
              )}
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      {editingDimension ? (
        <div className="px-3 pb-3">
          <DimensionForm
            mode="edit"
            initial={{
              slug: dimension.slug,
              label: dimension.label,
              description: dimension.description ?? "",
              cardinality: dimension.cardinality,
            }}
            pending={saveDimension.isPending}
            onCancel={() => setEditingDimension(false)}
            onSubmit={(draft) => saveDimension.mutate(draft)}
          />
        </div>
      ) : null}

      {expanded ? (
        <div className="space-y-2 border-t border-border px-3 py-2.5">
          {dimension.values.length === 0 ? (
            <p className="text-[11px] leading-4 text-muted-foreground">
              No answers yet. Until there is at least one, nothing can be sorted
              by this dimension and no rule can pay out on it.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {dimension.values.map((value) => (
                <ValueRow
                  key={value.value_id}
                  value={value}
                  editable={owned}
                  siteId={siteId}
                  dimensionSlug={dimension.slug}
                  dimensionLabel={dimension.label}
                  situational={situational}
                  focused={value.value_id === focusValueId}
                  matcherCount={matcherCounts.data?.get(value.value_id) ?? (matcherCounts.data ? 0 : undefined)}
                  autoOpenMatchers={
                    (focusMatcher && value.value_id === focusValueId) ||
                    value.value_id === justAdded
                  }
                  onSaved={onSaved}
                  onMatchersChanged={refreshMatcherCounts}
                />
              ))}
            </ul>
          )}

          {owned ? (
            addingValue ? (
              <ValueForm
                mode="create"
                pending={addValue.isPending}
                onCancel={() => setAddingValue(false)}
                onSubmit={(draft) => addValue.mutate(draft)}
              />
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => setAddingValue(true)}
              >
                <Plus className="mr-1 h-3 w-3" /> Add an answer
              </Button>
            )
          ) : (
            <p className="flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
              <Lock className="mt-px h-3 w-3 shrink-0" />
              These answers are shared by every site so results can be compared.
              Need one your business needs? Create your own dimension above —
              that one is entirely yours.
            </p>
          )}
        </div>
      ) : null}
    </article>
  );
}
