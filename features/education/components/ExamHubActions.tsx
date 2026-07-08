// Server component. The exam-hub PRODUCT block for an exam-prep axis entry
// (P6 Phase B). Turns a marketing exam page into a product entry point: take a
// free mock exam / practice quiz (P1's live assessment engine), study free
// guides, and browse community decks. The free mock exam is the generosity
// showcase (P8) — Knowt won an AP season on free mocks; this is our version.
//
// Deep-links carry `?examType=&topic=&depth=exam` so P1's create surface can
// pre-select the exam (forward-compatible: harmless if prefill isn't wired yet).
import Link from "next/link";
import { ArrowRight, FileCheck2, ListChecks, BookOpen, Library } from "lucide-react";
import { eduHref } from "../constants";
import type { AxisEntry } from "../types";

export function ExamHubActions({ entry }: { entry: AxisEntry }) {
  const q = new URLSearchParams({
    examType: entry.slug,
    topic: entry.name,
    depth: "exam",
  }).toString();

  const actions = [
    {
      icon: FileCheck2,
      title: "Take a free mock exam",
      description:
        "A timed, exam-grade practice test generated for this exam — with AI-graded free response and grounded feedback.",
      href: `/education/practice-tests/new?${q}`,
      accent: true,
    },
    {
      icon: ListChecks,
      title: "Practice quiz",
      description: "A quick quiz to drill a topic before the full mock.",
      href: `/education/quizzes/new?${q}`,
    },
    {
      icon: BookOpen,
      title: "Free study guides",
      description: "In-depth explainers for this exam's toughest topics.",
      href: eduHref("learn"),
    },
    {
      icon: Library,
      title: "Community decks",
      description: "Free flashcard decks from the community — study a copy.",
      href: eduHref("library"),
    },
  ];

  return (
    <section className="bg-card/50 border-y border-border">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20">
        <div className="text-center mb-10">
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
            Study {entry.name} — free
          </h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
            A full free study hub: mock exams with AI-graded free response, quick
            quizzes, guides, and community decks. No credit card.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.title}
                href={a.href}
                className={`group flex items-start gap-4 rounded-2xl border bg-card p-6 transition-all hover:shadow-lg hover:shadow-primary/5 ${
                  a.accent
                    ? "border-primary/40 hover:border-primary/60"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold flex items-center gap-1.5">
                    {a.title}
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    {a.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
