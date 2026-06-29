/**
 * Image Studio Preset Catalog
 * ─────────────────────────────────────────────────────────────────────────
 * Platform-specific output sizes with "where this is used" guidance. One
 * uploaded image → as many of these as the user selects, processed by
 * Sharp on the server, downloaded individually or zipped.
 *
 * Structure:
 *   Category → Preset[]
 *     Each preset has a stable `id` (filename key), dimensions, usage notes,
 *     optional aspect hint, and an optional default output format.
 *
 * Extend freely — the UI reads categories and presets directly from this file.
 */

import type { LucideIcon } from "lucide-react";
import {
  Share2,
  Image as ImageIcon,
  Smartphone,
  Globe,
  ShoppingBag,
  FileText,
  Mail,
  Printer,
  Palette,
  User,
  Building2,
  Apple,
} from "lucide-react";
import {
  Youtube,
  Instagram,
  Linkedin,
  Twitter,
  Facebook,
  Chrome,
} from "@/components/icons/brand-icons";

export type OutputFormat = "jpeg" | "png" | "webp" | "avif";

export interface StudioPreset {
  /** Stable id — used as part of the generated filename. */
  id: string;
  /** Short name shown in the UI. */
  name: string;
  /** One-sentence description of where to use it. */
  usage: string;
  /** Target dimensions in pixels. */
  width: number;
  height: number;
  /** Suggested output format. User can override globally. */
  defaultFormat?: OutputFormat;
  /** Aspect ratio label for UI ("square", "landscape", "portrait", "banner"). */
  aspect: "square" | "landscape" | "portrait" | "banner" | "wide";
  /** Platform or spec reference. */
  spec?: string;
  /** Optional tag for filtering / recommending. */
  tags?: string[];
}

export interface PresetCategory {
  id: string;
  name: string;
  /** Short one-liner under the category name. */
  description: string;
  icon: LucideIcon;
  /** Category accent (tailwind color). */
  accent:
    | "blue"
    | "purple"
    | "pink"
    | "emerald"
    | "amber"
    | "rose"
    | "cyan"
    | "slate"
    | "violet"
    | "indigo";
  presets: StudioPreset[];
}

