// Education Hub section layout. Server component — metadata only; the hub lives
// in (core) so it is publicly crawlable AND inherits the app shell + sign-up
// CTA + authed continuity (see FEATURE.md "Why (core), not (public)").
import { createRouteMetadata } from "@/utils/route-metadata";
import { EducationHeader } from "@/features/education/components/EducationHeader";
import { OfflineStudySyncMount } from "@/features/education/study/offline/OfflineStudySyncMount";
import { EducationAgeGateMount } from "@/features/education/compliance/EducationAgeGateMount";

export const metadata = {
  ...createRouteMetadata("/education", {
    title: "Education",
    description:
      "The all-in-one AI study platform — flashcards, quizzes, practice tests, podcasts, mind maps, and a context-aware tutor. Every subject, every grade, every way to learn.",
    letter: "Ed",
    canonicalPath: "/education",
  }),
  // Installing from any /education page installs the STUDY app (start_url
  // /education), not the platform workspace that /manifest.webmanifest
  // declares. See app/education.webmanifest/route.ts.
  manifest: "/education.webmanifest",
};

export default function EducationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
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
      {children}
    </>
  );
}
