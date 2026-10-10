"use client";

// features/unified-data/home/DataHomeRoute.tsx — /data's one home.
//
// THE HEADER'S PRESSES LIVE HERE (lane DATA-PAGE-DEFECTS, safety net T01/L02): New table opens the one
// New table dialog where it was pressed (G5 b, lane MAKE-HOME); Start from a template goes to the one
// template gallery (lane TEMPLATES, RETIRE-1).
// The old hub, its knob `custom.data_home_shell` and `?home=old` were removed after the switch's
// soak (lane ONE-HOME wave 4): there is one data home and nothing to choose between.

import { useState } from "react";

import { NewTableDialog } from "@/features/make/MakeMount";
import { useOpenNotionImport } from "@/features/spaces/io/NotionImportDoor";

import { DataHomeShellPage } from "./DataHomeShellPage";

/** How many times the header's New table was pressed, and the press. */
export interface DataHomeMaking {
  asked: { create: number };
  ask: (what: "create") => void;
  /** "Import from Notion": opens the Spaces door's importer in place (lane NOTION-DOOR). */
  importFromNotion: () => void;
}

export function DataHomeRoute() {
  const [asked, setAsked] = useState({ create: 0 });
  // THE PRESS OPENS ONE DIALOG, WHERE IT WAS PRESSED (G5 b, lane MAKE-HOME): never a name box at the
  // foot of the list, and never a missing button when no organization is chosen — the dialog asks.
  const [opened, setOpened] = useState<"create" | null>(null);
  const notion = useOpenNotionImport();
  const making: DataHomeMaking = {
    importFromNotion: notion.open,
    asked,
    ask: (what) => {
      setAsked((n) => ({ ...n, [what]: n[what] + 1 }));
      setOpened(what);
    },
  };
  return (
    <>
      <DataHomeShellPage making={making} />
      <NewTableDialog what={opened} onClose={() => setOpened(null)} />
      {notion.door}
    </>
  );
}