// ── Social Media ──────────────────────────────────────────────────────────
const SOCIAL: StudioPreset[] = [
  // Facebook
  {
    id: "fb-cover",
    name: "Facebook Page Cover",
    usage: "Cover photo for a Facebook Page / Group.",
    width: 820,
    height: 312,
    aspect: "banner",
    spec: "Facebook",
    tags: ["facebook", "cover"],
  },
  {
    id: "fb-post",
    name: "Facebook Post (Link)",
    usage: "Shared link card + feed image on Facebook.",
    width: 1200,
    height: 630,
    defaultFormat: "jpeg",
    aspect: "landscape",
    spec: "Facebook",
    tags: ["facebook", "og"],
  },
  {
    id: "fb-profile",
    name: "Facebook Profile Photo",
    usage: "Profile picture (square crop, displays as circle).",
    width: 180,
    height: 180,
    aspect: "square",
    spec: "Facebook",
    tags: ["facebook", "avatar"],
  },
  {
    id: "fb-event",
    name: "Facebook Event Cover",
    usage: "Event page cover image.",
    width: 1920,
    height: 1005,
    aspect: "wide",
    spec: "Facebook",
    tags: ["facebook", "event"],
  },
  // Instagram
  {
    id: "ig-square",
    name: "Instagram Feed (Square)",
    usage: "Classic square post in the feed.",
    width: 1080,
    height: 1080,
    aspect: "square",
    spec: "Instagram",
    tags: ["instagram", "post"],
  },
  {
    id: "ig-portrait",
    name: "Instagram Feed (Portrait)",
    usage: "Maximum-height portrait feed post.",
    width: 1080,
    height: 1350,
    aspect: "portrait",
    spec: "Instagram",
    tags: ["instagram", "post"],
  },
  {
    id: "ig-story",
    name: "Instagram Story",
    usage: "Full-screen 9:16 story / Reel cover.",
    width: 1080,
    height: 1920,
    aspect: "portrait",
    spec: "Instagram",
    tags: ["instagram", "story"],
  },
  {
    id: "ig-profile",
    name: "Instagram Profile",
    usage: "Round profile photo (served square).",
    width: 320,
    height: 320,
    aspect: "square",
    spec: "Instagram",
    tags: ["instagram", "avatar"],
  },
  // Twitter / X
  {
    id: "tw-header",
    name: "X / Twitter Header",
    usage: "Profile header banner.",
    width: 1500,
    height: 500,
    aspect: "banner",
    spec: "X",
    tags: ["twitter", "x", "header"],
  },
  {
    id: "tw-post",
    name: "X / Twitter Post",
    usage: "In-feed image attachment (16:9).",
    width: 1600,
    height: 900,
    aspect: "landscape",
    spec: "X",
    tags: ["twitter", "x", "post"],
  },
  {
    id: "tw-profile",
    name: "X / Twitter Profile",
    usage: "Round profile photo.",
    width: 400,
    height: 400,
    aspect: "square",
    spec: "X",
    tags: ["twitter", "x", "avatar"],
  },
  {
    id: "tw-card-large",
    name: "X Summary Card Large",
    usage: "Link-preview hero when sharing URLs on X.",
    width: 1200,
    height: 628,
    aspect: "landscape",
    spec: "X",
    tags: ["twitter", "x", "og"],
  },
  // LinkedIn
  {
    id: "li-cover",
    name: "LinkedIn Cover",
    usage: "Personal profile banner on LinkedIn.",
    width: 1584,
    height: 396,
    aspect: "banner",
    spec: "LinkedIn",
    tags: ["linkedin", "cover"],
  },
  {
    id: "li-company-cover",
    name: "LinkedIn Company Cover",
    usage: "Cover image on a Company Page.",
    width: 1128,
    height: 191,
    aspect: "banner",
    spec: "LinkedIn",
    tags: ["linkedin", "company"],
  },
  {
    id: "li-post",
    name: "LinkedIn Post",
    usage: "Link-preview and image post dimensions.",
    width: 1200,
    height: 627,
    aspect: "landscape",
    spec: "LinkedIn",
    tags: ["linkedin", "post"],
  },
  {
    id: "li-profile",
    name: "LinkedIn Profile",
    usage: "Profile photo (served square; rendered round).",
    width: 400,
    height: 400,
    aspect: "square",
    spec: "LinkedIn",
    tags: ["linkedin", "avatar"],
  },
  // YouTube
  {
    id: "yt-thumbnail",
    name: "YouTube Thumbnail",
    usage: "Video thumbnail (16:9).",
    width: 1280,
    height: 720,
    aspect: "landscape",
    spec: "YouTube",
    tags: ["youtube", "thumbnail"],
  },
  {
    id: "yt-banner",
    name: "YouTube Channel Banner",
    usage: "Channel art banner (safe area ≤1546×423).",
    width: 2560,
    height: 1440,
    aspect: "landscape",
    spec: "YouTube",
    tags: ["youtube", "banner"],
  },
  // TikTok
  {
    id: "tt-cover",
    name: "TikTok Video Cover",
    usage: "Vertical thumbnail / cover frame.",
    width: 1080,
    height: 1920,
    aspect: "portrait",
    spec: "TikTok",
    tags: ["tiktok", "cover"],
  },
  {
    id: "tt-profile",
    name: "TikTok Profile",
    usage: "Round profile photo.",
    width: 200,
    height: 200,
    aspect: "square",
    spec: "TikTok",
    tags: ["tiktok", "avatar"],
  },
  // Pinterest
  {
    id: "pin-standard",
    name: "Pinterest Pin",
    usage: "Standard vertical pin (2:3).",
    width: 1000,
    height: 1500,
    aspect: "portrait",
    spec: "Pinterest",
    tags: ["pinterest", "pin"],
  },
  // Snapchat
  {
    id: "sc-snap",
    name: "Snapchat Snap",
    usage: "Full-screen 9:16 Snap.",
    width: 1080,
    height: 1920,
    aspect: "portrait",
    spec: "Snapchat",
    tags: ["snapchat"],
  },
];

