"use client";

/**
 * AgentShortcutsPanel
 *
 * Landing UI for `/agents/[id]/shortcuts/`. Shows the user how many shortcuts
 * (user-owned + global) target this agent and lets them click through to the
 * standalone shortcut editor route at `/agents/[id]/shortcuts/[shortcutId]`.
 *
 * Data: hydrates both `global` and `user` scopes via `useAgentShortcuts`, then
 * filters via `selectShortcutsByAgentId`. No writes happen on this page —
 * creation routes to `/agents/[id]/shortcuts/new`.
 */

import Link from "next/link";
import {
  ArrowRight,
  Globe,
  KeyRound,
  Layers,
  Loader2,
  MonitorSmartphone,
  Plus,
  Stars,
  UserRound,
  Rocket,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import IconResolver from "@/components/official/icons/IconResolver.dynamic";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectShortcutsByAgentId } from "@/features/agents/redux/agent-shortcuts/selectors";
import { selectCategoryById } from "@/features/agents/redux/agent-shortcut-categories/selectors";
import type { AgentShortcutRecord } from "@/features/agents/redux/agent-shortcuts/types";

interface AgentShortcutsPanelProps {
  agentId: string;
  agentName: string;
  /** Base path for shortcut edit/new routes. Defaults to `/agents` (user route).
   *  Admin usage passes `/administration/system-agents/agents`. */
  basePath?: string;
}

