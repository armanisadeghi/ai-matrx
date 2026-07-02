// components/ui/IconSystem.js
import React from "react";

// Import icons from lucide-react
import {
    Search,
    Settings,
    User,
    Home,
    Plus,
    ChevronRight,
    Mail,
    Bell,
    Calendar,
    Download,
    Upload,
    ArrowBigRightDash,
    Send,
    // Add more icons specifically good for Submit buttons
    CheckIcon,
    CheckCircle,
    Check,
    ArrowRight,
    ArrowRightCircle,
    MoveRight,
    Forward,
    CornerRightDown,
    Save,
    ThumbsUp,
    CircleCheck,
    CircleArrowRight,
    CircleCheckBig,
    FileCheck,
    ArrowRightFromLine,
    ArrowUpRight,
    SquareArrowRight,
    Menu,
    LayoutPanelLeft,
    Sun,
    Moon,
    MessageSquare,
    HelpCircle,
    TreePalm,
    // Add more app icons
    Bookmark,
    Box,
    Briefcase,
    Building,
    Coffee,
    Compass,
    Crown,
    Database,
    Flag,
    Flower,
    Gift,
    Globe,
    Heart,
    Image,
    Layers,
    Library,
    LifeBuoy,
    Lightbulb,
    Map,
    Monitor,
    Music,
    Package,
    Palette,
    Pizza,
    Radio,
    Rocket,
    ShoppingBag,
    Star,
    AppWindowIcon,
    AppWindow,
    LayoutTemplate,
    Target,
    Ticket,
    Trophy,
    Tv,
    Zap,
} from "lucide-react";
import { FaCheck, FaArrowRight, FaCheckCircle, FaMagic, FaSave, FaThumbsUp, FaArrowCircleRight, FaPaperPlane } from "react-icons/fa";
import { SiMagic } from "react-icons/si";
import { LuBrain } from "react-icons/lu";
import { GiArtificialIntelligence } from "react-icons/gi";
import { FaBrain } from "react-icons/fa";
import { SiCodemagic } from "react-icons/si";
// Additional React icons for app icons<LayoutTemplate />
import { 
    FaChartBar, 
    FaClipboard, 
    FaCode, 
    FaCoffee, 
    FaDesktop, 
    FaEnvelope, 
    FaFileAlt, 
    FaGamepad, 
    FaGraduationCap, 
    FaHeadphones, 
    FaLaptop, 
    FaLock, 
    FaMapMarkerAlt, 
    FaMicrophone, 
    FaMusic, 
    FaNewspaper, 
    FaStore, 
    FaTools, 
    FaUser 
} from "react-icons/fa";

// Define your icon options
export const ICON_OPTIONS = {
    Search,
    Settings,
    User,
    Home,
    Plus,
    ChevronRight,
    Mail,
    Bell,
    Calendar,
    Download,
    Upload,
    Send,
    FaMagic,
    ArrowBigRightDash,
    AppWindowIcon,
    AppWindow,
    LayoutTemplate,
    CheckIcon,
    CircleArrowRight,
    CircleCheckBig,
    FileCheck,

    // Added submit button icons
    CheckCircle,
    Check,
    ArrowRight,
    ArrowRightCircle,
    MoveRight,
    Forward,
    Save,
    ThumbsUp,
    CircleCheck,
    ArrowRightFromLine,
    ArrowUpRight,
    SquareArrowRight,
    Menu,
    LayoutPanelLeft,
    Sun,
    
    // React icons
    FaCheck,
    FaArrowRight,
    FaArrowCircleRight,
    FaPaperPlane,
    FaCheckCircle,
    FaSave,
    FaThumbsUp,
    TreePalm,
    SiMagic,
    LuBrain,
    GiArtificialIntelligence,
    FaBrain,
    SiCodemagic,
    
    // Additional app icons - Lucide
    Bookmark,
    Box,
    Briefcase,
    Building,
    Coffee,
    Compass,
    Crown,
    Database,
    Flag,
    Flower,
    Gift,
    Globe,
    Heart,
    Image,
    Layers,
    Library,
    LifeBuoy,
    Lightbulb,
    Map,
    MessageSquare,
    Monitor,
    Moon,
    Music,
    Package,
    Palette,
    Pizza,
    Radio,
    Rocket,
    ShoppingBag,
    Star,
    Target,
    Ticket,
    Trophy,
    Tv,
    Zap,
    HelpCircle,
    
    // Additional app icons - React Icons
    FaChartBar,
    FaClipboard,
    FaCode,
    FaCoffee,
    FaDesktop,
    FaEnvelope,
    FaFileAlt,
    FaGamepad,
    FaGraduationCap,
    FaHeadphones,
    FaLaptop,
    FaLock,
    FaMapMarkerAlt,
    FaMicrophone,
    FaMusic,
    FaNewspaper,
    FaStore,
    FaTools,
};