// ── SEO / Link Previews ───────────────────────────────────────────────────
const SEO: StudioPreset[] = [
  {
    id: "og-image",
    name: "Open Graph (OG)",
    usage:
      "Universal link preview for Facebook, LinkedIn, Telegram, WhatsApp, Discord.",
    width: 1200,
    height: 630,
    defaultFormat: "jpeg",
    aspect: "landscape",
    spec: "OpenGraph",
    tags: ["og", "seo"],
  },
  {
    id: "og-small",
    name: "OG Small Square",
    usage: "Small square fallback when OG isn't hero-sized.",
    width: 600,
    height: 600,
    defaultFormat: "jpeg",
    aspect: "square",
    spec: "OpenGraph",
    tags: ["og", "seo"],
  },
  {
    id: "twitter-summary-small",
    name: "Twitter Summary Card",
    usage: "Small-card Twitter preview for text-heavy links.",
    width: 144,
    height: 144,
    aspect: "square",
    spec: "Twitter Card",
    tags: ["twitter", "seo"],
  },
  {
    id: "schema-logo",
    name: "Schema.org Logo",
    usage: "`logo` property for structured data (Google Knowledge Panel).",
    width: 600,
    height: 60,
    defaultFormat: "png",
    aspect: "banner",
    spec: "Schema.org",
    tags: ["schema", "seo"],
  },
  {
    id: "article-hero",
    name: "Article Hero",
    usage: "Featured image for blog / article hero sections.",
    width: 1920,
    height: 1080,
    aspect: "landscape",
    spec: "Web",
    tags: ["blog", "hero"],
  },
  {
    id: "article-thumbnail",
    name: "Article Thumbnail",
    usage: "Card thumbnail in blog index + related-posts lists.",
    width: 600,
    height: 400,
    aspect: "landscape",
    spec: "Web",
    tags: ["blog", "thumbnail"],
  },
];

// ── Favicons & App Icons ──────────────────────────────────────────────────
const ICONS: StudioPreset[] = [
  {
    id: "favicon-32",
    name: "Favicon 32×32",
    usage: "Standard browser tab favicon.",
    width: 32,
    height: 32,
    defaultFormat: "png",
    aspect: "square",
    spec: "W3C",
    tags: ["favicon"],
  },
  {
    id: "favicon-16",
    name: "Favicon 16×16",
    usage: "Tiny favicon for zoomed-out tabs.",
    width: 16,
    height: 16,
    defaultFormat: "png",
    aspect: "square",
    spec: "W3C",
    tags: ["favicon"],
  },
  {
    id: "favicon-192",
    name: "Favicon 192×192 (PNG)",
    usage: "PWA / manifest icon — browser tab and home screen.",
    width: 192,
    height: 192,
    defaultFormat: "png",
    aspect: "square",
    spec: "W3C",
    tags: ["favicon", "pwa"],
  },
  {
    id: "apple-touch",
    name: "Apple Touch Icon",
    usage: "iOS home-screen icon for web apps.",
    width: 180,
    height: 180,
    defaultFormat: "png",
    aspect: "square",
    spec: "Apple",
    tags: ["ios", "icon"],
  },
  {
    id: "android-chrome-192",
    name: "Android Chrome 192×192",
    usage: "Android home-screen / install icon.",
    width: 192,
    height: 192,
    defaultFormat: "png",
    aspect: "square",
    spec: "Android",
    tags: ["android", "icon"],
  },
  {
    id: "android-chrome-512",
    name: "Android Chrome 512×512",
    usage: "Android splash / high-density home-screen icon.",
    width: 512,
    height: 512,
    defaultFormat: "png",
    aspect: "square",
    spec: "Android",
    tags: ["android", "icon"],
  },
  {
    id: "pwa-maskable",
    name: "PWA Maskable Icon",
    usage: "Safe-zone icon for Android adaptive masks.",
    width: 512,
    height: 512,
    defaultFormat: "png",
    aspect: "square",
    spec: "W3C",
    tags: ["pwa", "icon"],
  },
  {
    id: "chrome-web-store",
    name: "Chrome Web Store Icon",
    usage: "Chrome extension store listing icon.",
    width: 128,
    height: 128,
    defaultFormat: "png",
    aspect: "square",
    spec: "Chrome",
    tags: ["chrome", "extension"],
  },
  {
    id: "chrome-web-store-screenshot",
    name: "Chrome Web Store Screenshot",
    usage: "Chrome extension store listing screenshot — strict 16:10 ratio.",
    width: 1280,
    height: 800,
    defaultFormat: "png",
    aspect: "landscape",
    spec: "Chrome",
    tags: ["chrome", "extension", "screenshot"],
  },
  {
    id: "chrome-web-store-screenshot-small",
    name: "Chrome Web Store Screenshot (Small)",
    usage: "Smaller Chrome extension store screenshot — strict 16:10 ratio.",
    width: 640,
    height: 400,
    defaultFormat: "png",
    aspect: "landscape",
    spec: "Chrome",
    tags: ["chrome", "extension", "screenshot"],
  },
  {
    id: "extension-small",
    name: "Extension 48×48",
    usage: "Toolbar / extension menu icon.",
    width: 48,
    height: 48,
    defaultFormat: "png",
    aspect: "square",
    spec: "Chrome",
    tags: ["chrome", "extension"],
  },
];

