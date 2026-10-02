// app/(core)/marketing/layout.tsx
//
// Auth branch for the whole Marketing module, decided SERVER-side (no client
// flash, and the workspace tree never enters a guest's bundle).
//
// Guests get the full marketing landing on ANY /marketing/* URL — never a login
// wall, never an error (`.claude/skills/module-landing-pages`, invariant 1).
// Signed-in users fall through to the real workspace; `AuthedWorkspaceCTA`
// inside ModuleLanding is what gives a signed-in visitor the way in when they
// do land on the pitch.
//
// getServerAuth() is request-scope cached — the (core) layout already called
// it, so this costs nothing.

import { headers } from "next/headers";

import MarketingLanding from "@/features/auth/components/module-landing/landings/MarketingLanding";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import { getMarketingRouteMetadata } from "@/features/marketing/lib/route-metadata";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { ChatCanvasWorkspace } from "@ai-matrx/chat/canvas/workspace/ChatCanvasWorkspace";
import { readCanvasWorkspaceLayout } from "@ai-matrx/chat/canvas/workspace/workspace-cookies.server";
import { readComposerModeCookie } from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/composer-mode.server";

const MARKETING_WORKSPACE_ID = "marketing";

export async function generateMetadata() {
  const pathname = (await headers()).get("x-pathname") ?? "/marketing";
  return getMarketingRouteMetadata(pathname);
}

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getSessionVerdict();

  if (!isAuthenticated) {
    return (
      <MarketingPageShell>
        <MarketingLanding />
      </MarketingPageShell>
    );
  }

  // Signed in: the chat beside the module, as on the Board and Education
  // (SIGNED_IN_CHAT_WORKSPACE_ROUTES gives the first paint canvas chrome). The
  // sidebar keeps Marketing's own menu as the domain panel; marketing pages'
  // <PageHeader> portals into the workspace header.
  const [initialLayout, initialMode] = await Promise.all([
    readCanvasWorkspaceLayout(MARKETING_WORKSPACE_ID),
    readComposerModeCookie(),
  ]);
  return (
    <ChatCanvasWorkspace
      id={MARKETING_WORKSPACE_ID}
      initialLayout={initialLayout}
      initialMode={initialMode}
      canvas={<div className="h-full min-h-0 overflow-y-auto">{children}</div>}
    />
  );
}
