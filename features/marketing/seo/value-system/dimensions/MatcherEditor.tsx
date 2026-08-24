"use client";

/**
 * THE MATCHER EDITOR — KI-008. "The real work is when you do the match"
 * (Arman) finally has a screen: every matcher hung on one dimension VALUE,
 * what it would catch BEFORE it is saved, and a door to re-run the engine.
 *
 * Until this screen, `dimension_matcher_upsert` and `gsc_matcher_reach_preview`
 * had no UI at all — a score receipt's "matcher" step linked to the answer the
 * matcher stamps and said so honestly (`reason-links.ts`). That is now a real
 * link to a real editor.
 *
 * 🚨 NO NEW WRITE PATH. Every write here is one of the two canonical matcher
 * functions from `./data.ts` (`upsertDimensionMatcher` / `deleteDimensionMatcher`,
 * both wrapping `seo.dimension_matcher_upsert` / `_delete`) or the shared
 * `runSiteMatchers` engine wrapper — the same three doors the C9 suggestion
 * approval flow and the ruling session's rule writer already use. This screen
 * adds no fourth.
 *
 * PATTERN matchers (exact / word / contains / starts_with / ends_with) and
 * `brand_identity` are authored here — KI-036 folded the old classification
 * workspace's brand-alias panel into this screen: an alias IS a
 * `brand_identity` matcher on the brand dimension's value, added, disabled and
 * removed through the same two canonical functions as every other pattern.
 * `place` matchers come from the geo-area editor (KI-009,
 * `site → Value → Rules & Geo`), and `condition` from Dig Here — each already
 * has its own screen and its own shape of "what would this catch". Those two
 * kinds still LIST here, read-only beyond enable/disable/delete, so a value's
 * matchers are never split across two places to look.
 */

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronsRight,
  Fingerprint,
  Loader2,
  MapPin,
  BadgeCheck,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Tag,
  Timer,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCount } from "@/features/marketing/search-console/types";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { reviewWindow } from "../lib";
import {
  previewMatcherReach,
  runSiteMatchers,
  type MatcherReach,
} from "../workbench/session/data";
import {
  deleteDimensionMatcher,
  getValueMatchers,
  upsertDimensionMatcher,
  type FacetValue,
  type ValueMatcher,
} from "./data";

/** The kinds this editor's "add" form writes. Every other kind is authored
 * by its own screen (see file header) and only lists/toggles here. */
const PATTERN_KINDS = [
  { key: "contains", label: "Contains", hint: "anywhere in the search phrase" },
  { key: "word", label: "Whole word", hint: "as its own word, not a substring" },
  { key: "exact", label: "Exact phrase", hint: "the entire search, nothing else" },
  { key: "starts_with", label: "Starts with", hint: "the phrase opens with this" },
  { key: "ends_with", label: "Ends with", hint: "the phrase closes with this" },
] as const;
type PatternKind = (typeof PATTERN_KINDS)[number]["key"];

const KIND_META: Record<
  string,
  { label: string; icon: typeof Tag; editableHere: boolean }
> = {
  contains: { label: "Contains", icon: Tag, editableHere: true },
  word: { label: "Whole word", icon: Tag, editableHere: true },
  exact: { label: "Exact phrase", icon: Tag, editableHere: true },
  starts_with: { label: "Starts with", icon: Tag, editableHere: true },
  ends_with: { label: "Ends with", icon: Tag, editableHere: true },
  place: { label: "Place", icon: MapPin, editableHere: false },
  fact: { label: "Fact", icon: ShieldCheck, editableHere: false },
  condition: { label: "Dig Here segment", icon: Timer, editableHere: false },
  // ONE dynamic row per site; dvm_target_check forbids a pattern on this kind,
  // and the alias list is read live from the brand's own names on every run —
  // authoring happens on the BRAND (its names/aliases), never here.
  brand_identity: { label: "Brand identity", icon: Fingerprint, editableHere: false },
};

/** The ONE display vocabulary for matcher kinds — exported so the Dimensions
 *  search labels a hit the same way its editor labels the row. */
export function kindMeta(kind: string) {
  return (
    KIND_META[kind] ?? { label: kind, icon: Tag, editableHere: false }
  );
}