// ── Logos & Branding ──────────────────────────────────────────────────────
const LOGOS: StudioPreset[] = [
  {
    id: "logo-large",
    name: "Logo — Large",
    usage: "Website header, hero sections, marketing pages.",
    width: 512,
    height: 512,
    defaultFormat: "png",
    aspect: "square",
    tags: ["logo"],
  },
  {
    id: "logo-medium",
    name: "Logo — Medium",
    usage: "Sidebar, card headers, small brand lockups.",
    width: 200,
    height: 200,
    defaultFormat: "png",
    aspect: "square",
    tags: ["logo"],
  },
  {
    id: "logo-small",
    name: "Logo — Small",
    usage: "Chat avatars, compact nav marks, inline badges.",
    width: 64,
    height: 64,
    defaultFormat: "png",
    aspect: "square",
    tags: ["logo"],
  },
  {
    id: "logo-banner",
    name: "Logo — Horizontal Banner",
    usage: "Wide logo lockup for email headers and sponsors.",
    width: 1200,
    height: 240,
    defaultFormat: "png",
    aspect: "banner",
    tags: ["logo", "banner"],
  },
];

// ── Avatars ───────────────────────────────────────────────────────────────
const AVATARS: StudioPreset[] = [
  {
    id: "avatar-xl",
    name: "Avatar — XL (400²)",
    usage: "Profile page hero, large cards.",
    width: 400,
    height: 400,
    defaultFormat: "webp",
    aspect: "square",
    tags: ["avatar"],
  },
  {
    id: "avatar-lg",
    name: "Avatar — Large (256²)",
    usage: "Comment threads, focused detail views.",
    width: 256,
    height: 256,
    defaultFormat: "webp",
    aspect: "square",
    tags: ["avatar"],
  },
  {
    id: "avatar-md",
    name: "Avatar — Medium (128²)",
    usage: "Member lists, DM headers.",
    width: 128,
    height: 128,
    defaultFormat: "webp",
    aspect: "square",
    tags: ["avatar"],
  },
  {
    id: "avatar-sm",
    name: "Avatar — Small (64²)",
    usage: "Navigation bars, inline mentions.",
    width: 64,
    height: 64,
    defaultFormat: "webp",
    aspect: "square",
    tags: ["avatar"],
  },
  {
    id: "avatar-xs",
    name: "Avatar — Tiny (32²)",
    usage: "Chat bubbles, tight toolbars.",
    width: 32,
    height: 32,
    defaultFormat: "webp",
    aspect: "square",
    tags: ["avatar"],
  },
];

