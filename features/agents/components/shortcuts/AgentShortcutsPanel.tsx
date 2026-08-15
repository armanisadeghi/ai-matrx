"use client";

/**
 * AgentShortcutsPanel
 *
 * Landing UI for `/agents/[id]/shortcuts/`. Shows the user how many shortcuts
 * (user-owned + global) target this agent and lets them click through to the
 * standalone shortcut editor route at `/agents/[id]/shortcuts/[shortcutId]`.
 *
 * Data: hydrates both `global` and `user` scopes via `useAgentShortcuts`, then
 * filters via `selectShortcutsByAgentId`. The only write on this page is
 * "Link shortcut" (`LinkAgentToShortcutModal`) — the fast path that either
 * mints a shortcut already pointing at this agent or adopts an existing
 * unlinked one. Full authoring still routes to `.../shortcuts/new`.
 */

import type { ComponentProps } from "react";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Globe,
  KeyRound,
  Layers,
  Loader2,
  MonitorSmartphone,
  Link2,
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
import IconResolver from "@/components/official/icons/IconResolver";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import { LinkAgentToShortcutModal } from "@/features/agent-shortcuts/components/LinkAgentToShortcutModal";
import type { AgentScope } from "@/features/agent-shortcuts/constants";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectShortcutsByAgentId } from "@/features/agents/redux/agent-shortcuts/selectors";
import { selectAllCategoriesMap } from "@/features/agents/redux/agent-shortcut-categories/selectors";
import type { AgentShortcutRecord } from "@/features/agents/redux/agent-shortcuts/types";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import {
  agentShortcutPanelCsvRows,
  agentShortcutPanelRowSummary,
  agentShortcutsPanelKpis,
  buildAgentShortcutPanelBriefs,
  buildAgentShortcutPanelRow,
  type AgentShortcutPanelRow,
  type AgentShortcutsPanelKpis,
} from "@/features/agent-shortcuts/format";

interface AgentShortcutsPanelProps {
  agentId: string;
  agentName: string;
  /** Base path for shortcut edit/new routes. Defaults to `/agents` (user route).
   *  Admin usage passes `/administration/agents/system-agents/agents`. */
  basePath?: string;
  /** Passed straight through to the link modal so a newly-minted shortcut
   *  inherits the agent's own description instead of an empty one. */
  agentDescription?: string | null;
  /** The agent's declared variables — what `ScopeMappingEditor` inside the link
   *  modal offers to map onto scope keys. Empty is valid (no variables). */
  agentVariableDefinitions?: { name: string }[];
  /** Which shortcut scope the link modal writes into. `user` on the (core)
   *  route (my shortcuts); the system-agents admin route passes `global`.
   *  Never inferred from the URL — the callsite owns it. */
  linkScope?: AgentScope;
}

