"use client";

/**
 * THE GEO AREA EDITOR — where a business says which places it actually wants.
 *
 * The geo BANDS were editable (ideal / acceptable / expansion / excluded, each
 * with a multiplier); the AREAS that map real place names into those bands were
 * not, in any surface. That made the whole geo model a shell — on
 * datadestruction.com all four adopted areas carried ZERO match tokens, so the
 * geo gate silently did nothing. A starter pack deliberately ships archetypes
 * with empty tokens ("a pack never carries somebody else's cities"), which only
 * works if the expert can fill them in. This is that screen.
 *
 * HOW MATCHING WORKS, said out loud: each token is matched as a WHOLE WORD
 * against the search. When several areas match one keyword the resolver
 * deliberately takes the LOWEST multiplier — the cautious reading — so an
 * excluded place beats an ideal one on the same query. The panel says so
 * rather than surprising anyone.
 *
 * REGEX SAFETY IS REAL, NOT PEDANTRY: these tokens are interpolated into a
 * regex inside the resolver, so one "(" would take down every value read for
 * the site. `seo.assert_safe_match_token` refuses it at write time; this screen
 * refuses it a round trip earlier, in the same words.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 */

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPinned, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import { extractErrorMessage } from "@/utils/errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useDebounce } from "@/hooks/usehooks/useDebounce";
import { getValueVocabulary } from "../data";
import type { SiteGeoArea } from "../types";
import type { BandMeta } from "../variants/c/lib";
import { ImpactPanel } from "./ImpactPanel";
import {
  archiveGeoArea,
  createGeoArea,
  previewGeoArea,
  updateGeoArea,
  valueSurfaceQueryKeys,
} from "./data";
import {
  AREA_KINDS,
  parseTokens,
  unsafeTokens,
  type GeoAreaFormState,
} from "./types";

function areaToForm(area: SiteGeoArea): GeoAreaFormState {
  return {
    label: area.label,
    areaKind: area.area_kind,
    tokensText: area.match_tokens.join(", "),
    geoBand: area.geo_band,
    notes: area.notes ?? "",
  };
}

