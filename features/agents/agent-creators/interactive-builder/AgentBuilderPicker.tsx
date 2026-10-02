import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Zap, Layout, Sliders } from "lucide-react";

const BUILDER_OPTIONS = [
  {
    href: "/agents/new/builder/instant",
    icon: Zap,
    iconClass: "text-purple-600 dark:text-purple-400",
    bgClass: "bg-purple-100 dark:bg-purple-900/30",
    title: "Instant Chat Assistant",
    description:
      "Options for persona, tone, format and sliders",
    badges: [
      { label: "No AI needed", color: "purple" },
      { label: "Instant creation", color: "green" },
    ],
  },
  {
    href: "/agents/new/builder/tabs",
    icon: Layout,
    iconClass: "text-blue-600 dark:text-blue-400",
    bgClass: "bg-blue-100 dark:bg-blue-900/30",
    title: "Comprehensive Builder",
    description:
      "Tabs for task, background, tone, examples and more",
    badges: [
      { label: "Advanced", color: "blue" },
      { label: "Detailed", color: "green" },
    ],
  },
  {
    href: "/agents/new/builder/customizer",
    icon: Sliders,
    iconClass: "text-indigo-600 dark:text-indigo-400",
    bgClass: "bg-indigo-100 dark:bg-indigo-900/30",
    title: "AI Experience Customizer",
    description:
      "Cards for personality, style, intelligence and output",
    badges: [
      { label: "Interactive", color: "indigo" },
      { label: "User-friendly", color: "green" },
    ],
  },
] as const;

const BADGE_COLORS: Record<string, string> = {
  purple:
    "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
  green: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  indigo:
    "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300",
};

export function AgentBuilderPicker() {
  return (
    <div className="space-y-3 py-2">
      {BUILDER_OPTIONS.map((option) => {
        const Icon = option.icon;
        return (
          <Link key={option.href} href={option.href} className="block">
            <Card className="p-4 cursor-pointer hover:bg-accent/50 transition-colors border-2 hover:border-primary">
              <div className="flex items-start gap-4">
                <div
                  className={`p-3 rounded-lg flex-shrink-0 ${option.bgClass}`}
                >
                  <Icon className={`h-6 w-6 ${option.iconClass}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold mb-1">
                    {option.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {option.description}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    {option.badges.map((badge) => (
                      <span
                        key={badge.label}
                        className={`text-xs px-2 py-1 rounded-full ${BADGE_COLORS[badge.color]}`}
                      >
                        {badge.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
