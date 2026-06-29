import { createRouteMetadata } from "@/utils/route-metadata";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import { AuthedWorkspaceCTA } from "@/features/auth/components/module-landing/AuthedWorkspaceCTA";
import { EduHero } from "@/features/education/components/sections/EduHero";
import { SectionRenderer } from "@/features/education/components/sections/SectionRenderer";
import { LEARN_DOCS } from "@/features/education/data/learn-content";
import {
  EDU_WORKSPACE_HREF,
  EDU_WORKSPACE_LABEL,
  eduHref,
} from "@/features/education/constants";
import { BookOpen } from "lucide-react";
import type { EduSection } from "@/features/education/types";

export const metadata = createRouteMetadata("/education", {
  titlePrefix: "Study Guides",
  title: "Education",
  description:
    "Free, in-depth study guides and topic explainers — clear content on the subjects you're learning, with one-click paths to study them in the app.",
  letter: "Lr",
});

export default function EducationLearnPage() {
  const sections: EduSection[] = [
    {
      kind: "status-cards",
      heading: "Study guides & explainers",
      subheading:
        "Clear, comprehensive content on the topics you're studying — free to read, easy to turn into flashcards, quizzes, and audio.",
      cards: LEARN_DOCS.map((d) => ({
        title: d.title,
        description: d.summary,
        status: "live" as const,
        href: eduHref("learn", d.slug),
        icon: BookOpen,
      })),
    },
  ];
  return (
    <MarketingPageShell>
      <AuthedWorkspaceCTA
        workspaceHref={EDU_WORKSPACE_HREF}
        workspaceLabel={EDU_WORKSPACE_LABEL}
      />
      <EduHero
        eyebrow="AI Matrx Education"
        eyebrowIcon={BookOpen}
        title="Study guides"
        titleAccent="that actually teach"
        description="In-depth, free explainers on the subjects and exams you're tackling — then study them with the full AI Matrx toolkit."
        primary={{ label: "Start studying free", href: eduHref() }}
      />
      <SectionRenderer sections={sections} />
    </MarketingPageShell>
  );
}
