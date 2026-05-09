// QuickActions.tsx — Server component for quick action cards
// Three horizontal cards for key workflows

import ShellIcon from "@/features/shell/components/ShellIcon";

const actions = [
  {
    label: "New Chat",
    description: "Start an AI conversation",
    href: "/chat",
    iconName: "MessageCircle",
    color:
      "bg-indigo-500/15 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400",
  },
  {
    label: "Quick Note",
    description: "Capture a thought or idea",
    href: "/notes",
    iconName: "NotebookPen",
    color:
      "bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400",
  },
  {
    label: "New Task",
    description: "Add something to your list",
    href: "/tasks",
    iconName: "ListTodo",
    color:
      "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-400",
  },
];

export default function QuickActions() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 sm:px-6">
      {actions.map((action) => (
        <a
          key={action.href}
          href={action.href}
          className="shell-quick-card matrx-glass-card shell-tactile-subtle"
        >
          <div className={`shell-quick-card-icon ${action.color}`}>
            <ShellIcon name={action.iconName} size={20} strokeWidth={1.75} />
          </div>
          <div className="shell-quick-card-text">
            <span className="shell-quick-card-title">{action.label}</span>
            <span className="shell-quick-card-desc">{action.description}</span>
          </div>
        </a>
      ))}
    </div>
  );
}
