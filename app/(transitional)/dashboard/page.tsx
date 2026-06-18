"use client";
// Layout switching is CSS-only (block md:hidden / hidden md:block) so there
// is ZERO layout shift regardless of hydration timing.
// Only the user-data sections (profile, stats) depend on client Redux state.

import React from "react";
import {
  Zap,
  BarChart3,
  Clock,
  Database,
  Cpu,
  MessageSquare,
  Brain,
  Settings,
  User,
  Building2,
  ImageIcon,
} from "lucide-react";
import Image from "next/image";
import { Grid } from "@/components/official/card-and-grid/Grid";
import type { CardProps } from "@/components/official/card-and-grid/Card";
import type { HorizontalCardProps } from "@/components/official/card-and-grid/HorizontalCard";
import { List } from "@/components/official/card-and-grid/List";
import { IosWidget } from "@/components/official/card-and-grid/IosWidget";
import { useUserStats } from "./user-stats-fetch";
import { FaTasks } from "react-icons/fa";
import Link from "next/link";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectUser,
  selectActiveUserName,
} from "@/lib/redux/selectors/userSelectors";
import { LatestAiModels } from "@/components/animated/ExpandableCards/ExpandableCardDemo";
import { dashboardLinks } from "@/features/shell/navigation/navigationLinks";
import { SandboxWidget, useSandboxSummary } from "./SandboxWidget";

// ─── Enterprise iOS gradients ────────────────────────────────────────────────────
// Vivid but professional — mid-range stops, not neon-flat, not near-black
const IOSGrad: Record<string, string> = {
  indigo: "from-indigo-500 to-indigo-800",
  emerald: "from-emerald-500 to-emerald-800",
  blue: "from-blue-500 to-blue-800",
  amber: "from-amber-500 to-amber-800",
  purple: "from-purple-600 to-purple-900",
  gray: "from-zinc-500 to-zinc-800",
  red: "from-red-500 to-red-800",
  green: "from-green-500 to-green-800",
  yellow: "from-yellow-500 to-yellow-700",
  pink: "from-pink-500 to-pink-800",
  orange: "from-orange-500 to-orange-800",
  teal: "from-teal-500 to-teal-800",
  cyan: "from-cyan-500 to-cyan-800",
  lime: "from-lime-500 to-lime-800",
  rose: "from-rose-500 to-rose-800",
  violet: "from-violet-600 to-violet-900",
  slate: "from-slate-500 to-slate-800",
};

// ─── Single iOS icon cell ───────────────────────────────────────────────────────
// Fixed 60×60 squircle box + label below. Icon fills ~80% of the box (size 36).
function IosAppIcon({ item }: { item: CardProps }) {
  const grad = IOSGrad[item.color] ?? IOSGrad.gray;
  const inner = (
    <div className="flex flex-col items-center gap-[4px]">
      {/* 60px squircle — iOS uses ~22% border-radius */}
      <div
        className={`w-[60px] h-[60px] rounded-[22%] bg-gradient-to-br ${grad}
                            ring-1 ring-white/10 shadow-md flex items-center justify-center
                            active:opacity-70 transition-opacity`}
      >
        {React.isValidElement(item.icon)
          ? React.cloneElement(
              item.icon as React.ReactElement<{
                size?: number;
                className?: string;
              }>,
              { className: "text-white", size: 36 },
            )
          : null}
      </div>
      {/* Label sits below the squircle */}
      <span className="text-[10px] font-medium text-center leading-tight text-foreground w-[68px] truncate">
        {item.title}
      </span>
    </div>
  );
  if (item.path)
    return (
      <Link href={item.path} className="flex justify-center">
        {inner}
      </Link>
    );
  return <div className="flex justify-center">{inner}</div>;
}

