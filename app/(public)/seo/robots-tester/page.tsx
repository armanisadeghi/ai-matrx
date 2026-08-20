import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";

import { RobotsTesterTool } from "@/features/marketing/seo/public-tools/RobotsTesterTool";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildPublicToolJsonLd } from "@/features/marketing/seo/public-tools/tool-jsonld";

const canonicalUrl = "https://www.aimatrx.com/seo/robots-tester";

export const metadata: Metadata = {
  title: "Free Robots.txt Tester — Check Any URL & Crawler",
  description:
    "Test whether Googlebot or another crawler can access any page. See the exact robots.txt rule, source line, sitemap links, and syntax warnings.",
  alternates: { canonical: canonicalUrl },
  openGraph: {
    type: "website",
    url: canonicalUrl,
    title: "Free Robots.txt Tester",
    description:
      "Check whether a crawler can access any page and see the exact robots.txt rule behind the result.",
  },
};

export default function RobotsTesterPage() {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <JsonLd
        data={buildPublicToolJsonLd({
          href: "/seo/robots-tester",
          name: "Free Robots.txt Tester",
          description:
            "Test whether Googlebot or another crawler can access any page. See the exact robots.txt rule, source line, sitemap links, and syntax warnings.",
        })}
      />
      <main className="mx-auto max-w-5xl px-4 py-10 pb-16 sm:px-6 sm:py-14">
        <section className="mx-auto mb-8 max-w-4xl">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Free Robots.txt Tester
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
            Enter any page URL to see whether a crawler is allowed to access
            it—and the exact robots.txt rule that decides the answer.
          </p>
        </section>

        <RobotsTesterTool />

        <section className="mx-auto mt-12 max-w-4xl border-t border-border pt-10">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                What this test checks
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                The tester fetches the site&apos;s live <code>/robots.txt</code>
                , finds the rule group for your selected crawler, and applies
                the most specific matching rule to the page path. The result
                includes the winning directive and source line so you can verify
                the answer yourself.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground">
                One important limit
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Robots.txt controls crawling; it does not hide private content
                and does not guarantee that a URL stays out of search results.
                Protect private pages with authentication, and use an
                index-control directive when indexing is the issue.
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-foreground">
              Two common rules
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Block every crawler from a folder
                </p>
                <pre className="overflow-x-auto rounded-lg bg-muted/60 p-3 text-xs text-foreground">
                  {"User-agent: *\nDisallow: /private/"}
                </pre>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Allow every crawler everywhere
                </p>
                <pre className="overflow-x-auto rounded-lg bg-muted/60 p-3 text-xs text-foreground">
                  {"User-agent: *\nDisallow:"}
                </pre>
              </div>
            </div>
          </div>

          <nav
            aria-label="Related free SEO tools"
            className="mt-8 flex flex-wrap gap-3 text-sm"
          >
            <Link
              href="/seo/page-audit"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Run a page SEO audit <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/seo/structured-data"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Validate structured data <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </nav>
        </section>
      </main>
    </div>
  );
}