// ── E-commerce ────────────────────────────────────────────────────────────
const ECOMMERCE: StudioPreset[] = [
  {
    id: "product-main",
    name: "Product Main (2048²)",
    usage: "Primary product gallery image, zoomable.",
    width: 2048,
    height: 2048,
    aspect: "square",
    tags: ["product", "shopify"],
  },
  {
    id: "product-zoom",
    name: "Product Zoom (3000²)",
    usage: "High-res zoom / pinch-to-zoom hi-DPI display.",
    width: 3000,
    height: 3000,
    aspect: "square",
    tags: ["product", "zoom"],
  },
  {
    id: "product-card",
    name: "Product Card",
    usage: "Collection grid thumbnail.",
    width: 800,
    height: 800,
    aspect: "square",
    tags: ["product"],
  },
  {
    id: "product-thumbnail",
    name: "Product Thumbnail",
    usage: "Cart, mini-cart, search suggestions.",
    width: 160,
    height: 160,
    aspect: "square",
    tags: ["product", "cart"],
  },
  {
    id: "shopify-collection",
    name: "Shopify Collection",
    usage: "Collection banner on Shopify storefront.",
    width: 2048,
    height: 1152,
    aspect: "landscape",
    spec: "Shopify",
    tags: ["shopify", "collection"],
  },
  {
    id: "amazon-main",
    name: "Amazon Main Image",
    usage: "Amazon product main photo (pure white bg).",
    width: 2000,
    height: 2000,
    aspect: "square",
    spec: "Amazon",
    tags: ["amazon", "product"],
  },
  {
    id: "etsy-listing",
    name: "Etsy Listing",
    usage: "Etsy primary listing photo (4:3 ratio).",
    width: 2700,
    height: 2025,
    aspect: "landscape",
    spec: "Etsy",
    tags: ["etsy", "product"],
  },
];

// ── Web & Blog ────────────────────────────────────────────────────────────
const WEB: StudioPreset[] = [
  {
    id: "hero-fullwidth",
    name: "Hero — Full Width",
    usage: "Full-width landing page hero (1920×1080).",
    width: 1920,
    height: 1080,
    aspect: "landscape",
    tags: ["hero", "landing"],
  },
  {
    id: "hero-wide",
    name: "Hero — Extra Wide",
    usage: "Cinematic 21:9 section banner.",
    width: 2400,
    height: 1000,
    aspect: "wide",
    tags: ["hero", "banner"],
  },
  {
    id: "section-divider",
    name: "Section Divider",
    usage: "Page-section background or decorative strip.",
    width: 1920,
    height: 400,
    aspect: "banner",
    tags: ["divider"],
  },
  {
    id: "card-landscape",
    name: "Card — Landscape",
    usage: "Content card thumbnail (3:2 ratio).",
    width: 600,
    height: 400,
    aspect: "landscape",
    tags: ["card"],
  },
  {
    id: "card-square",
    name: "Card — Square",
    usage: "Grid card thumbnail.",
    width: 400,
    height: 400,
    aspect: "square",
    tags: ["card"],
  },
  {
    id: "inline-image",
    name: "Inline Article Image",
    usage: "Image inside the body of an article (16:9).",
    width: 800,
    height: 450,
    aspect: "landscape",
    tags: ["blog"],
  },
];

// ── Email ─────────────────────────────────────────────────────────────────
const EMAIL: StudioPreset[] = [
  {
    id: "email-header",
    name: "Email Header",
    usage: "Newsletter header / hero (600px Gmail width).",
    width: 600,
    height: 200,
    aspect: "banner",
    tags: ["email", "newsletter"],
  },
  {
    id: "email-hero",
    name: "Email Hero",
    usage: "Tall newsletter feature image.",
    width: 600,
    height: 400,
    aspect: "landscape",
    tags: ["email"],
  },
  {
    id: "email-thumbnail",
    name: "Email Thumbnail",
    usage: "Inline email thumbnail / icon.",
    width: 200,
    height: 200,
    aspect: "square",
    tags: ["email"],
  },
];

