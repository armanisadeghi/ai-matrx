"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

console.log("[IconResolver] Loading IconResolver file...");

// Statically import commonly used Lucide icons to reduce bundle size
import {
  Zap,
  Home,
  User,
  Settings,
  Search,
  Bell,
  Menu,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  Edit,
  Trash,
  Check,
  AlertCircle,
  Info,
  HelpCircle,
  Eye,
  EyeOff,
  Copy,
  Download,
  Upload,
  Save,
  MoreVertical,
  MoreHorizontal,
  Filter,
  SortAsc,
  SortDesc,
  Calendar,
  Clock,
  Mail,
  Phone,
  MapPin,
  Link,
  ExternalLink,
  File,
  Folder,
  Image,
  Video,
  Music,
  FileText,
  Database,
  Cloud,
  Server,
  Code,
  Terminal,
  Globe,
  Lock,
  Unlock,
  Shield,
  Key,
  LogIn,
  LogOut,
  UserPlus,
  Users,
  Star,
  Heart,
  Bookmark,
  Share,
  Send,
  MessageSquare,
  MessageCircle,
  Hash,
  AtSign,
  Paperclip,
  Mic,
  Volume2,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RefreshCw,
  RotateCw,
  Loader,
  Loader2,
  Circle,
  Square,
  Triangle,
  Hexagon,
  Package,
  Box,
  Archive,
  Inbox,
  Layers,
  Layout,
  Grid,
  List,
  Columns,
  Sidebar,
  Maximize,
  Minimize,
  ZoomIn,
  ZoomOut,
  Move,
  Scissors,
  Clipboard,
  PieChart,
  BarChart,
  TrendingUp,
  TrendingDown,
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  WifiOff,
  Bluetooth,
  Battery,
  BatteryCharging,
  Power,
  Sun,
  Moon,
  CloudRain,
  Droplet,
  Wind,
  Tag,
  Tags,
  Flag,
  Award,
  Gift,
  ShoppingCart,
  CreditCard,
  DollarSign,
  Percent,
  Target,
  Crosshair,
  Navigation,
  Compass,
  Map,
  Smile,
  Frown,
  Meh,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import {
  FcGoogle,
  FcBrokenLink,
  FcFilm,
  FcDownload,
  FcBiotech,
  FcElectronics,
  FcGraduationCap,
  FcLibrary,
  FcMusic,
  FcParallelTasks,
  FcSalesPerformance,
  FcCalendar,
  FcDocument,
  FcEngineering,
  FcDataProtection,
  FcAssistant,
  FcSms,
  FcTodoList,
  FcWikipedia,
  FcCommandLine,
  FcConferenceCall,
  FcManager,
  FcAreaChart,
  FcMultipleInputs,
  FcShipped,
  FcBusinessContact,
  FcAlphabeticalSortingAz,
  FcAlphabeticalSortingZa,
  FcFeedback,
  FcSignature,
  FcBusiness,
} from "react-icons/fc";
import { FaBrave } from "react-icons/fa6";
import { parseMatrxSvgPublicPath } from "@/utils/icons/matrx-public-svg-registry";
import {
  markIconResolved,
  isHexColor,
  getTextColorClass,
} from "./icon-resolve";

// ─── TRIPWIRE ───────────────────────────────────────────────────────────────
// This module statically imports the FULL icon payload (~145 lucide + ~30
// react-icons). It is DB-ONLY: it must load ONLY after a user action that pulls
// a user-defined icon name from the database, always via a *.dynamic.tsx front
// door. If you see this log during a plain page/menu/header render — BEFORE any
// user interaction — a file is rendering a hardcoded icon through the DB-only
// system instead of importing it directly from lucide-react / using the SVG
// TapTarget set. That file is the leak. Find it and fix it.
console.log(
  "[IconResolver][TRIPWIRE] heavy icon payload loaded — this should ONLY happen after a user action that renders a DB-defined icon. If this fired on a static render, find the offender.",
);
// Stack trace so we can SEE which import chain pulled this module at boot.
// Captured as a single string block (easy to copy in one go) AND as a native
// console.trace (expandable frames). Remove once the boot leak is confirmed dead.
console.trace("[IconResolver][TRIPWIRE] import chain that loaded the payload");
try {
  const stack =
    new Error("IconResolver payload load site").stack ?? "(no stack)";
  console.log(
    "[IconResolver][TRIPWIRE] COPYABLE STACK ↓↓↓\n" +
      stack +
      "\n↑↑↑ COPYABLE STACK",
  );
} catch {
  /* noop */
}

// Re-export the lean, payload-free helpers so existing importers of these names
// keep working. New logic-only callers should import them from
// "./icon-resolve" directly (no payload). See that module's header.
export {
  getCuratedIconIdsForPicker,
  isIconRegisteredSync,
  isRegisteredOrLucideIconName,
} from "./icon-resolve";
// `isHexColor` / `getTextColorClass` are imported above for internal use and
// re-exported here for back-compat with existing importers.
export { isHexColor, getTextColorClass };

// Statically imported Lucide icons map (commonly used icons for optimal bundle size)
// Exported so callers can spread it as a scope without importing the full lucide namespace.
export const staticLucideIconMap: Record<string, any> = {
  Zap,
  Home,
  User,
  Settings,
  Search,
  Bell,
  Menu,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  Edit,
  Trash,
  Check,
  AlertCircle,
  Info,
  HelpCircle,
  Eye,
  EyeOff,
  Copy,
  Download,
  Upload,
  Save,
  MoreVertical,
  MoreHorizontal,
  Filter,
  SortAsc,
  SortDesc,
  Calendar,
  Clock,
  Mail,
  Phone,
  MapPin,
  Link,
  ExternalLink,
  File,
  Folder,
  Image,
  Video,
  Music,
  FileText,
  Database,
  Cloud,
  Server,
  Code,
  Terminal,
  Globe,
  Lock,
  Unlock,
  Shield,
  Key,
  LogIn,
  LogOut,
  UserPlus,
  Users,
  Star,
  Heart,
  Bookmark,
  Share,
  Send,
  MessageSquare,
  MessageCircle,
  Hash,
  AtSign,
  Paperclip,
  Mic,
  Volume2,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RefreshCw,
  RotateCw,
  Loader,
  Loader2,
  Circle,
  Square,
  Triangle,
  Hexagon,
  Package,
  Box,
  Archive,
  Inbox,
  Layers,
  Layout,
  Grid,
  List,
  Columns,
  Sidebar,
  Maximize,
  Minimize,
  ZoomIn,
  ZoomOut,
  Move,
  Scissors,
  Clipboard,
  PieChart,
  BarChart,
  TrendingUp,
  TrendingDown,
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  WifiOff,
  Bluetooth,
  Battery,
  BatteryCharging,
  Power,
  Sun,
  Moon,
  CloudRain,
  Droplet,
  Wind,
  Tag,
  Tags,
  Flag,
  Award,
  Gift,
  ShoppingCart,
  CreditCard,
  DollarSign,
  Percent,
  Target,
  Crosshair,
  Navigation,
  Compass,
  Map,
  Smile,
  Frown,
  Meh,
  ThumbsUp,
  ThumbsDown,
};

// Custom icons map for manually imported icons (react-icons)
const customIconMap: Record<string, any> = {
  FaBrave,
  FcGoogle,
  FcBrokenLink,
  FcFilm,
  FcDownload,
  FcBiotech,
  FcElectronics,
  FcGraduationCap,
  FcLibrary,
  FcMusic,
  FcParallelTasks,
  FcSalesPerformance,
  FcCalendar,
  FcDocument,
  FcEngineering,
  FcDataProtection,
  FcAssistant,
  FcSms,
  FcTodoList,
  FcWikipedia,
  FcCommandLine,
  FcConferenceCall,
  FcManager,
  FcAreaChart,
  FcMultipleInputs,
  FcShipped,
  FcBusinessContact,
  FcAlphabeticalSortingAz,
  FcAlphabeticalSortingZa,
  FcFeedback,
  FcBusiness,
  FcSignature,
};

// Cache for dynamically loaded icons to prevent re-importing
const dynamicIconCache: Record<string, any> = {};

/**
 * HOW TO ADD MORE STATIC ICONS:
 *
 * If you find yourself frequently using an icon that's not in the static map,
 * add it to optimize bundle size:
 *
 * 1. Import it at the top:
 *    import { YourIcon } from "lucide-react";
 *
 * 2. Add it to staticLucideIconMap:
 *    const staticLucideIconMap = {
 *      ...existing icons,
 *      YourIcon,
 *    };
 *
 * This way it will be included in the initial bundle and won't need dynamic loading.
 */

interface IconResolverProps {
  iconName: string | null;
  className?: string;
  size?: number;
  fallbackIcon?: string;
  style?: React.CSSProperties;
}

/**
 * IconResolver - A unified component for resolving and rendering icons by name
 * Uses hybrid approach: static imports for common icons, dynamic imports for others
 * Supports all lucide-react icons and custom manually imported icons
 */
const IconResolver: React.FC<IconResolverProps> = ({
  iconName,
  className = "h-4 w-4",
  size,
  fallbackIcon = "Zap",
  style,
}) => {
  const svgSrc = iconName ? parseMatrxSvgPublicPath(iconName) : null;
  const [DynamicIcon, setDynamicIcon] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadIcon = async () => {
      if (!iconName) {
        setDynamicIcon(null);
        setIsLoading(false);
        return;
      }

      if (parseMatrxSvgPublicPath(iconName)) {
        setDynamicIcon(null);
        setIsLoading(false);
        return;
      }

      // Check custom icons first
      if (customIconMap[iconName]) {
        setDynamicIcon(() => customIconMap[iconName]);
        return;
      }

      // Check statically imported Lucide icons
      if (staticLucideIconMap[iconName]) {
        setDynamicIcon(() => staticLucideIconMap[iconName]);
        return;
      }

      // Check if already cached
      if (dynamicIconCache[iconName]) {
        setDynamicIcon(() => dynamicIconCache[iconName]);
        return;
      }

      // Dynamically import from lucide-react
      setIsLoading(true);
      try {
        const iconModule = await import("lucide-react");
        const IconComponent = iconModule[iconName as keyof typeof iconModule];

        if (IconComponent) {
          dynamicIconCache[iconName] = IconComponent;
          markIconResolved(iconName);
          setDynamicIcon(() => IconComponent);
        } else {
          // Icon not found, use fallback
          setDynamicIcon(() => staticLucideIconMap[fallbackIcon] || Zap);
        }
      } catch (error) {
        console.warn(`Failed to load icon: ${iconName}`, error);
        setDynamicIcon(() => staticLucideIconMap[fallbackIcon] || Zap);
      } finally {
        setIsLoading(false);
      }
    };

    loadIcon();
  }, [iconName, fallbackIcon]);

  if (svgSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static public SVG assets
      <img
        src={svgSrc}
        alt=""
        className={cn("object-contain shrink-0", className)}
        width={size}
        height={size}
        style={style}
      />
    );
  }

  // Get the icon component to render
  const IconComponent = DynamicIcon || staticLucideIconMap[fallbackIcon] || Zap;

  // Show fallback while loading dynamic icons (seamless experience)
  if (isLoading && !DynamicIcon) {
    const FallbackIcon = staticLucideIconMap[fallbackIcon] || Zap;
    return <FallbackIcon className={className} size={size} style={style} />;
  }

  return <IconComponent className={className} size={size} style={style} />;
};

