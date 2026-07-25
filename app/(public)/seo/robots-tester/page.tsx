import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { RobotsTesterTool } from "@/features/marketing/seo/public-tools/RobotsTesterTool";

export const metadata: Metadata = {
  title: "Robots.txt Tester — SEO Tools",
  description:
    "Fetch and parse any site's robots.txt, then test whether specific URLs are allowed or blocked by each rule.",
};

export default function RobotsTesterPage() {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldAlert className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-base font-semibold leading-tight tracking-tight text-foreground">
              Robots.txt Tester
            </h1>
            <p className="text-[10px] leading-tight text-muted-foreground">
              SEO Tools · Test whether a path is allowed for a given crawler
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 pb-12 xl:px-8">
        <RobotsTesterTool />
      </main>
    </div>
  );
}