function MatcherRow({
  matcher,
  siteId,
  brandId,
  value,
  dimensionLabel,
  onChanged,
}: {
  matcher: ValueMatcher;
  siteId: string;
  /** For the brand-identity row's door to where its names are actually edited. */
  brandId?: string;
  /** The answer this match fills — the review window states the full address. */
  value: FacetValue;
  dimensionLabel: string;
  onChanged: () => void;
}) {
  const meta = kindMeta(matcher.kind);
  const Icon = meta.icon;
  const dispatch = useAppDispatch();

  // Only pattern-kind matchers are toggled from here (`meta.editableHere`) —
  // the cast is safe because the mutation is never wired up otherwise (below).
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      upsertDimensionMatcher({
        siteId,
        valueId: matcher.valueId,
        kind: matcher.kind as PatternKind,
        pattern: matcher.pattern,
        origin: (["human", "pack", "agent", "migration"] as const).includes(
          matcher.origin as "human" | "pack" | "agent" | "migration",
        )
          ? (matcher.origin as "human" | "pack" | "agent" | "migration")
          : "human",
        enabled,
      }),
    onSuccess: (_row, enabled) => {
      toast.success(enabled ? "Matcher enabled" : "Matcher disabled");
      onChanged();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => deleteDimensionMatcher(matcher.id),
    onSuccess: (result) => {
      // The delete already unstamped — say what it actually did rather than
      // "removed", which used to leave the reader to guess (and guess wrong).
      toast.success("Match removed", {
        description:
          result.answersRemoved > 0
            ? `Took the answer back off ${formatCount(result.answersRemoved)} keyword${
                result.answersRemoved === 1 ? "" : "s"
              }${
                result.answersRestamped > 0
                  ? `, and ${formatCount(result.answersRestamped)} of them picked up the answer waiting behind it`
                  : ""
              }.`
            : "It was not holding any keyword.",
      });
      onChanged();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const target =
    matcher.pattern ??
    (matcher.kind === "place"
      ? "a place on your geo map"
      : matcher.kind === "fact"
        ? "another dimension's answer"
        : matcher.kind === "condition"
          ? "a Dig Here segment"
          : matcher.kind === "brand_identity"
            ? "your brand name and its known variants"
            : "—");

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-border bg-card px-2.5 py-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[10px]">
        {meta.label}
      </Badge>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
        {target}
      </span>
      {matcher.kind === "brand_identity" && brandId ? (
        <Link
          href={`/marketing/brands/${brandId}/settings`}
          className="shrink-0 text-[11px] font-medium text-primary hover:underline"
        >
          Edit brand names
        </Link>
      ) : null}
      {/* THE COUNT IS A DOOR. "2,906 stamped" is the number that used to end the
          story; it now opens the review of exactly which keywords those are,
          which of them this match actually holds, and which a rival answer took
          — the same window a fresh save opens. A number you cannot open is the
          toast problem in a different font. */}
      {matcher.matchCount !== null ? (
        <button
          type="button"
          onClick={() =>
            dispatch(
              openOverlay({
                overlayId: "matcherReviewWindow",
                data: {
                  siteId,
                  matcherId: matcher.id,
                  pattern: matcher.pattern ?? "",
                  kindLabel: meta.label,
                  valueLabel: value.label,
                  dimensionLabel,
                },
              }),
            )
          }
          className="shrink-0 rounded px-1 text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:bg-accent hover:text-foreground"
          title={
            matcher.lastEvaluatedAt
              ? `See exactly which keywords this caught. Last run ${new Date(matcher.lastEvaluatedAt).toLocaleString()}`
              : "See exactly which keywords this caught. Never run."
          }
        >
          {formatCount(matcher.matchCount)} stamped
        </button>
      ) : null}
      <Badge
        variant="outline"
        className="h-4 shrink-0 px-1.5 text-[10px] text-muted-foreground"
        title={`Where this matcher came from: ${matcher.origin}`}
      >
        {matcher.origin}
      </Badge>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {meta.editableHere ? (
          <Switch
            checked={matcher.enabled}
            disabled={toggle.isPending}
            onCheckedChange={(checked) => toggle.mutate(checked)}
            aria-label={matcher.enabled ? "Disable matcher" : "Enable matcher"}
          />
        ) : (
          <Badge
            variant="outline"
            className="h-4 px-1.5 text-[10px] text-muted-foreground"
            title="Authored by its own screen — enable or disable it there."
          >
            {matcher.enabled ? "Enabled" : "Disabled"}
          </Badge>
        )}
        {meta.editableHere ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-destructive hover:text-destructive"
            disabled={remove.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: "Remove this match?",
                description: matcher.matchCount
                  ? `This also takes the answer back off the ${formatCount(
                      matcher.matchCount,
                    )} keyword${
                      matcher.matchCount === 1 ? "" : "s"
                    } it is holding — in one step, nothing left behind. Any keyword another match was waiting to claim picks that answer up immediately.`
                  : "It is not holding any keyword, so nothing else changes.",
                confirmLabel: "Remove",
                variant: "destructive",
              });
              if (!ok) return;
              remove.mutate();
            }}
          >
            {remove.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function ReachPreviewCard({
  reach,
  siteId,
  brandId,
  organizationId,
}: {
  reach: MatcherReach;
  siteId: string;
  brandId: string | undefined;
  organizationId: string | null | undefined;
}) {
  const openKeywordWindow = useOpenKeywordWindow();
  return (
    <div className="min-w-0 max-w-full space-y-1.5 rounded-md border border-primary/30 bg-primary/5 p-2.5">
      <p className="text-xs font-medium text-foreground">
        Reaches {formatCount(reach.keywords)} search
        {reach.keywords === 1 ? "" : "es"} in the last 28 days —{" "}
        {formatCount(reach.newlyValued)} of them carry no answer here today.
        {reach.alreadyValued > 0
          ? ` ${formatCount(reach.alreadyValued)} already do.`
          : ""}
      </p>
      {reach.sample.length > 0 ? (
        <ul className="flex min-w-0 max-w-full flex-wrap gap-1">
          {reach.sample.map((row) => (
            <li key={row.keywordId} className="min-w-0 max-w-full">
              <button
                type="button"
                onClick={() =>
                  openKeywordWindow({
                    phrase: row.keyword,
                    siteId,
                    brandId,
                    organizationId: organizationId ?? undefined,
                  })
                }
                title={`${formatCount(row.clicks)} clicks · ${formatCount(row.impressions)} impressions — open keyword intelligence`}
                className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-foreground transition-colors hover:bg-accent"
              >
                <span className="truncate">{row.keyword}</span>
                <span className="shrink-0 text-muted-foreground">
                  {formatCount(row.clicks)}c
                </span>
                {row.alreadyValued ? (
                  <ChevronsRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Nothing in the last 28 days matches this yet.
        </p>
      )}
    </div>
  );
}

function AddMatcherForm({
  siteId,
  value,
  dimensionLabel,
  onSaved,
}: {
  siteId: string;
  value: FacetValue;
  /** Only for the review window's title — the form itself never reads it. */
  dimensionLabel: string;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<PatternKind>("contains");
  const [pattern, setPattern] = useState("");
  const [reach, setReach] = useState<MatcherReach | null>(null);
  const [reachError, setReachError] = useState<string | null>(null);
  const { brandId, site } = useMarketingSite();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const trimmed = pattern.trim();

  const preview = useMutation({
    mutationFn: async () => {
      const window = reviewWindow();
      return previewMatcherReach({
        siteId,
        start: window.start,
        end: window.end,
        kind,
        pattern: trimmed,
        valueId: value.value_id,
        sample: 8,
      });
    },
    onSuccess: (result) => {
      setReach(result);
      setReachError(null);
    },
    onError: (error) => {
      setReach(null);
      setReachError(extractErrorMessage(error));
    },
  });

  /**
   * SAVE IS ONE ACT (Arman, 2026-08-24: *"you shouldn't need to click matcher.
   * Clicking okay should just run it automatically"*).
   *
   * Saving a match used to write the row and stop, leaving the rule inert until
   * someone found "Run matchers now" — so the thing you just created did
   * nothing and the screen said "saved". Now the same click writes it, RUNS the
   * engine, and opens the review of what it actually caught. The engine is
   * site-wide because a new pattern's reach is not knowable in advance; it is
   * the same call the manual button always made.
   */
  const save = useMutation({
    mutationFn: async () => {
      const saved = await upsertDimensionMatcher({
        siteId,
        valueId: value.value_id,
        kind,
        pattern: trimmed,
        origin: "human",
        enabled: true,
      });
      const run = await runSiteMatchers(siteId);
      return { saved, run };
    },
    onSuccess: ({ saved, run }) => {
      setPattern("");
      setReach(null);
      setReachError(null);
      onSaved();
      // Facets feed the value resolver — every keyword surface just moved.
      void queryClient.invalidateQueries({ queryKey: ["marketing", "seo"] });
      void queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] });
      const matcherId = saved?.id;
      if (matcherId) {
        // The result IS the review, not a number. The window opens on the
        // match that was just saved, showing every keyword it caught and every
        // one it lost to a rival answer, with undo on it.
        dispatch(
          openOverlay({
            overlayId: "matcherReviewWindow",
            data: {
              siteId,
              matcherId,
              pattern: trimmed,
              kindLabel: kindMeta(kind).label,
              valueLabel: value.label,
              dimensionLabel,
            },
          }),
        );
      } else {
        toast.success(
          `“${value.label}” now watches for this — ${formatCount(run.stamped)} stamped, ${formatCount(run.removed)} released`,
        );
      }
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  return (
    <div className="min-w-0 max-w-full space-y-2 rounded-md border border-dashed border-border p-2.5">
      <p className="text-xs font-semibold text-foreground">
        Add a matcher for “{value.label}”
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Select value={kind} onValueChange={(next) => setKind(next as PatternKind)}>
          <SelectTrigger size="sm" className="h-7 w-[9.5rem] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PATTERN_KINDS.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={pattern}
          onChange={(event) => {
            setPattern(event.target.value);
            setReach(null);
            setReachError(null);
          }}
          placeholder="crt monitor"
          className="h-7 min-w-0 max-w-[16rem] flex-1 text-xs"
        />
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">
        {PATTERN_KINDS.find((k) => k.key === kind)?.hint} — saving runs it
        straight away and shows you every keyword it caught.
      </p>

      {reach ? (
        <ReachPreviewCard
          reach={reach}
          siteId={siteId}
          brandId={brandId}
          organizationId={site.organization_id ?? null}
        />
      ) : reachError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
          {reachError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          disabled={!trimmed || preview.isPending}
          onClick={() => preview.mutate()}
        >
          {preview.isPending ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Play className="mr-1 h-3 w-3" />
          )}
          Preview reach
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 text-[11px]"
          disabled={!trimmed || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Plus className="mr-1 h-3 w-3" />
          )}
          Save matcher
        </Button>
      </div>
    </div>
  );
}

export function MatcherEditor({
  open,
  onOpenChange,
  siteId,
  dimensionLabel,
  value,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  dimensionLabel: string;
  value: FacetValue;
  /** The dimension card's own refresh — matcher counts / condition badges live there too. */
  onChanged: () => void;
}) {
  // The brand-identity row's "Edit brand names" door needs the brand.
  const { brandId } = useMarketingSite();
  const queryClient = useQueryClient();
  const matchersKey = [
    "marketing",
    "seo",
    "value-matchers",
    siteId,
    value.value_id,
  ] as const;

  const matchers = useQuery({
    queryKey: matchersKey,
    queryFn: ({ signal }) => getValueMatchers(siteId, value.value_id, signal),
    enabled: open,
    staleTime: 10_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: matchersKey });
    onChanged();
  };

  const run = useMutation({
    mutationFn: () => runSiteMatchers(siteId),
    onSuccess: (result) => {
      toast.success(
        result.stamped === 0 && result.removed === 0
          ? "Already up to date — nothing changed."
          : `${result.stamped.toLocaleString()} keywords stamped, ${result.removed.toLocaleString()} released across the site.`,
        result.conflicts > 0
          ? {
              description: `${result.conflicts.toLocaleString()} kept their existing single-answer stamp instead of switching.`,
            }
          : undefined,
      );
      refresh();
    },
    onError: (error) =>
      toast.error("Could not run your matchers", {
        description: extractErrorMessage(error),
      }),
  });

  const rows = matchers.data ?? [];
  const editableRows = rows.filter((row) => kindMeta(row.kind).editableHere);
  const otherRows = rows.filter((row) => !kindMeta(row.kind).editableHere);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Matchers for “{value.label}”
          </DialogTitle>
          <DialogDescription className="text-xs">
            {dimensionLabel} — what finds this answer. A matcher only FINDS
            keywords; the stamp it writes is what actually counts, and a human
            or AI stamp always outranks it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {matchers.isPending ? (
            <p className="text-xs text-muted-foreground">Loading matchers…</p>
          ) : matchers.isError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
              {extractErrorMessage(matchers.error)}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No matchers yet — nothing finds this answer automatically. Add
              one below, or stamp keywords by hand from the workbench.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {[...editableRows, ...otherRows].map((matcher) => (
                <MatcherRow
                  key={matcher.id}
                  matcher={matcher}
                  siteId={siteId}
                  brandId={brandId}
                  value={value}
                  dimensionLabel={dimensionLabel}
                  onChanged={refresh}
                />
              ))}
            </ul>
          )}

          <AddMatcherForm
            siteId={siteId}
            value={value}
            dimensionLabel={dimensionLabel}
            onSaved={refresh}
          />
        </div>

        <DialogFooter className="items-center justify-between sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            Saving a match runs it straight away, and deleting one takes its
            answers back off with it. Turning a match on or off takes effect on
            the next run — or press below.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={run.isPending}
            onClick={() => run.mutate()}
          >
            {run.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3 w-3" />
            )}
            {run.isPending ? "Running…" : "Run matchers now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
