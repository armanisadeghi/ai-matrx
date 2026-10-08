"use client";

// row-token: none — a dev demo sample of the table shell over sample rows, not a record view

/**
 * /education/overview — an HONEST rebuild as a HUB (owner, 2026-10-03, feedback
 * items 3, 4, 6, 7: "currently horrible … a hub one level up the tree that
 * lists many dimensions at once").
 *
 * Same data, same decisions, new arrangement:
 *   - ONE read: `loadEducationSnapshot()`, exactly as the real home.
 *   - The SAME block signals (`BLOCKS` from the real home) decide which
 *     sections appear and in what order — nothing is shown here that the real
 *     page would hide, and nothing it shows is dropped.
 *   - The SAME tool registry projection (`toolNavigation`) gives every tool and
 *     its live count; coming-soon tools say so.
 *   - The SAME agent surface (`education-overview`) and right-click menu, the
 *     study-today snapshot publish, and the layout's mounts (offline outbox
 *     chip, age gate, the scroll assistant).
 *
 * The page is a hub: a KPI row at the top instead of description text, then
 * one section per DIMENSION (study today, kits, what is due, recent material,
 * every tool), each a compact list or grid with a "See all" door, with space
 * between the sections rather than padding inside them.
 *
 * Not reproduced: the education route layout's chat-beside-canvas workspace
 * (`ChatCanvasWorkspace`) — a demo route cannot sit inside that layout; the
 * page itself is unchanged by it.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  ChevronRight,
  Coffee,
  FilePlus2,
  Flame,
  FolderOpen,
  LayoutGrid,
  Library,
  LibraryBig,
  MoreHorizontal,
  Package,
  Plus,
  RefreshCw,
  Rows3,
  TableProperties,
  Users,
} from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { ScrollAssistantLauncher } from "@ai-matrx/chat/agents/components/ambient-assistant/ScrollAssistantLauncher";
import { ItemMenu } from "@ai-matrx/design-system/item";
import { ComingSoonBadge } from "@/components/coming-soon/ComingSoonBadge";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import ShellIcon from "@/features/shell/components/ShellIcon";
import { CrumbTrailHeader, type CrumbOption } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { EDUCATION_OVERVIEW_SURFACE_NAME } from "@/features/surfaces/manifests/education-overview.manifest";
import { MandateDoorLink } from "@/features/mandates/components/MandateDoorLink";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import { cn } from "@/lib/utils";
import { EDUCATION_NAV_ITEMS } from "@/features/education/components/EducationHeader";
import { InstallStudyAppButton } from "@/features/education/components/InstallStudyAppButton";
import { OfflineStudySyncMount } from "@/features/education/study/offline/OfflineStudySyncMount";
import { EducationAgeGateMount } from "@/features/education/compliance/EducationAgeGateMount";
import { BLOCKS, toolNavigation } from "@/features/education/home/EducationHome";
import { loadEducationSnapshot } from "@/features/education/home/snapshot";
import { useSignedIn } from "@/lib/scoped-config/useSignedIn";
import { buildEducationOverviewScope } from "@/features/education/home/overviewSurfaceScope";
import { missingFormatsFor } from "@/features/education/home/nudges";
import type { EducationSnapshot } from "@/features/education/home/types";
import { setStudyTodaySnapshot } from "@/features/education/study/dashboard/studyTodaySnapshot";
import { modeReviewHref, modeWeakHref } from "@/features/education/study/dashboard/nextActions";
import { EDU_NAV_GROUPS, EDU_TOOL_NAV } from "@/features/education/lib/education-nav";
import { targetVisual } from "@/features/education/library/artifactVisuals";
import { kitHref, type StudyKit } from "@/features/education/kits/kitService";
import { EDUCATION_LIBRARY_COLUMNS } from "@/features/education/library/columns";
import { EducationLibraryCards } from "@/features/education/library/components/EducationLibraryCards";
import { EducationLibraryRows } from "@/features/education/library/components/EducationLibraryRows";
import { educationLibraryHref } from "@/features/education/library/types";
import { educationLibraryMenuFor } from "@/features/education/library/useEducationLibraryRowActions";
import { EDU_START_HREF } from "@/features/education/onboard/startRoutes";

import { KpiRow, type KpiRowItem } from "../../_components/page-top/kpi-row";
import { FeatureCards } from "../../_components/page-top/feature-cards";
import { Badge, Button, Chip, ChipSet, ControlRow, ControlScope, type SegmentOption, SegmentedControl } from "@ai-matrx/design-system/controls";

/* ------------------------------------------------------------------ */
/* Header — the sitewide crumb trail                                    */
/* ------------------------------------------------------------------ */

