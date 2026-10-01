"use client";

/**
 * AccountSettingsRouteMenu — the /settings/* pages' menu, as a route menu in
 * the ONE shell sidebar (route-menu-registry), exactly like /user-settings,
 * /chat and Administration. It used to be a second sidebar inside the page
 * plus a second bottom dock (owner, 2026-09-30: one sidebar a person can
 * always count on). Rows are the shell's own nav rows, so they collapse to
 * icons with the rail; a section's sub-tabs show while it is open.
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BookOpen,
  Building2,
  Code,
  Cpu,
  Database,
  Gamepad2,
  Image as ImageIcon,
  KeyRound,
  Mail,
  MessageSquare,
  MessageSquareMore,
  Mic,
  Monitor,
  Plug,
  Server,
  Settings as SettingsIcon,
  SquareStack,
  Type,
  User,
  UserCheck,
  Video,
  Volume2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Chrome } from "@/components/icons/brand-icons";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { cn } from "@/lib/utils";
import {
  ROUTE_MENU_ICON_SIZE,
  ROUTE_MENU_ICON_STROKE_WIDTH,
  ROUTE_MENU_NAV_ITEM_CLASS,
} from "@/features/shell/constants/route-menu-style";

interface AccountSettingsItem {
  title: string;
  href: string;
  Icon: LucideIcon;
  children?: { title: string; param: string; Icon: LucideIcon }[];
}

const ACCOUNT_SETTINGS_ITEMS: AccountSettingsItem[] = [
  { title: "Profile", href: "/settings/profile", Icon: User },
  {
    title: "Preferences",
    href: "/settings/preferences",
    Icon: SettingsIcon,
    children: [
      { title: "Display", param: "display", Icon: Monitor },
      { title: "Prompts", param: "prompts", Icon: Zap },
      { title: "Messaging", param: "messaging", Icon: MessageSquare },
      { title: "Voice", param: "voice", Icon: Mic },
      { title: "TTS", param: "textToSpeech", Icon: Volume2 },
      { title: "Assistant", param: "assistant", Icon: SquareStack },
      { title: "AI Models", param: "aiModels", Icon: Cpu },
      { title: "Email", param: "email", Icon: Mail },
      { title: "Video", param: "videoConference", Icon: Video },
      { title: "Photo", param: "photoEditing", Icon: ImageIcon },
      { title: "Images", param: "imageGeneration", Icon: ImageIcon },
      { title: "Text", param: "textGeneration", Icon: Type },
      { title: "Coding", param: "coding", Icon: Code },
      { title: "Flashcards", param: "flashcard", Icon: BookOpen },
      { title: "Playground", param: "playground", Icon: Gamepad2 },
      { title: "Agent Context", param: "agentContext", Icon: AGENT_ICON },
    ],
  },
  { title: "Agent shortcuts", href: "/agents/shortcuts", Icon: Zap },
  { title: "Voice & Mic", href: "/settings/voice", Icon: Mic },
  // "Connector" is the word (Arman, 2026-09-17); the route keeps its path.
  { title: "Connectors", href: "/settings/integrations", Icon: Plug },
  // Lives in (core) — this menu is the door to it, so a request that never
  // reached anyone's DM is still reachable from where people look.
  { title: "Access requests", href: "/settings/access-requests", Icon: UserCheck },
  { title: "Vault", href: "/vault", Icon: KeyRound },
  { title: "Sandbox Defaults", href: "/settings/sandbox", Icon: Server },
  { title: "Sandbox Storage", href: "/settings/sandbox-storage", Icon: Database },
  { title: "Orgs", href: "/settings/organizations", Icon: Building2 },
  { title: "Feedback", href: "/settings/feedback", Icon: MessageSquareMore },
  { title: "Extension", href: "/settings/extension", Icon: Chrome },
];

export default function AccountSettingsRouteMenu({ expanded }: { expanded: boolean }) {
  const pathname = usePathname() ?? "";
  const activeTab = useSearchParams()?.get("tab") ?? null;

  return (
    <div className="flex flex-col gap-0.5">
      {ACCOUNT_SETTINGS_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const first = item.children?.[0]?.param;
        return (
          <div key={item.href} className="flex flex-col gap-0.5">
            <Link
              href={first ? `${item.href}?tab=${first}` : item.href}
              title={item.title}
              aria-current={active ? "page" : undefined}
              className={cn(ROUTE_MENU_NAV_ITEM_CLASS, active && "shell-active-pill")}
            >
              <span className="shell-nav-icon">
                <item.Icon size={ROUTE_MENU_ICON_SIZE} strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH} />
              </span>
              <span className="shell-nav-label">{item.title}</span>
            </Link>
            {active && expanded && item.children
              ? item.children.map((child) => {
                  const childActive = activeTab === child.param || (!activeTab && child.param === first);
                  return (
                    <Link
                      key={child.param}
                      href={`${item.href}?tab=${child.param}`}
                      title={child.title}
                      aria-current={childActive ? "page" : undefined}
                      className={cn(
                        ROUTE_MENU_NAV_ITEM_CLASS,
                        "pl-6 text-xs",
                        childActive ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      <span className="shell-nav-icon">
                        <child.Icon size={14} strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH} />
                      </span>
                      <span className="shell-nav-label">{child.title}</span>
                    </Link>
                  );
                })
              : null}
          </div>
        );
      })}
    </div>
  );
}
