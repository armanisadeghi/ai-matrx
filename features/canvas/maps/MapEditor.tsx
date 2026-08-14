"use client";

// features/canvas/maps/MapEditor.tsx
//
// One map, open. The canvas itself is InteractiveDiagramBlock in authoring
// mode — this file owns loading, the name, and saving. Nothing here draws.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  parseDiagramJSON,
  validateDiagram,
  type DiagramData,
} from "@/components/mardown-display/blocks/diagram/parseDiagramJSON";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  MAPS_SURFACE_NAME,
  createMapsScope,
  type MapSurfaceSelection,
} from "@/features/surfaces/manifests/maps.manifest";
import MapCanvas from "./MapCanvas";
import { getMap, saveMap } from "./service";

const AUTOSAVE_DELAY_MS = 1200;

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

export function MapEditor({ mapId }: { mapId: string }) {
  const [diagram, setDiagram] = useState<DiagramData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [selection, setSelection] = useState<MapSurfaceSelection>({
    kind: null,
    id: null,
  });

  // The live document, read by the debounced save without re-arming it.
  const latest = useRef<DiagramData | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStateRef = useRef<SaveState>("idle");

  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

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
      if (
        saveStateRef.current === "pending" ||
        saveStateRef.current === "saving"
      )
        e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const renameMap = (title: string) => {
    if (!latest.current) return;
    handleChange({ ...latest.current, title });
  };

  const getApplicationScope = () => {
    const doc = latest.current;
    if (!doc)
      throw new Error(
        "The visual map has not finished loading its canvas data.",
      );
    const boxes = doc.nodes.filter((item) => !item.isGroup);
    const sections = doc.nodes.filter((item) => item.isGroup);
    const selectedItem = selection.id
      ? selection.kind === "arrow"
        ? doc.edges.find((item) => item.id === selection.id)
        : doc.nodes.find((item) => item.id === selection.id)
      : undefined;

    return createMapsScope({
      map_id: mapId,
      map_title: doc.title,
      map_description: doc.description,
      map_summary: {
        id: mapId,
        title: doc.title,
        description: doc.description,
        box_count: boxes.length,
        section_count: sections.length,
        arrow_count: doc.edges.length,
      },
      map_json: doc,
      map_boxes: doc.nodes,
      map_arrows: doc.edges,
      box_count: boxes.length,
      section_count: sections.length,
      arrow_count: doc.edges.length,
      selected_item_kind: selection.kind ?? undefined,
      selected_item_id: selection.id ?? undefined,
      selected_item: selectedItem,
      content: JSON.stringify(doc),
      context: {
        purpose: "Non-executable visual thinking map",
        selection,
      },
    });
  };

  const replaceMapFromSurface = async (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(
        "replace_map expects the complete map object, not text or an array.",
      );

    const next = parseDiagramJSON(JSON.stringify({ diagram: value }));
    if (!validateDiagram(next))
      throw new Error(
        "replace_map received an invalid map: every box needs a unique id and name, and every arrow must reference boxes that exist.",
      );

    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setSaveState("saving");
    const { error } = await saveMap(mapId, next);
    if (error) {
      setSaveState("error");
      throw new Error(`The approved map could not be saved: ${error}`);
    }
    latest.current = next;
    setDiagram(next);
    setSelection({ kind: null, id: null });
    setSaveState("saved");
  };

  const getSurfaceWriteHandlers = () => ({
    replace_map: replaceMapFromSurface,
  });

  const header = (
    <RouteHeader
      left={
        <Button asChild variant="ghost" size="sm" className="h-8 shrink-0 px-2">
          <Link href="/maps" aria-label="Back to maps">
            <ArrowLeft className="h-4 w-4" />
            <span className="max-sm:sr-only">Maps</span>
          </Link>
        </Button>
      }
      center={
        <div className="mx-auto w-[min(44vw,28rem)] px-2">
          <Input
            data-surface-value="map_title"
            value={diagram?.title ?? ""}
            onChange={(e) => renameMap(e.target.value)}
            disabled={!diagram}
            aria-label="Map name"
            className="h-8 w-full border-border/50 bg-background/65 px-2.5 text-center text-sm font-semibold shadow-sm backdrop-blur-xl hover:border-border focus:border-primary"
          />
        </div>
      }
      right={
        <div className="flex w-28 justify-end pr-1">
          <SaveIndicator state={saveState} />
        </div>
      }
    />
  );

  if (loadError) {
    return (
      <>
        {header}
        <div
          className="flex h-full flex-col items-center justify-center gap-3 overflow-hidden p-6 text-center"
          style={{ paddingTop: "var(--shell-header-h)" }}
        >
          <TriangleAlert className="h-6 w-6 text-destructive" />
          <p className="text-sm text-foreground">{loadError}</p>
          <Button asChild size="sm">
            <Link href="/maps">Back to your maps</Link>
          </Button>
        </div>
      </>
    );
  }

  if (!diagram) {
    return (
      <>
        {header}
        <div
          className="flex h-full items-center justify-center overflow-hidden"
          style={{ paddingTop: "var(--shell-header-h)" }}
        >
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName={MAPS_SURFACE_NAME}
      getScope={getApplicationScope}
      isEditable
      getWriteHandlers={getSurfaceWriteHandlers}
    >
      {header}
      <div
        className="h-full overflow-hidden"
        style={{ paddingTop: "var(--shell-header-h)" }}
        data-surface-value="map_json"
      >
        <MapCanvas
          diagram={diagram}
          defaultEditing
          presentation="workspace"
          onDiagramChange={handleChange}
          onSelectionChange={setSelection}
        />
      </div>
    </SurfaceRuntimeProvider>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const map: Record<
    Exclude<SaveState, "idle">,
    { label: string; className: string }
  > = {
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
