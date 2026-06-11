import FilesLanding from "@/features/auth/components/module-landing/landings/FilesLanding";


/**
 * `/files` is the public-facing marketing surface for the Files module.
 * The sidebar nav routes authenticated users straight to `/files/all`
 * (the workspace's catch-all root), so authed visitors land here only
 * via external links; `AuthedWorkspaceCTA` in `ModuleLanding` gives
 * them a one-tap route to the workspace.
 */
export default function FilesPage() {
  return (
    <div className="h-dvh w-full overflow-y-auto bg-textured">
      <div style={{ height: "var(--shell-header-h, 2.75rem)" }} />
      <FilesLanding />
    </div>
  );
}
