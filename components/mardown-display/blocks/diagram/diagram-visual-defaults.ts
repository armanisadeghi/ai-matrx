/**
 * Pure visual vocabulary and default inference for the canonical diagram
 * document. Defaults are materialized into DiagramData before render/save so
 * the renderer never owns an invisible styling decision the user cannot edit.
 */

export const DIAGRAM_NODE_SHAPES = [
  "rounded",
  "rectangle",
  "pill",
  "circle",
  "diamond",
  "hexagon",
] as const;

export type DiagramNodeShape = (typeof DIAGRAM_NODE_SHAPES)[number];

export const DIAGRAM_BORDER_STYLES = ["solid", "dashed", "dotted"] as const;
export type DiagramBorderStyle = (typeof DIAGRAM_BORDER_STYLES)[number];

export const DIAGRAM_EDGE_MARKERS = ["none", "end", "start", "both"] as const;
export type DiagramEdgeMarker = (typeof DIAGRAM_EDGE_MARKERS)[number];

export const DIAGRAM_BACKGROUNDS = ["dots", "lines", "cross"] as const;
export type DiagramBackground = (typeof DIAGRAM_BACKGROUNDS)[number];

export const DIAGRAM_COLOR_PRESETS = [
  {
    value: "gray",
    label: "Gray",
    hex: "#6b7280",
    nodeClass:
      "bg-textured border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300",
  },
  {
    value: "purple",
    label: "Purple",
    hex: "#8b5cf6",
    nodeClass:
      "bg-purple-100 dark:bg-purple-950/30 border-purple-500 text-purple-700 dark:text-purple-300",
  },
  {
    value: "slate",
    label: "Slate",
    hex: "#64748b",
    nodeClass:
      "bg-slate-100 dark:bg-slate-950/30 border-slate-500 text-slate-700 dark:text-slate-300",
  },
  {
    value: "blue",
    label: "Blue",
    hex: "#3b82f6",
    nodeClass:
      "bg-blue-100 dark:bg-blue-950/30 border-blue-500 text-blue-700 dark:text-blue-300",
  },
  {
    value: "indigo",
    label: "Indigo",
    hex: "#6366f1",
    nodeClass:
      "bg-indigo-100 dark:bg-indigo-950/30 border-indigo-500 text-indigo-700 dark:text-indigo-300",
  },
  {
    value: "violet",
    label: "Violet",
    hex: "#8b5cf6",
    nodeClass:
      "bg-violet-100 dark:bg-violet-950/30 border-violet-500 text-violet-700 dark:text-violet-300",
  },
  {
    value: "pink",
    label: "Pink",
    hex: "#ec4899",
    nodeClass:
      "bg-pink-100 dark:bg-pink-950/30 border-pink-500 text-pink-700 dark:text-pink-300",
  },
  {
    value: "red",
    label: "Red",
    hex: "#ef4444",
    nodeClass:
      "bg-red-100 dark:bg-red-950/30 border-red-500 text-red-700 dark:text-red-300",
  },
  {
    value: "orange",
    label: "Orange",
    hex: "#f97316",
    nodeClass:
      "bg-orange-100 dark:bg-orange-950/30 border-orange-500 text-orange-700 dark:text-orange-300",
  },
  {
    value: "amber",
    label: "Amber",
    hex: "#f59e0b",
    nodeClass:
      "bg-amber-100 dark:bg-amber-950/30 border-amber-500 text-amber-700 dark:text-amber-300",
  },
  {
    value: "yellow",
    label: "Yellow",
    hex: "#eab308",
    nodeClass:
      "bg-yellow-100 dark:bg-yellow-950/30 border-yellow-500 text-yellow-700 dark:text-yellow-300",
  },
  {
    value: "green",
    label: "Green",
    hex: "#10b981",
    nodeClass:
      "bg-green-100 dark:bg-green-950/30 border-green-500 text-green-700 dark:text-green-300",
  },
  {
    value: "teal",
    label: "Teal",
    hex: "#14b8a6",
    nodeClass:
      "bg-teal-100 dark:bg-teal-950/30 border-teal-500 text-teal-700 dark:text-teal-300",
  },
  {
    value: "cyan",
    label: "Cyan",
    hex: "#06b6d4",
    nodeClass:
      "bg-cyan-100 dark:bg-cyan-950/30 border-cyan-500 text-cyan-700 dark:text-cyan-300",
  },
] as const;

