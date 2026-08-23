"use client";

/**
 * One dimension, with its allowed answers.
 *
 * NOTHING IS DELETED BLIND. Every answer carries how many keywords already
 * wear it, and the dimension header carries how many value rules point at it.
 * That is why there is no delete button on this screen at all: a row can
 * disappear, the 196k classifications that name it cannot, and a soft-delete
 * that silently orphans facts is worse than no button. Retirement is its own
 * change with its own proof.
 *
 * Platform dimensions render with the same anatomy but locked: they are facts
 * every tenant shares, and comparability across sites is the reason.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ChevronDown,
  Gavel,
  Lock,
  Pencil,
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
import { DimensionForm, type DimensionFormValue } from "./DimensionForm";
import { ValueForm, type ValueFormValue } from "./ValueForm";
import {
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
}: {
  icon: typeof Tag;
  value: number;
  label: string;
  title: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground"
    >
      <Icon className="h-3 w-3 shrink-0" />
      {formatCount(value)} {label}
    </span>
  );
}

function ValueRow({
  value,
  editable,
  siteId,
  dimensionSlug,
  situational,
  onSaved,
}: {
  value: FacetValue;
  editable: boolean;
  siteId: string;
  dimensionSlug: string;
  situational: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);

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
    <li className="flex flex-wrap items-start gap-x-2 gap-y-1 rounded-md border border-border bg-card px-2.5 py-2">
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
        <CountChip
          icon={Tag}
          value={value.keyword_count}
          label="keywords"
          title={`${value.keyword_count} keywords currently carry this answer`}
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
      </div>
    </li>
  );
}

export function DimensionCard({
  dimension,
  siteId,
  defaultExpanded,
  onSaved,
}: {
  dimension: FacetDimension;
  siteId: string;
  defaultExpanded: boolean;
  onSaved: () => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editingDimension, setEditingDimension] = useState(false);
  const [addingValue, setAddingValue] = useState(false);

  const owned = dimension.scope === "site";
  const situational = dimension.nature === "situational";
  // Re-derivation is the DB's job — this button only asks for it, scoped to
  // this dimension, over the site's current window (THE SCOPE RULE).
  const stampMutations = useDigStampMutations(siteId);

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
    onSuccess: () => {
      setAddingValue(false);
      setExpanded(true);
      toast.success("Answer added");
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
                        `${dimension.label}: ${result.stamped.toLocaleString()} stamped, ${result.removed.toLocaleString()} released (${result.window.start} → ${result.window.end}).`,
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
                  situational={situational}
                  onSaved={onSaved}
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
