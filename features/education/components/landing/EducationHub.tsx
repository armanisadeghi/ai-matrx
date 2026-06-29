// Server component. The Education Hub home (/education). Bespoke landing built
// from the shared section primitives + axis config — the one entry point that
// routes users into all five discovery axes, the content engine, and the tools.
// 100% server-rendered. Tracks VISION-education-hub.md.
import { GraduationCap, Upload, Sparkles, Trophy, ArrowRight } from "lucide-react";
import Link from "next/link";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import { AuthedWorkspaceCTA } from "@/features/auth/components/module-landing/AuthedWorkspaceCTA";
import { EduHero } from "../sections/EduHero";
import { SectionRenderer } from "../sections/SectionRenderer";
import {
  EDU_AXES,
  EDU_BASE,
  EDU_WORKSPACE_HREF,
  EDU_WORKSPACE_LABEL,
  eduHref,
} from "../../constants";
import type { EduSection } from "../../types";

export function EducationHub() {
  const sections: EduSection[] = [
    {
      kind: "feature-grid",
      heading: "Find your way in",
      subheading:
        "Five ways to discover what to study — by subject, by your level, by the exam you're chasing, by the study aid you love, or by the features that make us different.",
      items: EDU_AXES.map((axis) => ({
        icon: axis.icon,
        title: axis.label,
        description: axis.blurb,
        href: eduHref(axis.segment),
      })),
    },
    {
      kind: "steps",
      heading: "How it works",
      subheading: "Bring in any material; walk out with everything you need to master it.",
      steps: [
        { number: "01", title: "Bring anything", description: "Upload a PDF, record a lecture, paste a YouTube link, or snap a photo of your notes." },
        { number: "02", title: "Auto-build study material", description: "Flashcards, quizzes, summaries, mind maps, and audio overviews generate in seconds." },
        { number: "03", title: "Study every way you learn", description: "FastFire spoken recall, spaced repetition, practice tests, and a context-aware AI tutor." },
        { number: "04", title: "Measure real progress", description: "Per-card mastery, weak-area surfacing, and pre/post learning-gain — not just streaks." },
      ],
    },
    {
      kind: "feature-grid",
      heading: "Why students stay",
      subheading: "The capabilities no single competitor has matched.",
      columns: 2,
      items: [
        { icon: Sparkles, title: "FastFire", description: "Rapid-fire spoken recall, graded live and adapting mid-session.", href: eduHref("features", "fastfire") },
        { icon: GraduationCap, title: "An AI tutor that knows everything", description: "Your sets, your history, your exam dates — present at every surface.", href: eduHref("features", "ai-tutor") },
        { icon: Upload, title: "Ingest anything", description: "PDF, video, audio, photos, YouTube, live lectures — all become study material.", href: eduHref("features", "multi-format-ingestion") },
        { icon: Trophy, title: "Graded the way you actually answer", description: "Spoken, written, typed, and handwritten — all graded with feedback.", href: eduHref("features", "ai-grading") },
      ],
    },
    {
      kind: "cta",
      heading: "Start studying — free",
      body: "Build your first deck, take a practice quiz, or ask the tutor a question. No credit card, every grade level, every subject.",
      primary: { label: "Open the Study Hub", href: EDU_BASE },
      secondary: { label: "Browse study aids", href: eduHref("study-aids") },
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
        eyebrowIcon={GraduationCap}
        title="Every subject. Every grade."
        titleAccent="Every way to learn."
        description="The all-in-one AI study platform — flashcards, quizzes, practice tests, podcasts, mind maps, and a context-aware tutor that grades your spoken answers in real time. From a 2nd grader's picture cards to a med student's oral-exam prep."
        primary={{ label: "Start studying free", href: EDU_BASE }}
        secondary={{ label: "See the features", href: eduHref("features") }}
      />
      <SectionRenderer sections={sections} />
      {/* Quiet footer line — the hub is the savior list view, never a dead end. */}
      <div className="border-t border-border bg-card/30">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 text-center text-sm text-muted-foreground">
          Looking for something specific?{" "}
          <Link href={eduHref("subjects")} className="text-primary hover:underline">
            Browse all subjects
          </Link>{" "}
          or{" "}
          <Link href={eduHref("exam-prep")} className="text-primary hover:underline inline-flex items-center gap-1">
            jump to exam prep <ArrowRight className="h-3 w-3" />
          </Link>
          .
        </div>
      </div>
    </MarketingPageShell>
  );
}
