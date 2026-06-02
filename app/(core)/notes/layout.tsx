// app/(a)/notes/layout.tsx

import "./notes.css";
import { NotesView } from "@/features/notes/components/NotesView";
import { UnauthSurfaceLanding } from "@/features/auth/components/UnauthSurfaceLanding";
import { StickyNote } from "lucide-react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/notes", {
  title: "Notes",
  description: "SSR test route for the 6-layer notes architecture",
  letter: "N",
});

const highlightStyles = `
/* CSS Highlights API for the markdown preview panel. */
::highlight(notes-find-match) {
  background-color: hsl(48 100% 60% / 0.45);
  color: inherit;
}
::highlight(notes-find-match-active) {
  background-color: hsl(24 100% 55% / 0.7);
  color: inherit;
}
.dark ::highlight(notes-find-match) {
  background-color: hsl(48 100% 55% / 0.35);
}
.dark ::highlight(notes-find-match-active) {
  background-color: hsl(24 100% 55% / 0.55);
}
`;

export default function NotesV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="notes-root h-full overflow-hidden relative z-0"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <style dangerouslySetInnerHTML={{ __html: highlightStyles }} />
      <span className="shell-hide-dock" aria-hidden="true" />
      <UnauthSurfaceLanding
        featureName="Notes"
        icon={StickyNote}
        description="Capture thoughts, drafts, and reference material — all searchable and synced across your devices."
        bullets={[
          "Markdown notes with rich previews",
          "Pin notes to scopes and projects",
          "Drop into chat or share by link",
        ]}
      >
        <NotesView className="h-full" />
      </UnauthSurfaceLanding>
      <div style={{ display: "none" }}>{children}</div>
    </div>
  );
}