// ── Mobile App Assets ─────────────────────────────────────────────────────
const MOBILE: StudioPreset[] = [
  {
    id: "ios-icon-1024",
    name: "iOS App Icon (1024²)",
    usage: "App Store marketing icon (no transparency).",
    width: 1024,
    height: 1024,
    defaultFormat: "png",
    aspect: "square",
    spec: "Apple",
    tags: ["ios", "app-icon"],
  },
  {
    id: "android-play-icon",
    name: "Play Store Icon",
    usage: "Google Play Store listing icon.",
    width: 512,
    height: 512,
    defaultFormat: "png",
    aspect: "square",
    spec: "Android",
    tags: ["android", "app-icon"],
  },
  {
    id: "ios-splash",
    name: "iOS Splash (iPhone)",
    usage: "Launch screen static image (iPhone 15 Pro Max).",
    width: 1290,
    height: 2796,
    aspect: "portrait",
    spec: "Apple",
    tags: ["ios", "splash"],
  },
  {
    id: "app-screenshot-iphone",
    name: "App Store iPhone Screenshot",
    usage: '6.7" iPhone screenshot for App Store listing.',
    width: 1290,
    height: 2796,
    aspect: "portrait",
    spec: "Apple",
    tags: ["ios", "screenshot"],
  },
];

// ── Print ─────────────────────────────────────────────────────────────────
const PRINT: StudioPreset[] = [
  {
    id: "print-a4-300dpi",
    name: "A4 @ 300 DPI",
    usage: "Full-page print-quality render (2480×3508).",
    width: 2480,
    height: 3508,
    defaultFormat: "png",
    aspect: "portrait",
    spec: "ISO A4",
    tags: ["print", "a4"],
  },
  {
    id: "business-card",
    name: 'Business Card 3.5×2"',
    usage: "Standard business card bleed at 300 DPI (1050×600).",
    width: 1050,
    height: 600,
    defaultFormat: "png",
    aspect: "landscape",
    tags: ["print", "card"],
  },
  {
    id: "flyer-letter",
    name: "US Letter Flyer",
    usage: '8.5×11" print-ready flyer (2550×3300 @ 300 DPI).',
    width: 2550,
    height: 3300,
    defaultFormat: "png",
    aspect: "portrait",
    tags: ["print", "flyer"],
  },
];

// ── The full catalog ──────────────────────────────────────────────────────
export const PRESET_CATEGORIES: PresetCategory[] = [
  {
    id: "social",
    name: "Social Media",
    description:
      "Platform-perfect sizes for every major network — ready to drag into Facebook, Instagram, LinkedIn, X, YouTube, TikTok, Pinterest.",
    icon: Share2,
    accent: "blue",
    presets: SOCIAL,
  },
  {
    id: "seo",
    name: "SEO & Link Previews",
    description:
      "Open Graph, Twitter Cards, Schema.org logos — everything you need so shared URLs look rich, not broken.",
    icon: Globe,
    accent: "purple",
    presets: SEO,
  },
  {
    id: "icons",
    name: "Favicons & App Icons",
    description:
      "The complete favicon + PWA icon set: 16, 32, 192, Apple touch, Android Chrome, Chrome Web Store.",
    icon: Chrome,
    accent: "emerald",
    presets: ICONS,
  },
  {
    id: "logos",
    name: "Logos & Branding",
    description:
      "A full lockup in every size — header hero, card header, avatar mark, email banner.",
    icon: Palette,
    accent: "amber",
    presets: LOGOS,
  },
  {
    id: "avatars",
    name: "Avatars",
    description:
      "Profile photos from XL down to tiny — WebP for ~30% smaller files with full browser support.",
    icon: User,
    accent: "rose",
    presets: AVATARS,
  },
  {
    id: "ecommerce",
    name: "E-commerce",
    description:
      "Product photos for Shopify, Amazon, Etsy — including zoom-quality hi-res and cart thumbnails.",
    icon: ShoppingBag,
    accent: "pink",
    presets: ECOMMERCE,
  },
  {
    id: "web",
    name: "Web & Blog",
    description:
      "Hero sections, article heroes, cards, section dividers, inline article images.",
    icon: FileText,
    accent: "cyan",
    presets: WEB,
  },
  {
    id: "email",
    name: "Email & Newsletter",
    description:
      "Email-client-safe widths for headers, heroes, and inline thumbnails.",
    icon: Mail,
    accent: "indigo",
    presets: EMAIL,
  },
  {
    id: "mobile",
    name: "Mobile App Assets",
    description:
      "iOS + Android icons, splash screens, and App Store screenshot dimensions.",
    icon: Smartphone,
    accent: "violet",
    presets: MOBILE,
  },
  {
    id: "print",
    name: "Print",
    description: "300 DPI print-ready output — A4, US Letter, business cards.",
    icon: Printer,
    accent: "slate",
    presets: PRINT,
  },
];

