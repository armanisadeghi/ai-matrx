import FilesLanding from "@/features/auth/components/module-landing/landings/FilesLanding";

/**
 * `/files` is the public-facing marketing surface for the Files module.
 * The sidebar nav routes authenticated users straight to `/files/all`
 * (the browser), so authed visitors land here only via external links;
 * via external links; `AuthedWorkspaceCTA` in `ModuleLanding` gives
 * them a one-tap route to the browser.
 */
export default function FilesPage() {
  return <FilesLanding />;
}
