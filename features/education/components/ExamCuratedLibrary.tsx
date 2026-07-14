// Server component. The CURATED STUDY LIBRARY block for an exam-prep axis entry
// (the "Coming Soon: standardized exam content libraries" vision surface, now
// live). Surfaces the actual certified, curated decks + published study guides
// for THIS exam — the real content behind the exam-hub structure.
//
// Reuse-first: decks come from the community library's `edu_public_decks` RPC
// (exam-slug + certified filters) and render with the canonical `DeckCard`;
// guides come from the `/education/learn` publishing engine (docs keyworded
// with the exam slug). No bespoke content system, no new deck/guide card.
//
// Anon + cookie-free reads only, so the exam pages stay statically generable
// (ISR). Renders nothing when an exam has no curated content yet.
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { fetchExamCertifiedDecks } from "../library/queries";
import { getExamLearnDocs } from "../publishing/queries";
import { DeckCard } from "../library/components/DeckCard";
import { CertifiedBadge } from "../library/components/CertifiedBadge";
import { eduHref, EDU_LEARN_SEGMENT } from "../constants";

export async function ExamCuratedLibrary({
  examSlug,
  examName,
}: {
  examSlug: string;
  examName: string;
}) {
  const [decks, guides] = await Promise.all([
    fetchExamCertifiedDecks(examSlug),
    getExamLearnDocs(examSlug),
  ]);

  if (decks.length === 0 && guides.length === 0) return null;

  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-3">
            <CertifiedBadge size="md" note="Editorially verified by AI Matrx" />
          </div>
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
            {examName} certified study library
          </h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
            Curated, exam-grade decks and study guides for {examName}. Study a
            copy free — every card and guide is editorially reviewed.
          </p>
        </div>

        {decks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {decks.map((deck) => (
              <DeckCard
                key={deck.id}
                deck={deck}
                isSuperAdmin={false}
                isSignedIn={false}
              />
            ))}
          </div>
        ) : null}

        {guides.length > 0 ? (
          <div className="mt-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">
              Free study guides
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {guides.map((guide) => (
                <Link
                  key={guide.slug}
                  href={eduHref(EDU_LEARN_SEGMENT, guide.slug)}
                  className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <BookOpen className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm flex items-center gap-1.5 group-hover:text-primary transition-colors">
                      {guide.title}
                      <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {guide.summary}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
