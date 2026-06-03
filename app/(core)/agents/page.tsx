import type { Metadata } from "next";
import AgentsLanding from "@/features/auth/components/module-landing/landings/AgentsLanding";

export const metadata: Metadata = {
  title: "Agents — AI Matrx",
  description:
    "Build agents that finish the work. Compose tools, models, scopes, and policies. Start from a template, customize in minutes, ship to chat, apps, or the API.",
  openGraph: {
    title: "Build agents that finish the work — AI Matrx",
    description:
      "Tools, models, scopes, policies — composed into agents that run end-to-end workflows.",
    type: "website",
  },
};

/**
 * `/agents` is the public-facing marketing surface for the Agents module.
 * The sidebar nav routes authenticated users straight to `/agents/all`
 * (the gallery), so authed visitors land here only via external links;
 * when they do, `AuthedWorkspaceCTA` (mounted by `ModuleLanding`) gives
 * them a one-tap route to the gallery.
 */
export default function AgentsPage() {
  return (
    <div className="h-dvh w-full overflow-y-auto bg-textured">
      <div style={{ height: "var(--shell-header-h, 2.75rem)" }} />
      <AgentsLanding />
    </div>
  );
}
