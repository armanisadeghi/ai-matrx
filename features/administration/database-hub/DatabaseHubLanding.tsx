"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  ArrowRight,
  Database,
  Loader2,
  ShieldCheck,
  SlidersHorizontal,
  SquareFunction,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DATABASE_TOOL_SECTIONS,
  databaseToolLabel,
  databaseToolPages,
  type DatabaseToolPage,
  type DatabaseToolSection,
} from "./database-tools";

const SECTION_ICONS: Record<DatabaseToolSection, React.ReactNode> = {
  legacy: <Database className="h-5 w-5" />,
  sql: <SquareFunction className="h-5 w-5" />,
  canonicalization: <ShieldCheck className="h-5 w-5" />,
  schema: <SlidersHorizontal className="h-5 w-5" />,
};

function ToolCard({ page }: { page: DatabaseToolPage }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Link
      href={page.path}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        startTransition(() => router.push(page.path));
      }}
      className="block"
    >
      <Card
        className={cn(
          "relative h-full transition-all duration-200 border-border hover:border-primary/40 hover:shadow-md",
          isPending && "pointer-events-none opacity-70",
        )}
      >
        {isPending && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/70 backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <CardHeader className="px-4 pt-4 pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">
              {databaseToolLabel(page)}
            </CardTitle>
            <div className="flex shrink-0 gap-1">
              {page.isDuplicate && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  Dup
                </Badge>
              )}
            </div>
          </div>
          <CardDescription className="text-xs line-clamp-3">
            {page.description}
          </CardDescription>
        </CardHeader>
        {page.duplicateNote && (
          <CardContent className="px-4 py-0 pb-2">
            <p className="text-[11px] text-amber-600 dark:text-amber-400 border-l-2 border-amber-500/40 pl-2">
              {page.duplicateNote}
            </p>
          </CardContent>
        )}
        <CardFooter className="px-4 pb-4 pt-1">
          <span className="text-xs font-medium text-muted-foreground flex items-center">
            Open
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}

export function DatabaseHubLanding() {
  const totalTools = databaseToolPages.length;
  const dupCount = databaseToolPages.filter((p) => p.isDuplicate).length;

  return (
    <div className="h-full w-full overflow-auto bg-textured">
      <div className="w-full max-w-[1400px] mx-auto py-6 px-4 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">
            Database Tools Hub
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Unified entry point for all {totalTools} database admin tools — SQL
            editors, legacy dashboard, canonicalization workflow, and schema
            visualizers. {dupCount} duplicate(s) marked{" "}
            <Badge variant="outline" className="text-[10px] mx-0.5">
              Dup
            </Badge>{" "}
            so you can compare and pick which to keep.
          </p>
        </div>

        <div className="space-y-8">
          {DATABASE_TOOL_SECTIONS.map((section) => {
            const tools = databaseToolPages.filter(
              (p) => p.section === section.id,
            );
            if (tools.length === 0) return null;

            return (
              <section key={section.id}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {SECTION_ICONS[section.id]}
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      {section.label}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        ({tools.length})
                      </span>
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {section.description}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {tools.map((page) => (
                    <ToolCard key={page.path} page={page} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
