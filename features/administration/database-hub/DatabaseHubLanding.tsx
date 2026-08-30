"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  ArrowRight,
  Database,
  Loader2,
  Network,
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
  DEFAULT_DATABASE_SCHEMA,
} from "./database-tools";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import {
  ADMIN_DATABASE_SURFACE_NAME,
  createAdminDatabaseScope,
} from "@/features/surfaces/manifests/admin-database.manifest";

const SECTION_ICONS: Record<DatabaseToolSection, React.ReactNode> = {
  legacy: <Database className="h-5 w-5" />,
  sql: <SquareFunction className="h-5 w-5" />,
  governance: <Network className="h-5 w-5" />,
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
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-background/70 backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs font-medium text-foreground">
              Opening {databaseToolLabel(page)}…
            </span>
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

  // Surface emitter — hub half of `matrx-admin/database`. Built at trigger
  // time. No credentials of any kind enter this scope.
  //
  // NO WRITE HANDLERS, deliberately. This mount owns no editable state: the
  // hub is a static link grid over `databaseToolPages` (a build-time config
  // module), and `totalTools`/`dupCount` are derived counts, not settings —
  // there is nothing here an agent could author. The surface's one write
  // target (`sql_query`) belongs to the SQL workbench mount at
  // `/administration/database/sql-queries`, which owns the editor buffer.
  // Registering no handler is the correct outcome, not an omission:
  // `listAgentWritableTargets()` only offers a target where the mount wired
  // one, so an agent on the hub is offered nothing and cannot stage SQL into
  // a page that has no editor.
  const getSurfaceScope = () =>
    createAdminDatabaseScope({
      console_section: "hub",
      default_schema: DEFAULT_DATABASE_SCHEMA,
      database_tool_pages: databaseToolPages.map((p) => ({
        title: databaseToolLabel(p),
        href: p.path,
        section: p.section,
      })),
      database_tool_count: totalTools,
      selection: window.getSelection()?.toString() || undefined,
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_DATABASE_SURFACE_NAME}
      getScope={getSurfaceScope}
      isEditable={false}
    >
      <NonEditableContextMenu
        sourceFeature="admin"
        surfaceName={ADMIN_DATABASE_SURFACE_NAME}
        getApplicationScope={getSurfaceScope}
        contentSource={{ type: "raw" }}
      >
        <div
          className="min-h-full w-full bg-textured"
          data-surface-value="console_section"
        >
          <div className="mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-6">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span data-surface-value="database_tool_count">
                {totalTools} tools
              </span>
              <span aria-hidden="true">·</span>
              <span data-surface-value="default_schema">
                Default schema: {DEFAULT_DATABASE_SCHEMA}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                {dupCount} duplicates marked
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  Dup
                </Badge>
              </span>
            </div>

            <div className="space-y-8" data-surface-value="database_tool_pages">
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
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}