export type DiagramColorPreset =
  (typeof DIAGRAM_COLOR_PRESETS)[number]["value"];

const COLOR_BY_VALUE = new Map(
  DIAGRAM_COLOR_PRESETS.map((preset) => [preset.value, preset]),
);

export function getDiagramColorHex(color: unknown): string {
  if (typeof color !== "string" || color === "" || color === "auto")
    return "#64748b";
  return COLOR_BY_VALUE.get(color as DiagramColorPreset)?.hex ?? color;
}

export function getDiagramNodeColorClass(color: unknown): string {
  if (typeof color !== "string") return "";
  return COLOR_BY_VALUE.get(color as DiagramColorPreset)?.nodeClass ?? "";
}

export function isCustomDiagramColor(color: unknown): color is string {
  return (
    typeof color === "string" &&
    color !== "" &&
    !COLOR_BY_VALUE.has(color as DiagramColorPreset)
  );
}

export const DIAGRAM_ICON_OPTIONS = [
  { value: "none", label: "No icon" },
  { value: "square", label: "Square" },
  { value: "circle-check", label: "Check" },
  { value: "circle-x", label: "Finish" },
  { value: "settings", label: "Process" },
  { value: "git-branch", label: "Decision" },
  { value: "database", label: "Data" },
  { value: "users", label: "People" },
  { value: "user-check", label: "Person" },
  { value: "crown", label: "Leader" },
  { value: "building", label: "Organization" },
  { value: "briefcase", label: "Business" },
  { value: "lightbulb", label: "Idea" },
  { value: "target", label: "Goal" },
  { value: "heart", label: "Care" },
  { value: "globe", label: "Web" },
  { value: "server", label: "System" },
  { value: "cpu", label: "Compute" },
  { value: "hard-drive", label: "Storage" },
  { value: "clock", label: "Event" },
  { value: "table", label: "Table" },
  { value: "code", label: "Code" },
  { value: "chart", label: "Analytics" },
  { value: "search", label: "Search" },
  { value: "mail", label: "Message" },
  { value: "shield", label: "Security" },
  { value: "palette", label: "Design" },
  { value: "wrench", label: "Tools" },
  { value: "package", label: "Package" },
  { value: "shield-user", label: "Executive" },
  { value: "calculator", label: "Accounting" },
  { value: "cog", label: "Operations" },
  { value: "megaphone", label: "Marketing" },
  { value: "box", label: "Product" },
  { value: "trending-up", label: "Growth" },
  { value: "user-plus", label: "Recruiting" },
  { value: "pen-tool", label: "Writing" },
  { value: "radio", label: "Communications" },
  { value: "layers", label: "Full stack" },
  { value: "monitor", label: "Technology" },
  { value: "phone", label: "Mobile" },
  { value: "clipboard-list", label: "Checklist" },
  { value: "camera", label: "Visual" },
  { value: "film", label: "Motion" },
  { value: "zap", label: "AI" },
  { value: "pie-chart", label: "Intelligence" },
  { value: "graduation-cap", label: "Learning" },
  { value: "award", label: "Benefits" },
  { value: "headphones", label: "Support" },
  { value: "truck", label: "Supply chain" },
  { value: "warehouse", label: "Inventory" },
  { value: "factory", label: "Manufacturing" },
  { value: "dollar-sign", label: "Finance" },
  { value: "file-text", label: "Document" },
  { value: "lock", label: "Security analyst" },
  { value: "key", label: "Risk" },
  { value: "cloud", label: "Cloud" },
  { value: "bell", label: "Reception" },
  { value: "microscope", label: "Research" },
  { value: "stethoscope", label: "Healthcare" },
  { value: "hammer", label: "Construction" },
  { value: "plane", label: "Travel" },
  { value: "newspaper", label: "Publishing" },
  { value: "music", label: "Audio" },
  { value: "book-open", label: "Education" },
  { value: "shopping-cart", label: "Retail" },
] as const;

export type DiagramIconName = (typeof DIAGRAM_ICON_OPTIONS)[number]["value"];

interface VisualInferenceInput {
  diagramType: string;
  nodeType: string;
  label: string;
  description?: string;
  details?: string;
  isGroup?: boolean;
}

