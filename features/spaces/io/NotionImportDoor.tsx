"use client";

// features/spaces/io/NotionImportDoor.tsx — THE DOOR to "Import from Notion" for pages outside Spaces
// (the Tables home, a table's ⋯ → Import). Named in scripts/check-spaces-fence.mjs ENTRY_POINTS.
//
//   const notion = useOpenNotionImport();
//   <button onClick={notion.open}>Import from Notion</button>
//   {notion.door}                       // render once, anywhere on the page
//
// The importer's own provider and run state live behind ONE next/dynamic edge (NotionImportDoorImpl): a
// page that never opens it loads none of it. After the import the report lands the person on the
// imported Space page (/spaces/<id>) or the report table (/data/<id>).
//
// BUILD GRAPH (code-splitting Method B): add no other import here and no second dynamic edge.

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";

const NotionImportDoorImpl = dynamic(() => import("./NotionImportDoorImpl"), { ssr: false });

/** The door itself: mounts the importer only while `open`; `onClose` fires when the person is done. */
export function NotionImportDoor({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <NotionImportDoorImpl onClose={onClose} /> : null;
}

/** `open()` starts "Import from Notion"; render `door` once on the page. */
export function useOpenNotionImport(): { open: () => void; door: ReactNode } {
  const [isOpen, setOpen] = useState(false);
  return { open: () => setOpen(true), door: <NotionImportDoor open={isOpen} onClose={() => setOpen(false)} /> };
}
