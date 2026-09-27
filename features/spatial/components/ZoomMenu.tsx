"use client";

/**
 * ZoomMenu — the top-right zoom control (Claude Design / Figma): the live
 * zoom level as the trigger; zoom in / out, fit everything, the current
 * level, presets, layout guides, and undo / redo. ⌘/Ctrl + and − zoom the
 * board instead of the browser page while the pointer is over it.
 */

import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { zoomAt } from "../engine/camera";
import { useLayoutGuides, useSpatialStore } from "../engine/react";

const PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2];

export interface HistoryControls {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

export function ZoomMenu({ history, className }: { history?: HistoryControls; className?: string }) {
  const store = useSpatialStore();
  const guides = useLayoutGuides();
  const pctRef = useRef<HTMLSpanElement>(null);

  // The trigger reads the camera through a frame listener (no React render per frame).
  useEffect(() => {
    const el = pctRef.current;
    if (!el) return;
    const text = document.createTextNode("");
    el.replaceChildren(text);
    const apply = () => {
      const next = `${Math.round(store.getCamera().z * 100)}%`;
      if (text.nodeValue !== next) text.nodeValue = next;
    };
    apply();
    return store.subscribeFrame(apply);
  }, [store]);

  const zoomTo = (z: number) => {
    const { w, h } = store.getSize();
    store.flyTo(zoomAt(store.getCamera(), w / 2, h / 2, z), 220);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-spatial-chrome
          aria-label="Zoom and view"
          className={cn(
            "flex h-8 items-center gap-1 rounded-md px-2 font-mono text-xs tabular-nums text-foreground hover:bg-accent",
            className,
          )}
        >
          <span ref={pctRef} />
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" data-spatial-chrome>
        <DropdownMenuItem onSelect={() => zoomTo(store.getCamera().z * 1.25)}>
          Zoom in
          <DropdownMenuShortcut>⌘+</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => zoomTo(store.getCamera().z / 1.25)}>
          Zoom out
          <DropdownMenuShortcut>⌘−</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => store.fitAll()}>
          Fit everything
          <DropdownMenuShortcut>⇧1</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          {`Now ${Math.round(store.getCamera().z * 100)}%`}
        </DropdownMenuLabel>
        {PRESETS.map((z) => (
          <DropdownMenuItem key={z} onSelect={() => zoomTo(z)}>
            {`${Math.round(z * 100)}%`}
            {z === 1 && <DropdownMenuShortcut>⇧0</DropdownMenuShortcut>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={guides} onCheckedChange={(on) => store.setGuides(on === true)}>
          Layout guides
          <DropdownMenuShortcut>⇧G</DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        {history && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!history.canUndo} onSelect={history.undo}>
              Undo
              <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!history.canRedo} onSelect={history.redo}>
              Redo
              <DropdownMenuShortcut>⇧⌘Z</DropdownMenuShortcut>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