const ORG_ICON_PATTERNS: ReadonlyArray<{
  keywords: readonly string[];
  icon: DiagramIconName;
}> = [
  { keywords: ["ceo", "chief executive", "founder"], icon: "crown" },
  {
    keywords: ["president", "vp", "vice president"],
    icon: "shield-user",
  },
  {
    keywords: ["cfo", "chief financial", "finance director"],
    icon: "calculator",
  },
  {
    keywords: ["cto", "chief technology", "tech director"],
    icon: "code",
  },
  {
    keywords: ["coo", "chief operating", "operations director"],
    icon: "cog",
  },
  {
    keywords: ["cmo", "chief marketing", "marketing director"],
    icon: "megaphone",
  },
  {
    keywords: ["cpo", "chief product", "product director"],
    icon: "box",
  },
  {
    keywords: [
      "ciso",
      "chief information security",
      "security director",
      "security",
      "infosec",
      "cybersecurity",
    ],
    icon: "shield",
  },
  {
    keywords: ["chro", "chief hr", "chief people"],
    icon: "user-check",
  },
  {
    keywords: ["sales", "business development", "revenue", "account executive"],
    icon: "trending-up",
  },
  {
    keywords: ["account manager", "client relations", "relationship manager"],
    icon: "user-plus",
  },
  { keywords: ["sales operations", "sales ops"], icon: "chart" },
  { keywords: ["marketing", "brand", "growth"], icon: "megaphone" },
  { keywords: ["content", "copywriter", "writer"], icon: "pen-tool" },
  { keywords: ["social media", "community"], icon: "globe" },
  {
    keywords: ["pr", "public relations", "communications"],
    icon: "radio",
  },
  { keywords: ["seo", "sem", "digital marketing"], icon: "search" },
  { keywords: ["email marketing", "campaign"], icon: "mail" },
  { keywords: ["product manager", "product owner"], icon: "lightbulb" },
  { keywords: ["product marketing"], icon: "target" },
  { keywords: ["product design"], icon: "layers" },
  {
    keywords: ["developer", "engineer", "programmer", "software"],
    icon: "code",
  },
  { keywords: ["frontend", "front-end", "front end"], icon: "monitor" },
  { keywords: ["backend", "back-end", "back end"], icon: "server" },
  { keywords: ["fullstack", "full-stack", "full stack"], icon: "layers" },
  { keywords: ["mobile", "ios", "android"], icon: "phone" },
  { keywords: ["devops", "site reliability", "sre"], icon: "cog" },
  { keywords: ["qa", "quality assurance", "test"], icon: "clipboard-list" },
  {
    keywords: ["architect", "principal engineer", "staff engineer"],
    icon: "git-branch",
  },
  { keywords: ["designer", "ui", "ux", "design"], icon: "palette" },
  { keywords: ["graphic", "visual design"], icon: "camera" },
  { keywords: ["motion", "animation"], icon: "film" },
  {
    keywords: ["data scientist", "machine learning", "ml", "ai"],
    icon: "zap",
  },
  { keywords: ["data analyst", "analyst", "analytics"], icon: "chart" },
  { keywords: ["data engineer", "database"], icon: "database" },
  { keywords: ["business intelligence", "bi"], icon: "pie-chart" },
  {
    keywords: ["hr", "human resources", "people", "talent"],
    icon: "user-check",
  },
  {
    keywords: ["recruiter", "recruiting", "talent acquisition"],
    icon: "user-plus",
  },
  { keywords: ["learning", "training", "development"], icon: "graduation-cap" },
  { keywords: ["compensation", "benefits"], icon: "award" },
  { keywords: ["customer success", "csm"], icon: "heart" },
  {
    keywords: ["support", "customer service", "help desk"],
    icon: "headphones",
  },
  { keywords: ["technical support", "tech support"], icon: "wrench" },
  { keywords: ["operations", "ops"], icon: "settings" },
  { keywords: ["supply chain", "procurement"], icon: "truck" },
  { keywords: ["logistics", "shipping"], icon: "package" },
  { keywords: ["warehouse", "inventory"], icon: "warehouse" },
  { keywords: ["manufacturing", "production"], icon: "factory" },
  { keywords: ["finance", "financial"], icon: "dollar-sign" },
  { keywords: ["accounting", "accountant", "bookkeeping"], icon: "calculator" },
  { keywords: ["controller", "fp&a"], icon: "pie-chart" },
  { keywords: ["treasury", "payments"], icon: "briefcase" },
  {
    keywords: ["legal", "counsel", "attorney", "lawyer"],
    icon: "briefcase",
  },
  { keywords: ["compliance", "regulatory"], icon: "clipboard-list" },
  { keywords: ["contract", "agreements"], icon: "file-text" },
  { keywords: ["security", "infosec", "cybersecurity"], icon: "shield" },
  { keywords: ["security analyst", "security engineer"], icon: "lock" },
  { keywords: ["risk", "audit"], icon: "key" },
  { keywords: ["it", "information technology"], icon: "monitor" },
  { keywords: ["system", "infrastructure", "network"], icon: "server" },
  { keywords: ["cloud", "aws", "azure", "gcp"], icon: "cloud" },
  { keywords: ["facilities", "facility"], icon: "building" },
  {
    keywords: ["admin", "administrative", "office manager"],
    icon: "clipboard-list",
  },
  { keywords: ["reception", "receptionist"], icon: "bell" },
  { keywords: ["research", "scientist"], icon: "microscope" },
  { keywords: ["medical", "healthcare", "clinical"], icon: "stethoscope" },
  { keywords: ["construction", "builder"], icon: "hammer" },
  { keywords: ["travel", "tourism"], icon: "plane" },
  { keywords: ["editorial", "editor", "publishing"], icon: "newspaper" },
  { keywords: ["music", "audio", "sound"], icon: "music" },
  { keywords: ["education", "teacher", "instructor"], icon: "book-open" },
  { keywords: ["e-commerce", "ecommerce", "retail"], icon: "shopping-cart" },
];

