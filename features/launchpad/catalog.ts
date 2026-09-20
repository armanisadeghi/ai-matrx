import { QUICK_ACTIONS } from "@/features/dashboard/dashboard.config";
import {
  isNavActionChild,
  isNavPanelChild,
  primaryNavItems,
  settingsItem,
  type ShellNavItem,
} from "@/features/shell/constants/nav-data";
import type { ShellIconName } from "@/features/shell/shellIconMap";
import { filterAndSortBySearch } from "@ai-matrx/kit/search-scoring";
import { USER_LAUNCHPAD_PATH } from "./constants";

export interface LaunchpadDestination {
  id: string;
  label: string;
  href: string;
  description?: string;
  iconName: ShellIconName;
  color?: string;
  groupLabel: string;
  external?: boolean;
  kind: "area" | "destination" | "quick-start";
}

export interface LaunchpadGroup {
  id: string;
  label: string;
  href: string;
  description?: string;
  iconName: ShellIconName;
  color?: string;
  external?: boolean;
  destinations: LaunchpadDestination[];
}

const searchFields = [
  { get: (item: LaunchpadDestination) => item.label, weight: "title" as const },
  {
    get: (item: LaunchpadDestination) => item.groupLabel,
    weight: "subtitle" as const,
  },
  {
    get: (item: LaunchpadDestination) => item.description,
    weight: "body" as const,
  },
  { get: (item: LaunchpadDestination) => item.href, weight: "meta" as const },
];

/**
 * Area-card subtitles must stay on one line so the browse grid can snap.
 * Sidebar and search keep the full nav descriptions; only the card uses this.
 */
export const LAUNCHPAD_CARD_DESCRIPTION_MAX_LENGTH = 40;

const LAUNCHPAD_CARD_DESCRIPTIONS: Record<string, string> = {
  "AI Matrx": "Your hub for activity and insights",
  "AI Work": "Chats and connected work",
  Chat: "Chat with AI Matrx",
  Masterwork: "Your expertise, enforced as rules",
  Knowledge: "Stores, graph, research, and search",
  "Agent Apps": "Apps built from agents",
  Workflows: "Run multi-step workflows live",
  Shapes: "Design structured-content shapes",
  Reports: "Agent drift and other reports",
  Publish: "Podcasts, artifacts, and sites",
  Files: "Your files and documents",
  HR: "People, time, pay, and records",
  CRM: "People, companies, and contacts",
  Libraries: "Catalogue and transcribe YouTube",
  "Legal Hub": "Legal tools and case utilities",
  "Medical Hub (Soon)": "Clinical tools — coming soon",
  "Education Hub": "Flashcards, quizzes, and a tutor",
  Print: "Decks, tests, labels, and documents",
  Marketing: "Brands, search, and measurement",
  Communication: "Messages, email, and windows",
  "Workflow Studio": "Design workflow graphs on a canvas",
};

export function launchpadCardDescription(
  item: Pick<ShellNavItem, "label" | "description">,
): string | undefined {
  return LAUNCHPAD_CARD_DESCRIPTIONS[item.label] ?? item.description;
}

function destinationFromItem(
  item: ShellNavItem,
  kind: LaunchpadDestination["kind"] = "area",
): LaunchpadDestination {
  return {
    id: item.href,
    label: item.label,
    href: item.href,
    description: item.description,
    iconName: item.iconName,
    color: item.color,
    groupLabel: item.label,
    external: item.external,
    kind,
  };
}

/**
 * Builds the user launcher from the canonical shell registry. Top-level areas
 * stay compact; searchable destinations include every child explicitly marked
 * for user discovery, while action and window-panel controls remain excluded.
 */
export function buildUserLaunchpadCatalog(
  items: readonly ShellNavItem[],
  settings: ShellNavItem,
): LaunchpadGroup[] {
  const groupsByHref = new Map<string, LaunchpadGroup>();

  for (const item of [...items, settings]) {
    if (item.href === USER_LAUNCHPAD_PATH) continue;

    const destinations: LaunchpadDestination[] = [destinationFromItem(item)];
    const seen = new Set([item.href]);

    for (const child of item.children ?? []) {
      if (
        !child.dashboard ||
        isNavActionChild(child) ||
        isNavPanelChild(child) ||
        seen.has(child.href)
      ) {
        continue;
      }
      seen.add(child.href);
      destinations.push({
        id: child.href,
        label: child.label,
        href: child.href,
        description: child.description,
        iconName: child.iconName,
        color: child.color ?? item.color,
        groupLabel: item.label,
        external: child.external,
        kind: "destination",
      });
    }

    const group: LaunchpadGroup = {
      id: item.href,
      label: item.label,
      href: item.href,
      description: launchpadCardDescription(item),
      iconName: item.iconName,
      color: item.color,
      external: item.external,
      destinations,
    };

    const existing = groupsByHref.get(item.href);
    if (!existing || group.destinations.length > existing.destinations.length) {
      groupsByHref.set(item.href, group);
    }
  }

  return [...groupsByHref.values()];
}

export const USER_LAUNCHPAD_GROUPS = buildUserLaunchpadCatalog(
  primaryNavItems,
  settingsItem,
);

const catalogDestinations = USER_LAUNCHPAD_GROUPS.flatMap(
  (group) => group.destinations,
);

const quickStartDestinations: LaunchpadDestination[] = QUICK_ACTIONS.map(
  (action) => ({
    id: action.href,
    label: action.label,
    href: action.href,
    iconName: action.iconName,
    color: action.color,
    groupLabel: "Start something",
    kind: "quick-start",
  }),
);

export const USER_LAUNCHPAD_DESTINATIONS = [
  ...quickStartDestinations,
  ...catalogDestinations,
].filter(
  (destination, index, destinations) =>
    destinations.findIndex(
      (candidate) => candidate.href === destination.href,
    ) === index,
);

export function searchUserLaunchpad(
  query: string,
  destinations: readonly LaunchpadDestination[] = USER_LAUNCHPAD_DESTINATIONS,
): LaunchpadDestination[] {
  return filterAndSortBySearch(destinations, query, searchFields);
}
