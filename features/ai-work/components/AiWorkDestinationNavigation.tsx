"use client";

import {
  MetricNavigation,
  type MetricNavigationItem,
} from "@/components/navigation/MetricNavigation";
import type { EntityListController } from "@/lib/entity-list/config";
import { primaryNavItems } from "@/features/shell/constants/nav-data";
import type { ShellIconName } from "@/features/shell/shellIconMap";
import type { ConversationBrowseRow } from "../conversations/types";

export interface WorkDoor {
  title: string;
  description: string;
  href: string;
  iconName: ShellIconName;
  external?: boolean;
  availability?: MetricNavigationItem["availability"];
}

const CONTINUE_DOORS: readonly WorkDoor[] = [
  {
    title: "Start work",
    description:
      "Compose and launch a new AI Matrx request with the available destinations.",
    href: "/work/new",
    iconName: "BrainCircuit",
  },
  {
    title: "Saved requests",
    description: "Reuse and manage the requests you have saved.",
    href: "/work/requests",
    iconName: "BookmarkCheck",
  },
  {
    title: "All conversations",
    description:
      "Browse AI Matrx chats and provider mirrors in one organized inbox.",
    href: "/work/conversations",
    iconName: "MessageSquare",
  },
  {
    title: "Start an AI Matrx conversation",
    description:
      "Send a message to an AI Matrx agent using the chat workspace available today.",
    href: "/chat/new",
    iconName: "MessageCircle",
  },
];

const ORGANIZE_DOORS: readonly WorkDoor[] = [
  {
    title: "Projects",
    description: "Group conversations and other work into a shared project.",
    href: "/projects",
    iconName: "FolderKanban",
  },
  {
    title: "Tasks",
    description:
      "Track work and attach conversations to an existing or new task.",
    href: "/tasks",
    iconName: "ListTodo",
  },
  {
    title: "War Rooms",
    description:
      "Bring conversations into a room with tasks, notes, files, and agents.",
    href: "/war-room/all",
    iconName: "Users",
  },
];

const CONFIGURE_DOORS: readonly WorkDoor[] = [
  {
    title: "Skills",
    description:
      "Create and manage reusable expertise used by AI Matrx agents.",
    href: "/agent-connections/skills",
    iconName: "BookOpen",
  },
  {
    title: "Sync status",
    description:
      "See exact delivery, account, and runtime state, plus Claude history sync via Matrx Local.",
    href: "/work/connections",
    iconName: "Plug",
  },
  {
    title: "MCP connections",
    description: "Connect or inspect MCP servers and the tools they expose.",
    href: "/agent-connections/mcp-servers",
    iconName: "Network",
  },
  {
    title: "Schedules",
    description: "Run existing AI Matrx agents on a recurring schedule.",
    href: "/schedules",
    iconName: "CalendarClock",
  },
];

/** The live AI Work destinations advertised by the signed-in home. */
export const AI_WORK_DOOR_GROUPS = [
  { title: "Continue or start", doors: CONTINUE_DOORS },
  { title: "Organize the work", doors: ORGANIZE_DOORS },
  { title: "Configure and automate", doors: CONFIGURE_DOORS },
] as const;

function workNavChildren(): readonly MetricNavigationItem[] {
  const work = primaryNavItems.find((item) => item.label === "AI Work");
  return (work?.children ?? []).map((item) => ({
    key: item.href,
    label:
      item.href === "/work/conversations"
        ? "Conversations"
        : item.href === "/agent-connections/plugins"
          ? "Connection setup"
          : item.label,
    href: item.href,
    iconName: item.iconName,
    color: item.color ?? work?.color,
    description:
      item.href === "/work/conversations"
        ? "The current conversation inbox view"
        : item.href === "/agent-connections/plugins"
          ? "Install and configure coding-provider connections"
          : item.description,
    external: item.external,
  }));
}

function doorItems(): readonly MetricNavigationItem[] {
  return AI_WORK_DOOR_GROUPS.flatMap((group) =>
    group.doors.map((door) => ({
      key: door.href,
      label: door.title,
      href: door.href,
      iconName: door.iconName,
      color: "violet",
      description: door.description,
      external: door.external,
      availability: door.availability,
    })),
  );
}

function uniqueDestinations(
  items: readonly MetricNavigationItem[],
): MetricNavigationItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.external ? "external:" : ""}${item.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type AiWorkConversationMetric = Pick<
  MetricNavigationItem,
  "value" | "state" | "description"
>;

/**
 * Destination order and metric attachment are pure so the home can prove that
 * its compact strip carries every live door without making up inventory.
 */
export function aiWorkDestinationItems(
  conversationMetric: AiWorkConversationMetric,
): MetricNavigationItem[] {
  return uniqueDestinations([...workNavChildren(), ...doorItems()]).map(
    (item) =>
      item.href === "/work/conversations"
        ? { ...item, ...conversationMetric }
        : item,
  );
}

/**
 * The home exposes both the shell's canonical AI Work children and every
 * product door. Only the list controller may attach a count: it owns the
 * filtered result set and knows whether that count was actually read.
 */
export function AiWorkDestinationNavigation({
  list,
}: {
  list: EntityListController<ConversationBrowseRow>;
}) {
  const conversationMetric: AiWorkConversationMetric = list.error
    ? { state: "unavailable", description: "AI chats matching this inbox view" }
    : list.isLoading
      ? { state: "loading", description: "AI chats matching this inbox view" }
      : {
          value: list.total,
          state: "ready",
          description: "AI chats matching this inbox view",
        };

  const items = aiWorkDestinationItems(conversationMetric);

  return <MetricNavigation label="AI Work destinations" items={items} />;
}
