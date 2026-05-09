// RecentActivity.tsx — Server component for recent platform updates/features
// Static content showcasing what's new on the platform

import ShellIcon from "@/features/shell/components/ShellIcon";

const recentItems = [
  {
    title: "New Research Mode",
    description:
      "Deep-dive research with AI-powered topic analysis and synthesis",
    iconName: "FlaskConical",
    time: "New",
    color: "text-purple-500 dark:text-purple-400",
  },
  {
    title: "Prompt Apps",
    description:
      "Transform prompts into shareable AI-powered mini-applications",
    iconName: "LayoutGrid",
    time: "New",
    color: "text-emerald-500 dark:text-emerald-400",
  },
  {
    title: "Sandbox Environments",
    description: "Ephemeral coding environments for rapid prototyping",
    iconName: "Container",
    time: "Updated",
    color: "text-orange-500 dark:text-orange-400",
  },
  {
    title: "Workflow Builder",
    description: "Visual workflow automation with drag-and-drop interface",
    iconName: "Workflow",
    time: "Beta",
    color: "text-violet-500 dark:text-violet-400",
  },
];

export default function RecentActivity() {
  return (
    <div className="flex flex-col gap-1 px-4 sm:px-6">
      {recentItems.map((item) => (
        <div
          key={item.title}
          className="flex items-center gap-3 py-2.5 px-3 rounded-xl"
          style={{ transition: "background 150ms" }}
        >
          <div
            className={`flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 ${item.color}`}
            style={{ background: "var(--matrx-glass-bg)" }}
          >
            <ShellIcon name={item.iconName} size={18} strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-medium truncate"
                style={{ color: "var(--shell-nav-text-hover)" }}
              >
                {item.title}
              </span>
              <span
                className="text-[0.625rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{
                  background: "var(--matrx-glass-bg)",
                  color: "var(--shell-nav-icon)",
                }}
              >
                {item.time}
              </span>
            </div>
            <p
              className="text-xs truncate"
              style={{ color: "var(--shell-nav-icon)" }}
            >
              {item.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
