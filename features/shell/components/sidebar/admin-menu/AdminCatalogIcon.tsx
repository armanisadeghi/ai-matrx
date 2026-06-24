"use client";

/**
 * AdminCatalogIcon — renders an admin-catalog icon by its build-time name using
 * DIRECT lucide-react imports (no DB-only IconResolver, no heavy payload).
 *
 * The admin catalog (`adminCategoriesData`) stores icon names as strings, but
 * those names are HARDCODED at build time — they are NOT user/DB-defined. So
 * they must NOT go through the DB-only IconResolver (which drags ~145 lucide +
 * ~30 react-icons into the always-on mobile side sheet, the boot leak we hunted
 * down via the [IconResolver][TRIPWIRE] stack trace).
 *
 * This map contains exactly the icons referenced by the catalog. When you add a
 * new `iconName` to `admin-categories.ts`, add the matching lucide import here.
 * Unknown names fall back to `Zap` (matching the old resolver fallback).
 */

import {
  MessageSquare,
  BarChart3,
  Send,
  DollarSign,
  AlertCircle,
  Beaker,
  Container,
  LayoutDashboard,
  Server,
  ScrollText,
  Bug,
  CalendarClock,
  Calendar,
  LineChart,
  OctagonAlert,
  Clipboard,
  Search,
  Globe,
  Network,
  Brain,
  AlertTriangle,
  RefreshCw,
  Zap,
  Bot,
  GitBranch,
  Boxes,
  Folder,
  Shield,
  Download,
  File,
  SlidersHorizontal,
  Mic,
  Pencil,
  Code,
  Layout,
  TestTube,
  Box,
  Cpu,
  Users,
  ShieldCheck,
  Database,
  Cloud,
  DatabaseBackup,
  DatabaseZap,
  ToggleLeft,
  Flag,
  List,
  type LucideIcon,
} from "lucide-react";

const ADMIN_CATALOG_ICONS: Record<string, LucideIcon> = {
  MessageSquare,
  BarChart3,
  Send,
  DollarSign,
  AlertCircle,
  Beaker,
  Container,
  LayoutDashboard,
  Server,
  ScrollText,
  Bug,
  CalendarClock,
  Calendar,
  LineChart,
  OctagonAlert,
  Clipboard,
  Search,
  Globe,
  Network,
  Brain,
  AlertTriangle,
  RefreshCw,
  Zap,
  Bot,
  GitBranch,
  Boxes,
  Folder,
  Shield,
  Download,
  File,
  SlidersHorizontal,
  Mic,
  Pencil,
  Code,
  Layout,
  TestTube,
  Box,
  Cpu,
  Users,
  ShieldCheck,
  Database,
  Cloud,
  DatabaseBackup,
  DatabaseZap,
  ToggleLeft,
  Flag,
  List,
};

interface AdminCatalogIconProps {
  name: string | null | undefined;
  className?: string;
}

export function AdminCatalogIcon({ name, className }: AdminCatalogIconProps) {
  const Icon = (name && ADMIN_CATALOG_ICONS[name]) || Zap;
  return <Icon className={className} />;
}

export default AdminCatalogIcon;
