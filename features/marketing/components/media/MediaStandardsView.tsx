"use client";

/**
 * MediaStandardsView — the site's image standards: named slots (hero, OG,
 * blog header…) with target dimensions, format, and weight budget, plus
 * site-wide media rules. Persisted at `web.site.settings.media_standards`;
 * the Generate view resolves order dimensions from these slots, and the
 * asset drill-down checks crawled images against them.
 */

import { useState } from "react";
import { Loader2, Plus, Ruler, Save, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useSaveSiteMediaStandards } from "@/features/marketing/data/hooks";
import { MARKETING_SITE_MEDIA_SURFACE_NAME } from "@/features/marketing/lib/scopes/site-media-scope";
import {
  validateMediaStandardsNotesWrite,
  validateMediaStandardsSlotsWrite,
} from "@/features/marketing/lib/site-media-write-targets";
import {
  DEFAULT_STANDARD_SLOTS,
  type MediaStandardSlot,
  type SiteMediaStandards,
} from "@/features/marketing/data/media-library";

function numberValue(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

export function MediaStandardsView({
  standards,
}: {
  standards: SiteMediaStandards;
}) {
  const { site } = useMarketingSite();
  const save = useSaveSiteMediaStandards();
  const [draft, setDraft] = useState<SiteMediaStandards>(standards);
  const [dirty, setDirty] = useState(false);

  /** The ONE path every edit takes — user typing and agent writes alike. */
  const patchDraft = (
    updater: (current: SiteMediaStandards) => SiteMediaStandards,
  ) => {
    setDraft(updater);
    setDirty(true);
  };

  const update = (next: SiteMediaStandards) => patchDraft(() => next);

  /**
   * Write targets for the site's media standards. Registered HERE, not on the
   * workspace, because this view owns the standards draft — so they are
   * offered only while the Standards view is open, which the manifest
   * descriptions say outright. Both stage into the same unsaved draft the
   * inputs above drive; the USER still presses "Save standards", which is the
   * only thing that touches `web.site.settings.media_standards`.
   *
   * Validation runs synchronously (throwing into the writeback seam) BEFORE
   * the functional state update, never inside it.
   */
  useSurfaceWriteHandlers(MARKETING_SITE_MEDIA_SURFACE_NAME, {
    media_standards_slots: (value: unknown) => {
      const slots = validateMediaStandardsSlotsWrite(value);
      patchDraft((current) => ({ ...current, slots }));
    },
    media_standards_notes: (value: unknown) => {
      const notes = validateMediaStandardsNotesWrite(value);
      patchDraft((current) => ({ ...current, notes }));
    },
  });

  const updateSlot = (id: string, patch: Partial<MediaStandardSlot>) => {
    update({
      ...draft,
      slots: draft.slots.map((slot) =>
        slot.id === id ? { ...slot, ...patch } : slot,
      ),
    });
  };

  const addSlot = () => {
    update({
      ...draft,
      slots: [
        ...draft.slots,
        {
          id: crypto.randomUUID(),
          name: "",
          width: null,
          height: null,
          format: null,
          maxKb: null,
          notes: "",
        },
      ],
    });
  };

  const seedDefaults = () => {
    update({
      ...draft,
      slots: [
        ...draft.slots,
        ...DEFAULT_STANDARD_SLOTS.map((slot) => ({
          ...slot,
          id: crypto.randomUUID(),
        })),
      ],
    });
  };

  const onSave = async () => {
    try {
      await save.mutateAsync({
        siteId: site.id,
        expectedVersion: site.version,
        standards: {
          slots: draft.slots.filter((slot) => slot.name.trim()),
          notes: draft.notes,
        },
      });
      setDirty(false);
      toast.success("Media standards saved");
    } catch (error) {
      toast.error("Could not save the standards", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Ruler className="h-4 w-4 text-foreground/60" />
        <p className="text-[11px] text-muted-foreground">
          Define the image sizes this site expects. The Generate view orders
          to these dimensions automatically, and crawled assets are checked
          against them.
        </p>
      </div>

      <div className="space-y-2">
        <div className="hidden grid-cols-[1fr_5rem_5rem_5rem_5rem_2rem] gap-1.5 px-1 sm:grid">
          {["Slot", "Width", "Height", "Format", "Max KB", ""].map(
            (label, index) => (
              <span
                key={index}
                className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {label}
              </span>
            ),
          )}
        </div>
        {draft.slots.map((slot) => (
          <div
            key={slot.id}
            className="grid grid-cols-2 gap-1.5 rounded-lg border border-border/60 bg-card p-1.5 sm:grid-cols-[1fr_5rem_5rem_5rem_5rem_2rem] sm:border-0 sm:bg-transparent sm:p-0"
          >
            <Input
              value={slot.name}
              onChange={(event) =>
                updateSlot(slot.id, { name: event.target.value })
              }
              placeholder="Slot name (Hero, OG card…)"
              className="col-span-2 h-7 text-xs sm:col-span-1"
            />
            <Input
              value={slot.width ?? ""}
              onChange={(event) =>
                updateSlot(slot.id, { width: numberValue(event.target.value) })
              }
              placeholder="W"
              inputMode="numeric"
              className="h-7 text-xs"
            />
            <Input
              value={slot.height ?? ""}
              onChange={(event) =>
                updateSlot(slot.id, { height: numberValue(event.target.value) })
              }
              placeholder="H"
              inputMode="numeric"
              className="h-7 text-xs"
            />
            <Input
              value={slot.format ?? ""}
              onChange={(event) =>
                updateSlot(slot.id, {
                  format: event.target.value.trim() || null,
                })
              }
              placeholder="webp"
              className="h-7 text-xs"
            />
            <Input
              value={slot.maxKb ?? ""}
              onChange={(event) =>
                updateSlot(slot.id, { maxKb: numberValue(event.target.value) })
              }
              placeholder="KB"
              inputMode="numeric"
              className="h-7 text-xs"
            />
            <button
              type="button"
              onClick={() =>
                update({
                  ...draft,
                  slots: draft.slots.filter((item) => item.id !== slot.id),
                })
              }
              title="Remove slot"
              className="flex h-7 items-center justify-center rounded text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7" onClick={addSlot}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add slot
          </Button>
          {draft.slots.length === 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={seedDefaults}
            >
              Start from the common set
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-1">
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
          Site-wide media rules
        </h3>
        <Textarea
          value={draft.notes}
          onChange={(event) => update({ ...draft, notes: event.target.value })}
          minHeight={64}
          maxHeight={200}
          placeholder="Naming conventions, tone, subjects to avoid, compression rules… These ride along with every AI image order."
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-8"
          disabled={!dirty || save.isPending}
          onClick={() => void onSave()}
        >
          {save.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Save standards
        </Button>
        {dirty ? (
          <span className="text-[10px] text-amber-600 dark:text-amber-400">
            Unsaved changes
          </span>
        ) : null}
      </div>
    </div>
  );
}
