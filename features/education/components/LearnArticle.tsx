// Server component. Renders a pure-content LEARN page (study guide / explainer)
// from a LearnDoc: article header + JSON-LD + authored sections + a prominent
// content→app conversion bridge. 100% server-rendered for SEO.
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import { AuthedWorkspaceCTA } from "@/features/auth/components/module-landing/AuthedWorkspaceCTA";
import { SectionRenderer } from "./sections/SectionRenderer";
import { getAxisEntry } from "../data/registry";
import { EDU_TOOL_BY_SLUG } from "../data/tools";
import {
  EDU_BASE,
  EDU_LEARN_SEGMENT,
  EDU_WORKSPACE_HREF,
  EDU_WORKSPACE_LABEL,
  eduHref,
} from "../constants";
import { siteConfig } from "@/config/extras/site";
import type { LearnDoc, EduSection } from "../types";

/** Slug → Title Case, used ONLY as a fallback when no registry name exists. */
function humanize(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const subjectName = (s: string) => getAxisEntry("subjects", s)?.name ?? humanize(s);
const toolName = (s: string) => EDU_TOOL_BY_SLUG[s]?.name ?? humanize(s);

export function LearnArticle({ doc }: { doc: LearnDoc }) {
  const url = `${siteConfig.url}${eduHref(EDU_LEARN_SEGMENT, doc.slug)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: doc.title,
    description: doc.summary,
    datePublished: doc.updated,
    dateModified: doc.updated,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: "AI Matrx" },
    publisher: { "@type": "Organization", name: "AI Matrx" },
  };

  const bridgeTools = doc.related?.tools ?? [];

  const ctaSection: EduSection = {
    kind: "cta",
    heading: `Study ${doc.title.replace(/:.*$/, "")} with AI Matrx`,
    body: "Turn this into flashcards, a quiz, an audio overview, or a tutoring session — generated from this guide and your own notes.",
    primary: {
      label: bridgeTools[0] ? `Open ${toolName(bridgeTools[0])}` : "Start studying free",
      href: bridgeTools[0] ? eduHref(bridgeTools[0]) : EDU_BASE,
    },
    secondary: doc.subject
      ? { label: `More ${subjectName(doc.subject)}`, href: eduHref("subjects", doc.subject) }
      : undefined,
  };

  return (
    <MarketingPageShell>
      {/* Static, server-built JSON-LD from trusted registry data (no user input). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AuthedWorkspaceCTA
        workspaceHref={EDU_WORKSPACE_HREF}
        workspaceLabel={EDU_WORKSPACE_LABEL}
      />

      {/* Article header */}
      <header className="mx-auto max-w-3xl px-4 sm:px-6 pt-14 sm:pt-20 pb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Link href={eduHref("learn")} className="hover:text-foreground transition-colors inline-flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" /> Study guides
          </Link>
          {doc.subject ? (
            <>
              <span aria-hidden>/</span>
              <Link href={eduHref("subjects", doc.subject)} className="hover:text-foreground transition-colors">
                {subjectName(doc.subject)}
              </Link>
            </>
          ) : null}
        </div>
        <h1 className="text-[clamp(1.75rem,1.4rem+1.8vw,3rem)] font-bold tracking-tight leading-[1.15]">
          {doc.title}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
          {doc.summary}
        </p>
        <p className="mt-4 text-xs text-muted-foreground/60">
          Updated {doc.updated}
        </p>
      </header>

      <SectionRenderer sections={doc.sections} />
      <SectionRenderer sections={[ctaSection]} />
    </MarketingPageShell>
  );
}
