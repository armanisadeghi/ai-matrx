"use client";

/**
 * P23 for LEVELS — "+ Add a level", everywhere a level (value band) or a geo
 * band is chosen.
 *
 * A level is not a bare label: it is a NAME plus WHERE IT STARTS. A picker that
 * quietly invented a threshold would be worse than the dead end it replaced, so
 * this dialog asks for both, in the person's own words, and refuses nothing —
 * it shows the ladder it is joining so the number is obvious rather than
 * guessed.
 *
 * THE ONE WRITE PATH. It saves through `saveValueVocabulary`
 * (`seo.gsc_save_value_vocabulary`) — the same call the full
 * `BandVocabularyEditor` uses — by appending one row to the site's current
 * vocabulary. There is no second vocabulary writer, and adding one would be the
 * defect this whole sweep exists to kill.
 *
 * ADOPT-THEN-EDIT still holds: a site running on the platform template has its
 * template copied into its own rows by this first save, which is exactly what
 * the band editor does.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getValueVocabulary, saveValueVocabulary } from "../data";
import type { ValueBandDef, VocabKind } from "../types";
import {
  isReservedNegative,
  minScoreOf,
  multiplierOf,
  slugifyVocabValue,
  toDraftRows,
} from "../vocabulary/lib";

const COPY: Record<
  VocabKind,
  { title: string; noun: string; field: string; hint: string; unit: string }
> = {
  value_band: {
    title: "Add a level",
    noun: "level",
    field: "Starts at score",
    hint: "A keyword scoring this or higher lands in your new level, until the next one up takes over. Scores run 0–100.",
    unit: "score",
  },
  geo_band: {
    title: "Add a geo band",
    noun: "geo band",
    field: "Worth multiplier",
    hint: "How much a search from this kind of place is worth to you. Your tight radius is usually ×1; ×0 is a place you never serve.",
    unit: "×",
  },
};

export function AddLevelDialog({
  siteId,
  kind,
  /** What the person already typed into the picker — never make them retype. */
  initialLabel = "",
  onCancel,
  /** Fired with the new level's identity so the picker selects it at once. */
  onCreated,
}: {
  siteId: string;
  kind: VocabKind;
  initialLabel?: string;
  onCancel: () => void;
  onCreated: (value: string, label: string) => void;
}) {
  const copy = COPY[kind];
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(initialLabel);
  const [amount, setAmount] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const name = label.trim();
      const parsed = Number(amount.trim());
      const existing: ValueBandDef[] = await getValueVocabulary(siteId, kind);
      const rows = toDraftRows(existing);
      const identity = slugifyVocabValue(name);
      if (!identity) {
        throw new Error("Give it a name with letters or numbers in it.");
      }
      if (rows.some((row) => row.value === identity)) {
        throw new Error(`You already have a ${copy.noun} called “${name}”.`);
      }
      const config =
        kind === "value_band"
          ? { min_score: parsed }
          : { multiplier: parsed };
      const next = [
        ...rows,
        {
          value: identity,
          label: name,
          description: null,
          sort: rows.length,
          config,
        },
      ]
        // Levels read top-down by where they start; geo bands by worth. Sorting
        // here means the new one lands in the ladder rather than at the end.
        .sort((a, b) => {
          if (isReservedNegative(a)) return 1;
          if (isReservedNegative(b)) return -1;
          const av =
            kind === "value_band" ? (minScoreOf(a) ?? 0) : (multiplierOf(a) ?? 0);
          const bv =
            kind === "value_band" ? (minScoreOf(b) ?? 0) : (multiplierOf(b) ?? 0);
          return bv - av;
        })
        .map((row, index) => ({ ...row, sort: index }));
      await saveValueVocabulary(siteId, kind, next);
      return { value: identity, label: name };
    },
    onSuccess: ({ value, label: name }) => {
      void queryClient.invalidateQueries({
        queryKey: ["marketing", "value-vocab"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["marketing", "gsc", "filter-level-vocabulary", siteId],
      });
      toast.success(`“${name}” is now one of your ${copy.noun}s`, {
        description: `It lives in your ${kind === "value_band" ? "value scale" : "geo bands"} — rename it, move its ${copy.unit}, or remove it from the vocabulary editor whenever you like.`,
      });
      onCreated(value, name);
    },
    onError: (error) => {
      toast.error(`Couldn't add that ${copy.noun}`, {
        description: extractErrorMessage(error),
      });
    },
  });

  const parsed = Number(amount.trim());
  const amountOk =
    amount.trim() !== "" &&
    Number.isFinite(parsed) &&
    (kind === "value_band" ? parsed >= 0 && parsed <= 100 : parsed >= 0 && parsed <= 10);
  const ready = label.trim().length > 0 && amountOk && !save.isPending;

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" />
            {copy.title}
          </DialogTitle>
          <DialogDescription>
            Your words, your ladder. It joins this site&apos;s vocabulary the
            moment you save, and every screen that offers {copy.noun}s offers it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">Name</p>
            <Input
              autoFocus
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={
                kind === "value_band" ? "e.g. Flagship" : "e.g. Next county over"
              }
              className="h-9 text-sm"
              aria-label={`New ${copy.noun} name`}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">{copy.field}</p>
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && ready) save.mutate();
              }}
              inputMode="decimal"
              placeholder={kind === "value_band" ? "85" : "0.5"}
              className="h-9 text-sm"
              aria-label={copy.field}
            />
            <p className="text-[11px] leading-snug text-muted-foreground">
              {copy.hint}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={save.isPending}
          >
            Cancel
          </Button>
          <Button size="sm" disabled={!ready} onClick={() => save.mutate()}>
            {save.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Add {copy.noun}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
