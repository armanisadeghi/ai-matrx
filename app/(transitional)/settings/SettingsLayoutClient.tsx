"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  User,
  Settings as SettingsIcon,
  Building2,
  Chrome,
  Mic,
  FileText,
  MessageSquareMore,
  Plug,
  Monitor,
  MessageSquare,
  Volume2,
  SquareStack,
  Mail,
  Video,
  Image as ImageIcon,
  Type,
  Code,
  BookOpen,
  Gamepad2,
  Cpu,
  Zap,
  BrainCircuit,
  Database,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MobileDock, type DockItem } from "@/components/navigation/MobileDock";

interface SettingsNavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  IconComp: LucideIcon;
  children?: { title: string; param: string; icon: React.ReactNode }[];
}

const settingsNavItems: SettingsNavItem[] = [
  {
    title: "Profile",
    href: "/settings/profile",
    icon: <User className="h-3.5 w-3.5" />,
    IconComp: User,
  },
  {
    title: "Preferences",
    href: "/settings/preferences",
    icon: <SettingsIcon className="h-3.5 w-3.5" />,
    IconComp: SettingsIcon,
    children: [
      {
        title: "Display",
        param: "display",
        icon: <Monitor className="h-3 w-3" />,
      },
      { title: "Prompts", param: "prompts", icon: <Zap className="h-3 w-3" /> },
      {
        title: "Messaging",
        param: "messaging",
        icon: <MessageSquare className="h-3 w-3" />,
      },
      { title: "Voice", param: "voice", icon: <Mic className="h-3 w-3" /> },
      {
        title: "TTS",
        param: "textToSpeech",
        icon: <Volume2 className="h-3 w-3" />,
      },
      {
        title: "Assistant",
        param: "assistant",
        icon: <SquareStack className="h-3 w-3" />,
      },
      {
        title: "AI Models",
        param: "aiModels",
        icon: <Cpu className="h-3 w-3" />,
      },
      { title: "Email", param: "email", icon: <Mail className="h-3 w-3" /> },
      {
        title: "Video",
        param: "videoConference",
        icon: <Video className="h-3 w-3" />,
      },
      {
        title: "Photo",
        param: "photoEditing",
        icon: <ImageIcon className="h-3 w-3" />,
      },
      {
        title: "Images",
        param: "imageGeneration",
        icon: <ImageIcon className="h-3 w-3" />,
      },
      {
        title: "Text",
        param: "textGeneration",
        icon: <Type className="h-3 w-3" />,
      },
      { title: "Coding", param: "coding", icon: <Code className="h-3 w-3" /> },
      {
        title: "Flashcards",
        param: "flashcard",
        icon: <BookOpen className="h-3 w-3" />,
      },
      {
        title: "Playground",
        param: "playground",
        icon: <Gamepad2 className="h-3 w-3" />,
      },
      {
        title: "Agent Context",
        param: "agentContext",
        icon: <BrainCircuit className="h-3 w-3" />,
      },
    ],
  },
  {
    title: "Templates",
    href: "/settings/content-templates",
    icon: <FileText className="h-3.5 w-3.5" />,
    IconComp: FileText,
  },
  {
    title: "Agent shortcuts",
    href: "/agents/shortcuts",
    icon: <Zap className="h-3.5 w-3.5" />,
    IconComp: Zap,
  },
  {
    title: "Voice & Mic",
    href: "/settings/voice",
    icon: <Mic className="h-3.5 w-3.5" />,
    IconComp: Mic,
  },
  {
    title: "Integrations",
    href: "/settings/integrations",
    icon: <Plug className="h-3.5 w-3.5" />,
    IconComp: Plug,
  },
  {
    title: "Sandbox Storage",
    href: "/settings/sandbox-storage",
    icon: <Database className="h-3.5 w-3.5" />,
    IconComp: Database,
  },
  {
    title: "Orgs",
    href: "/settings/organizations",
    icon: <Building2 className="h-3.5 w-3.5" />,
    IconComp: Building2,
  },
  {
    title: "Feedback",
    href: "/settings/feedback",
    icon: <MessageSquareMore className="h-3.5 w-3.5" />,
    IconComp: MessageSquareMore,
  },
  {
    title: "Extension",
    href: "/settings/extension",
    icon: <Chrome className="h-3.5 w-3.5" />,
    IconComp: Chrome,
  },
];

const settingsDockItems: DockItem[] = settingsNavItems.map((item) => ({
  key: item.href,
  label: item.title,
  icon: item.IconComp,
  href: item.href,
}));

function SettingsNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab");

  return (
    <nav>
      <div className="py-1">
        {settingsNavItems.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(item.href + "/");
          const isExpanded = isActive && !!item.children;

          return (
            <div key={item.href}>
              {/* Top-level item */}
              <Link
                href={
                  item.children
                    ? `${item.href}?tab=${item.children[0].param}`
                    : item.href
                }
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 transition-colors text-xs",
                  "hover:bg-muted/80",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {item.icon}
                </span>
                <span className="truncate">{item.title}</span>
              </Link>

              {/* Sub-items (expanded when parent is active) */}
              {isExpanded && item.children && (
                <div className="py-0.5">
                  {item.children.map((child) => {
                    const isChildActive =
                      activeTab === child.param ||
                      (!activeTab && child.param === item.children![0].param);

                    return (
                      <Link
                        key={child.param}
                        href={`${item.href}?tab=${child.param}`}
                        className={cn(
                          "flex items-center gap-1.5 pl-8 pr-3 py-1 transition-colors text-[11px]",
                          "hover:bg-muted/80",
                          isChildActive
                            ? "text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "shrink-0",
                            isChildActive
                              ? "text-primary"
                              : "text-muted-foreground/60",
                          )}
                        >
                          {child.icon}
                        </span>
                        <span className="truncate">{child.title}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export default function SettingsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-page w-full flex flex-col bg-transparent">
      <div className="flex flex-1 overflow-hidden bg-transparent">
        {/* Desktop sidebar — two-tier nav */}
        <aside className="hidden md:flex w-40 shrink-0 border-r border-border/60 bg-muted/30">
          <ScrollArea className="h-full w-full">
            <SettingsNavigation />
          </ScrollArea>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-h-0 overflow-y-auto bg-transparent">
          {children}
        </main>
      </div>

      <MobileDock items={settingsDockItems} />
    </div>
  );
}