export default IconResolver;

/**
 * Synchronous utility function for getting icon components directly
 * Only works with statically imported icons (custom + common Lucide icons)
 * For dynamic Lucide icons not in the static map, use the IconResolver component instead
 *
 * **Always returns a component** (default/fallback Zap when unknown). Do not use the return
 * value to infer whether `iconName` exists — use {@link isIconRegisteredSync} or
 * {@link isRegisteredOrLucideIconName} instead.
 */
export const getIconComponent = (
  iconName: string | null,
  fallbackIcon: string = "Zap",
) => {
  console.log(
    "[IconResolver][TRIPWIRE] getIconComponent called — DB-only path. iconName:",
    iconName,
  );
  if (!iconName) {
    return staticLucideIconMap[fallbackIcon] || Zap;
  }

  // First check custom icons
  if (customIconMap[iconName]) {
    return customIconMap[iconName];
  }

  // Then check statically imported Lucide icons
  if (staticLucideIconMap[iconName]) {
    return staticLucideIconMap[iconName];
  }

  // Check dynamic cache
  if (dynamicIconCache[iconName]) {
    return dynamicIconCache[iconName];
  }

  // Fallback to default icon
  return staticLucideIconMap[fallbackIcon] || Zap;
};

/**
 * Renders an icon element directly with optional props
 * This is the preferred method for rendering icons in JSX
 */
