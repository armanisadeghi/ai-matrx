import type { RouteNavItem } from "@/features/shell/components/header/RouteModeNav";
import {
  Cloud,
  FileText,
  FolderOpen,
  Globe,
  LayoutGrid,
  Monitor,
  Settings2,
  Terminal,
  Zap,
} from "lucide-react";

export const LOCAL_TOOLS_NAV_ITEMS: RouteNavItem[] = [
  { name: "Hub", href: "/demos/local-tools", icon: LayoutGrid },
  { name: "Scraper", href: "/demos/local-tools/scraper", icon: Globe },
  { name: "Files", href: "/demos/local-tools/files", icon: FileText },
  { name: "System", href: "/demos/local-tools/system", icon: Monitor },
  { name: "Shell", href: "/demos/local-tools/shell", icon: Terminal },
  { name: "Terminal", href: "/demos/local-tools/terminal", icon: FolderOpen },
  {
    name: "Documents",
    href: "/demos/local-tools/documents",
    icon: FileText,
  },
  { name: "Cloud", href: "/demos/local-tools/cloud-sync", icon: Cloud },
  { name: "Engine", href: "/demos/local-tools/engine", icon: Settings2 },
  {
    name: "PowerShell",
    href: "/demos/local-tools/powershell",
    icon: Zap,
  },
];