// ── Convenience exports ───────────────────────────────────────────────────

/** Flat list of every preset. */
export const ALL_PRESETS: StudioPreset[] = PRESET_CATEGORIES.flatMap(
  (c) => c.presets,
);

export const PRESETS_BY_ID: ReadonlyMap<string, StudioPreset> = new Map(
  ALL_PRESETS.map((p) => [p.id, p]),
);

export function getPresetById(id: string): StudioPreset | undefined {
  return PRESETS_BY_ID.get(id);
}

export function getCategoryForPreset(
  presetId: string,
): PresetCategory | undefined {
  return PRESET_CATEGORIES.find((c) =>
    c.presets.some((p) => p.id === presetId),
  );
}

/** Common "starter" sets — a single click pre-selects a sensible bundle. */
export const RECOMMENDED_BUNDLES: Array<{
  id: string;
  name: string;
  description: string;
  presetIds: string[];
}> = [
  {
    id: "everywhere",
    name: "Share Everywhere",
    description:
      "OG image + Twitter card + Facebook/Instagram post — one upload ready for every channel.",
    presetIds: ["og-image", "tw-card-large", "fb-post", "ig-square", "li-post"],
  },
  {
    id: "complete-favicon",
    name: "Complete Favicon Set",
    description:
      "Every favicon variant: 16/32/192 PNG, Apple touch, Android Chrome 192 + 512, maskable.",
    presetIds: [
      "favicon-16",
      "favicon-32",
      "favicon-192",
      "apple-touch",
      "android-chrome-192",
      "android-chrome-512",
      "pwa-maskable",
    ],
  },
  {
    id: "avatar-set",
    name: "Full Avatar Set",
    description:
      "XL, large, medium, small, and tiny — one source image, every avatar size ready.",
    presetIds: [
      "avatar-xl",
      "avatar-lg",
      "avatar-md",
      "avatar-sm",
      "avatar-xs",
    ],
  },
  {
    id: "logo-lockup",
    name: "Logo Lockup",
    description: "Large hero, card header, inline mark, horizontal banner.",
    presetIds: ["logo-large", "logo-medium", "logo-small", "logo-banner"],
  },
  {
    id: "product-listing",
    name: "Product Listing",
    description:
      "Main photo, zoom, card, and cart thumbnail — complete product shot package.",
    presetIds: [
      "product-main",
      "product-zoom",
      "product-card",
      "product-thumbnail",
    ],
  },
  {
    id: "instagram-complete",
    name: "Instagram Complete",
    description:
      "Square feed, portrait feed, story, profile — all four in one upload.",
    presetIds: ["ig-square", "ig-portrait", "ig-story", "ig-profile"],
  },
];
