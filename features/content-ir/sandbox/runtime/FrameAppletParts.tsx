/**
 * FrameAppletParts — the sandbox frame's stand-in for
 * `@/features/agent-apps/embed/AppletParts` (the `@/applets` import).
 *
 * WHY IT EXISTS. `@/applets` is allowlisted (allowed-imports.ts) so an applet
 * can place a page built from tables (`DataPage`) or another applet
 * (`Applet`) inside itself. Both read live data under the viewer's session:
 * the real module reaches `recordsUiHost` → the Share dialog → a server action
 * (`next/cache`) and the Supabase client. In the page that is fine; in the
 * frame esbuild inlines it, which put Next server internals into the sandbox
 * build and failed every release on 2026-10-04. It could not work here even if
 * bundled: the frame's CSP is `connect-src 'none'` and it holds no session.
 *
 * NOTHING SILENT (Law 4): each part renders one line saying it opens outside
 * the preview — never an empty box, never a fake page.
 */

function OutsidePreview({ what }: { what: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      {what} opens outside this preview.
    </p>
  );
}

export function DataPage(_props: { id: string }) {
  return <OutsidePreview what="This page" />;
}

export function Applet(_props: { id: string }) {
  return <OutsidePreview what="This applet" />;
}
