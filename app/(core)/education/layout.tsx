// Education Hub section layout. Server component — metadata only; the hub lives
// in (core) so it is publicly crawlable AND inherits the app shell + sign-up
// CTA + authed continuity (see FEATURE.md "Why (core), not (public)").
import { createRouteMetadata } from "@/utils/route-metadata";
import { EducationHeader } from "@/features/education/components/EducationHeader";
import { OfflineStudySyncMount } from "@/features/education/study/offline/OfflineStudySyncMount";
import { EducationAgeGateMount } from "@/features/education/compliance/EducationAgeGateMount";
import { ScrollAssistantLauncher } from "@ai-matrx/chat/agents/components/ambient-assistant/ScrollAssistantLauncher";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ChatCanvasWorkspace } from "@ai-matrx/chat/canvas/workspace/ChatCanvasWorkspace";
import { readCanvasWorkspaceLayout } from "@ai-matrx/chat/next/server/workspace-cookies.server";

/** The education workspace's id: its remembered layout. */
const EDUCATION_WORKSPACE_ID = "education";

export const metadata = {
  ...createRouteMetadata("/education", {
    title: "Education",
    description:
      "The all-in-one AI study platform — flashcards, quizzes, practice tests, podcasts, mind maps, and a tutor that knows your class. Every subject, every grade, every way to learn.",
    letter: "Ed",
    canonicalPath: "/education",
  }),
  // Installing from any /education page installs the STUDY app (start_url
  // /education), not the platform workspace that /manifest.webmanifest
  // declares. See app/education.webmanifest/route.ts.
  manifest: "/education.webmanifest",
};

export default async function EducationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const body = (
    <>
      <EducationHeader />
      {/* Drains the offline study outbox on every education route, on `online`,
          and on tab refocus — and renders the queue-depth chip that is the one
          in-app door onto /education/offline (renders nothing at zero). */}
      <OfflineStudySyncMount />
      {/* Render-free: asks an undeclared signed-in learner for their age band
          ONCE, up front, so COPPA is settled before any AI action — never
          discovered via a refusal. */}
      <EducationAgeGateMount />
      {/* The AppShell intentionally pulls (core) content beneath its glass
          header. Education uses a shared static route header, so every screen
          must begin below it; owning that clearance here keeps all present and
          future education routes aligned without per-page offsets. */}
      <div className="education-scroll-boundary scroll-page-end-space box-border h-full min-h-0 pt-[var(--shell-header-h)]">
        {children}
      </div>
      <ScrollAssistantLauncher inputVariant="text-voice" />
    </>
  );

  // A guest (education is public and crawlable) keeps the ordinary shell: the
  // chat needs an account.
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return body;

  // Signed in: THE chat-beside-a-canvas layout (../aidream/apps/shared/chat/src/canvas/workspace) —
  // the app's own sidebar (Chats one switch away), the shell chat beside it
  // (Education's own conversation, closed until opened — `shellChatHome`), and
  // education as the canvas. EducationHeader's module menu portals into the
  // workspace header; the chat sees whichever education page is on screen and
  // follows the person from page to page. Listed in SIGNED_IN_CANVAS_CHROME_ROUTES
  // so the first paint already has canvas chrome.
  const initialLayout = await readCanvasWorkspaceLayout(EDUCATION_WORKSPACE_ID);
  return (
    <ChatCanvasWorkspace
      id={EDUCATION_WORKSPACE_ID}
      initialLayout={initialLayout}
      // Canvas chrome stops `.shell-main` scrolling; the education pages scroll here.
      canvas={<div className="h-full min-h-0 overflow-y-auto">{body}</div>}
    />
  );
}
