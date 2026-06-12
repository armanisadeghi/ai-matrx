"use client";

/**
 * New-diagram entry points:
 *  - NewDiagramMenuItems — submenu items for embedding in an existing
 *    DropdownMenuContent (canvas navigation, list headers).
 *  - NewDiagramButton — standalone trigger (demo/playground surfaces).
 *
 * Each featured catalog type opens the workbench with its starter template as
 * a fresh user-created draft (persisted on first edit via create-manual).
 * Import covers the "upload" path: paste or pick a .mmd/.txt file.
 */

import React, { useRef } from "react";
import { FileUp, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";

import { getFeaturedCatalogEntries } from "../catalog";
import { detectDiagramType } from "../diagram-type";

const MAX_IMPORT_BYTES = 256 * 1024;

export function useOpenNewDiagram() {
  const { open } = useCanvas();

  const openNew = (source: string, title: string) => {
    open({
      type: "mermaid",
      data: source,
      metadata: {
        title,
        mermaid: { diagramType: detectDiagramType(source), title },
      },
    });
  };

  const importFile = async (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error("That file is too large for a diagram (256 KB max)");
      return;
    }
    const text = await file.text();
    if (detectDiagramType(text) === "unknown") {
      toast.error("That file doesn't look like a mermaid diagram");
      return;
    }
    openNew(text, file.name.replace(/\.(mmd|txt)$/i, ""));
  };

  return { openNew, importFile };
}

/** Submenu items — render inside an existing DropdownMenuContent. */
export function NewDiagramMenuItems() {
  const { openNew, importFile } = useOpenNewDiagram();
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <DropdownMenuLabel className="text-xs">New diagram</DropdownMenuLabel>
      {getFeaturedCatalogEntries().map((entry) => {
        const Icon = entry.icon;
        return (
          <DropdownMenuItem
            key={entry.type}
            onClick={() => openNew(entry.starterTemplate, `Untitled ${entry.label.toLowerCase()}`)}
          >
            <Icon className="mr-1.5 h-3.5 w-3.5 text-primary" />
            {entry.label}
          </DropdownMenuItem>
        );
      })}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => fileRef.current?.click()} onSelect={(e) => e.preventDefault()}>
        <FileUp className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
        Import .mmd file…
      </DropdownMenuItem>
      <input
        ref={fileRef}
        type="file"
        accept=".mmd,.txt,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importFile(file);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** Standalone button + menu. */
export function NewDiagramButton({ className }: { className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className={className}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New diagram
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <NewDiagramMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
