"use client";

// HeaderDemoClient — Live interactive demo of all header center-zone variants.
// Select a card to inject that variant into the real header above.

import { useState } from "react";
import { cn } from "@/lib/utils";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import HeaderToggle from "@/features/shell/components/header/variants/variants/HeaderToggle";
import HeaderIconTitle from "@/features/shell/components/header/variants/variants/HeaderIconTitle";
import HeaderPills from "@/features/shell/components/header/variants/variants/HeaderPills";
import HeaderTabs from "@/features/shell/components/header/variants/variants/HeaderTabs";
import type {
  HeaderAction,
  HeaderOption,
  HeaderDropdownOption,
} from "@/features/shell/components/header/variants/types";

// ─── Typed demo data ─────────────────────────────────────────────────────────

type ViewValue = "grid" | "list" | "kanban";
type ToggleValue = "notes" | "folders";
type PillValue = "all" | "msgs" | "tasks" | "files";
type TabValue = "recent" | "starred" | "archive";

const ACTIONS: HeaderAction[] = [
  { icon: "Plus", label: "New Item", onPress: () => {} },
  { icon: "SlidersHorizontal", label: "Filter", onPress: () => {} },
  { icon: "Trash2", label: "Delete", onPress: () => {}, destructive: true },
];

const VIEW_OPTIONS: HeaderDropdownOption<ViewValue>[] = [
  { label: "Grid", value: "grid", icon: "LayoutGrid" },
  { label: "List", value: "list", icon: "List" },
  { label: "Kanban", value: "kanban", icon: "Columns3" },
];

const TOGGLE_OPTIONS: [HeaderOption<ToggleValue>, HeaderOption<ToggleValue>] = [
  { icon: "StickyNote", label: "Notes", value: "notes" },
  { icon: "Folder", label: "Folders", value: "folders" },
];

const PILL_OPTIONS: [
  HeaderOption<PillValue>,
  HeaderOption<PillValue>,
  HeaderOption<PillValue>,
  HeaderOption<PillValue>,
] = [
  { icon: "Layers", label: "All", value: "all", badge: 12 },
  { icon: "MessageCircle", label: "Msgs", value: "msgs" },
  { icon: "SquareCheck", label: "Tasks", value: "tasks", badge: 3 },
  { icon: "File", label: "Files", value: "files" },
];

const TAB_OPTIONS: [
  HeaderOption<TabValue>,
  HeaderOption<TabValue>,
  HeaderOption<TabValue>,
] = [
  { label: "Recent", value: "recent", badge: 5 },
  { label: "Starred", value: "starred" },
  { label: "Archive", value: "archive" },
];

// ─── Variant card metadata ────────────────────────────────────────────────────

type VariantId = "v1" | "v2" | "v2d" | "v3" | "v4" | "v5" | "v6";

