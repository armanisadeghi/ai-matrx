"use client";

// features/unified-data/home/DataHomeRoute.tsx — /data's one home.
//
// THE HEADER'S PRESSES LIVE HERE (lane DATA-PAGE-DEFECTS, safety net T01/L02): New table and Start
// from an example open the one New table dialog where they were pressed (G5 b, lane MAKE-HOME).
// The old hub, its knob `custom.data_home_shell` and `?home=old` were removed after the switch's
// soak (lane ONE-HOME wave 4): there is one data home and nothing to choose between.

import { useState } from "react";

import { NewTableDialog } from "@/features/make/MakeMount";

import { DataHomeShellPage } from "./DataHomeShellPage";

/** How many times the header's New table / Start from an example was pressed, and the press. */
export interface DataHomeMaking {
  asked: { create: number; examples: number };
  ask: (what: "create" | "examples") => void;
}

export function DataHomeRoute() {
  const [asked, setAsked] = useState({ create: 0, examples: 0 });
  // THE PRESS OPENS ONE DIALOG, WHERE IT WAS PRESSED (G5 b, lane MAKE-HOME): never a name box at the
  // foot of the list, and never a missing button when no organization is chosen — the dialog asks.
  const [opened, setOpened] = useState<"create" | "examples" | null>(null);
  const making: DataHomeMaking = {
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
    </>
  );
}