// Define color variations for different component types
export const COLOR_VARIANTS = {
    // Background color variants for action buttons
    buttonBg: {
        rose: "bg-rose-500 hover:bg-rose-600 dark:bg-rose-600 dark:hover:bg-rose-700 text-white",
        blue: "bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white",
        green: "bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white",
        purple: "bg-purple-500 hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700 text-white",
        yellow: "bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700 text-black",
        red: "bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white",
        orange: "bg-orange-500 hover:bg-orange-600 dark:bg-orange-600 dark:hover:bg-orange-700 text-white",
        pink: "bg-pink-500 hover:bg-pink-600 dark:bg-pink-600 dark:hover:bg-pink-700 text-white",
        slate: "bg-slate-500 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-700 text-white",
        zinc: "bg-zinc-500 hover:bg-zinc-600 dark:bg-zinc-600 dark:hover:bg-zinc-700 text-white",
        neutral: "bg-neutral-500 hover:bg-neutral-600 dark:bg-neutral-600 dark:hover:bg-neutral-700 text-white",
        stone: "bg-stone-500 hover:bg-stone-600 dark:bg-stone-600 dark:hover:bg-stone-700 text-white",
        amber: "bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700 text-black",
        lime: "bg-lime-500 hover:bg-lime-600 dark:bg-lime-600 dark:hover:bg-lime-700 text-black",
        emerald: "bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white",
        teal: "bg-teal-500 hover:bg-teal-600 dark:bg-teal-600 dark:hover:bg-teal-700 text-white",
        cyan: "bg-cyan-500 hover:bg-cyan-600 dark:bg-cyan-600 dark:hover:bg-cyan-700 text-white",
        sky: "bg-sky-500 hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-700 text-white",
        violet: "bg-violet-500 hover:bg-violet-600 dark:bg-violet-600 dark:hover:bg-violet-700 text-white",
        fuchsia: "bg-fuchsia-500 hover:bg-fuchsia-600 dark:bg-fuchsia-600 dark:hover:bg-fuchsia-700 text-white",
    },

    // Text color variants for icons and text elements
    text: {
        rose: "text-rose-500 dark:text-rose-600 hover:text-rose-600 dark:hover:text-rose-700",
        blue: "text-blue-500 dark:text-blue-600 hover:text-blue-600 dark:hover:text-blue-700",
        green: "text-green-500 dark:text-green-600 hover:text-green-600 dark:hover:text-green-700",
        purple: "text-purple-500 dark:text-purple-600 hover:text-purple-600 dark:hover:text-purple-700",
        yellow: "text-yellow-500 dark:text-yellow-600 hover:text-yellow-600 dark:hover:text-yellow-700",
        red: "text-red-500 dark:text-red-600 hover:text-red-600 dark:hover:text-red-700",
        orange: "text-orange-500 dark:text-orange-600 hover:text-orange-600 dark:hover:text-orange-700",
        pink: "text-pink-500 dark:text-pink-600 hover:text-pink-600 dark:hover:text-pink-700",
        slate: "text-slate-500 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-700",
        zinc: "text-zinc-500 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-700",
        neutral: "text-neutral-500 dark:text-neutral-600 hover:text-neutral-600 dark:hover:text-neutral-700",
        stone: "text-stone-500 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-700",
        amber: "text-amber-500 dark:text-amber-600 hover:text-amber-600 dark:hover:text-amber-700",
        lime: "text-lime-500 dark:text-lime-600 hover:text-lime-600 dark:hover:text-lime-700",
        emerald: "text-emerald-500 dark:text-emerald-600 hover:text-emerald-600 dark:hover:text-emerald-700",
        teal: "text-teal-500 dark:text-teal-600 hover:text-teal-600 dark:hover:text-teal-700",
        cyan: "text-cyan-500 dark:text-cyan-600 hover:text-cyan-600 dark:hover:text-cyan-700",
        sky: "text-sky-500 dark:text-sky-600 hover:text-sky-600 dark:hover:text-sky-700",
        violet: "text-violet-500 dark:text-violet-600 hover:text-violet-600 dark:hover:text-violet-700",
        fuchsia: "text-fuchsia-500 dark:text-fuchsia-600 hover:text-fuchsia-600 dark:hover:text-fuchsia-700",
    },

    // Border color variants
    border: {
        rose: "border-rose-500 dark:border-rose-400 hover:border-rose-600 dark:hover:border-rose-700",
        blue: "border-blue-500 dark:border-blue-400 hover:border-blue-600 dark:hover:border-blue-700",
        green: "border-green-500 dark:border-green-400 hover:border-green-600 dark:hover:border-green-700",
        purple: "border-purple-500 dark:border-purple-400 hover:border-purple-600 dark:hover:border-purple-700",
        yellow: "border-yellow-500 dark:border-yellow-400 hover:border-yellow-600 dark:hover:border-yellow-700",
        red: "border-red-500 dark:border-red-400 hover:border-red-600 dark:hover:border-red-700",
        orange: "border-orange-500 dark:border-orange-400 hover:border-orange-600 dark:hover:border-orange-700",
        pink: "border-pink-500 dark:border-pink-400 hover:border-pink-600 dark:hover:border-pink-700",
        slate: "border-slate-500 dark:border-slate-400 hover:border-slate-600 dark:hover:border-slate-700",
        zinc: "border-zinc-500 dark:border-zinc-400 hover:border-zinc-600 dark:hover:border-zinc-700",
        neutral: "border-neutral-500 dark:border-neutral-400 hover:border-neutral-600 dark:hover:border-neutral-700",
        stone: "border-stone-500 dark:border-stone-400 hover:border-stone-600 dark:hover:border-stone-700",
        amber: "border-amber-500 dark:border-amber-400 hover:border-amber-600 dark:hover:border-amber-700",
        lime: "border-lime-500 dark:border-lime-400 hover:border-lime-600 dark:hover:border-lime-700",
        emerald: "border-emerald-500 dark:border-emerald-400 hover:border-emerald-600 dark:hover:border-emerald-700",
        teal: "border-teal-500 dark:border-teal-400 hover:border-teal-600 dark:hover:border-teal-700",
        cyan: "border-cyan-500 dark:border-cyan-400 hover:border-cyan-600 dark:hover:border-cyan-700",
        sky: "border-sky-500 dark:border-sky-400 hover:border-sky-600 dark:hover:border-sky-700",
        violet: "border-violet-500 dark:border-violet-400 hover:border-violet-600 dark:hover:border-violet-700",
        fuchsia: "border-fuchsia-500 dark:border-fuchsia-400 hover:border-fuchsia-600 dark:hover:border-fuchsia-700",
    },

    background: {
        gray: "bg-textured",
        rose: "bg-rose-500 dark:bg-rose-900",
        blue: "bg-blue-500 dark:bg-blue-900",
        green: "bg-green-500 dark:bg-green-900",
        purple: "bg-purple-500 dark:bg-purple-900",
        yellow: "bg-yellow-500 dark:bg-yellow-900",
        red: "bg-red-500 dark:bg-red-900",
        orange: "bg-orange-500 dark:bg-orange-900",
        pink: "bg-pink-500 dark:bg-pink-900",
        slate: "bg-slate-500 dark:bg-slate-900",
        zinc: "bg-zinc-500 dark:bg-zinc-900",
        neutral: "bg-neutral-500 dark:bg-neutral-900",
        stone: "bg-stone-500 dark:bg-stone-900",
        amber: "bg-amber-500 dark:bg-amber-900",
        lime: "bg-lime-500 dark:bg-lime-900",
        emerald: "bg-emerald-500 dark:bg-emerald-900",
        teal: "bg-teal-500 dark:bg-teal-900",
        cyan: "bg-cyan-500 dark:bg-cyan-900",
        sky: "bg-sky-500 dark:bg-sky-900",
        violet: "bg-violet-500 dark:bg-violet-900",
        fuchsia: "bg-fuchsia-500 dark:bg-fuchsia-900",
    },
    appPreview: {
        gray: "bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800",
        rose: "bg-rose-100 dark:bg-rose-900 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800",
        blue: "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
        green: "bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800",
        yellow: "bg-yellow-100 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
        red: "bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800",
        orange: "bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800",
        pink: "bg-pink-100 dark:bg-pink-900 text-pink-600 dark:text-pink-400 border-pink-200 dark:border-pink-800",
        slate: "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800",
        zinc: "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800",
        neutral: "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800",
        stone: "bg-stone-100 dark:bg-stone-900 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-800",
        amber: "bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800",
        lime: "bg-lime-100 dark:bg-lime-900 text-lime-600 dark:text-lime-400 border-lime-200 dark:border-lime-800",
        emerald: "bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
        teal: "bg-teal-100 dark:bg-teal-900 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-800",
        cyan: "bg-cyan-100 dark:bg-cyan-900 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800",
        sky: "bg-sky-100 dark:bg-sky-900 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-800",
        violet: "bg-violet-100 dark:bg-violet-900 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800",
        fuchsia: "bg-fuchsia-100 dark:bg-fuchsia-900 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-200 dark:border-fuchsia-800",
    },
    primaryBg: {
        gray: "bg-gray-100 dark:bg-gray-900/30",
        slate: "bg-slate-100 dark:bg-slate-900/30",
        zinc: "bg-zinc-100 dark:bg-zinc-900/30",
        neutral: "bg-neutral-100 dark:bg-neutral-900/30",
        stone: "bg-stone-100 dark:bg-stone-900/30",
        red: "bg-red-100 dark:bg-red-900/30",
        orange: "bg-orange-100 dark:bg-orange-900/30",
        amber: "bg-amber-100 dark:bg-amber-900/30",
        yellow: "bg-yellow-100 dark:bg-yellow-900/30",
        lime: "bg-lime-100 dark:bg-lime-900/30",
        green: "bg-green-100 dark:bg-green-900/30",
        emerald: "bg-emerald-100 dark:bg-emerald-900/30",
        teal: "bg-teal-100 dark:bg-teal-900/30",
        cyan: "bg-cyan-100 dark:bg-cyan-900/30",
        sky: "bg-sky-100 dark:bg-sky-900/30",
        blue: "bg-blue-100 dark:bg-blue-900/30",
        indigo: "bg-indigo-100 dark:bg-indigo-900/30",
        violet: "bg-violet-100 dark:bg-violet-900/30",
        purple: "bg-purple-100 dark:bg-purple-900/30",
        fuchsia: "bg-fuchsia-100 dark:bg-fuchsia-900/30",
        pink: "bg-pink-100 dark:bg-pink-900/30",
        rose: "bg-rose-100 dark:bg-rose-900/30",
    },
    // Primary color text
    primaryText: {
        gray: "text-gray-600 dark:text-gray-400",
        slate: "text-slate-600 dark:text-slate-400",
        zinc: "text-zinc-600 dark:text-zinc-400",
        neutral: "text-neutral-600 dark:text-neutral-400",
        stone: "text-stone-600 dark:text-stone-400",
        red: "text-red-600 dark:text-red-400",
        orange: "text-orange-600 dark:text-orange-400",
        amber: "text-amber-600 dark:text-amber-400",
        yellow: "text-yellow-600 dark:text-yellow-400",
        lime: "text-lime-600 dark:text-lime-400",
        green: "text-green-600 dark:text-green-400",
        emerald: "text-emerald-600 dark:text-emerald-400",
        teal: "text-teal-600 dark:text-teal-400",
        cyan: "text-cyan-600 dark:text-cyan-400",
        sky: "text-sky-600 dark:text-sky-400",
        blue: "text-blue-600 dark:text-blue-400",
        indigo: "text-indigo-600 dark:text-indigo-400",
        violet: "text-violet-600 dark:text-violet-400",
        purple: "text-purple-600 dark:text-purple-400",
        fuchsia: "text-fuchsia-600 dark:text-fuchsia-400",
        pink: "text-pink-600 dark:text-pink-400",
        rose: "text-rose-600 dark:text-rose-400",
    },
    // Primary color borders
    primaryBorder: {
        gray: "border-gray-200 dark:border-gray-800",
        slate: "border-slate-200 dark:border-slate-800",
        zinc: "border-zinc-200 dark:border-zinc-800",
        neutral: "border-neutral-200 dark:border-neutral-800",
        stone: "border-stone-200 dark:border-stone-800",
        red: "border-red-200 dark:border-red-800",
        orange: "border-orange-200 dark:border-orange-800",
        amber: "border-amber-200 dark:border-amber-800",
        yellow: "border-yellow-200 dark:border-yellow-800",
        lime: "border-lime-200 dark:border-lime-800",
        green: "border-green-200 dark:border-green-800",
        emerald: "border-emerald-200 dark:border-emerald-800",
        teal: "border-teal-200 dark:border-teal-800",
        cyan: "border-cyan-200 dark:border-cyan-800",
        sky: "border-sky-200 dark:border-sky-800",
        blue: "border-blue-200 dark:border-blue-800",
        indigo: "border-indigo-200 dark:border-indigo-800",
        violet: "border-violet-200 dark:border-violet-800",
        purple: "border-purple-200 dark:border-purple-800",
        fuchsia: "border-fuchsia-200 dark:border-fuchsia-800",
        pink: "border-pink-200 dark:border-pink-800",
        rose: "border-rose-200 dark:border-rose-800",
    },
    // Accent color backgrounds
    accentBg: {
        gray: "bg-gray-500 dark:bg-gray-600",
        slate: "bg-slate-500 dark:bg-slate-600",
        zinc: "bg-zinc-500 dark:bg-zinc-600",
        neutral: "bg-neutral-500 dark:bg-neutral-600",
        stone: "bg-stone-500 dark:bg-stone-600",
        red: "bg-red-500 dark:bg-red-600",
        orange: "bg-orange-500 dark:bg-orange-600",
        amber: "bg-amber-500 dark:bg-amber-600",
        yellow: "bg-yellow-500 dark:bg-yellow-600",
        lime: "bg-lime-500 dark:bg-lime-600",
        green: "bg-green-500 dark:bg-green-600",
        emerald: "bg-emerald-500 dark:bg-emerald-600",
        teal: "bg-teal-500 dark:bg-teal-600",
        cyan: "bg-cyan-500 dark:bg-cyan-600",
        sky: "bg-sky-500 dark:bg-sky-600",
        blue: "bg-blue-500 dark:bg-blue-600",
        indigo: "bg-indigo-500 dark:bg-indigo-600",
        violet: "bg-violet-500 dark:bg-violet-600",
        purple: "bg-purple-500 dark:bg-purple-600",
        fuchsia: "bg-fuchsia-500 dark:bg-fuchsia-600",
        pink: "bg-pink-500 dark:bg-pink-600",
        rose: "bg-rose-500 dark:bg-rose-600",
    },
    // Accent color text
    accentText: {
        gray: "text-gray-500 dark:text-gray-400",
        slate: "text-slate-500 dark:text-slate-400",
        zinc: "text-zinc-500 dark:text-zinc-400",
        neutral: "text-neutral-500 dark:text-neutral-400",
        stone: "text-stone-500 dark:text-stone-400",
        red: "text-red-500 dark:text-red-400",
        orange: "text-orange-500 dark:text-orange-400",
        amber: "text-amber-500 dark:text-amber-400",
        yellow: "text-yellow-500 dark:text-yellow-400",
        lime: "text-lime-500 dark:text-lime-400",
        green: "text-green-500 dark:text-green-400",
        emerald: "text-emerald-500 dark:text-emerald-400",
        teal: "text-teal-500 dark:text-teal-400",
        cyan: "text-cyan-500 dark:text-cyan-400",
        sky: "text-sky-500 dark:text-sky-400",
        blue: "text-blue-500 dark:text-blue-400",
        indigo: "text-indigo-500 dark:text-indigo-400",
        violet: "text-violet-500 dark:text-violet-400",
        purple: "text-purple-500 dark:text-purple-400",
        fuchsia: "text-fuchsia-500 dark:text-fuchsia-400",
        pink: "text-pink-500 dark:text-pink-400",
        rose: "text-rose-500 dark:text-rose-400",
    },
    // Accent color 
    accentBorder: {
        gray: "border-gray-500 dark:border-gray-600",
        slate: "border-slate-500 dark:border-slate-600",
        zinc: "border-zinc-500 dark:border-zinc-600",
        neutral: "border-neutral-500 dark:border-neutral-600",
        stone: "border-stone-500 dark:border-stone-600",
        red: "border-red-500 dark:border-red-600",
        orange: "border-orange-500 dark:border-orange-600",
        amber: "border-amber-500 dark:border-amber-600",
        yellow: "border-yellow-500 dark:border-yellow-600",
        lime: "border-lime-500 dark:border-lime-600",
        green: "border-green-500 dark:border-green-600",
        emerald: "border-emerald-500 dark:border-emerald-600",
        teal: "border-teal-500 dark:border-teal-600",
        cyan: "border-cyan-500 dark:border-cyan-600",
        sky: "border-sky-500 dark:border-sky-600",
        blue: "border-blue-500 dark:border-blue-600",
        indigo: "border-indigo-500 dark:border-indigo-600",
        violet: "border-violet-500 dark:border-violet-600",
        purple: "border-purple-500 dark:border-purple-600",
        fuchsia: "border-fuchsia-500 dark:border-fuchsia-600",
        pink: "border-pink-500 dark:border-pink-600",
        rose: "border-rose-500 dark:border-rose-600"
    }
};