const VARIANTS: {
  id: VariantId;
  num: number | string;
  title: string;
  description: string;
  note?: string;
}[] = [
  {
    id: "v1",
    num: 1,
    title: "Generic",
    description: "Raw slot — you own the entire center zone. Pass any content.",
    note: "Use when no other variant fits.",
  },
  {
    id: "v2",
    num: 2,
    title: "Structured",
    description:
      "Optional back · centered title · right-side action icons that auto-collapse to a bottom sheet on mobile.",
  },
  {
    id: "v2d",
    num: "2b",
    title: "Structured + Dropdown",
    description:
      "Same as V2 but the title is a tappable glass dropdown for switching views.",
    note: "Good for list/grid/kanban toggles.",
  },
  {
    id: "v3",
    num: 3,
    title: "Two-Way Toggle",
    description:
      "Apple Notes-style segmented toggle in the center. Exactly 2 options.",
    note: "Use for primary view switching within a route.",
  },
  {
    id: "v4",
    num: 4,
    title: "Icon & Title",
    description:
      "Branded icon + title lockup in a glass pill. Clean and centered.",
    note: "Best for named pages: Dashboard, Settings, Profile.",
  },
  {
    id: "v5",
    num: 5,
    title: "Four Pills",
    description: "Four pill buttons distributed across the full center zone.",
    note: "No back/actions — pills own the full zone.",
  },
  {
    id: "v6",
    num: 6,
    title: "Three Tabs",
    description:
      "Three compact underline-style tabs spanning the full center zone.",
    note: "No back/actions — tabs own the full zone.",
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function HeaderDemoClient() {
  const [active, setActive] = useState<VariantId>("v4");

  // Per-variant interactive state
  const [view, setView] = useState<ViewValue>("grid");
  const [toggle, setToggle] = useState<ToggleValue>("notes");
  const [pill, setPill] = useState<PillValue>("all");
  const [tab, setTab] = useState<TabValue>("recent");

  return (
    <>
      {/* ── Live header injection — only the active variant renders ── */}

      {active === "v1" && (
        <PageHeader>
          <span className="matrx-shell-glass h-[1.875rem] px-4 rounded-full text-[0.6875rem] font-medium text-(--shell-nav-text-hover) flex items-center gap-1.5">
            ✦ Your custom content here
          </span>
        </PageHeader>
      )}

      {active === "v2" && (
        <PageHeader>
          <HeaderStructured back title="Inventory" actions={ACTIONS} />
        </PageHeader>
      )}

      {active === "v2d" && (
        <PageHeader>
          <HeaderStructured<ViewValue>
            dropdown={{
              options: VIEW_OPTIONS,
              selected: view,
              onSelect: (v) => setView(v),
            }}
            actions={ACTIONS}
          />
        </PageHeader>
      )}

      {active === "v3" && (
        <PageHeader>
          <HeaderToggle<ToggleValue>
            back
            options={TOGGLE_OPTIONS}
            active={toggle}
            onChange={(v) => setToggle(v)}
            actions={[{ icon: "Search", label: "Search", onPress: () => {} }]}
          />
        </PageHeader>
      )}

      {active === "v4" && (
        <PageHeader>
          <HeaderIconTitle icon="LayoutDashboard" title="Dashboard" />
        </PageHeader>
      )}

      {active === "v5" && (
        <PageHeader>
          <HeaderPills<PillValue>
            options={PILL_OPTIONS}
            active={pill}
            onChange={(v) => setPill(v)}
          />
        </PageHeader>
      )}

      {active === "v6" && (
        <PageHeader>
          <HeaderTabs<TabValue>
            options={TAB_OPTIONS}
            active={tab}
            onChange={(v) => setTab(v)}
          />
        </PageHeader>
      )}

      {/* ── Page body ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 pt-20 px-4 max-w-2xl mx-auto">
        {/* Instruction banner */}
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/10">
          <svg
            className="w-4 h-4 shrink-0 text-primary mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="text-sm font-medium text-foreground">
              Select a variant to preview it in the header above
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The active variant is injected into the real transparent header
              center zone. All interactions — dropdowns, toggles, bottom sheets
              — work live.
            </p>
          </div>
        </div>

        {/* Variant cards */}
        {VARIANTS.map((v) => {
          const isActive = active === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setActive(v.id)}
              className={cn(
                "w-full text-left px-4 py-3.5 rounded-xl border transition-all duration-150 cursor-pointer",
                isActive
                  ? "bg-primary/5 border-primary/25 shadow-sm"
                  : "bg-card border-border hover:border-border/60 hover:bg-accent/30",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  {/* Variant number badge */}
                  <span
                    className={cn(
                      "shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-[0.625rem] font-bold mt-0.5 tabular-nums",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {v.num}
                  </span>

                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-sm font-semibold leading-tight",
                        isActive ? "text-primary" : "text-foreground",
                      )}
                    >
                      {v.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {v.description}
                    </p>
                    {v.note && (
                      <p className="text-[0.6875rem] text-muted-foreground/60 mt-1 italic">
                        {v.note}
                      </p>
                    )}
                  </div>
                </div>

                {/* Active dot */}
                <span
                  className={cn(
                    "shrink-0 w-2 h-2 rounded-full mt-2 transition-all duration-150",
                    isActive ? "bg-primary scale-125" : "bg-border",
                  )}
                />
              </div>
            </button>
          );
        })}

        {/* Import reference */}
        <div className="mt-1 px-4 py-3.5 rounded-xl bg-muted/40 border border-border">
          <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Components
          </p>
          <code className="block text-[0.6875rem] text-foreground font-mono leading-relaxed whitespace-pre-wrap break-all">
            {`import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import HeaderToggle from "@/features/shell/components/header/variants/variants/HeaderToggle";
import HeaderIconTitle from "@/features/shell/components/header/variants/variants/HeaderIconTitle";
import HeaderPills from "@/features/shell/components/header/variants/variants/HeaderPills";
import HeaderTabs from "@/features/shell/components/header/variants/variants/HeaderTabs";
import type { HeaderAction, HeaderOption, HeaderDropdownOption } from "@/features/shell/components/header/variants/types";`}
          </code>

          <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-1.5">
            CSS — import once in your route layout.tsx
          </p>
          <code className="block text-[0.6875rem] text-foreground font-mono leading-relaxed whitespace-pre-wrap break-all">
            {`import "@/features/shell/components/header/variants/header-variants.css";`}
          </code>
        </div>
      </div>
    </>
  );
}
