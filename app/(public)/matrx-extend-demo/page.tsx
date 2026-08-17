import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Matrx Extend Demo Page",
  description:
    "A stable public page for trying Matrx Extend page capture, structured-data extraction, SEO auditing, and page-aware chat.",
  alternates: { canonical: "/matrx-extend-demo" },
  openGraph: {
    title: "Matrx Extend Demo Page",
    description:
      "A stable sample article with links, a table, and structured data for demonstrating Matrx Extend.",
    url: "/matrx-extend-demo",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "Matrx Extend Demo Page",
    description:
      "A stable sample article with links, a table, and structured data for demonstrating Matrx Extend.",
    images: ["/matrx/logo-option-4.jpeg"],
  },
};

const workflowStages = [
  {
    stage: "Capture",
    purpose: "Turn the open page into readable content.",
    result: "Article text, links, media, metadata, and schema.",
  },
  {
    stage: "Understand",
    purpose: "Ask questions about what is actually on the page.",
    result: "Answers grounded in the current page.",
  },
  {
    stage: "Use",
    purpose: "Extract the details needed for the next task.",
    result: "Structured rows that can be copied or reused.",
  },
];

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "A clear three-stage browser workflow",
  description:
    "A stable sample article used to demonstrate how Matrx Extend captures, understands, and uses the page open in Chrome.",
  author: {
    "@type": "Organization",
    name: "AI Matrx",
  },
  publisher: {
    "@type": "Organization",
    name: "AI Matrx",
  },
  datePublished: "2026-08-17",
  dateModified: "2026-08-17",
};

export default function MatrxExtendDemoPage() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <script
        type="application/ld+json"
        // Static, locally-authored schema. Nothing from a visitor is rendered here.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />

      <article className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
        <header className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
            Matrx Extend demo
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            A clear three-stage browser workflow
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            This stable sample page lets anyone try Matrx Extend without signing
            in. The page contains a real article, useful links, a structured
            table, and JSON-LD metadata so the extension&apos;s page-aware
            features have predictable material to work with.
          </p>
        </header>

        <section aria-labelledby="workflow-heading" className="mt-14">
          <h2 id="workflow-heading" className="text-2xl font-semibold">
            The three workflow stages
          </h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead className="bg-muted/60 text-sm">
                <tr>
                  <th scope="col" className="px-5 py-4 font-semibold">
                    Stage
                  </th>
                  <th scope="col" className="px-5 py-4 font-semibold">
                    Purpose
                  </th>
                  <th scope="col" className="px-5 py-4 font-semibold">
                    Expected result
                  </th>
                </tr>
              </thead>
              <tbody>
                {workflowStages.map((item) => (
                  <tr
                    key={item.stage}
                    className="border-t border-border align-top"
                  >
                    <th scope="row" className="px-5 py-4 font-semibold">
                      {item.stage}
                    </th>
                    <td className="px-5 py-4 text-muted-foreground">
                      {item.purpose}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {item.result}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="why-heading" className="mt-14 max-w-3xl">
          <h2 id="why-heading" className="text-2xl font-semibold">
            Why page-aware assistance matters
          </h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            A browser assistant is most useful when its answer is grounded in
            the page the user chose. Matrx Extend can capture readable content
            on demand, inspect page structure, and use that context to answer a
            direct question. Automatic capture is optional and is off on a fresh
            installation.
          </p>
          <p className="mt-4 leading-7 text-muted-foreground">
            The user remains in control: read-only tools can inspect the active
            page, while the default interaction mode asks before an action
            changes a page. Privileged actions always require confirmation.
          </p>
        </section>

        <nav
          aria-label="Related resources"
          className="mt-14 rounded-2xl bg-muted/40 p-6"
        >
          <h2 className="text-lg font-semibold">Related resources</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link
                className="text-primary underline underline-offset-4"
                href="/privacy-policy/extension"
              >
                Matrx Extend privacy policy
              </Link>
            </li>
            <li>
              <Link
                className="text-primary underline underline-offset-4"
                href="/contact"
              >
                Contact AI Matrx support
              </Link>
            </li>
            <li>
              <Link
                className="text-primary underline underline-offset-4"
                href="/how-it-works"
              >
                How AI Matrx works
              </Link>
            </li>
          </ul>
        </nav>
      </article>
    </div>
  );
}
