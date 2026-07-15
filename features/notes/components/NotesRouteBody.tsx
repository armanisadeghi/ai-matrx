"use client";

// Route-level switch for the /notes tree: most segments ([id], bare /notes)
// are handled entirely by <NotesView /> reading the [id] param itself, so
// their page.tsx files are empty placeholders and get hidden here. The
// /notes/[id]/diff segment is a real standalone page (NoteVersionDiffPage) —
// it must render instead of NotesView, not sit behind it in a display:none
// div. Add future non-NotesView /notes/[id]/<segment> pages to DIFF_SUFFIXES.

import { usePathname } from "next/navigation";
import type { Layout } from "react-resizable-panels";
import { NotesView } from "./NotesView";

const STANDALONE_SUFFIXES = ["/diff"];

export function NotesRouteBody({
  children,
  sidebarLayout,
}: {
  children: React.ReactNode;
  sidebarLayout?: Layout;
}) {
  const pathname = usePathname();
  const isStandaloneRoute = STANDALONE_SUFFIXES.some((suffix) =>
    pathname?.endsWith(suffix),
  );

  if (isStandaloneRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <NotesView className="h-full" sidebarLayout={sidebarLayout} />
      <div style={{ display: "none" }}>{children}</div>
    </>
  );
}