export const getColorClasses = (usage: keyof typeof COLOR_VARIANTS, color: string) => {
    const colorGroup: Record<string, string> = COLOR_VARIANTS[usage];
    const colorClasses = colorGroup[color];
    if (!colorClasses) {
        console.error(`Color '${color}' not found for usage '${usage}'`);
        return "";
    }
    return colorClasses;
};


// Component types with their specific styles
export const COMPONENT_STYLES = {
    submitButton: {
        base: "rounded-full p-3 cursor-pointer",
        colorType: "buttonBg", // References the buttonBg color group
    },
    appIcon: {
        base: "", // Base classes for app icon
        colorType: "text", // References the text color group
    },
    appIconWithBg: {
        base: "w-48 h-12 p-2 rounded-none flex items-center justify-center",
        colorType: "text", // Icon color from text color group
        bgColorType: "background", // Background color from background color group
    },
    actionButton: {
        base: "rounded-md px-4 py-2 flex items-center justify-center cursor-pointer",
        colorType: "buttonBg",
    },
    outlineButton: {
        base: "rounded-md px-4 py-2 border-2 flex items-center justify-center cursor-pointer",
        colorType: "border",
    },
    // Add more component types as needed
};

export interface GetComponentProps {
    type?: string;
    color?: string;
    primaryColor?: string;
    icon?: string;
    size?: number;
    className?: string;
    children?: React.ReactNode;
}

