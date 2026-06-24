"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
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
import { isLucideModuleIconExport } from "@/utils/icons/lucide-module-icon";
import {
  isMatrxSvgIconValue,
  listMatrxSvgIconValues,
  parseMatrxSvgPublicPath,
} from "@/utils/icons/matrx-public-svg-registry";

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
 * Finite list for the curated icon gallery: every statically bundled Lucide name,
 * custom registry ids (react-icons), and all `svg:…` public assets.
 */
export function getCuratedIconIdsForPicker(): string[] {
  const set = new Set<string>();
  for (const k of Object.keys(staticLucideIconMap)) {
    set.add(k);
  }
  for (const k of Object.keys(customIconMap)) {
    set.add(k);
  }
  for (const id of listMatrxSvgIconValues()) {
    set.add(id);
  }
  return Array.from(set).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

/**
 * True if this exact name maps to a known icon (static Lucide, custom map, or
 * previously resolved dynamic Lucide cached under this key).
 *
 * Does not import lucide-react — use with {@link isRegisteredOrLucideIconName} for full checks.
 */
export function isIconRegisteredSync(
  iconName: string | null | undefined,
): boolean {
  if (!iconName || iconName.trim() === "") {
    return false;
  }
  const name = iconName;
  if (customIconMap[name]) return true;
  if (staticLucideIconMap[name]) return true;
  return Boolean(dynamicIconCache[name]);
}

/**
 * True if `iconName` is a real icon id: custom/static/cached, or a Lucide export
 * that is a function component (not the fallback Zap).
 *
 * Prefer this over truthiness on {@link getIconComponent}, which always returns a component.
 */
export async function isRegisteredOrLucideIconName(
  iconName: string | null | undefined,
): Promise<boolean> {
  if (!iconName || iconName.trim() === "") {
    return false;
  }
  if (isMatrxSvgIconValue(iconName)) {
    return true;
  }
  if (isIconRegisteredSync(iconName)) {
    return true;
  }
  try {
    const iconModule = await import("lucide-react");
    const Exported = iconModule[iconName as keyof typeof iconModule];
    return isLucideModuleIconExport(iconName, Exported);
  } catch {
    return false;
  }
}

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
  const IconComponent = getIconComponent(iconName, fallbackIcon);
  return <IconComponent {...props} />;
};

/**
 * Utility to detect if a string is a hex color code
 */
export const isHexColor = (color: string): boolean => {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
};

export const getTextColorClass = (color?: string) => {
  if (!color) return "text-gray-600 dark:text-gray-400";

  // If it's a hex color, return null (we'll use inline styles instead)
  if (isHexColor(color)) return null;

  const colorMap: Record<string, string> = {
    gray: "text-gray-600 dark:text-gray-400",
    rose: "text-rose-600 dark:text-rose-400",
    blue: "text-blue-600 dark:text-blue-400",
    amber: "text-amber-600 dark:text-amber-400",
    cyan: "text-cyan-600 dark:text-cyan-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    fuchsia: "text-fuchsia-600 dark:text-fuchsia-400",
    green: "text-green-600 dark:text-green-400",
    indigo: "text-indigo-600 dark:text-indigo-400",
    lime: "text-lime-600 dark:text-lime-400",
    neutral: "text-neutral-600 dark:text-neutral-400",
    orange: "text-orange-600 dark:text-orange-400",
    pink: "text-pink-600 dark:text-pink-400",
    purple: "text-purple-600 dark:text-purple-400",
    red: "text-red-600 dark:text-red-400",
    sky: "text-sky-600 dark:text-sky-400",
    slate: "text-slate-600 dark:text-slate-400",
    stone: "text-stone-600 dark:text-stone-400",
    teal: "text-teal-600 dark:text-teal-400",
    violet: "text-violet-600 dark:text-violet-400",
    yellow: "text-yellow-600 dark:text-yellow-400",
    zinc: "text-zinc-600 dark:text-zinc-400",
  };

  return colorMap[color.toLowerCase()] || "text-gray-600 dark:text-gray-400";
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