const EMPTY: GeoAreaFormState = {
  label: "",
  areaKind: "city",
  tokensText: "",
  geoBand: "",
  notes: "",
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-[11px] font-medium text-foreground">{label}</span>
      {children}
      {hint ? (
        <span className="block text-[10px] leading-4 text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

function draftIssues(form: GeoAreaFormState): string[] {
  const issues: string[] = [];
  if (!form.label.trim()) issues.push("Give the area a name, like “Primary service radius”.");
  if (!form.geoBand) issues.push("Choose which band this area belongs to.");
  const tokens = parseTokens(form.tokensText);
  if (tokens.length === 0)
    issues.push(
      "Add at least one place name. An area with no place names matches nothing — that is exactly the state this editor exists to fix.",
    );
  const unsafe = unsafeTokens(tokens);
  if (unsafe.length > 0)
    issues.push(
      `“${unsafe.join("”, “")}” cannot be used — place names can only contain letters, numbers, spaces and ' - . / & _ , because each one becomes a whole-word search.`,
    );
  return issues;
}

export function GeoAreaEditor({
  siteId,
  organizationId,
  window,
  windowLabel,
  bandMetas,
  area,
  onClose,
}: {
  siteId: string;
  organizationId: string | null;
  window: { start: string; end: string };
  windowLabel: string;
  bandMetas: BandMeta[];
  /** null = creating a new area. */
  area: SiteGeoArea | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<GeoAreaFormState>(() =>
    area ? areaToForm(area) : EMPTY,
  );
  const set = <K extends keyof GeoAreaFormState>(key: K, value: GeoAreaFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const geoBands = useQuery({
    queryKey: ["marketing", "value-c", "vocab", siteId, "geo_band"],
    queryFn: ({ signal }) => getValueVocabulary(siteId, "geo_band", signal),
    staleTime: 5 * 60_000,
  });

  const selectedBand = (geoBands.data ?? []).find((band) => band.value === form.geoBand);
  const selectedMultiplier =
    typeof selectedBand?.config?.multiplier === "number"
      ? (selectedBand.config.multiplier as number)
      : null;

  const issues = draftIssues(form);
  const ready = issues.length === 0;
  const debounced = useDebounce(form, 450);
  const debouncedReady = draftIssues(debounced).length === 0;
  const debouncedTokens = parseTokens(debounced.tokensText);

  const preview = useQuery({
    queryKey: [
      "seo",
      "value-rules",
      "geo-preview",
      siteId,
      window.start,
      window.end,
      area?.id ?? "new",
      debouncedTokens.join("|"),
      debounced.geoBand,
    ],
    enabled: debouncedReady,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      previewGeoArea(
        {
          siteId,
          start: window.start,
          end: window.end,
          tokens: debouncedTokens,
          geoBand: debounced.geoBand,
          areaId: area?.id ?? null,
        },
        signal,
      ),
  });

  const invalidate = () => {
    for (const key of valueSurfaceQueryKeys(siteId)) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const draft = {
        label: form.label,
        areaKind: form.areaKind,
        tokens: parseTokens(form.tokensText),
        geoBand: form.geoBand,
        notes: form.notes,
      };
      return area
        ? updateGeoArea(area.id, draft, siteId)
        : createGeoArea(draft, siteId, organizationId);
    },
    onSuccess: () => {
      const moved = preview.data?.moved_keywords ?? 0;
      toast.success(area ? "Area updated" : "Area saved", {
        description:
          moved > 0
            ? `${moved} keyword${moved === 1 ? "" : "s"} changed band.`
            : "No keyword changed band.",
      });
      invalidate();
      onClose();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const archive = useMutation({
    mutationFn: async () => {
      if (!area) return;
      await archiveGeoArea(area.id);
    },
    onSuccess: () => {
      toast.success("Area archived", {
        description: "Keywords it was gating re-resolve without it.",
      });
      invalidate();
      onClose();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const askArchive = async () => {
    const ok = await confirm({
      title: "Archive this area?",
      description:
        "Searches from these places stop being treated differently, and the keywords it was gating re-resolve immediately.",
      confirmLabel: "Archive area",
      variant: "destructive",
    });
    if (ok) archive.mutate();
  };

  const busy = save.isPending || archive.isPending;
  const moved = preview.data?.moved_keywords ?? 0;
  const tokenCount = parseTokens(form.tokensText).length;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="flex max-h-[92dvh] w-[min(58rem,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b border-border px-4 pt-4 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPinned className="h-4 w-4 text-primary" aria-hidden />
            {area ? "Edit geo area" : "New geo area"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            An area maps real place names onto one of your geo bands. When more
            than one area matches a search, the LOWEST multiplier wins — so a
            place you never serve beats a place you love, on the same query.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="min-h-0 space-y-3 overflow-y-auto border-border p-4 scrollbar-thin md:border-r">
            <Field label="Name" hint="How this area reads in the ledger.">
              <Input
                value={form.label}
                onChange={(e) => set("label", e.target.value)}
                placeholder="Primary service radius"
                className="h-8 text-sm"
              />
            </Field>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Kind">
                <Select value={form.areaKind} onValueChange={(v) => set("areaKind", v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AREA_KINDS.map((kind) => (
                      <SelectItem key={kind.key} value={kind.key} className="text-xs">
                        {kind.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Band"
                hint={
                  selectedMultiplier === null
                    ? undefined
                    : selectedMultiplier === 0
                      ? "×0 — any search from these places resolves Negative."
                      : `×${selectedMultiplier} on the score.`
                }
              >
                {geoBands.isLoading ? (
                  <Skeleton className="h-8 rounded-md" />
                ) : geoBands.isError ? (
                  <InlineQueryError
                    what="geo bands"
                    error={geoBands.error}
                    onRetry={() => void geoBands.refetch()}
                  />
                ) : (
                  <Select value={form.geoBand} onValueChange={(v) => set("geoBand", v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Choose a band" />
                    </SelectTrigger>
                    <SelectContent>
                      {(geoBands.data ?? []).map((band) => (
                        <SelectItem key={band.value} value={band.value} className="text-xs">
                          {band.label}
                          {typeof band.config?.multiplier === "number"
                            ? ` ×${band.config.multiplier}`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>

            <Field
              label={`Place names${tokenCount > 0 ? ` (${tokenCount})` : ""}`}
              hint="One per line, or separated by commas. Each is matched as a whole word inside the search — “newark” matches “data destruction newark”, not “newarkshire”."
            >
              <Textarea
                value={form.tokensText}
                onChange={(e) => set("tokensText", e.target.value)}
                rows={5}
                placeholder={"new jersey\nnewark\nedison\njersey city"}
                className="text-xs"
              />
            </Field>

            <Field label="Why (optional)">
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
                placeholder="Everything inside a same-day truck run."
                className="text-xs"
              />
            </Field>

            {issues.length > 0 ? (
              <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2">
                {issues.map((issue) => (
                  <li key={issue} className="text-[11px] leading-4 text-warning">
                    {issue}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="min-h-0 space-y-2 overflow-y-auto bg-muted/20 p-4 scrollbar-thin">
            <p className="text-xs font-semibold text-foreground">
              Which keywords this catches
            </p>
            <ImpactPanel
              impact={preview.data}
              isPending={preview.isPending}
              isFetching={preview.isFetching}
              error={preview.error}
              onRetry={() => void preview.refetch()}
              bandMetas={bandMetas}
              incomplete={
                debouncedReady
                  ? null
                  : "Add place names and choose a band, and this will show exactly which of your keywords this area catches — before you save."
              }
              windowLabel={windowLabel}
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-border px-4 pt-3 pb-4">
          <div>
            {area ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void askArchive()}
                disabled={busy}
                className="h-8 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Archive
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => save.mutate()}
              disabled={!ready || busy}
              className={cn("gap-1.5")}
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              {moved > 0
                ? `Save — ${moved} keyword${moved === 1 ? "" : "s"} move`
                : area
                  ? "Save changes"
                  : "Save area"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
