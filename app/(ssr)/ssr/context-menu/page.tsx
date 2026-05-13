"use client";

/**
 * Context-menu testing suite — hub.
 *
 * Index page for everything under `/ssr/context-menu/*`. Cards are
 * generated from the page registry (`_registry.ts`) — adding a new
 * advanced testing page is a single-file edit there.
 */

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONTEXT_MENU_BASE, CONTEXT_MENU_PAGES } from "./_registry";

export default function ContextMenuHubPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const handleNavigate = (href: string, disabled: boolean) => {
    if (disabled || isPending) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* ── Intro ──────────────────────────────────────────────────── */}
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h1 className="text-xl font-semibold">
              UnifiedAgentContextMenu — Testing Suite
            </h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            One place to exercise every moving part of the v2 context menu. Each
            card below is a focused page — pick the one that matches what
            you&apos;re investigating. New pages register through{" "}
            <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
              _registry.ts
            </code>{" "}
            and appear here automatically.
          </p>
        </header>

        {/* ── Cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {CONTEXT_MENU_PAGES.map((page) => {
            const href = `${CONTEXT_MENU_BASE}/${page.slug}`;
            const Icon = page.icon;
            const isPlanned = page.status === "planned";
            const isWip = page.status === "wip";
            const isNavigating = isPending && pendingHref === href;

            const card = (
              <div
                className={cn(
                  "h-full p-4 rounded-lg border bg-card transition-all flex flex-col gap-2",
                  isPlanned
                    ? "border-dashed border-border opacity-60 cursor-not-allowed"
                    : "border-border hover:border-primary/40 hover:shadow-sm cursor-pointer",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "p-1.5 rounded",
                        isPlanned
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <h2 className="text-sm font-semibold">{page.title}</h2>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isWip && (
                      <span className="text-[9px] uppercase tracking-wide bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 px-1.5 py-0.5 rounded">
                        wip
                      </span>
                    )}
                    {isPlanned && (
                      <span className="text-[9px] uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                        planned
                      </span>
                    )}
                    {!isPlanned &&
                      (isNavigating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      ))}
                  </div>
                </div>
                <p className="text-[12px] text-muted-foreground font-medium">
                  {page.tagline}
                </p>
                <p className="text-[11px] text-muted-foreground/80 leading-relaxed flex-1">
                  {page.description}
                </p>
                {!isPlanned && (
                  <div className="pt-2 mt-auto">
                    <code className="text-[10px] text-muted-foreground/70">
                      {href}
                    </code>
                  </div>
                )}
              </div>
            );

            if (isPlanned) {
              return (
                <div key={page.slug} aria-disabled>
                  {card}
                </div>
              );
            }

            return (
              <button
                key={page.slug}
                type="button"
                onClick={() => handleNavigate(href, false)}
                disabled={isPending}
                className="text-left disabled:cursor-progress"
              >
                {card}
              </button>
            );
          })}
        </div>

        {/* ── Footer: how it works ───────────────────────────────────── */}
        <section className="border-t border-border pt-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Where things live
          </h3>
          <ul className="text-[12px] text-muted-foreground space-y-1 list-disc ml-5">
            <li>
              Menu component:{" "}
              <Code>features/context-menu-v2/UnifiedAgentContextMenu.tsx</Code>
            </li>
            <li>
              Data hook:{" "}
              <Code>
                features/context-menu-v2/hooks/useUnifiedAgentContextMenu.ts
              </Code>
            </li>
            <li>
              Menu fetch thunk:{" "}
              <Code>
                features/agents/redux/agent-shortcuts/thunks.ts (
                <span className="font-semibold">fetchUnifiedMenu</span>)
              </Code>
            </li>
            <li>
              API route: <Code>app/api/agent-context-menu/route.ts</Code>{" "}
              (queries{" "}
              <Code>
                public.
                <span className="font-semibold">agx_context_menu_view</span>
              </Code>
              )
            </li>
            <li>
              Launch thunk:{" "}
              <Code>
                features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts
              </Code>{" "}
              (applies <Code>runtime.surfaceName</Code> +{" "}
              <Code>agx_agent_surface.value_mappings</Code> when both present)
            </li>
            <li>
              Surface manifests:{" "}
              <Code>features/tool-registry/surfaces/manifests/registry.ts</Code>
            </li>
            <li>
              Page registry (edit to add a card):{" "}
              <Code>app/(ssr)/ssr/context-menu/_registry.ts</Code>
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Common admin entry points
          </h3>
          <ul className="text-[12px] text-muted-foreground space-y-1 list-disc ml-5">
            <li>
              Personal shortcuts:{" "}
              <PageLink href="/agents/shortcuts/shortcuts">
                /agents/shortcuts/shortcuts
              </PageLink>
            </li>
            <li>
              Organization shortcuts:{" "}
              <PageLink href="/organizations/admin/shortcuts/shortcuts">
                /organizations/[slug]/shortcuts/shortcuts
              </PageLink>
            </li>
            <li>
              System (global) shortcuts:{" "}
              <PageLink href="/administration/system-agents/shortcuts">
                /administration/system-agents/shortcuts
              </PageLink>
            </li>
            <li>
              Surface registry admin:{" "}
              <PageLink href="/administration/surfaces">
                /administration/surfaces
              </PageLink>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="text-[11px] font-mono bg-muted/50 px-1 py-0.5 rounded">
      {children}
    </code>
  );
}

function PageLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-primary hover:underline font-mono text-[11px]"
    >
      {children}
    </Link>
  );
}