export function AgentShortcutsPanel({
  agentId,
  agentName,
  basePath = "/agents",
}: AgentShortcutsPanelProps) {
  const router = useRouter();

  // Hydrate both global and user scopes into the slice. The selector below
  // filters across everything the current user can see.
  const globalQuery = useAgentShortcuts({ scope: "global" });
  const userQuery = useAgentShortcuts({ scope: "user" });

  const shortcuts = useAppSelector((state) =>
    selectShortcutsByAgentId(state, agentId),
  );

  const isLoading = globalQuery.isLoading || userQuery.isLoading;
  const error = globalQuery.error || userQuery.error;

  const userShortcuts = shortcuts.filter((s) => s.userId !== null);
  const globalShortcuts = shortcuts.filter(
    (s) =>
      s.userId === null &&
      s.organizationId === null &&
      s.projectId === null &&
      s.taskId === null,
  );
  const otherShortcuts = shortcuts.filter(
    (s) =>
      s.userId === null &&
      (s.organizationId !== null || s.projectId !== null || s.taskId !== null),
  );

  const goToEditor = (shortcutId: string) => {
    router.push(`${basePath}/${agentId}/shortcuts/${shortcutId}`);
  };

  return (
    <div className="h-full overflow-y-auto pt-12">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Shortcuts
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href={`${basePath}/${agentId}/shortcuts/batch`}>
              <Button size="sm" variant="outline">
                <Layers className="h-4 w-4 mr-1.5" />
                Batch
              </Button>
            </Link>
            <Link href={`${basePath}/${agentId}/shortcuts/new`}>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                New shortcut
              </Button>
            </Link>
          </div>
        </header>

        {/* Counts */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <CountCard
            label="Your shortcuts"
            value={userShortcuts.length}
            icon={UserRound}
            tone="default"
            isLoading={isLoading}
          />
          <CountCard
            label="Global shortcuts"
            value={globalShortcuts.length}
            icon={Globe}
            tone="default"
            isLoading={isLoading}
          />
          <CountCard
            label="Other scopes"
            value={otherShortcuts.length}
            icon={Stars}
            tone="muted"
            isLoading={isLoading}
            help="Organization, project, or task scoped shortcuts you can see."
          />
        </section>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Failed to load shortcuts: {error}
          </div>
        )}

        {/* List */}
        <section className="space-y-3">
          {isLoading && shortcuts.length === 0 ? (
            <Card className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading shortcuts…
            </Card>
          ) : shortcuts.length === 0 ? (
            <EmptyState agentId={agentId} basePath={basePath} />
          ) : (
            <div className="space-y-2">
              {shortcuts.map((shortcut) => (
                <ShortcutRow
                  key={shortcut.id}
                  shortcut={shortcut}
                  onOpen={() => goToEditor(shortcut.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function CountCard({
  label,
  value,
  icon: Icon,
  tone,
  isLoading,
  help,
}: {
  label: string;
  value: number;
  icon: typeof UserRound;
  tone: "default" | "muted";
  isLoading: boolean;
  help?: string;
}) {
  return (
    <Card
      className={cn(
        "p-4 flex items-start gap-3",
        tone === "muted" && "bg-muted/30",
      )}
    >
      <div className="shrink-0 rounded-md bg-primary/10 text-primary p-2">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">
          {label}
        </div>
        <div className="text-2xl font-semibold text-foreground leading-none mt-1">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            value
          )}
        </div>
        {help && (
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
            {help}
          </p>
        )}
      </div>
    </Card>
  );
}

function ShortcutRow({
  shortcut,
  onOpen,
}: {
  shortcut: AgentShortcutRecord;
  onOpen: () => void;
}) {
  const category = useAppSelector((state) =>
    selectCategoryById(state, shortcut.categoryId),
  );

  const scopeBadge = getScopeBadge(shortcut);
  const surface = shortcut.surfaceName
    ? splitSurfaceName(shortcut.surfaceName)
    : null;
  const surfaceLocal = surface ? prettifySurface(surface.local) : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors",
        "hover:bg-accent hover:border-accent-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="shrink-0 rounded-md bg-primary/10 text-primary p-2">
        {shortcut.iconName ? (
          <IconResolver iconName={shortcut.iconName} size={16} />
        ) : (
          <MonitorSmartphone className="h-4 w-4" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {/* Primary value = the surface (the UI the shortcut links to) */}
        <div className="flex items-center gap-2 flex-wrap">
          {surfaceLocal ? (
            <span className="text-sm font-semibold text-foreground truncate">
              {surfaceLocal}
            </span>
          ) : (
            <span className="text-sm font-semibold text-muted-foreground italic truncate">
              No surface
            </span>
          )}
          {surface?.client && (
            <Badge
              variant="outline"
              className="text-[10px] h-4 px-1.5 font-mono text-muted-foreground"
            >
              {surface.client}
            </Badge>
          )}
          <Badge
            variant={scopeBadge.variant}
            className="text-[10px] h-4 px-1.5"
          >
            <scopeBadge.icon className="h-2.5 w-2.5 mr-0.5" />
            {scopeBadge.label}
          </Badge>
          {!shortcut.isActive && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">
              Inactive
            </Badge>
          )}
          {shortcut.keyboardShortcut && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
              <KeyRound className="h-2.5 w-2.5" />
              {shortcut.keyboardShortcut}
            </span>
          )}
        </div>
        {/* Secondary = raw surface path · shortcut label · category */}
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
          {shortcut.surfaceName && (
            <span className="font-mono truncate">{shortcut.surfaceName}</span>
          )}
          <span aria-hidden>·</span>
          <span className="truncate">{shortcut.label}</span>
          {category && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">
                {category.placementType} · {category.label}
              </span>
            </>
          )}
        </div>
      </div>

      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

/** `matrx-user/notes` → `{ client: "matrx-user", local: "notes" }`. */
function splitSurfaceName(fullName: string): { client: string; local: string } {
  const idx = fullName.indexOf("/");
  if (idx < 0) return { client: "", local: fullName };
  return { client: fullName.slice(0, idx), local: fullName.slice(idx + 1) };
}

/** `chat-voice` → `Chat Voice`. */
function prettifySurface(s: string): string {
  return s
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function EmptyState({
  agentId,
  basePath,
}: {
  agentId: string;
  basePath: string;
}) {
  return (
    <Card className="p-6 flex flex-col items-center text-center gap-3">
      <div className="rounded-full bg-primary/10 text-primary p-3">
        <Rocket className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">
          No shortcuts for this agent yet
        </div>
        <p className="text-xs text-muted-foreground max-w-sm">
          Shortcuts let you launch this agent from menus, keyboard hotkeys,
          context menus, and other surfaces across the app.
        </p>
      </div>
      <Link href={`${basePath}/${agentId}/shortcuts/new`}>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1.5" />
          Create the first one
        </Button>
      </Link>
    </Card>
  );
}

type ScopeBadge = {
  label: string;
  icon: typeof UserRound;
  variant: "default" | "secondary" | "outline";
};

function getScopeBadge(shortcut: AgentShortcutRecord): ScopeBadge {
  if (shortcut.userId) {
    return { label: "Yours", icon: UserRound, variant: "secondary" };
  }
  if (
    shortcut.organizationId === null &&
    shortcut.projectId === null &&
    shortcut.taskId === null
  ) {
    return { label: "Global", icon: Globe, variant: "default" };
  }
  return { label: "Shared", icon: Stars, variant: "outline" };
}
