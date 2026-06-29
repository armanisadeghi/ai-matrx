// Education Hub section layout. Server component — metadata only; the hub lives
// in (core) so it is publicly crawlable AND inherits the app shell + sign-up
// CTA + authed continuity (see FEATURE.md "Why (core), not (public)").
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/education", {
  title: "Education",
  description:
    "The all-in-one AI study platform — flashcards, quizzes, practice tests, podcasts, mind maps, and a context-aware tutor. Every subject, every grade, every way to learn.",
  letter: "Ed",
  canonicalPath: "/education",
});

export default function EducationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
