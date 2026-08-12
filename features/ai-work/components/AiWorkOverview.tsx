import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  FolderKanban,
  MessagesSquare,
  MessageCircle,
  Network,
  Plug,
  ShieldCheck,
  SquareCheckBig,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface WorkDoor {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

const CONTINUE_DOORS: WorkDoor[] = [
  {
    title: "All conversations",
    description:
      "Browse AI Matrx chats and provider mirrors in one organized inbox.",
    href: "/work/conversations",
    icon: MessagesSquare,
  },
  {
    title: "Start an AI Matrx conversation",
    description:
      "Send a message to an AI Matrx agent using the chat workspace available today.",
    href: "/chat/new",
    icon: MessageCircle,
  },
];

const ORGANIZE_DOORS: WorkDoor[] = [
  {
    title: "Projects",
    description: "Group conversations and other work into a shared project.",
    href: "/projects",
    icon: FolderKanban,
  },
  {
    title: "Tasks",
    description:
      "Track work and attach conversations to an existing or new task.",
    href: "/tasks",
    icon: SquareCheckBig,
  },
  {
    title: "War Rooms",
    description:
      "Bring conversations into a room with tasks, notes, files, and agents.",
    href: "/war-room/all",
    icon: UsersRound,
  },
];

const CONFIGURE_DOORS: WorkDoor[] = [
  {
    title: "Skills",
    description:
      "Create and manage reusable expertise used by AI Matrx agents.",
    href: "/agent-connections/skills",
    icon: BookOpen,
  },
  {
    title: "Coding connections",
    description:
      "See exact delivery and runtime state, and sync capability when it is live.",
    href: "/work/connections",
    icon: Plug,
  },
  {
    title: "MCP connections",
    description: "Connect or inspect MCP servers and the tools they expose.",
    href: "/agent-connections/mcp-servers",
    icon: Network,
  },
  {
    title: "Schedules",
    description: "Run existing AI Matrx agents on a recurring schedule.",
    href: "/schedules",
    icon: CalendarClock,
  },
];

/** The live destinations advertised by the Hub. Keep unsupported routes out. */
export const AI_WORK_DOOR_GROUPS = [
  { title: "Continue or start", doors: CONTINUE_DOORS },
  { title: "Organize the work", doors: ORGANIZE_DOORS },
  { title: "Configure and automate", doors: CONFIGURE_DOORS },
] as const;

export function AiWorkOverview() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-[calc(var(--shell-header-h)+0.75rem)] sm:px-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <section className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <h1 className="text-sm font-semibold text-foreground">
                  Work with what is connected today
                </h1>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  AI Matrx chat is ready to send messages. Provider
                  conversations appear only after an authenticated coding
                  adapter captures them. ChatGPT and Claude.ai history import
                  and sending new turns into independent provider sessions are
                  not available yet.
                </p>
              </div>
            </div>
          </section>

          {AI_WORK_DOOR_GROUPS.map((group) => (
            <DoorSection
              key={group.title}
              title={group.title}
              doors={group.doors}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DoorSection({
  title,
  doors,
}: {
  title: string;
  doors: readonly WorkDoor[];
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {doors.map((door) => {
          const Icon = door.icon;
          return (
            <Link
              key={door.href}
              href={door.href}
              className="group flex min-h-28 items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/30"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
                  {door.title}
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {door.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
