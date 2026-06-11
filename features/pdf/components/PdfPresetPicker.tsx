"use client";

/**
 * PdfPresetPicker — the studio preset catalog, finally in product.
 *
 * The backend has served a 30+ preset catalog (GET /utilities/pdf/studio/
 * presets → categories + curated bundles) since Stage 2, mirroring the
 * Image Studio pattern — but no surface ever rendered it (audit intent-gap
 * #5). This canonical component lists the catalog and runs any preset
 * against the current document via POST studio/render, downloading the
 * image/ZIP result. Mountable on any surface that knows a fileId.
 *
 * Preset ids are stable contract strings owned by the backend catalog
 * (matrx-utils pdf/studio/presets.py) — never hardcode them here.
 */

import { useEffect, useState } from "react";
import { Loader2, Play, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePdfClient } from "@/features/pdf/api/client";
import { useDownloadBlob } from "@/features/pdf/hooks/useDownloadBlob";
import { buildPdfSourceFromFileId } from "@/features/pdf/utils/source";
import type { PdfStudioCatalog } from "@/features/pdf-extractor/types";

export interface PdfPresetPickerProps {
  fileId: string;
  className?: string;
}

export function PdfPresetPicker({ fileId, className }: PdfPresetPickerProps) {
  const api = usePdfClient();
  const downloadBlob = useDownloadBlob();
  const [catalog, setCatalog] = useState<PdfStudioCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getJson<PdfStudioCatalog>("studioPresets")
      .then((c) => {
        if (!cancelled) {
          setCatalog(c);
          setOpenCategory(c.categories[0]?.id ?? null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runPreset(presetId: string) {
    if (runningId) return;
    setRunningId(presetId);
    setRunError(null);
    try {
      const result = await api.postPdfBlob("studioRender", {
        ...buildPdfSourceFromFileId(fileId),
        preset_id: presetId,
      });
      downloadBlob(result);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunningId(null);
    }
  }

  if (loadError) {
    return (
      <p className="px-2 py-1.5 text-[10px] text-destructive">
        Couldn't load the preset catalog: {loadError}
      </p>
    );
  }
  if (!catalog) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading presets…
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 px-0.5 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <SlidersHorizontal className="h-3 w-3" /> Studio presets
      </div>
      <div className="space-y-1">
        {catalog.categories.map((cat) => (
          <div key={cat.id} className="rounded border border-border bg-card">
            <button
              type="button"
              className="flex w-full items-center justify-between px-2 py-1.5 text-left text-[11px] font-medium hover:bg-accent/40"
              onClick={() =>
                setOpenCategory((cur) => (cur === cat.id ? null : cat.id))
              }
              aria-expanded={openCategory === cat.id}
            >
              <span>{cat.name}</span>
              <span className="text-[9px] text-muted-foreground">
                {cat.presets.length}
              </span>
            </button>
            {openCategory === cat.id && (
              <ul className="space-y-0.5 border-t border-border p-1">
                {cat.presets.map((preset) => (
                  <li
                    key={preset.id}
                    className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/30"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px]">
                        {preset.name}
                      </span>
                      <span className="block truncate text-[9px] text-muted-foreground">
                        {preset.usage}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      aria-label={`Run preset: ${preset.name}`}
                      disabled={runningId !== null}
                      onClick={() => void runPreset(preset.id)}
                    >
                      {runningId === preset.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      {runError ? (
        <p className="px-0.5 pt-1 text-[10px] leading-snug text-destructive">
          {runError}
        </p>
      ) : null}
    </div>
  );
}
