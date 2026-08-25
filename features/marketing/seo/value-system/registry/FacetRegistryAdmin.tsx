"use client";

/**
 * THE PLATFORM VOCABULARY REGISTRY — the universal facets every tenant's
 * keywords are classified against, and the band starter templates every site
 * adopts from. Rows live in platform.categories (dimensions 'seo_facet',
 * 'seo_value_band', 'seo_geo_band'); db-rules §5 makes that the home of every
 * growing controlled vocabulary.
 *
 * WHY THIS SCREEN EXISTS. Facts are universal and meaning is local
 * (value-system.md, law 1): the FACET vocabulary is deliberately the same for
 * every tenant, because comparability requires it. A site cannot edit it — so
 * without this screen the labels an agent applies to 196k keywords would be
 * visible only in a migration file. "The rules can't live in the agent's head"
 * (Arman, 2026-08-21) applies to the platform plane too.
 *
 * WHAT IS EDITABLE AND WHAT IS NOT.
 *  - Label and description: yes, by a super admin. They are how the vocabulary
 *    reads; nothing points at them.
 *  - The identity (slug): never. Every classified keyword and every site
 *    vocabulary points at it.
 *  - Deleting a value: not offered. seo.keyword's CHECK constraints still
 *    enforce the values the classifier has already written; a registry row can
 *    disappear and the data it names cannot.
 *  - Adding a value: allowed only once seo.keyword's matching CHECK has been
 *    widened, in the same change. The DB refuses otherwise, and this screen
 *    says so before you try.
 *
 * Band TEMPLATES show their thresholds read-only: moving a template threshold
 * silently re-bands every site that has not adopted its own vocabulary. Sites
 * change their own bands on the value workbench, which shows them the impact.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenText,
  Check,
  Landmark,
  Loader2,
  Lock,
  MapPinned,
  Plus,
  ShieldAlert,
  Tags,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/styles/themes/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import {
  addFacetRegistryValue,
  getFacetRegistryUsage,
  listVocabularyRegistry,
  updateVocabularyRegistryEntry,
} from "../data";
import type { RegistryDimension, RegistryEntry } from "../types";

const DIMENSIONS: Array<{
  key: RegistryDimension;
  label: string;
  icon: typeof Tags;
  blurb: string;
}> = [
  {
    key: "seo_facet",
    label: "Keyword facets",
    icon: Tags,
    blurb:
      "What a query IS — detected once, identically for every tenant. Agents never free-type these; they pick from this list.",
  },
  {
    key: "seo_value_band",
    label: "Value band template",
    icon: Landmark,
    blurb:
      "The starter bands a site adopts on its value workbench. Sites that have not adopted run on these names and thresholds.",
  },
  {
    key: "seo_geo_band",
    label: "Geo band template",
    icon: MapPinned,
    blurb:
      "The starter geography bands. A site adopts and re-multiplies them for its own economics.",
  },
];

function InlineEdit({
  entryId,
  label,
  description,
  canEdit,
  onSaved,
}: {
  entryId: string;
  label: string;
  description: string | null;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label);
  const [draftDescription, setDraftDescription] = useState(description ?? "");

  const save = useMutation({
    mutationFn: () =>
      updateVocabularyRegistryEntry(
        entryId,
        draftLabel,
        draftDescription.trim() || null,
      ),
    onSuccess: () => {
      toast.success("Vocabulary updated", {
        description: `Every surface that reads this entry now says “${draftLabel.trim()}”.`,
      });
      setEditing(false);
      onSaved();
    },
    onError: (error) => {
      toast.error("Could not update the vocabulary", {
        description: extractErrorMessage(error),
      });
    },
  });

  if (!editing) {
    return (
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => {
          setDraftLabel(label);
          setDraftDescription(description ?? "");
          setEditing(true);
        }}
        className={cn(
          "min-w-0 flex-1 rounded px-1 py-0.5 text-left transition-colors",
          canEdit ? "hover:bg-muted/60" : "cursor-default",
        )}
        title={canEdit ? "Rename or re-describe this entry" : undefined}
      >
        <span className="block truncate text-xs font-medium text-foreground">
          {label}
        </span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {description || "No description yet."}
        </span>
      </button>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Input
        autoFocus
        value={draftLabel}
        disabled={save.isPending}
        onChange={(event) => setDraftLabel(event.target.value)}
        className="h-7 text-xs"
        placeholder="Name"
      />
      <Input
        value={draftDescription}
        disabled={save.isPending}
        onChange={(event) => setDraftDescription(event.target.value)}
        className="h-7 border-dashed text-[11px]"
        placeholder="What does this mean? (optional)"
      />
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          disabled={save.isPending || !draftLabel.trim()}
          onClick={() => save.mutate()}
          className="h-6 gap-1 px-2 text-[11px]"
        >
          {save.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={save.isPending}
          onClick={() => setEditing(false)}
          className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
        >
          <X className="h-3 w-3" /> Cancel
        </Button>
      </div>
    </div>
  );
}

function AddValueForm({
  facet,
  allowedHint,
  onAdded,
}: {
  facet: string;
  allowedHint: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");

  const add = useMutation({
    mutationFn: () =>
      addFacetRegistryValue(facet, value.trim(), label, description.trim() || null),
    onSuccess: () => {
      toast.success(`“${label.trim()}” added to ${facet}`, {
        description: "Classifier runs can use it from the next run onward.",
      });
      setOpen(false);
      setValue("");
      setLabel("");
      setDescription("");
      onAdded();
    },
    onError: (error) => {
      toast.error("Could not add the value", {
        description: extractErrorMessage(error),
      });
    },
  });

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-6 gap-1 px-1.5 text-[10px]"
      >
        <Plus className="h-3 w-3" /> Add a value
      </Button>
    );
  }

  return (
    <div className="w-full space-y-1.5 rounded-md border border-border bg-muted/30 p-2">
      <p className="flex items-start gap-1.5 text-[10px] leading-4 text-warning">
        <ShieldAlert className="mt-px h-3 w-3 shrink-0" />
        Adding a value requires widening <code>keyword_{facet}_check</code> on{" "}
        <code>seo.keyword</code> in the same change — until that lands the
        database refuses this, because a label for a value the classifier can
        never write is a lie. Currently accepted: {allowedHint}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Input
          autoFocus
          value={value}
          disabled={add.isPending}
          onChange={(event) => setValue(event.target.value)}
          placeholder="value_written_by_the_classifier"
          className="h-7 min-w-[14rem] flex-1 font-mono text-[11px]"
        />
        <Input
          value={label}
          disabled={add.isPending}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Name humans read"
          className="h-7 min-w-[12rem] flex-1 text-xs"
        />
      </div>
      <Input
        value={description}
        disabled={add.isPending}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="What does this value mean? (optional)"
        className="h-7 border-dashed text-[11px]"
      />
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          disabled={add.isPending || !value.trim() || !label.trim()}
          onClick={() => add.mutate()}
          className="h-6 gap-1 px-2 text-[11px]"
        >
          {add.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Add value
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={add.isPending}
          onClick={() => setOpen(false)}
          className="h-6 px-2 text-[11px] text-muted-foreground"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function FacetRegistryAdmin() {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const queryClient = useQueryClient();
  const [dimension, setDimension] = useState<RegistryDimension>("seo_facet");

  const registry = useQuery({
    queryKey: ["seo-registry", dimension],
    queryFn: ({ signal }) => listVocabularyRegistry(dimension, signal),
    staleTime: 5 * 60_000,
  });
  const usage = useQuery({
    queryKey: ["seo-registry", "usage"],
    queryFn: ({ signal }) => getFacetRegistryUsage(signal),
    staleTime: 5 * 60_000,
    enabled: dimension === "seo_facet",
  });

  const usageByKey = new Map(
    (usage.data ?? []).map((row) => [`${row.facet}:${row.value_key}`, row.keywords]),
  );

  const grouped = new Map<string, { entry: RegistryEntry; values: RegistryEntry[] }>();
  for (const row of registry.data ?? []) {
    const key = row.parent_slug;
    const bucket = grouped.get(key);
    if (bucket) bucket.values.push(row);
    else grouped.set(key, { entry: row, values: [row] });
  }

  const active = DIMENSIONS.find((item) => item.key === dimension) ?? DIMENSIONS[0];
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["seo-registry"] });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3 sm:p-4">
      <div className="shrink-0">
        <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <BookOpenText className="h-4 w-4 text-primary" />
          SEO vocabulary registry
        </h1>
        <p className="text-xs text-muted-foreground">
          The controlled vocabularies every keyword classifier applies. Facts are
          universal, so these are the same for every tenant — meaning is local,
          and each site governs its own bands on its value workbench.
        </p>
      </div>

      {!isSuperAdmin ? (
        <p className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Read-only — the platform vocabulary is edited by super admins. What you
          see here is exactly what the agents apply.
        </p>
      ) : null}

      <div className="flex shrink-0 flex-wrap gap-1.5">
        {DIMENSIONS.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.key}
              type="button"
              size="sm"
              variant={item.key === dimension ? "default" : "outline"}
              onClick={() => setDimension(item.key)}
              className="h-7 gap-1.5 text-xs"
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Button>
          );
        })}
      </div>
      <p className="shrink-0 text-[11px] text-muted-foreground">{active.blurb}</p>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1 scrollbar-thin">
        {registry.isError ? (
          <InlineQueryError
            what="the vocabulary registry"
            error={registry.error}
            onRetry={() => void registry.refetch()}
          />
        ) : null}
        {registry.isPending ? (
          <>
            <Skeleton className="h-24 rounded-md" />
            <Skeleton className="h-24 rounded-md" />
          </>
        ) : null}

        {dimension === "seo_facet"
          ? [...grouped.values()].map(({ entry, values }) => {
              const allowed = values
                .filter((row) => row.enforced)
                .map((row) => row.value_key)
                .join(", ");
              return (
                <section
                  key={entry.parent_slug}
                  className="rounded-lg border border-border bg-card p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <InlineEdit
                      entryId={entry.parent_id as string}
                      label={entry.parent_label ?? entry.parent_slug}
                      description={entry.parent_description}
                      canEdit={isSuperAdmin}
                      onSaved={refresh}
                    />
                    <code className="shrink-0 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      seo.keyword.{entry.parent_slug}
                    </code>
                  </div>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                    {values.map((row) => {
                      const count = usageByKey.get(
                        `${entry.parent_slug}:${row.value_key}`,
                      );
                      return (
                        <li
                          key={row.value_id}
                          className={cn(
                            "flex items-start gap-1.5 rounded-md border bg-background px-2 py-1.5",
                            row.enforced ? "border-border" : "border-warning/50",
                          )}
                        >
                          <InlineEdit
                            entryId={row.value_id}
                            label={row.value_label}
                            description={row.value_description}
                            canEdit={isSuperAdmin}
                            onSaved={refresh}
                          />
                          <span className="flex shrink-0 flex-col items-end gap-0.5">
                            <code className="text-[10px] text-muted-foreground">
                              {row.value_key}
                            </code>
                            {row.enforced ? (
                              <span className="text-[10px] tabular-nums text-muted-foreground">
                                {usage.isPending
                                  ? "…"
                                  : `${formatCount(count ?? 0)} kw`}
                              </span>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-warning/50 bg-warning/10 text-[9px] font-normal text-warning"
                                title="seo.keyword's CHECK constraint does not accept this value, so the classifier can never write it."
                              >
                                not enforced
                              </Badge>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {isSuperAdmin ? (
                    <div className="mt-1.5 flex">
                      <AddValueForm
                        facet={entry.parent_slug}
                        allowedHint={allowed || "none"}
                        onAdded={refresh}
                      />
                    </div>
                  ) : null}
                </section>
              );
            })
          : (registry.data ?? []).map((row) => {
              const minScore = row.value_config?.min_score;
              const multiplier = row.value_config?.multiplier;
              return (
                <div
                  key={row.value_id}
                  className="flex items-start gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
                >
                  <InlineEdit
                    entryId={row.value_id}
                    label={row.value_label}
                    description={row.value_description}
                    canEdit={isSuperAdmin}
                    onSaved={refresh}
                  />
                  <span className="flex shrink-0 items-center gap-2">
                    {typeof minScore === "number" ? (
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        score ≥ {minScore}
                      </span>
                    ) : null}
                    {typeof multiplier === "number" ? (
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        ×{multiplier}
                      </span>
                    ) : null}
                    <code className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {row.value_slug}
                    </code>
                  </span>
                </div>
              );
            })}

        {dimension !== "seo_facet" && registry.isSuccess ? (
          <p className="flex items-start gap-1.5 rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
            <Lock className="mt-px h-3 w-3 shrink-0" />
            Thresholds are read-only here on purpose: moving one silently
            re-bands every site still on the template. A site changes its own
            bands on its value workbench, where it can see exactly which of its
            keywords move.
          </p>
        ) : null}
      </div>
    </div>
  );
}