export function inferOrgChartRoleIconName(
  label: string,
  description?: string,
  details?: string,
): DiagramIconName {
  const searchText = [label, description, details]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    ORG_ICON_PATTERNS.find((pattern) =>
      pattern.keywords.some((keyword) => searchText.includes(keyword)),
    )?.icon ?? "users"
  );
}

export function inferDiagramNodeVisuals(input: VisualInferenceInput): {
  color: string;
  icon: DiagramIconName;
  shape: DiagramNodeShape;
  borderStyle: DiagramBorderStyle;
  textAlign: "left" | "center";
} {
  if (input.isGroup) {
    return {
      color: "auto",
      icon: "none",
      shape: "rounded",
      borderStyle: "dashed",
      textAlign: "left",
    };
  }

  const byType: Record<
    string,
    { color: DiagramColorPreset; icon: DiagramIconName }
  > = {
    start: { color: "green", icon: "circle-check" },
    end: { color: "red", icon: "circle-x" },
    decision: { color: "orange", icon: "git-branch" },
    process: { color: "blue", icon: "settings" },
    data: { color: "purple", icon: "database" },
    user: { color: "indigo", icon: "users" },
    system: { color: "gray", icon: "server" },
    api: { color: "teal", icon: "globe" },
    compute: { color: "yellow", icon: "cpu" },
    storage: { color: "pink", icon: "hard-drive" },
    event: { color: "cyan", icon: "clock" },
    entity: { color: "violet", icon: "table" },
    gateway: { color: "amber", icon: "git-branch" },
  };
  const inferred = byType[input.nodeType] ?? {
    color: "gray" as const,
    icon: "square" as const,
  };

  return {
    color: inferred.color,
    icon:
      input.diagramType === "orgchart"
        ? inferOrgChartRoleIconName(
            input.label,
            input.description,
            input.details,
          )
        : inferred.icon,
    // Existing generated diagrams have always rendered as rounded cards. The
    // explicit default keeps that appearance while making alternatives editable.
    shape: "rounded",
    borderStyle: "solid",
    textAlign: input.diagramType === "orgchart" ? "center" : "left",
  };
}

export const DEFAULT_DIAGRAM_RENDER_HINTS = {
  showLegend: true,
  showEdgeLabels: true,
  compactNodes: false,
  hideArrows: false,
  background: "dots" as DiagramBackground,
  showMiniMap: false,
  snapToGrid: false,
  showControls: true,
};