// Main function to generate components
export const getComponent = ({ type = "submitButton", color = "rose", primaryColor = "gray", icon = "Search", size = 24, className = "", children = null }: GetComponentProps) => {
    // Get component style configuration
    const componentStyles: Record<string, { base: string; colorType: string; bgColorType?: string }> = COMPONENT_STYLES;
    const componentConfig = componentStyles[type];

    if (!componentConfig) {
        console.error(`Component type '${type}' not found`);
        return null;
    }

    // Get the appropriate color variant based on component type
    const colorVariants: Record<string, Record<string, string>> = COLOR_VARIANTS;
    const colorGroup = colorVariants[componentConfig.colorType];
    const colorClasses = colorGroup?.[color.toLowerCase()];

    if (!colorClasses) {
        console.error(`Color '${color}' not found for component type '${type}'`);
        return null;
    }

    // Handle background color for components that use it (like appIconWithBg)
    let bgColorClasses = "";
    if (componentConfig.bgColorType && primaryColor) {
        const bgColorGroup = colorVariants[componentConfig.bgColorType];
        bgColorClasses = bgColorGroup?.[primaryColor.toLowerCase()] || "";
    }

    // Get the icon component
    const iconOptions: Record<string, React.ComponentType<{ size?: number }>> = ICON_OPTIONS;
    const IconComponent = iconOptions[icon];

    if (!IconComponent && icon) {
        console.error(`Icon '${icon}' not found`);
        return null;
    }

    // Generate all classes
    const allClasses = `${componentConfig.base} ${bgColorClasses} ${colorClasses} ${className}`;

    // Return the appropriate component based on type
    return (
        <div className={allClasses}>
            {IconComponent && <IconComponent size={size} />}
            {children}
        </div>
    );
};