// ─── Page ───────────────────────────────────────────────────────────────────────
const DashboardPage = () => {
  const { stats } = useUserStats();
  const user = useAppSelector(selectUser);
  const displayName = useAppSelector(selectActiveUserName);
  const sandboxSummary = useSandboxSummary();

  const recentActivity = [
    {
      id: 1,
      title: "New GPT 5 Models Deployed",
      time: "This week",
      icon: <Zap size={14} />,
    },
    {
      id: 2,
      title: "HTML live preview in Chat & Applets",
      time: "This week",
      icon: <Database size={14} />,
    },
    {
      id: 3,
      title: "Questionnaire mode in Chat",
      time: "3 days ago",
      icon: <Cpu size={14} />,
    },
    {
      id: 4,
      title: "New Claude 4.5 Sonnet Deployed",
      time: "2 days ago",
      icon: <Cpu size={14} />,
    },
  ];

  const usageStats = [
    {
      id: 1,
      name: "Chats",
      userCount: stats?.user_conversation_count ?? 0,
      totalCount: stats?.total_conversation_count ?? 0,
      icon: <MessageSquare size={16} />,
    },
    {
      id: 2,
      name: "Recipes",
      userCount: stats?.user_recipe_count ?? 0,
      totalCount: stats?.total_recipe_count ?? 0,
      icon: <Brain size={16} />,
    },
    {
      id: 3,
      name: "Tables",
      userCount: stats?.user_tables_count ?? 0,
      totalCount: stats?.total_tables_count ?? 0,
      icon: <Database size={16} />,
    },
  ];

  const featureCards: CardProps[] = dashboardLinks
    .filter((link) => link.href !== "/dashboard")
    .map((link) => ({
      title: link.label,
      description: link.description || "",
      icon: link.icon as React.ReactElement,
      color: (link.color || "gray") as CardProps["color"],
      path: link.href,
      external: link.external,
    }));

  const userSettingsCards: CardProps[] = [
    {
      title: "Profile",
      description: "",
      icon: <User />,
      color: "cyan",
      path: "/settings/profile",
    },
    {
      title: "Preferences",
      description: "",
      icon: <Settings />,
      color: "orange",
      path: "/settings/preferences",
    },
    {
      title: "Organizations",
      description: "",
      icon: <Building2 />,
      color: "blue",
      path: "/settings/organizations",
    },
  ];

  const quickAccessItems: HorizontalCardProps[] = [
    {
      title: "Structured Plan & Task List",
      description: "Use an audio file to convert speech into a task list",
      icon: <FaTasks />,
      color: "purple",
      path: "/chat",
    },
    {
      title: "Image Generator",
      description: "Create custom visuals",
      icon: <ImageIcon />,
      color: "green",
      path: "/chat",
    },
    {
      title: "Data Analyzer",
      description: "Extract insights",
      icon: <BarChart3 />,
      color: "blue",
      path: "/chat",
    },
  ];

  // Explicit grid placement:
  //   Row 1-2 col 1-2: featureCards 0-3  (4 icons in a 2×2 sub-area)
  //   Row 1-2 col 3-4: Widget A
  //   Row 3-4 col 1-2: featureCards 4-7
  //   Row 3-4 col 3-4: Widget B
  //   Row 5+  col 1-4: featureCards 8+  (auto-placed)
  //   Next rows:       userSettingsCards (auto-placed)
  //
  // gridAutoRows = 84px:  60px icon + 3px gap + 14px label + 7px padding = 84px
  const iconGridStyle: React.CSSProperties = {
    gap: "8px",
    gridAutoRows: "84px",
  };

  const gridPos = (col: number, row: number) =>
    ({
      gridColumn: col,
      gridRow: row,
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
      paddingTop: "6px",
    }) as React.CSSProperties;

  return (
    <div className="flex flex-col h-page w-full overflow-hidden">
      <div className="flex flex-col w-full h-full bg-textured text-gray-800 dark:text-gray-100">
        {/* ═══ MOBILE — CSS only, no JS layout switch ═══════════════════════════ */}
        <div className="block md:hidden h-full overflow-y-auto">
          <div className="px-4 pt-3 pb-10 space-y-6">
            {/* iOS icon + widget grid */}
            <div className="grid grid-cols-4" style={iconGridStyle}>
              {/* featureCards 0–3: col 1-2, rows 1-2 */}
              {featureCards.slice(0, 4).map((item, i) => (
                <div
                  key={i}
                  style={gridPos((i % 2) + 1, Math.floor(i / 2) + 1)}
                >
                  <IosAppIcon item={item} />
                </div>
              ))}

              {/* Widget A: col 3-4, row 1-2 */}
              <div style={{ gridColumn: "3 / 5", gridRow: "1 / 3" }}>
                <IosWidget
                  title="Structured Plan"
                  description="Convert speech to a task list"
                  icon={<FaTasks />}
                  color="purple"
                  path="/chat"
                  badge="AI"
                />
              </div>

              {/* featureCards 4–7: col 1-2, rows 3-4 */}
              {featureCards.slice(4, 8).map((item, i) => (
                <div
                  key={i}
                  style={gridPos((i % 2) + 1, Math.floor(i / 2) + 3)}
                >
                  <IosAppIcon item={item} />
                </div>
              ))}

              {/* Widget B: col 3-4, row 3-4 */}
              <div style={{ gridColumn: "3 / 5", gridRow: "3 / 5" }}>
                <IosWidget
                  title="Image Generator"
                  description="Create custom AI visuals"
                  icon={<ImageIcon />}
                  color="emerald"
                  path="/chat"
                  badge="New"
                />
              </div>

              {/* Remaining feature icons — auto-placed, full 4 cols (row 5+) */}
              {featureCards.slice(8).map((item, i) => (
                <div
                  key={i}
                  className="flex justify-center items-start pt-[6px]"
                >
                  <IosAppIcon item={item} />
                </div>
              ))}

              {/* Settings icons */}
              {userSettingsCards.map((item, i) => (
                <div
                  key={i}
                  className="flex justify-center items-start pt-[6px]"
                >
                  <IosAppIcon item={item} />
                </div>
              ))}
            </div>

            {/* Latest AI Models */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2 px-1">
                Latest AI Models
              </p>
              <div className="rounded-2xl border border-border overflow-hidden">
                <LatestAiModels />
              </div>
            </div>

            {/* New Features */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2 px-1">
                New Features
              </p>
              <div className="rounded-2xl bg-white dark:bg-zinc-800 shadow-sm overflow-hidden">
                {recentActivity.map((a, i) => (
                  <div
                    key={a.id}
                    className={`flex items-center gap-3 px-4 py-3 ${i < recentActivity.length - 1 ? "border-b border-gray-100 dark:border-zinc-700" : ""}`}
                  >
                    <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-zinc-700 flex-shrink-0">
                      {a.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium truncate">
                        {a.title}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock size={9} className="text-gray-400" />
                        <span className="text-[10px] text-gray-400">
                          {a.time}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2 px-1">
                Stats
              </p>
              <div className="grid grid-cols-3 gap-3">
                {usageStats.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-2xl bg-white dark:bg-zinc-800 shadow-sm p-3 flex flex-col items-center text-center gap-1"
                  >
                    <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-zinc-700">
                      {s.icon}
                    </div>
                    <span className="text-base font-semibold">
                      {s.userCount}
                    </span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {s.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <SandboxWidget summary={sandboxSummary} />
          </div>
        </div>

        {/* ═══ DESKTOP — unchanged layout ═══════════════════════════════════════ */}
        <div
          className={`hidden md:block w-full px-6 pt-4 h-full overflow-hidden`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
            <div className="lg:col-span-2 overflow-y-auto scrollbar-none h-full pr-3 pb-8">
              <Grid
                title=""
                items={featureCards}
                columns={4}
                compact={false}
                showAddButton={true}
                addButtonText="Add Feature"
              />
              <List
                title=""
                items={quickAccessItems}
                className="mt-8"
                containerClassName="p-2"
              />
              <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <Grid
                    items={userSettingsCards}
                    columns={4}
                    compact={false}
                    className="mt-2"
                  />
                </div>
                <div className="lg:col-span-1">
                  <h2 className="text-md font-semibold mb-4">Recommended</h2>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/40 dark:to-purple-900/40 border border-indigo-100 dark:border-indigo-800/50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/70">
                        <FaTasks
                          size={18}
                          className="text-indigo-500 dark:text-indigo-400"
                        />
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/70 dark:text-indigo-300">
                        Advanced Workflow
                      </span>
                    </div>
                    <h3 className="font-semibold text-md mb-1">
                      Structured Plan & Task List
                    </h3>
                    <p className="text-sm mb-4 text-gray-600 dark:text-gray-400">
                      Use an audio file to convert your speech into a structured
                      plan and task list
                    </p>
                    <Link href="/chat/new">
                      <button className="w-full py-2 rounded-lg font-medium text-center transition bg-indigo-500 hover:bg-indigo-600 text-white">
                        Try Now
                      </button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
            <div className="lg:col-span-1 overflow-y-auto scrollbar-none h-full pl-3 pb-8">
              <div className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-md">
                <div className="flex items-center mb-4">
                  <div className="relative h-16 w-16 rounded-full bg-gray-200 dark:bg-zinc-700 flex items-center justify-center overflow-hidden">
                    {user.userMetadata.picture ? (
                      <Image
                        src={user.userMetadata.picture}
                        alt="Profile"
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    ) : (
                      <User size={32} className="text-gray-400" />
                    )}
                  </div>
                  <div className="ml-4">
                    <h3 className="font-semibold text-lg">
                      {displayName || "User"}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {user.email}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/settings/profile">
                    <div className="p-2 rounded-lg text-center bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-900/30 dark:hover:bg-cyan-900/50 transition-colors text-cyan-700 dark:text-cyan-300 text-sm font-medium">
                      Edit Profile
                    </div>
                  </Link>
                  <Link href="/settings/preferences">
                    <div className="p-2 rounded-lg text-center bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 transition-colors text-orange-700 dark:text-orange-300 text-sm font-medium">
                      Preferences
                    </div>
                  </Link>
                </div>
              </div>
              <div className="mt-3 border border-border rounded-3xl">
                <LatestAiModels />
              </div>
              <div className="mt-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-md font-semibold">New Features</h2>
                  <button className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                    View all
                  </button>
                </div>
                <div className="rounded-xl bg-white dark:bg-zinc-800 shadow-md">
                  {recentActivity.map((a, i) => (
                    <div
                      key={a.id}
                      className={`flex items-start p-4 ${i < recentActivity.length - 1 ? "border-b border-gray-100 dark:border-zinc-700" : ""}`}
                    >
                      <div className="p-2 rounded-lg mr-4 flex-shrink-0 bg-gray-100 dark:bg-zinc-700">
                        {a.icon}
                      </div>
                      <div>
                        <h3 className="font-medium">{a.title}</h3>
                        <div className="flex items-center mt-1">
                          <Clock size={12} className="text-gray-400" />
                          <span className="text-xs ml-1 text-gray-400">
                            {a.time}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <SandboxWidget summary={sandboxSummary} />
              <div className="mt-6">
                <h2 className="text-md font-semibold mb-4">Stats</h2>
                <div className="rounded-xl overflow-hidden bg-white dark:bg-zinc-800 shadow-md">
                  {usageStats.map((s, i) => (
                    <div
                      key={s.id}
                      className={`flex items-center p-4 ${i < usageStats.length - 1 ? "border-b border-gray-100 dark:border-zinc-700" : ""}`}
                    >
                      <div className="p-2 rounded-lg mr-4 bg-gray-100 dark:bg-zinc-700">
                        {s.icon}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm text-gray-500 dark:text-gray-400">
                          Your {s.name}
                        </h3>
                        <div className="flex items-baseline">
                          <span className="text-xl font-semibold mr-2">
                            {s.userCount}
                          </span>
                          <span className="text-xs text-gray-400">
                            Community: {s.totalCount}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