const EDU_SECTIONS: CrumbOption[] = EDUCATION_NAV_ITEMS.map((i) => ({
  label: i.name,
  href: i.href,
  active: i.href === "/education/overview",
}));

/* ------------------------------------------------------------------ */
/* Section shell — 13px title, 11px meta, actions, a "See all" door     */
/* ------------------------------------------------------------------ */

function Section({
  title,
  meta,
  actions,
  seeAll,
  children,
  id,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  seeAll?: { href: string; label: string };
  children: ReactNode;
  id: string;
}) {
  return (
    <section aria-labelledby={`edu-${id}`} className="flex flex-col gap-2">
      <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1">
        <h2 id={`edu-${id}`} className="text-[0.8125rem] font-semibold text-foreground">
          {title}
        </h2>
        {meta ? <div className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">{meta}</div> : null}
        <span className="flex-1" />
        {actions ? <ControlRow>{actions}</ControlRow> : null}
        {seeAll ? (
          <Link
            href={seeAll.href}
            className="inline-flex h-7 cursor-pointer items-center gap-0.5 px-[3px] text-xs font-medium text-primary hover:underline"
          >
            {seeAll.label}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Quiet text link at 12px, the height of the one control. */
function QuietLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mx-[3px] inline-flex h-7 cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* KPI row — the page top                                               */
/* ------------------------------------------------------------------ */

function kpis(s: EducationSnapshot | null): KpiRowItem[] {
  const a = s?.availability;
  const read = (lane: keyof EducationSnapshot["availability"]) =>
    s == null ? { status: "loading" as const } : a?.[lane].state === "unavailable" ? { status: "error" as const, error: new Error(`${lane} unavailable`) } : { status: "ready" as const };
  return [
    { id: "kits", label: "Study kits", value: s?.kits.total ?? null, read: read("kits"), href: "/education/kits", hint: "Material + what was made from it" },
    { id: "library", label: "Library", value: s?.library.total ?? null, read: read("library"), href: "/education/library", hint: "Study items you own" },
    {
      id: "due",
      label: "Due now",
      value: s?.study.totalDue ?? null,
      read: read("mastery"),
      href: "/education/progress",
      tone: (s?.study.totalDue ?? 0) > 0 ? "warn" : "neutral",
      hint: "Items ready for review",
    },
    {
      id: "weak",
      label: "Weak",
      value: s?.study.totalWeak ?? null,
      read: read("mastery"),
      href: "/education/progress",
      tone: (s?.study.totalWeak ?? 0) > 0 ? "bad" : "neutral",
      hint: "Items you keep missing",
    },
    {
      id: "streak",
      label: "Streak",
      value: s ? `${s.study.streakDays} ${s.study.streakDays === 1 ? "day" : "days"}` : null,
      read: read("streak"),
      href: "/education/progress",
      tone: (s?.study.streakDays ?? 0) > 0 ? "good" : "neutral",
    },
    { id: "goals", label: "Active goals", value: s?.study.goals.length ?? null, read: read("goals"), href: "/education/planner" },
  ];
}

/* ------------------------------------------------------------------ */
/* Dimension sections                                                   */
/* ------------------------------------------------------------------ */

function AvailabilityNotice({ snapshot, onRetry }: { snapshot: EducationSnapshot; onRetry: () => void }) {
  const unavailable = Object.entries(snapshot.availability)
    .filter(([, status]) => status.state === "unavailable")
    .map(([lane]) => lane);
  if (unavailable.length === 0) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 py-1 pl-3 pr-[9px]">
      <span className="min-w-0 flex-1 text-xs text-foreground">
        {unavailable.join(", ")} didn&apos;t load — those counts show “—”.
      </span>
      <ErrorAlchemyMenu />
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw aria-hidden /> Retry
      </Button>
    </div>
  );
}

/** Empty account: the ingest leads; three secondary doors (StartHereBlock's four links). */
function StartHereSection() {
  return (
    <Section id="start" title="Start here">
      <Link
        href="/education/kits/new"
        className="group flex cursor-pointer items-center gap-3 rounded-lg border border-primary/30 bg-gradient-to-r from-primary/[0.08] to-transparent py-2 pl-3 pr-[9px] transition-colors hover:border-primary/60"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
          <FilePlus2 className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.8125rem] font-semibold">Create a study kit</span>
          <span className="block truncate text-xs text-muted-foreground">Bring in material — get cards, quizzes and more</span>
        </span>
        <Button asChild variant="primary"><span>
          Start <ArrowRight aria-hidden />
        </span></Button>
      </Link>
      <FeatureCards
        ariaLabel="Other ways to start"
        items={[
          { href: "/education/library/community", icon: LibraryBig, title: "Study what exists", line: "Community decks and quizzes", tone: "success" },
          { href: "/education/classes/join", icon: Users, title: "Join your class", line: "Your course, decks and dates", tone: "info" },
          { href: "/education/tutor", icon: AGENT_ICON, title: "Just ask a question", line: "The tutor knows your material", tone: "primary" },
        ]}
      />
    </Section>
  );
}

function StudyTodaySection({ snapshot }: { snapshot: EducationSnapshot }) {
  const { study, nextActions } = snapshot;
  const totalMinutes = nextActions.reduce((sum, a) => sum + (a.minutes ?? 0), 0);
  return (
    <Section
      id="today"
      title="Study today"
      meta={
        <>
          {totalMinutes > 0 ? <Badge tone="primary">~{totalMinutes} min</Badge> : null}
          {study.streakDays > 0 ? (
            <Badge tone="warning">
              <span className="inline-flex items-center gap-0.5">
                <Flame className="size-3" aria-hidden />
                {study.streakDays}-day streak
              </span>
            </Badge>
          ) : null}
        </>
      }
      actions={
        <>
          {/* Renders nothing unless this browser can install. */}
          <InstallStudyAppButton />
          {/* THE DOOR LAW — the education mandates the learner may re-point. */}
          <span className="mx-[3px] inline-flex h-7 items-center text-xs">
            <MandateDoorLink feature="education" label="Study agents" variant="inline" />
          </span>
          <QuietLink href="/education/progress">Progress</QuietLink>
        </>
      }
      seeAll={{ href: "/education/planner", label: study.plan ? "Open plan" : "Make a plan" }}
    >
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {study.isRestDay && nextActions.length === 0 ? (
          <div className="flex min-h-11 items-center gap-3 py-1.5 pl-3 pr-[9px]">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Coffee className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.8125rem] font-medium">Rest day — you&apos;ve earned it</div>
              <div className="truncate text-xs text-muted-foreground">Your plan protects today for recovery.</div>
            </div>
          </div>
        ) : nextActions.length === 0 ? (
          <div className="flex min-h-11 items-center gap-3 py-1.5 pl-3 pr-[9px]">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.8125rem] font-medium">You&apos;re all caught up</div>
              <div className="truncate text-xs text-muted-foreground">Nothing due — get ahead with a new set.</div>
            </div>
            <Button asChild variant="outline"><Link href="/education/library">
              Study something
            </Link></Button>
          </div>
        ) : (
          nextActions.map((action) => {
            const Icon = action.icon;
            return (
              <div key={action.key} className="hover:bg-accent/50 flex min-h-11 items-center gap-3 py-1 pl-3 pr-[9px]">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-[0.8125rem] font-medium">{action.label}</span>
                    {action.minutes != null ? (
                      <span className="shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground">~{action.minutes} min</span>
                    ) : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{action.why}</div>
                </div>
                {action.href ? (
                  <Button asChild variant="outline"><Link href={action.href}>
                    Start
                  </Link></Button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </Section>
  );
}

function KitCard({ kit }: { kit: StudyKit }) {
  const href = kitHref(kit.sourceType, kit.sourceId);
  const present = Array.from(
    new Map(
      kit.artifacts.map((a) => {
        const kind = a.targetKind ?? a.artifactType;
        return [kind, { artifact: a, visual: targetVisual(kind) }] as const;
      }),
    ).values(),
  );
  const missing = missingFormatsFor(kit);
  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-border bg-card transition-colors hover:border-primary/40">
      <Link href={href} className="group flex items-center gap-2.5 py-2 pl-3 pr-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
          <Package className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.8125rem] font-semibold">{kit.title}</span>
          <span className="block truncate text-[0.6875rem] text-muted-foreground">
            {present.length} {present.length === 1 ? "study aid" : "study aid types"}
            {kit.artifacts.length !== present.length ? ` · ${kit.artifacts.length} items` : ""} · {formatRelativeTime(kit.createdAt)}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
      <div className="px-3 pb-3">
      <ChipSet layout="grid">
        {present.map(({ artifact, visual }) => {
          const Icon = visual.icon;
          return (
            <Chip key={visual.label} asChild tone={visual.tone} icon={<Icon />} label={visual.label}>
              <Link href={artifact.href} />
            </Chip>
          );
        })}
      </ChipSet>
      </div>
      {missing.length > 0 ? (
        <div className="mt-auto border-t border-border px-3 pb-3 pt-2">
          <p className="mb-1.5 text-[0.6875rem] text-muted-foreground">Not in this kit yet</p>
          <ChipSet layout="grid">
            {missing.map((option) => {
              const Icon = option.visual.icon;
              return (
                <Chip key={option.target} asChild variant="add" icon={<Icon />} label={option.visual.label}>
                  <Link href={option.href} />
                </Chip>
              );
            })}
          </ChipSet>
        </div>
      ) : null}
    </article>
  );
}

function KitsSection({ snapshot }: { snapshot: EducationSnapshot }) {
  return (
    <Section
      id="kits"
      title="Your study kits"
      meta={<span>{snapshot.kits.total}</span>}
      actions={
        <Button asChild variant="quiet"><Link href="/education/kits/new">
          <Plus aria-hidden /> New kit
        </Link></Button>
      }
      seeAll={{ href: "/education/kits", label: `All ${snapshot.kits.total} kits` }}
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {snapshot.kits.recent.map((kit) => (
          <KitCard key={`${kit.sourceType}:${kit.sourceId}`} kit={kit} />
        ))}
      </div>
    </Section>
  );
}

function DueSection({ snapshot }: { snapshot: EducationSnapshot }) {
  const modes = snapshot.study.modes.filter((m) => m.due > 0 || m.weak > 0);
  const chip = (href: string | null, tone: "warning" | "destructive", icon: ReactNode, label: string) => {
    const cls = cn(
      "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[0.6875rem] font-medium",
      tone === "warning" ? "border-warning/60 bg-warning/15 text-foreground" : "border-destructive/40 bg-destructive/10 text-destructive-ink",
    );
    // A count is a door (THE DOOR LAW); a mode with no review surface stays honest text.
    return href ? (
      <Link href={href} className={cn(cls, "cursor-pointer hover:brightness-110")}>
        {icon}
        {label}
      </Link>
    ) : (
      <span className={cls}>
        {icon}
        {label}
      </span>
    );
  };
  return (
    <Section id="due" title="Waiting for you" seeAll={{ href: "/education/progress", label: "All progress" }}>
      <div className="grid gap-x-6 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2 lg:grid-cols-3">
        {modes.map((mode) => (
          <div key={mode.itemType} className="flex min-h-9 items-center gap-2 border-b border-border py-1 pl-3 pr-[9px] [&:nth-last-child(1)]:border-b-0">
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">{mode.label}</span>
            {mode.due > 0 ? chip(modeReviewHref(mode.itemType), "warning", <CalendarClock className="size-3.5" aria-hidden />, `${mode.due} due`) : null}
            {mode.weak > 0 ? chip(modeWeakHref(mode.itemType), "destructive", <Flame className="size-3.5" aria-hidden />, `${mode.weak} weak`) : null}
          </div>
        ))}
      </div>
    </Section>
  );
}

type RecentView = "table" | "cards" | "rows";

/** The real RecentBlock's body (same table / cards / rows components, same menus), restyled header. */
function RecentSection({ snapshot }: { snapshot: EducationSnapshot }) {
  const { prefs, setView } = useListViewPrefs("education-home-recent", { view: "table" });
  const view: RecentView = prefs.view === "cards" || prefs.view === "rows" || prefs.view === "table" ? prefs.view : "table";
  const tableColumns = EDUCATION_LIBRARY_COLUMNS.filter((column) =>
    ["title", "kind", "size", "progress", "due", "updated"].includes(column.id),
  ).map((column) => column.column);
  const views: SegmentOption<RecentView>[] = [
    { value: "table", label: "Table" },
    { value: "cards", label: "Cards" },
    { value: "rows", label: "Rows" },
  ];
  return (
    <Section
      id="recent"
      title="Recently created"
      actions={
        <>
          <span className="hidden sm:contents">
            <SegmentedControl data={views} value={view} onValueChange={setView} aria-label="Show recent study items as" />
          </span>
          <Button asChild variant="quiet"><Link href={EDU_START_HREF}>
            <FolderOpen aria-hidden /> Study a file you have
          </Link></Button>
        </>
      }
      seeAll={{ href: "/education/library", label: `Library (${snapshot.library.total})` }}
    >
      {/* Icons-only switch on a phone, where the labels would not fit. */}
      <div className="flex sm:hidden">
        <SegmentedControl
          aria-label="Show recent study items as"
          value={view}
          onValueChange={setView}
          data={([
            ["table", TableProperties],
            ["cards", LayoutGrid],
            ["rows", Rows3],
          ] as const).map(([id, Icon]) => ({ value: id, ariaLabel: id, label: <Icon className="size-4" aria-hidden /> }))}
        />
      </div>
      {view === "table" ? (
        <MatrxDataTable
          data={snapshot.library.recent}
          columns={[
            ...tableColumns,
            {
              id: "custom-actions",
              header: "Actions",
              sortable: false,
              filter: false,
              customActions: (row) => (
                <ItemMenu config={educationLibraryMenuFor(row)} align="end">
                  <Button variant="quiet" aria-label={`Actions for ${row.title}`} icon={<MoreHorizontal aria-hidden />} />
                </ItemMenu>
              ),
            },
          ]}
          getRowId={(row) => row.id}
          pageSize={0}
          zebra
          toolbar={{ search: true, searchPlaceholder: "Find recent study items…" }}
          mobileCards={(row) => (
            <EducationLibraryRows rows={[row]} density="comfortable" showShared={false} menuFor={educationLibraryMenuFor} hrefFor={educationLibraryHref} />
          )}
          emptyState={{ title: "No recent study items" }}
        />
      ) : view === "rows" ? (
        <EducationLibraryRows rows={snapshot.library.recent} density="comfortable" showShared={false} menuFor={educationLibraryMenuFor} hrefFor={educationLibraryHref} />
      ) : (
        <EducationLibraryCards rows={snapshot.library.recent} density="comfortable" showShared={false} menuFor={educationLibraryMenuFor} hrefFor={educationLibraryHref} />
      )}
    </Section>
  );
}

/** Every tool, grouped by what the learner is trying to do — each row a door with its live count. */
function ToolsSection({ snapshot }: { snapshot: EducationSnapshot }) {
  const tools = toolNavigation(snapshot);
  const groupOf = new Map(EDU_TOOL_NAV.map((t) => [t.slug, t.group]));
  return (
    <Section id="tools" title="All study tools" meta={<span>{tools.length}</span>}>
      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {EDU_NAV_GROUPS.map((group) => {
          const items = tools.filter((t) => groupOf.get(t.key) === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="flex min-w-0 flex-col gap-1.5">
              <h3 className="px-3 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">{group}</h3>
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {items.map((t) => (
                  <Link
                    key={t.key}
                    href={t.href}
                    title={t.description}
                    data-surface-value={t.value !== undefined ? `${t.key}_count` : undefined}
                    className="hover:bg-accent/50 flex min-h-9 cursor-pointer items-center gap-2 pl-3 pr-[9px]"
                  >
                    <span className="flex shrink-0 text-muted-foreground">
                      <ShellIcon name={t.iconName} size={16} strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem]">{t.label}</span>
                    {t.availability === "coming-soon" ? <ComingSoonBadge /> : null}
                    {t.state === "unavailable" ? (
                      <span className="text-[0.6875rem] text-muted-foreground">—</span>
                    ) : t.value !== undefined ? (
                      <span className="text-[0.6875rem] tabular-nums text-muted-foreground">{t.value}</span>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Loading — one skeleton per region                                    */
/* ------------------------------------------------------------------ */

function SectionSkeleton({ rows = 3, grid = false }: { rows?: number; grid?: boolean }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-32" />
      {grid ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex min-h-11 items-center gap-3 px-3">
              <Skeleton className="size-7 rounded-full" />
              <div className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-3.5" style={{ width: `${35 + ((i * 17) % 30)}%` }} />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

const RENDER: Record<string, (s: EducationSnapshot) => ReactNode> = {
  "start-here": () => <StartHereSection key="start-here" />,
  "study-today": (s) => <StudyTodaySection key="study-today" snapshot={s} />,
  kits: (s) => <KitsSection key="kits" snapshot={s} />,
  "due-by-mode": (s) => <DueSection key="due-by-mode" snapshot={s} />,
  recent: (s) => <RecentSection key="recent" snapshot={s} />,
};

export function EducationOverviewSample() {
  const [snapshot, setSnapshot] = useState<EducationSnapshot | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // The snapshot is the signed-in learner's own library: a signed-out visitor has none, and the
  // library RPCs refuse anon, so the read is not issued (re-runs the moment a person signs in).
  const signedIn = useSignedIn();

  // The real home's read and its study-today publish, unchanged.
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void loadEducationSnapshot().then((next) => {
      if (cancelled) return;
      setSnapshot(next);
      const hasSignal = next.nextActions.length > 0 || !!next.study.plan || next.study.streakDays > 0 || next.study.goals.length > 0;
      setStudyTodaySnapshot(
        hasSignal
          ? {
              has_active_plan: !!next.study.plan,
              is_rest_day: next.study.isRestDay,
              streak_days: next.study.streakDays,
              next_actions: next.nextActions.map((a) => ({ key: a.key, label: a.label, why: a.why, minutes: a.minutes, href: a.href })),
              total_minutes: next.nextActions.reduce((sum, a) => sum + (a.minutes ?? 0), 0),
            }
          : null,
      );
    });
    return () => {
      cancelled = true;
      setStudyTodaySnapshot(null);
    };
  }, [reloadKey, signedIn]);

  // The real home's block signals decide which sections show, and their order.
  const blocks = snapshot
    ? BLOCKS.map((block) => ({ id: block.id, signal: block.signal(snapshot) }))
        .filter((b): b is { id: string; signal: number } => b.signal !== null && RENDER[b.id] != null)
        .sort((a, b) => b.signal - a.signal)
    : [];
  const tools = snapshot ? toolNavigation(snapshot) : [];
  const getScope = () =>
    buildEducationOverviewScope({
      snapshot,
      visibleBlocks: blocks.map((b) => b.id),
      tools: tools.map((t) => ({ key: t.key, label: t.label, href: t.href, value: t.value, state: t.state, availability: t.availability })),
    });

  return (
    <>
      <CrumbTrailHeader
        backHref="/demos/ui-unification"
        trail={[
          { label: "Education", href: "/education/overview", options: EDU_SECTIONS, optionsLabel: "Education" },
          { label: "Study Hub", options: EDU_SECTIONS, optionsLabel: "Education" },
        ]}
      />
      {/* The education layout's mounts: offline outbox chip, the age gate, the scroll assistant. */}
      <OfflineStudySyncMount />
      <EducationAgeGateMount />
      <SurfaceRuntimeProvider surfaceName={EDUCATION_OVERVIEW_SURFACE_NAME} getScope={getScope}>
        <NonEditableContextMenu
          sourceFeature="education-analytics"
          surfaceName={EDUCATION_OVERVIEW_SURFACE_NAME}
          menuVersion={1}
          getApplicationScope={getScope}
          contentSource={{ type: "raw" }}
        >
          <ControlScope className="h-full">
            <main className="h-full overflow-y-auto bg-textured">
              {/* PAGE RHYTHM: gutter, page top and the block gap from the one scale; no bottom
                  padding — the shell's runway under this <main> is the page end, once. */}
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-[var(--matrx-page-block-gap)] px-[var(--matrx-page-gutter)] pt-[var(--matrx-page-top)]">
                {/* PAGE TOP — provenance + the page's two actions, then the KPI row. */}
                <div className="flex flex-col gap-3">
                  <div className="flex min-h-7 flex-wrap items-center gap-y-1">
                    <ControlRow nowrap>
                      <Button asChild variant="outline"><Link href="/education/library">
                        <Library aria-hidden /> Library
                      </Link></Button>
                      <Button asChild variant="primary"><Link href="/education/kits/new">
                        <Plus aria-hidden /> Create kit
                      </Link></Button>
                    </ControlRow>
                  </div>
                  <KpiRow items={kpis(snapshot)} ariaLabel="Your study at a glance" />
                </div>

                {!snapshot ? (
                  <>
                    <SectionSkeleton rows={4} />
                    <SectionSkeleton grid />
                    <SectionSkeleton rows={5} />
                  </>
                ) : (
                  <>
                    <AvailabilityNotice snapshot={snapshot} onRetry={() => setReloadKey((k) => k + 1)} />
                    {blocks.map((b) => RENDER[b.id]!(snapshot))}
                    <ToolsSection snapshot={snapshot} />
                  </>
                )}
              </div>
            </main>
          </ControlScope>
        </NonEditableContextMenu>
      </SurfaceRuntimeProvider>
      <ScrollAssistantLauncher inputVariant="text-voice" />
    </>
  );
}