export const renderIcon = (
  iconName: string | null | undefined,
  props?: React.ComponentProps<any>,
  fallbackIcon: string = "Zap",
) => {
  console.log(
    "[IconResolver][TRIPWIRE] renderIcon called — DB-only path. iconName:",
    iconName,
  );
  const IconComponent = getIconComponent(iconName, fallbackIcon);
  return <IconComponent {...props} />;
};

/**
 * Utility function for rendering an icon with color and size
 * Note: This is synchronous and only works with statically imported icons
 * For dynamic icons, use the DynamicIcon component instead
 */
export const getIconWithColorAndSize = (
  iconName: string | null,
  color: string = "gray",
  size: number = 4,
) => {
  const IconComponent = getIconComponent(iconName);
  const colorClass = getTextColorClass(color);
  return <IconComponent className={`h-${size} w-${size} ${colorClass}`} />;
};

/**
 * Simple Icon component for direct usage with color and size support
 * Uses IconResolver internally to support both static and dynamic icons
 *
 * Supports both Tailwind color names (e.g., "blue", "red", "zinc") and hex colors (e.g., "#ff0000", "#666")
 */
interface IconProps {
  name: string | null;
  color?: string;
  size?: number;
  className?: string;
  fallbackIcon?: string;
}

export const DynamicIcon: React.FC<IconProps> = ({
  name,
  color = "gray",
  size = 4,
  className,
  fallbackIcon = "Zap",
}) => {
  const isHex = color && isHexColor(color);
  const colorClass = isHex ? null : getTextColorClass(color);
  const sizeClass = `h-${size} w-${size}`;

  console.log("[DynamicIcon] rendering icon:", name);

  // Build className: always include size, include colorClass if not hex, include custom className
  const combinedClassName = [sizeClass, !isHex && colorClass, className]
    .filter(Boolean)
    .join(" ")
    .trim();

  // If hex color, apply as inline style
  const style = isHex ? { color } : undefined;

  return (
    <IconResolver
      iconName={name}
      className={combinedClassName}
      fallbackIcon={fallbackIcon}
      style={style}
    />
  );
};
