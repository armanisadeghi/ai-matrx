"use client";

// features/canvas/maps/MapEditor.tsx
//
// One map, open. The canvas itself is InteractiveDiagramBlock in authoring
// mode — this file owns loading, the name, and saving. Nothing here draws.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { DiagramData } from "@/components/mardown-display/blocks/diagram/parseDiagramJSON";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import MapCanvas from "./MapCanvas";
import { getMap, saveMap } from "./service";

const AUTOSAVE_DELAY_MS = 1200;

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

export function MapEditor({ mapId }: { mapId: string }) {
  const [diagram, setDiagram] = useState<DiagramData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // The live document, read by the debounced save without re-arming it.
  const latest = useRef<DiagramData | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { diagram: loaded, error } = await getMap(mapId);
      if (cancelled) return;
      if (error || !loaded) {
        setLoadError(error ?? "That map could not be opened.");
        return;
      }
      setDiagram(loaded);
      latest.current = loaded;
    })();
    return () => {
      cancelled = true;
    };
  }, [mapId]);

  const flush = useCallback(async () => {
    const doc = latest.current;
    if (!doc) return;
    setSaveState("saving");
    const { error } = await saveMap(mapId, doc);
    if (error) {
      // Loud recovery: a save that failed must never look like one that worked.
      setSaveState("error");
      toast.error(`Could not save this map: ${error}`);
      return;
    }
    setSaveState("saved");
  }, [mapId]);

  const handleChange = useCallback(
    (next: DiagramData) => {
      latest.current = next;
      setDiagram(next);
      setSaveState("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  // Never let a pending edit die with the page.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState === "pending" || saveState === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [saveState]);

  const renameMap = (title: string) => {
    if (!latest.current) return;
    handleChange({ ...latest.current, title });
  };

  const header = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Button asChild variant="ghost" size="sm" className="h-7 shrink-0 px-2">
        <Link href="/maps" aria-label="Back to maps">
          <ArrowLeft className="h-4 w-4" />
          <span className="max-sm:sr-only">Maps</span>
        </Link>
      </Button>
      <Input
        value={diagram?.title ?? ""}
        onChange={(e) => renameMap(e.target.value)}
        disabled={!diagram}
        aria-label="Map name"
        className="h-7 max-w-xs border-transparent bg-transparent px-1.5 text-sm font-semibold hover:border-border focus:border-border"
      />
      <SaveIndicator state={saveState} />
    </div>
  );

  if (loadError) {
    return (
      <>
        <PageHeader>{header}</PageHeader>
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <TriangleAlert className="h-6 w-6 text-destructive" />
          <p className="text-sm text-foreground">{loadError}</p>
          <Button asChild size="sm">
            <Link href="/maps">Back to your maps</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader>{header}</PageHeader>
      <div className="h-full overflow-auto">
        {diagram ? (
          <MapCanvas diagram={diagram} onDiagramChange={handleChange} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const map: Record<Exclude<SaveState, "idle">, { label: string; className: string }> =
    {
      pending: { label: "Unsaved changes", className: "text-muted-foreground" },
      saving: { label: "Saving…", className: "text-muted-foreground" },
      saved: { label: "All changes saved", className: "text-muted-foreground" },
      error: { label: "Not saved", className: "text-destructive" },
    };
  const { label, className } = map[state];
  return (
    <span className={`flex shrink-0 items-center gap-1 text-xs ${className}`}>
      {state === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
      {state === "saved" && <Check className="h-3 w-3" />}
      {state === "error" && <TriangleAlert className="h-3 w-3" />}
      <span className="max-sm:sr-only">{label}</span>
    </span>
  );
}
