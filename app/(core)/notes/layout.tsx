// app/(core)/notes/layout.tsx
//
// Server Component layout. The auth branch is made server-side via
// `getServerAuth()` (request-scoped cache — no extra round-trip vs. the parent
// layout's call). Guests are served the full `<NotesLanding />` marketing page
// directly; authed users get the `<NotesView />` workspace. Neither tree leaks
// into the other's bundle, and no Lucide icons (or other non-serializable
// values) cross a server→client boundary.

import "./notes.css";
import { NotesView } from "@/features/notes/components/NotesView";
import NotesLanding from "@/features/auth/components/module-landing/landings/NotesLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
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

export default async function NotesV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();

  if (!isAuthenticated) {
    // Guests: full marketing landing, fully server-rendered. The
    // workspace tree (and its bundle) never loads.
    return <NotesLanding />;
  }

  return (
    <div
      className="notes-root h-full overflow-hidden relative z-0"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <style dangerouslySetInnerHTML={{ __html: highlightStyles }} />
      <span className="shell-hide-dock" aria-hidden="true" />
      <NotesView className="h-full" />
      <div style={{ display: "none" }}>{children}</div>
    </div>
  );
}
