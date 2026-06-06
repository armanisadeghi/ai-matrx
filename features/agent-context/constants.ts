// Context Management — Constants & Status Configuration

import type {
  ContextItemStatus,
  ContextFetchHint,
  ContextSensitivity,
  ContextValueType,
} from "./types";

// Status lifecycle phases
export const STATUS_PHASES = [
  {
    key: "discovery",
    label: "Discovery",
    statuses: ["idea", "stub"] as ContextItemStatus[],
  },
  {
    key: "collection",
    label: "Collection",
    statuses: ["gathering", "partial", "needs_review"] as ContextItemStatus[],
  },
  {
    key: "refinement",
    label: "Refinement",
    statuses: [
      "ai_enriched",
      "in_revision",
      "pending_approval",
    ] as ContextItemStatus[],
  },
  {
    key: "live",
    label: "Live",
    statuses: ["active", "provisional"] as ContextItemStatus[],
  },
  {
    key: "maintenance",
    label: "Maintenance",
    statuses: [
      "stale",
      "needs_update",
      "superseded",
      "archived",
      "deprecated",
    ] as ContextItemStatus[],
  },
] as const;

export type StatusConfig = {
  label: string;
  tagline: string;
  phase: string;
  colorDot: string;
  colorBg: string;
  colorText: string;
  iconName: string;
};

export const STATUS_CONFIG: Record<ContextItemStatus, StatusConfig> = {
  idea: {
    label: "Idea",
    tagline: "Placeholder — nothing here yet",
    phase: "discovery",
    colorDot: "bg-slate-400",
    colorBg: "bg-slate-500/10",
    colorText: "text-slate-500 dark:text-slate-400",
    iconName: "Lightbulb",
  },
  stub: {
    label: "Stub",
    tagline: "Named and described, ready to fill",
    phase: "discovery",
    colorDot: "bg-blue-400",
    colorBg: "bg-blue-500/10",
    colorText: "text-blue-600 dark:text-blue-400",
    iconName: "FileText",
  },
  gathering: {
    label: "Gathering",
    tagline: "Actively collecting data",
    phase: "collection",
    colorDot: "bg-amber-400",
    colorBg: "bg-amber-500/10",
    colorText: "text-amber-600 dark:text-amber-400",
    iconName: "Download",
  },
  partial: {
    label: "Partial",
    tagline: "Has some data, gaps remain",
    phase: "collection",
    colorDot: "bg-yellow-400",
    colorBg: "bg-yellow-500/10",
    colorText: "text-yellow-600 dark:text-yellow-400",
    iconName: "PieChart",
  },
  needs_review: {
    label: "Needs Review",
    tagline: "Content ready — needs a human look",
    phase: "collection",
    colorDot: "bg-orange-400",
    colorBg: "bg-orange-500/10",
    colorText: "text-orange-600 dark:text-orange-400",
    iconName: "Eye",
  },
  ai_enriched: {
    label: "AI Enriched",
    tagline: "AI expanded this — verify before use",
    phase: "refinement",
    colorDot: "bg-purple-400",
    colorBg: "bg-purple-500/10",
    colorText: "text-purple-600 dark:text-purple-400",
    iconName: "Rainbow",
  },
  in_revision: {
    label: "In Revision",
    tagline: "Someone is actively updating this",
    phase: "refinement",
    colorDot: "bg-indigo-400",
    colorBg: "bg-indigo-500/10",
    colorText: "text-indigo-600 dark:text-indigo-400",
    iconName: "Pencil",
  },
  pending_approval: {
    label: "Pending Approval",
    tagline: "Complete — awaiting sign-off",
    phase: "refinement",
    colorDot: "bg-sky-400",
    colorBg: "bg-sky-500/10",
    colorText: "text-sky-600 dark:text-sky-400",
    iconName: "Clock",
  },
  active: {
    label: "Active",
    tagline: "Verified and serving agents",
    phase: "live",
    colorDot: "bg-green-400",
    colorBg: "bg-green-500/10",
    colorText: "text-green-600 dark:text-green-400",
    iconName: "CheckCircle",
  },
  provisional: {
    label: "Provisional",
    tagline: "Active — use with caution, not fully verified",
    phase: "live",
    colorDot: "bg-teal-400",
    colorBg: "bg-teal-500/10",
    colorText: "text-teal-600 dark:text-teal-400",
    iconName: "ShieldAlert",
  },
  stale: {
    label: "Stale",
    tagline: "Past review date — may need refresh",
    phase: "maintenance",
    colorDot: "bg-amber-300",
    colorBg: "bg-amber-400/10",
    colorText: "text-amber-500 dark:text-amber-400",
    iconName: "Clock4",
  },
  needs_update: {
    label: "Needs Update",
    tagline: "Owner flagged as outdated",
    phase: "maintenance",
    colorDot: "bg-orange-300",
    colorBg: "bg-orange-400/10",
    colorText: "text-orange-500 dark:text-orange-400",
    iconName: "AlertTriangle",
  },
  superseded: {
    label: "Superseded",
    tagline: "Replaced by a newer version",
    phase: "maintenance",
    colorDot: "bg-gray-400",
    colorBg: "bg-gray-500/10",
    colorText: "text-gray-500 dark:text-gray-400",
    iconName: "ArrowRightLeft",
  },
  archived: {
    label: "Archived",
    tagline: "Inactive — kept for history",
    phase: "maintenance",
    colorDot: "bg-gray-500",
    colorBg: "bg-gray-600/10",
    colorText: "text-gray-600 dark:text-gray-500",
    iconName: "Archive",
  },
  deprecated: {
    label: "Deprecated",
    tagline: "Scheduled for removal",
    phase: "maintenance",
    colorDot: "bg-red-400",
    colorBg: "bg-red-500/10",
    colorText: "text-red-500 dark:text-red-400",
    iconName: "Trash2",
  },
};

