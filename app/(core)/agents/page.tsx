import AgentsLanding from "@/features/auth/components/module-landing/landings/AgentsLanding";

/**
 * `/agents` is the public-facing marketing surface for the Agents module.
 * The sidebar nav routes authenticated users straight to `/agents/all`
 * (the gallery), so authed visitors land here only via external links;
 * when they do, `AuthedWorkspaceCTA` (mounted by `ModuleLanding`) gives
 * them a one-tap route to the gallery.
 */
export default function AgentsPage() {
  return <AgentsLanding />;
}