export function AgentShortcutsPanel({
  agentId,
  agentName,
  basePath = "/agents",
  agentDescription = null,
  agentVariableDefinitions,
  linkScope = "user",
}: AgentShortcutsPanelProps) {
  const router = useRouter();
  const [linkOpen, setLinkOpen] = useState(false);

  // Hydrate both global and user scopes into the slice. The selector below
  // filters across everything the current user can see.
  const globalQuery = useAgentShortcuts({ scope: "global" });
  const userQuery = useAgentShortcuts({ scope: "user" });

  const shortcuts = useAppSelector((state) =>
    selectShortcutsByAgentId(state, agentId),
  );

  // Names for org-scoped shortcuts, so "Shared" rows can name AND open the org.
  const { organizations } = useUserOrganizations();

  // Every category the slice knows about — the panel builds ALL row
  // projections here (one shared shape for the row, the list copy, and the
  // exports) instead of each row re-deriving its own.
  const categoriesById = useAppSelector(selectAllCategoriesMap);

  const isLoading = globalQuery.isLoading || userQuery.isLoading;
  const error = globalQuery.error || userQuery.error;
  /** The exact sentence the error banner renders. Captured verbatim. */
  const errorText = error ? `Failed to load shortcuts: ${error}` : null;

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

  // ── Copy / export ────────────────────────────────────────────────────
  const location = `AI Matrx — Agent shortcuts (${basePath}/${agentId}/shortcuts)`;
  const kpis = agentShortcutsPanelKpis({
    user: userShortcuts,
    global: globalShortcuts,
    other: otherShortcuts,
  });
  const orgNameFor = (shortcut: AgentShortcutRecord) =>
    shortcut.organizationId
      ? (organizations.find((o) => o.id === shortcut.organizationId)?.name ??
        null)
      : null;
  const panelRowFor = (shortcut: AgentShortcutRecord): AgentShortcutPanelRow =>
    buildAgentShortcutPanelRow(shortcut, {
      category: categoriesById[shortcut.categoryId] ?? null,
      orgName: orgNameFor(shortcut),
      editorHref: `${basePath}/${agentId}/shortcuts/${shortcut.id}`,
    });
  const panelRows = shortcuts.map(panelRowFor);

  /** The page as data: its counts, its error, and its rendered rows. */
  const pageView = () => ({
    agent: { id: agentId, name: agentName },
    kpis,
    state: isLoading ? "loading" : errorText ? "error" : "loaded",
    error_on_screen: errorText,
    shortcuts: panelRows,
  });

  const pageHuman = () =>
    [
      `Shortcuts for agent: ${agentName}`,
      `Agent ID: ${agentId}`,
      `Your shortcuts: ${kpis.your_shortcuts} · Global shortcuts: ${kpis.global_shortcuts} · Other scopes: ${kpis.other_scope_shortcuts}`,
      errorText ? `\nERROR ON SCREEN: ${errorText}` : null,
      "",
      panelRows.length
        ? panelRows
            .map((r) => `- ${agentShortcutPanelRowSummary(r)}`)
            .join("\n")
        : "No shortcuts for this agent yet.",
    ]
      .filter((line) => line !== null)
      .join("\n");

  const countCardCopy = (label: string, value: number, help?: string) => ({
    label: `${label} (agent shortcuts)`,
    human: () =>
      `${label}: ${value} — shortcuts targeting ${agentName}${help ? ` (${help})` : ""}`,
    agent: () => ({
      kind: "agent-shortcuts-count",
      location,
      description: `The "${label}" count card on the shortcuts panel for ${agentName}.`,
      data: { metric: label, value, detail: help ?? null },
      attributes: { ...kpis, metric: label, agent_id: agentId },
      context: { agent_name: agentName },
    }),
  });

  return (
    <div className="h-full overflow-y-auto pt-12">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Shortcuts
            </div>
            {/* The agent these shortcuts target — a door, not a label. */}
            <EntityRef
              token="agent"
              id={agentId}
              name={agentName}
              href={`${basePath}/${agentId}`}
              alwaysShowActions
              className="text-base font-semibold text-foreground"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <CopyButtons
              size="icon"
              label={`Shortcuts for ${agentName}`}
              human={pageHuman}
              json={pageView}
              agent={() => ({
                kind: "agent-shortcuts-panel",
                location,
                description: `The shortcuts panel for ${agentName} as rendered: its three counts, any error on screen, and every shortcut row (surface first, then scope, category and hotkey).`,
                data: pageView(),
                summary: pageHuman(),
                attributes: { ...kpis, agent_id: agentId },
                context: { agent_name: agentName, base_path: basePath },
              })}
              agentVariant={{
                label: "This panel (what I see)",
                hint: "Counts, error, and every rendered row",
                position: "first",
              }}
              aiVariants={[
                {
                  id: "briefs",
                  label: "Briefs only",
                  hint: "Surface · scope · label · hotkey per shortcut",
                  build: () => ({
                    kind: "agent-shortcuts-panel-briefs",
                    location,
                    description: `Short briefs for all ${panelRows.length} shortcut(s) targeting ${agentName} — one line of identity each, no execution config.`,
                    data: {
                      agent: { id: agentId, name: agentName },
                      kpis,
                      error_on_screen: errorText,
                      shortcuts: buildAgentShortcutPanelBriefs(panelRows),
                    },
                    attributes: { ...kpis, agent_id: agentId },
                    context: { agent_name: agentName },
                  }),
                },
                {
                  id: "everything",
                  label: "Everything (full records)",
                  hint: "Rendered rows + the raw shortcut records",
                  build: () => ({
                    kind: "agent-shortcuts-panel-full",
                    location,
                    description: `Every shortcut targeting ${agentName}: the rendered rows plus the complete underlying records (execution config, mappings, variable definitions, context slots).`,
                    data: { ...pageView(), records: shortcuts },
                    summary: pageHuman(),
                    attributes: { ...kpis, agent_id: agentId },
                    context: { agent_name: agentName },
                  }),
                },
              ]}
            />
            <ExportMenu
              label={`agent-shortcuts-${agentName}`}
              items={[
                jsonExportItem(pageView, "JSON (panel data)"),
                jsonExportItem(() => shortcuts, "JSON (full records)"),
                csvExportItem(
                  () => agentShortcutPanelCsvRows(panelRows),
                  "CSV (all shortcuts)",
                ),
              ]}
            />
            <Link href={`${basePath}/${agentId}/shortcuts/batch`}>
              <Button size="sm" variant="outline">
                <Layers className="h-4 w-4 mr-1.5" />
                Batch
              </Button>
            </Link>
            {/* The fast path: mint a shortcut already pointing at this agent,
                or adopt an existing unlinked one. `/shortcuts/new` is the full
                authoring form and stays the primary action. */}
            <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
              <Link2 className="h-4 w-4 mr-1.5" />
              Link shortcut
            </Button>
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
            copy={countCardCopy("Your shortcuts", userShortcuts.length)}
          />
          <CountCard
            label="Global shortcuts"
            value={globalShortcuts.length}
            icon={Globe}
            tone="default"
            isLoading={isLoading}
            copy={countCardCopy("Global shortcuts", globalShortcuts.length)}
          />
          <CountCard
            label="Other scopes"
            value={otherShortcuts.length}
            icon={Stars}
            tone="muted"
            isLoading={isLoading}
            help="Organization, project, or task scoped shortcuts you can see."
            copy={countCardCopy(
              "Other scopes",
              otherShortcuts.length,
              "Organization, project, or task scoped shortcuts you can see.",
            )}
          />
        </section>

        {/* Error */}
        {errorText && (
          <div className="group/error flex items-start justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>{errorText}</span>
            <span className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/error:opacity-100">
              <CopyButtons
                size="xs"
                label="Shortcuts load error"
                human={() => `${errorText}\n\n${pageHuman()}`}
                agent={() => ({
                  kind: "agent-shortcuts-panel-error",
                  location,
                  description:
                    "The error banner rendered on the agent shortcuts panel, with the page state it is blocking.",
                  data: {
                    error_on_screen: errorText,
                    agent: { id: agentId, name: agentName },
                    kpis,
                    shortcuts_still_rendered: panelRows.length,
                  },
                  attributes: { ...kpis, agent_id: agentId, has_error: true },
                  context: { agent_name: agentName },
                })}
              />
            </span>
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
            <EmptyState
              agentId={agentId}
              basePath={basePath}
              onLink={() => setLinkOpen(true)}
            />
          ) : (
            <div className="space-y-2">
              {shortcuts.map((shortcut, index) => (
                <ShortcutRow
                  key={shortcut.id}
                  shortcut={shortcut}
                  row={panelRows[index]}
                  editorHref={`${basePath}/${agentId}/shortcuts/${shortcut.id}`}
                  orgName={orgNameFor(shortcut)}
                  kpis={kpis}
                  location={location}
                  onOpen={() => goToEditor(shortcut.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <LinkAgentToShortcutModal
        scope={linkScope}
        isOpen={linkOpen}
        onClose={() => setLinkOpen(false)}
        agent={{
          id: agentId,
          name: agentName,
          description: agentDescription,
          variableDefinitions: agentVariableDefinitions ?? [],
          // No pinned version row is loaded here, so "always use latest" is the
          // only honest default — pinning to a version happens in the editor.
          useLatest: true,
          currentVersionId: null,
        }}
        onSuccess={(shortcutId) => {
          // The slice is scope-keyed; the new row lands in whichever scope the
          // modal wrote to, so refetch both this panel reads.
          globalQuery.refetch();
          userQuery.refetch();
          router.push(`${basePath}/${agentId}/shortcuts/${shortcutId}`);
        }}
      />
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
  copy,
}: {
  label: string;
  value: number;
  icon: typeof UserRound;
  tone: "default" | "muted";
  isLoading: boolean;
  help?: string;
  /** Hover-revealed copy pair for this metric — a scalar, so no JSON flavor. */
  copy: ComponentProps<typeof CopyButtons>;
}) {
  return (
    <Card
      className={cn(
        "group/card p-4 flex items-start gap-3",
        tone === "muted" && "bg-muted/30",
      )}
    >
      <div className="shrink-0 rounded-md bg-primary/10 text-primary p-2">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">
            {label}
          </div>
          <span className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/card:opacity-100">
            <CopyButtons size="xs" {...copy} />
          </span>
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
  row,
  editorHref,
  orgName,
  kpis,
  location,
  onOpen,
}: {
  shortcut: AgentShortcutRecord;
  /** This row's rendered projection — built once by the panel and shared by
   *  the row, the list copy, and the exports. */
  row: AgentShortcutPanelRow;
  /** Canonical editor route for this shortcut (basePath-aware). */
  editorHref: string;
  /** Resolved org name for org-scoped shortcuts; null when not org-scoped
   *  (or the org isn't one of the viewer's). */
  orgName: string | null;
  /** The panel's three count cards, mirrored into every row payload. */
  kpis: AgentShortcutsPanelKpis;
  location: string;
  onOpen: () => void;
}) {
  const category = row.category
    ? { placementType: row.category_placement, label: row.category }
    : null;

  const scopeBadge = getScopeBadge(shortcut);
  const surfaceLabel = shortcut.surfaceName
    ? getSurfaceDisplayLabel(shortcut.surfaceName)
    : null;
  const surfaceClient =
    shortcut.surfaceName && shortcut.surfaceName.includes("/")
      ? shortcut.surfaceName.slice(0, shortcut.surfaceName.indexOf("/"))
      : "";

  return (
    // Div-with-button-semantics, not a <button>: the EntityRef doors inside
    // (peek / new tab) are interactive and may not nest in a <button>.
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        // Only when the row itself is focused — keydown from a nested door
        // (link/peek) bubbles here and must not also open the editor.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group/row w-full flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors cursor-pointer",
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
          {surfaceLabel ? (
            <span className="text-sm font-semibold text-foreground truncate">
              {surfaceLabel}
            </span>
          ) : (
            <span className="text-sm font-semibold text-muted-foreground italic truncate">
              No surface
            </span>
          )}
          {surfaceClient && (
            <Badge
              variant="outline"
              className="text-[10px] h-4 px-1.5 font-mono text-muted-foreground"
            >
              {surfaceClient}
            </Badge>
          )}
          <Badge
            variant={scopeBadge.variant}
            className="text-[10px] h-4 px-1.5"
          >
            <scopeBadge.icon className="h-2.5 w-2.5 mr-0.5" />
            {scopeBadge.label}
          </Badge>
          {/* Org-scoped shortcuts name the org WITH a door, not a bare "Shared". */}
          {shortcut.organizationId && orgName ? (
            <EntityRef
              token="organization"
              id={shortcut.organizationId}
              name={orgName}
              showIcon={false}
              className="text-[11px] text-muted-foreground"
            />
          ) : null}
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
        {/* Secondary = raw surface path · shortcut label (a door: open/new-tab/peek) · category */}
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
          {shortcut.surfaceName && (
            <span className="font-mono truncate">{shortcut.surfaceName}</span>
          )}
          <span aria-hidden>·</span>
          <EntityRef
            token="agent_shortcut"
            id={shortcut.id}
            name={shortcut.label}
            href={editorHref}
            showIcon={false}
            className="truncate"
          />
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

      <span className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
        <CopyButtons
          size="xs"
          label={row.label}
          human={() => agentShortcutPanelRowSummary(row)}
          json={() => row}
          agent={() => ({
            kind: "agent-shortcut-row",
            location,
            description:
              "One shortcut row from the agent's shortcuts panel, as rendered: the surface it targets, its scope, category, hotkey and launch config.",
            data: { rendered_row: row, record: shortcut },
            summary: agentShortcutPanelRowSummary(row),
            attributes: {
              ...kpis,
              shortcut_id: row.id,
              scope: row.scope,
              surface: row.surface_name,
              is_active: row.is_active,
            },
            context: { organization: orgName, editor_href: editorHref },
          })}
        />
      </span>

      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  );
}

function EmptyState({
  agentId,
  basePath,
  onLink,
}: {
  agentId: string;
  basePath: string;
  onLink: () => void;
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
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <Button size="sm" onClick={onLink}>
          <Link2 className="h-4 w-4 mr-1.5" />
          Link this agent to a shortcut
        </Button>
        <Link href={`${basePath}/${agentId}/shortcuts/new`}>
          <Button size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1.5" />
            Create the first one
          </Button>
        </Link>
      </div>
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