// Suggested next status transitions
export const STATUS_TRANSITIONS: Record<
  ContextItemStatus,
  ContextItemStatus[]
> = {
  idea: ["stub"],
  stub: ["gathering"],
  gathering: ["partial", "needs_review"],
  partial: ["gathering", "needs_review"],
  needs_review: ["active", "in_revision"],
  ai_enriched: ["needs_review", "active"],
  in_revision: ["needs_review", "pending_approval"],
  pending_approval: ["active", "in_revision"],
  active: ["stale", "needs_update", "archived"],
  provisional: ["active", "needs_review"],
  stale: ["needs_update", "active"],
  needs_update: ["in_revision", "gathering"],
  superseded: ["archived"],
  archived: ["active"],
  deprecated: ["archived"],
};

// Attention statuses (items needing action)
export const ATTENTION_STATUSES: ContextItemStatus[] = [
  "needs_review",
  "stale",
  "needs_update",
  "partial",
  "ai_enriched",
];

// Fetch hint display config
export const FETCH_HINT_CONFIG: Record<
  ContextFetchHint,
  { label: string; description: string; iconName: string }
> = {
  always: {
    label: "Always Pre-load",
    description: "Included in every agent context automatically",
    iconName: "Zap",
  },
  on_demand: {
    label: "On Demand",
    description: "Agent fetches when it decides this item is relevant",
    iconName: "MousePointerClick",
  },
  batch_related: {
    label: "Batch with Related",
    description: "Fetched together with related items as a group",
    iconName: "Layers",
  },
  lazy: {
    label: "Lazy",
    description: "Only fetched if explicitly referenced or needed",
    iconName: "Coffee",
  },
  never: {
    label: "Never",
    description: "Not available for agent access — internal reference only",
    iconName: "EyeOff",
  },
};

// Sensitivity display config
export const SENSITIVITY_CONFIG: Record<
  ContextSensitivity,
  { label: string; description: string; iconName: string }
> = {
  public: {
    label: "Public",
    description: "Visible to all agents and users",
    iconName: "Globe",
  },
  internal: {
    label: "Internal",
    description: "Visible within the organization only",
    iconName: "Building2",
  },
  restricted: {
    label: "Restricted",
    description: "Limited to specific roles or teams",
    iconName: "Lock",
  },
  privileged: {
    label: "Privileged",
    description: "Highest sensitivity — owner and admins only",
    iconName: "ShieldCheck",
  },
};

// Value type display config
export const VALUE_TYPE_CONFIG: Record<
  ContextValueType,
  { label: string; iconName: string }
> = {
  string: { label: "String", iconName: "Type" },
  number: { label: "Number", iconName: "Hash" },
  boolean: { label: "Boolean", iconName: "ToggleLeft" },
  date: { label: "Date", iconName: "Calendar" },
  object: { label: "Object", iconName: "Braces" },
  array: { label: "Array", iconName: "List" },
  document: { label: "Document", iconName: "FileText" },
  reference: { label: "Reference", iconName: "Link" },
};

// Industry categories for templates
export const INDUSTRY_CATEGORIES = [
  { key: "create_my_own", label: "Create My Own", iconName: "PenLine" },
  { key: "universal", label: "Universal (All Industries)", iconName: "Globe" },
  {
    key: "web_development_agency",
    label: "Web Development Agency",
    iconName: "Code2",
  },
  { key: "seo_agency", label: "SEO & Digital Marketing", iconName: "Search" },
  { key: "recruitment", label: "Recruitment & Staffing", iconName: "Users" },
  { key: "law_firm", label: "Law Firm — General Practice", iconName: "Scale" },
  { key: "workers_comp", label: "Workers Comp Defense", iconName: "Shield" },
  { key: "medical", label: "Medical / Doctor's Office", iconName: "Heart" },
  { key: "shopify", label: "Shopify / E-Commerce", iconName: "ShoppingBag" },
  { key: "ebay", label: "eBay / Marketplace Seller", iconName: "Store" },
  { key: "ai_research", label: "AI Research Organization", iconName: "Brain" },
] as const;

// Default categories for the category combobox
export const DEFAULT_CATEGORIES = [
  "Brand & Identity",
  "Technical",
  "Content & Communication",
  "Business & Strategy",
  "Audience & Market",
  "Operations",
  "Legal & Compliance",
  "Product",
  "Team & Culture",
] as const;

// Reference types for the reference value type
export const REFERENCE_TYPES = [
  { value: "recipe", label: "Recipe" },
  { value: "workflow", label: "Workflow" },
  { value: "ai_agent", label: "AI Agent" },
  { value: "prompt", label: "Prompt" },
  { value: "context_item", label: "Context Item" },
] as const;