// Named exports for specific component types (convenience wrappers)
export const getSubmitButton = (props: Omit<GetComponentProps, "type">) => getComponent({ type: "submitButton", ...props });
export const getAppIcon = (props: Omit<GetComponentProps, "type">) => getComponent({ type: "appIcon", ...props });
export const getAppIconWithBg = (props: Omit<GetComponentProps, "type">) => getComponent({ type: "appIconWithBg", ...props });
export const getActionButton = (props: Omit<GetComponentProps, "type">) => getComponent({ type: "actionButton", ...props });
export const getOutlineButton = (props: Omit<GetComponentProps, "type">) => getComponent({ type: "outlineButton", ...props });
export const getAppletIcon = (props: Omit<GetComponentProps, "type">) => getComponent({ type: "appIcon", ...props });

// Utility function to get a list of recommended app icons
export const getAppIconOptions = () => {
    // Icons that are suitable as app icons
    const appIconNames = [
        // Lucide Icons
        "Bookmark",
        "Box",
        "Briefcase",
        "Building",
        "Coffee",
        "Compass",
        "Crown",
        "Database",
        "Flag",
        "Flower",
        "Gift",
        "Globe",
        "Heart",
        "Home",
        "Image",
        "Layers",
        "Library",
        "LifeBuoy",
        "Lightbulb",
        "Map",
        "MessageSquare",
        "Monitor",
        "Moon",
        "Music",
        "Package",
        "Palette",
        "Pizza",
        "Radio",
        "Rocket",
        "Settings",
        "ShoppingBag",
        "Star",
        "Sun",
        "Target",
        "Ticket",
        "Trophy",
        "Tv",
        "Zap",
        "HelpCircle",
        "TreePalm",
        "AppWindow",
        // React Icons
        "FaChartBar",
        "FaClipboard",
        "FaCode",
        "FaCoffee",
        "FaDesktop",
        "FaEnvelope",
        "FaFileAlt",
        "FaGamepad",
        "FaGraduationCap",
        "FaHeadphones",
        "FaLaptop",
        "FaLock",
        "FaMapMarkerAlt",
        "FaMicrophone",
        "FaMusic",
        "FaNewspaper",
        "FaStore",
        "FaTools",
        "FaBrain",
        "FaMagic",
        "GiArtificialIntelligence",
        "LuBrain",
        "SiMagic",
        "SiCodemagic",
        "Search",
        "User",
        "Plus",
        "ChevronRight",
        "Mail",
        "Bell",
        "Calendar",
        "Download",
        "Upload",
        "Send",
        "ArrowBigRightDash",
        "AppWindowIcon",
        "LayoutTemplate",
        "CheckIcon",
        
        // Added submit button icons
        "CheckCircle",
        "Check",
        "ArrowRight",
        "ArrowRightCircle",
        "MoveRight",
        "Forward",
        "Save",
        "ThumbsUp",
        "CircleCheck",
        "ArrowRightFromLine",
        "ArrowUpRight",
        "SquareArrowRight",
        "Menu",
        "LayoutPanelLeft",
        "FaArrowCircleRight",
        "FaPaperPlane"
    ];

    // Return the list of icons with their components
    const iconOptions: Record<string, React.ComponentType<{ size?: number }>> = ICON_OPTIONS;
    return appIconNames.map(iconName => ({
        name: iconName,
        component: iconOptions[iconName]
    }));
};
