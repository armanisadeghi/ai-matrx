"use client";

/**
 * THE BAND EDITOR — where a site takes ownership of the vocabulary its agents
 * apply. Arman's determinism ruling (2026-08-21): "users must be able to see
 * and adjust the vocabulary agents apply — the rules can't live in the agent's
 * head."
 *
 * ADOPT THEN EDIT. Until a site saves here it runs on the platform starter
 * template; the first save copies those rows into seo.site_vocabulary and from
 * then on the site's rows REPLACE the whole template set. The platform
 * template is never touched by this screen.
 *
 * IDENTITY vs NAME. `value` is the identity every ruling points at and is
 * fixed once created. The NAME is free text, and renaming it re-labels every
 * keyword the instant you save — which is exactly the point of owning your own
 * vocabulary, so this screen shows the rename happening rather than warning
 * about it.
 *
 * NOTHING IS SILENTLY DROPPED. Removing a band asks where its keywords go, and
 * the reassignment travels with the save (the DB refuses the removal without
 * it).
 *
 * THE PREVIEW IS SERVER-SIDE. Thresholds are re-banded by
 * seo.gsc_value_band_preview against this site's real GSC keywords — a band is
 * never re-derived on the client (value-system.md, law 3).
 */

import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowRight,
  Landmark,
  Loader2,
  MapPinned,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/styles/themes/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import {
  adoptValueVocabulary,
  getValueVocabulary,
  listGeoAreas,
  previewValueBands,
  resetValueVocabulary,
  saveValueVocabulary,
} from "../data";
import type { ValueBandDef, VocabKind, VocabularyDraftRow } from "../types";
import {
  findDraftIssues,
  isReservedNegative,
  minScoreOf,
  multiplierOf,
  orderedForDisplay,
  removedValues,
  renamedValues,
  slugifyVocabValue,
  toDraftRows,
} from "./lib";

const KIND_COPY: Record<
  VocabKind,
  { title: string; blurb: string; icon: typeof Landmark; noun: string }
> = {
  value_band: {
    title: "Value bands",
    icon: Landmark,
    noun: "band",
    blurb:
      "Every keyword's computed score lands in one of these bands. Rename them to your language, move the thresholds to your economics — the whole site re-labels the moment you save.",
  },
  geo_band: {
    title: "Geo bands",
    icon: MapPinned,
    noun: "geo band",
    blurb:
      "How much a search from each kind of place is worth to you. Your tight radius is usually ×1; a place you never serve is ×0, which forces Negative.",
  },
};

function numberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function BandVocabularyEditor({
  siteId,
  siteDomain,
  kind,
  window,
  onClose,
  onSaved,
}: {
  siteId: string;
  siteDomain: string;
  kind: VocabKind;
  /** GSC window the live impact preview is measured over. */
  window: { start: string; end: string };
  onClose: () => void;
  /** Fired after a successful save/reset so the host can refresh its views. */
  onSaved?: () => void;
}) {
  const copy = KIND_COPY[kind];
  const Icon = copy.icon;
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<VocabularyDraftRow[] | null>(null);
  const [reassign, setReassign] = useState<Record<string, string>>({});

  const vocab = useQuery({
    queryKey: ["marketing", "value-vocab", siteId, kind],
    queryFn: ({ signal }) => getValueVocabulary(siteId, kind, signal),
    staleTime: 60_000,
  });
  const saved: ValueBandDef[] = vocab.data ?? [];
  const isTemplate = Boolean(saved[0]?.is_template);
  const draft = rows ?? toDraftRows(saved);

  const geoAreas = useQuery({
    queryKey: ["marketing", "value-vocab", "geo-areas", siteId],
    queryFn: () => listGeoAreas(siteId),
    staleTime: 60_000,
    enabled: kind === "geo_band",
  });

  const issues = findDraftIssues(kind, draft);
  const blockingIssue = issues.length > 0;
  const removed = removedValues(saved, draft);
  const renamed = renamedValues(saved, draft);
  const unrouted = removed.filter((value) => !reassign[value]);
  const dirty =
    rows !== null &&
    JSON.stringify(toDraftRows(saved)) !== JSON.stringify(draft);

  // The live impact: this site's real keywords re-banded by the PROPOSED
  // thresholds, server-side. Only asked for when the draft is coherent — the
  // DB would (correctly) reject anything else.
  //
  // The key is the BANDING, not the draft. Re-banding scans the whole keyword
  // corpus, so keying it on the draft would fire a corpus-wide query on every
  // keystroke of a name that cannot move a single keyword. Names are joined in
  // for display after the fact.
  const bandingKey = JSON.stringify(
    draft
      .map((row) => [row.value, minScoreOf(row)] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  );
  const preview = useQuery({
    queryKey: [
      "marketing",
      "value-vocab",
      "preview",
      siteId,
      window.start,
      window.end,
      bandingKey,
    ],
    queryFn: ({ signal }) =>
      previewValueBands(
        siteId,
        // Labels are irrelevant to banding but the DB checks coherence, so send
        // the identity as the name: this payload is never persisted.
        draft.map((row) => ({ ...row, label: row.value, description: null })),
        window.start,
        window.end,
        signal,
      ),
    enabled: kind === "value_band" && !blockingIssue,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

  const previewByBand = new Map(
    (preview.data ?? []).map((row) => [row.value_band, row]),
  );
  const movedTotal = (preview.data ?? []).reduce(
    (sum, row) => sum + row.moved_in,
    0,
  );

  const geoUseByBand = new Map<string, number>();
  for (const area of geoAreas.data ?? []) {
    geoUseByBand.set(area.geo_band, (geoUseByBand.get(area.geo_band) ?? 0) + 1);
  }

  function patchRow(value: string, patch: Partial<VocabularyDraftRow>) {
    setRows(
      draft.map((row) => (row.value === value ? { ...row, ...patch } : row)),
    );
  }

  /**
   * A band that has never been saved has no rulings pointing at it, so its
   * identity can still follow the name — settled on blur, never mid-keystroke
   * (the identity is this row's React key). Once saved, the identity is frozen:
   * it is what every ruling refers to.
   */
  function settleIdentity(value: string) {
    if (saved.some((def) => def.value === value)) return;
    const row = draft.find((item) => item.value === value);
    if (!row) return;
    const nextValue = slugifyVocabValue(row.label);
    if (!nextValue || nextValue === value) return;
    if (draft.some((item) => item.value !== value && item.value === nextValue)) return;
    setRows(
      draft.map((item) =>
        item.value === value ? { ...item, value: nextValue } : item,
      ),
    );
  }

  function patchConfig(value: string, key: string, next: number | null) {
    setRows(
      draft.map((row) => {
        if (row.value !== value) return row;
        const config = { ...row.config };
        if (next === null) delete config[key];
        else config[key] = next;
        return { ...row, config };
      }),
    );
  }

  function addRow() {
    const seq = draft.length + 1;
    let value = `band_${seq}`;
    let guard = seq;
    while (draft.some((row) => row.value === value)) {
      guard += 1;
      value = `band_${guard}`;
    }
    setRows([
      ...draft,
      {
        value,
        label: "",
        description: null,
        sort: draft.length,
        config: kind === "value_band" ? { min_score: 50 } : { multiplier: 0.5 },
      },
    ]);
  }

  function removeRow(value: string) {
    setRows(draft.filter((row) => row.value !== value));
  }

  function restoreRow(value: string) {
    const original = saved.find((def) => def.value === value);
    if (!original) return;
    setReassign((current) => {
      const next = { ...current };
      delete next[value];
      return next;
    });
    setRows([
      ...draft,
      {
        value: original.value,
        label: original.label,
        description: original.description,
        sort: original.sort,
        config: { ...original.config },
      },
    ]);
  }

  const save = useMutation({
    mutationFn: () => saveValueVocabulary(siteId, kind, draft, reassign),
    onSuccess: (next) => {
      const renameNote =
        renamed.length > 0
          ? ` ${renamed.map((r) => `“${r.from}” is now “${r.to}”`).join("; ")} everywhere.`
          : "";
      toast.success(
        isTemplate
          ? `${siteDomain} now governs its own ${copy.title.toLowerCase()}`
          : `${copy.title} saved`,
        {
          description: `${next.length} ${copy.noun}s in effect.${renameNote}`,
        },
      );
      setRows(null);
      setReassign({});
      void queryClient.invalidateQueries({ queryKey: ["marketing"] });
      onSaved?.();
    },
    onError: (error) => {
      toast.error(`Could not save the ${copy.title.toLowerCase()}`, {
        description: extractErrorMessage(error),
      });
    },
  });

  const adopt = useMutation({
    mutationFn: () => adoptValueVocabulary(siteId, kind),
    onSuccess: () => {
      toast.success(`${siteDomain} now governs its own ${copy.title.toLowerCase()}`, {
        description:
          "The platform starter set was copied in. Edit it freely — the template stays untouched.",
      });
      void queryClient.invalidateQueries({ queryKey: ["marketing"] });
    },
    onError: (error) => {
      toast.error("Could not adopt the starter set", {
        description: extractErrorMessage(error),
      });
    },
  });

  const reset = useMutation({
    mutationFn: () => resetValueVocabulary(siteId, kind),
    onSuccess: () => {
      toast.success(`${copy.title} handed back to the platform defaults`);
      setRows(null);
      setReassign({});
      void queryClient.invalidateQueries({ queryKey: ["marketing"] });
      onSaved?.();
    },
    onError: (error) => {
      toast.error("Could not restore the platform defaults", {
        description: extractErrorMessage(error),
      });
    },
  });

  const busy = save.isPending || adopt.isPending || reset.isPending;
  const displayRows = orderedForDisplay(kind, draft);

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="flex max-h-[88dvh] w-[min(72rem,96vw)] max-w-none flex-col gap-3 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b border-border px-4 pt-4 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Icon className="h-4 w-4 text-primary" />
            {copy.title} for {siteDomain}
            {isTemplate ? (
              <Badge
                variant="outline"
                className="border-info/40 bg-info/10 text-[10px] font-normal text-info"
              >
                platform defaults
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-success/40 bg-success/10 text-[10px] font-normal text-success"
              >
                yours
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {copy.blurb}
            {isTemplate ? (
              <>
                {" "}
                This site is still on the platform starter set — saving here
                copies it in and makes it yours. The template is never changed.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-4 pb-1 scrollbar-thin lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* Rows */}
          <div className="space-y-2">
            {vocab.isError ? (
              <InlineQueryError
                what={copy.title.toLowerCase()}
                error={vocab.error}
                onRetry={() => void vocab.refetch()}
              />
            ) : null}
            {vocab.isPending ? (
              <>
                <Skeleton className="h-14 rounded-md" />
                <Skeleton className="h-14 rounded-md" />
                <Skeleton className="h-14 rounded-md" />
              </>
            ) : null}

            {displayRows.map((row) => {
              const rowIssues = issues.filter((issue) => issue.value === row.value);
              const reserved = kind === "value_band" && isReservedNegative(row);
              const impact = previewByBand.get(row.value);
              const renamedRow = renamed.find((r) => r.value === row.value);
              return (
                <div
                  key={row.value}
                  className={cn(
                    "rounded-md border bg-card px-3 py-2",
                    rowIssues.length > 0 ? "border-destructive/50" : "border-border",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={row.label}
                      disabled={busy}
                      placeholder="Name this band"
                      onChange={(event) =>
                        patchRow(row.value, { label: event.target.value })
                      }
                      onBlur={() => settleIdentity(row.value)}
                      className="h-8 min-w-[10rem] flex-1 text-xs"
                    />
                    {kind === "value_band" ? (
                      reserved ? (
                        <span className="rounded border border-border bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
                          guard — no score range
                        </span>
                      ) : (
                        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          score ≥
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            disabled={busy}
                            value={minScoreOf(row) ?? ""}
                            onChange={(event) =>
                              patchConfig(
                                row.value,
                                "min_score",
                                numberOrNull(event.target.value),
                              )
                            }
                            className="h-8 w-20 text-xs tabular-nums"
                          />
                        </label>
                      )
                    ) : (
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        multiplier ×
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          step={0.05}
                          disabled={busy}
                          value={multiplierOf(row) ?? ""}
                          onChange={(event) =>
                            patchConfig(
                              row.value,
                              "multiplier",
                              numberOrNull(event.target.value),
                            )
                          }
                          className="h-8 w-24 text-xs tabular-nums"
                        />
                      </label>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={busy || reserved}
                      title={
                        reserved
                          ? "The Negative band is reserved — you may rename it, never remove it."
                          : `Remove this ${copy.noun}`
                      }
                      onClick={() => removeRow(row.value)}
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <Input
                    value={row.description ?? ""}
                    disabled={busy}
                    placeholder="What does this band mean to your business? (optional)"
                    onChange={(event) =>
                      patchRow(row.value, {
                        description: event.target.value || null,
                      })
                    }
                    className="mt-1.5 h-7 border-dashed text-[11px]"
                  />

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px]">
                    <span className="text-muted-foreground/70">
                      identity <code className="text-muted-foreground">{row.value}</code>
                    </span>
                    {renamedRow ? (
                      <span className="flex items-center gap-1 text-info">
                        “{renamedRow.from}” <ArrowRight className="h-3 w-3" />{" "}
                        “{renamedRow.to}” on every keyword
                      </span>
                    ) : null}
                    {impact ? (
                      <span className="text-muted-foreground">
                        {formatCount(impact.keywords)} keywords ·{" "}
                        {formatCount(impact.clicks)} clicks
                        {impact.moved_in > 0 ? (
                          <span className="ml-1 text-success">
                            +{formatCount(impact.moved_in)} moving in
                          </span>
                        ) : null}
                        {impact.moved_out > 0 ? (
                          <span className="ml-1 text-warning">
                            −{formatCount(impact.moved_out)} moving out
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    {kind === "geo_band" ? (
                      <span className="text-muted-foreground">
                        {geoUseByBand.get(row.value) ?? 0} geo area(s)
                      </span>
                    ) : null}
                  </div>

                  {rowIssues.map((issue) => (
                    <p
                      key={issue.message}
                      className="mt-1 flex items-start gap-1 text-[10px] text-destructive"
                    >
                      <TriangleAlert className="mt-px h-3 w-3 shrink-0" />
                      {issue.message}
                    </p>
                  ))}
                </div>
              );
            })}

            {vocab.isSuccess ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={addRow}
                className="h-8 gap-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Add a {copy.noun}
              </Button>
            ) : null}

            {/* Removals — nothing that carries a ruling disappears silently. */}
            {removed.map((value) => {
              const original = saved.find((def) => def.value === value);
              return (
                <div
                  key={value}
                  className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2"
                >
                  <p className="text-[11px] font-medium text-foreground">
                    Removing “{original?.label ?? value}”
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Anything ruled this band needs somewhere to go — pick where,
                    or put the band back.
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Select
                      value={reassign[value] ?? ""}
                      disabled={busy}
                      onValueChange={(next) =>
                        setReassign((current) => ({ ...current, [value]: next }))
                      }
                    >
                      <SelectTrigger className="h-8 w-52 text-xs">
                        <SelectValue placeholder="Move them to…" />
                      </SelectTrigger>
                      <SelectContent>
                        {draft
                          .filter((row) => row.label.trim())
                          .map((row) => (
                            <SelectItem key={row.value} value={row.value} className="text-xs">
                              {row.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => restoreRow(value)}
                      className="h-8 gap-1 px-2 text-xs text-muted-foreground"
                    >
                      <RotateCcw className="h-3 w-3" /> Put it back
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Live impact */}
          <aside className="space-y-2 lg:border-l lg:border-border lg:pl-3">
            <div>
              <p className="text-xs font-semibold text-foreground">
                {kind === "value_band" ? "Live impact" : "Where these apply"}
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                {kind === "value_band" ? (
                  <>
                    Your real keywords, {window.start} → {window.end}, re-banded
                    by the thresholds above. Expert rulings and the reserved
                    buckets never move.
                  </>
                ) : (
                  <>
                    Geo bands change what a search from each place is worth.
                    They apply through the geo areas you have defined.
                  </>
                )}
              </p>
            </div>

            {kind === "value_band" ? (
              <>
                {blockingIssue ? (
                  <p className="rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
                    Fix the problems on the left and the impact appears here.
                  </p>
                ) : preview.isError ? (
                  <InlineQueryError
                    what="the live impact"
                    error={preview.error}
                    onRetry={() => void preview.refetch()}
                  />
                ) : preview.isPending ? (
                  <Skeleton className="h-24 rounded-md" />
                ) : (
                  <>
                    <p
                      className={cn(
                        "rounded-md border px-2.5 py-2 text-[11px]",
                        movedTotal > 0
                          ? "border-info/40 bg-info/10 text-info"
                          : "border-border bg-muted/30 text-muted-foreground",
                      )}
                    >
                      {movedTotal > 0
                        ? `${formatCount(movedTotal)} keywords change band when you save.`
                        : "No keyword changes band — only the names change."}
                    </p>
                    <ul className="space-y-1">
                      {(preview.data ?? []).map((row) => {
                        const label =
                          draft.find((item) => item.value === row.value_band)?.label ??
                          row.value_band;
                        return (
                          <li
                            key={row.value_band}
                            className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px]"
                          >
                            <span className="min-w-0 truncate font-medium text-foreground">
                              {label}
                            </span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {formatCount(row.keywords)} kw ·{" "}
                              {formatCount(row.clicks)} clicks
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <ul className="space-y-1">
                {(geoAreas.data ?? []).map((area) => (
                  <li
                    key={area.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="min-w-0 truncate text-foreground">{area.label}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {draft.find((row) => row.value === area.geo_band)?.label ??
                        area.geo_band}
                    </span>
                  </li>
                ))}
                {geoAreas.isSuccess && (geoAreas.data ?? []).length === 0 ? (
                  <li className="rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
                    No geo areas yet, so no geo gate applies to any keyword.
                  </li>
                ) : null}
              </ul>
            )}

            {issues
              .filter((issue) => issue.value === null)
              .map((issue) => (
                <p
                  key={issue.message}
                  className="flex items-start gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive"
                >
                  <TriangleAlert className="mt-px h-3 w-3 shrink-0" />
                  {issue.message}
                </p>
              ))}
          </aside>
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-border px-4 pt-3 pb-4">
          <div className="flex items-center gap-2">
            {isTemplate ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => adopt.mutate()}
                className="h-8 gap-1.5 text-xs"
              >
                {adopt.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Adopt the starter set
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                className="h-8 gap-1.5 text-xs text-muted-foreground"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Hand ${copy.title.toLowerCase()} back to the platform defaults?`,
                    description: `${siteDomain} stops governing its own ${copy.title.toLowerCase()} and goes back to the platform starter set. Your rulings stay, but any band the template does not have must be moved first.`,
                    confirmLabel: "Restore defaults",
                    variant: "destructive",
                  });
                  if (ok) reset.mutate();
                }}
              >
                {reset.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Restore platform defaults
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onClose}
              className="h-8 text-xs"
            >
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || blockingIssue || unrouted.length > 0 || !dirty}
              onClick={() => save.mutate()}
              className="h-8 gap-1.5 text-xs"
              title={
                unrouted.length > 0
                  ? "Say where the removed band's keywords go first."
                  : undefined
              }
            >
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {isTemplate ? "Adopt & save" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
