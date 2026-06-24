"use client";

/**
 * CuratedIconPickerWindow
 *
 * Floating gallery for picking from the curated icon set (Lucide names,
 * registry icons, AI-brand tap targets, AI-action tap targets, plus an
 * embedded Lucide gallery iframe). Registered overlay — open via
 * `useOpenCuratedIconPickerWindow()` and listen for the `picked` event.
 *
 * Multi-instance + ephemeral: each opener call yields a fresh window and
 * never persists to DB.
 */

import React, { useMemo, useRef, useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import IconResolver, {
  getCuratedIconIdsForPicker,
} from "@/components/official/icons/IconResolver";
import { TapTargetButton } from "@/components/icons/TapTargetButton";
import { TapTargetLabeled } from "@/components/icons/TapTargetLabeled";
import {
  CURATED_PICKER_AI_ACTIONS,
  CURATED_PICKER_AI_BRANDS,
  CURATED_PICKER_TABS,
  type CuratedPickerAiTapEntry,
  type CuratedPickerTabId,
} from "@/components/icons/curated-icon-picker-entries";
import { EmbedSiteFrame } from "@/features/window-panels/components/EmbedSiteFrame";
import { cn } from "@/lib/utils";
import { LUCIDE_ICONS_GALLERY_URL } from "@/utils/icons/lucide-gallery-url";
import { emitCuratedIconPickerEvent } from "./callbacks";

export interface CuratedIconPickerWindowProps {
  isOpen: boolean;
  onClose: () => void;
  /** Auto-passed by `OverlaySurface` for multi-instance windows. */
  instanceId: string;
  /** From overlay data — connects events back to the opener. */
  callbackGroupId?: string | null;
}

export function CuratedIconPickerWindow({
  isOpen,
  onClose,
  instanceId,
  callbackGroupId,
}: CuratedIconPickerWindowProps) {
  const allIds = useMemo(() => getCuratedIconIdsForPicker(), []);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<CuratedPickerTabId>("all");
  const lastPickedRef = useRef<string | null>(null);

  const q = query.trim().toLowerCase();

  const { svgIds, componentIds } = useMemo(() => {
    const base = q
      ? allIds.filter((id) => id.toLowerCase().includes(q))
      : allIds;
    const svg = base.filter((id) => id.startsWith("svg:"));
    const comp = base.filter((id) => !id.startsWith("svg:"));
    return { svgIds: svg, componentIds: comp };
  }, [allIds, q]);

  const aiBrandsFiltered = useMemo(() => {
    if (!q) return CURATED_PICKER_AI_BRANDS;
    return CURATED_PICKER_AI_BRANDS.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.selectValue.toLowerCase().includes(q),
    );
  }, [q]);

  const aiActionsFiltered = useMemo(() => {
    if (!q) return CURATED_PICKER_AI_ACTIONS;
    return CURATED_PICKER_AI_ACTIONS.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.selectValue.toLowerCase().includes(q),
    );
  }, [q]);

  if (!isOpen) return null;

  const pick = (id: string) => {
    lastPickedRef.current = id;
    emitCuratedIconPickerEvent(callbackGroupId, {
      type: "picked",
      instanceId,
      iconId: id,
    });
    handleClose();
  };

  const handleClose = () => {
    emitCuratedIconPickerEvent(callbackGroupId, {
      type: "window-close",
      instanceId,
      lastPicked: lastPickedRef.current,
    });
    onClose();
  };

  return (
    <WindowPanel
      title="Icon gallery"
      id={`curated-icon-picker-${instanceId}`}
      overlayId="curatedIconPickerWindow"
      onClose={handleClose}
      width={560}
      height={600}
      minWidth={380}
      minHeight={320}
      position="center"
      footerLeft={
        <p className="truncate px-2 text-[10px] text-muted-foreground">
          {tab === "lucideWeb"
            ? "Browse Lucide here, then enter the icon name in the field. Search Lucide in the form still opens the full site frame."
            : "AI tiles match the button demo; stored id may differ from artwork — use Icons tab to refine."}
        </p>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex gap-1 overflow-x-auto pb-0.5 shrink-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CURATED_PICKER_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                tab === t.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab !== "lucideWeb" ? (
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            className="h-9 shrink-0 text-sm"
            style={{ fontSize: "16px" }}
            aria-label="Filter icons"
          />
        ) : null}

        {tab === "lucideWeb" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <EmbedSiteFrame
              src={LUCIDE_ICONS_GALLERY_URL}
              title="Lucide icons"
              className="min-h-[200px] rounded-md border bg-muted/20"
            />
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 pr-3 pb-2">
              {tab === "all" && (
                <>
                  {svgIds.length > 0 ? (
                    <section className="space-y-1.5">
                      <h3 className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Matrx SVG ({svgIds.length})
                      </h3>
                      <IconPickerTapestry ids={svgIds} onPick={pick} />
                    </section>
                  ) : null}
                  {componentIds.length > 0 ? (
                    <section className="space-y-1.5">
                      <h3 className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Icons ({componentIds.length})
                      </h3>
                      <IconPickerTapestry ids={componentIds} onPick={pick} />
                    </section>
                  ) : null}
                  {svgIds.length === 0 && componentIds.length === 0 ? (
                    <EmptyFilter />
                  ) : null}
                </>
              )}

              {tab === "svg" &&
                (svgIds.length > 0 ? (
                  <IconPickerTapestry ids={svgIds} onPick={pick} />
                ) : (
                  <EmptyFilter />
                ))}

              {tab === "icons" &&
                (componentIds.length > 0 ? (
                  <IconPickerTapestry ids={componentIds} onPick={pick} />
                ) : (
                  <EmptyFilter />
                ))}

              {tab === "aiBrands" &&
                (aiBrandsFiltered.length > 0 ? (
                  <AiTapTapestry entries={aiBrandsFiltered} onPick={pick} />
                ) : (
                  <EmptyFilter />
                ))}

              {tab === "aiActions" &&
                (aiActionsFiltered.length > 0 ? (
                  <AiTapTapestry entries={aiActionsFiltered} onPick={pick} />
                ) : (
                  <EmptyFilter />
                ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </WindowPanel>
  );
}

function EmptyFilter() {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">
      Nothing matches this filter.
    </p>
  );
}

function IconPickerTapestry({
  ids,
  onPick,
}: {
  ids: string[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => (
        <TapTargetLabeled key={id} label={id}>
          <TapTargetButton
            type="button"
            ariaLabel={id}
            tooltip={false}
            onClick={() => onPick(id)}
            icon={
              <IconResolver
                iconName={id}
                className="h-4 w-4 shrink-0 text-foreground"
              />
            }
          />
        </TapTargetLabeled>
      ))}
    </div>
  );
}

function AiTapTapestry({
  entries,
  onPick,
}: {
  entries: CuratedPickerAiTapEntry[];
  onPick: (selectValue: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map((entry) => {
        const { Component, label, selectValue, colored } = entry;
        return (
          <TapTargetLabeled key={`${label}-${selectValue}`} label={label}>
            <Component
              ariaLabel={label}
              tooltip={false}
              colored={colored}
              onClick={() => onPick(selectValue)}
            />
          </TapTargetLabeled>
        );
      })}
    </div>
  );
}
