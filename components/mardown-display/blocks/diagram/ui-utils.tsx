import {
  Crown,
  Calculator,
  Code,
  Cog,
  TrendingUp,
  UserCheck,
  Shield,
  Palette,
  HeadphonesIcon,
  Wrench,
  Briefcase,
  Building,
  Server,
  Database,
  Users,
  Megaphone,
  ShoppingCart,
  Package,
  Truck,
  ClipboardList,
  FileText,
  BarChart,
  Target,
  Lightbulb,
  Microscope,
  GraduationCap,
  Stethoscope,
  Hammer,
  Camera,
  Plane,
  Globe,
  Mail,
  Phone,
  Monitor,
  Zap,
  Settings,
  Award,
  BookOpen,
  Heart,
  Newspaper,
  Radio,
  Film,
  Music,
  PenTool,
  Layers,
  GitBranch,
  Box,
  Factory,
  Warehouse,
  DollarSign,
  PieChart,
  UserPlus,
  Search,
  Bell,
  Lock,
  Key,
  CloudIcon,
  ShieldUser,
  CheckCircle2,
  XCircle,
  Cpu,
  HardDrive,
  Clock,
  Table as TableIcon,
  Square,
  type LucideIcon,
} from "lucide-react";
import type { DiagramIconName } from "./diagram-visual-defaults";

const DIAGRAM_ICON_COMPONENTS: Record<
  Exclude<DiagramIconName, "none">,
  LucideIcon
> = {
  square: Square,
  "circle-check": CheckCircle2,
  "circle-x": XCircle,
  settings: Settings,
  "git-branch": GitBranch,
  database: Database,
  users: Users,
  "user-check": UserCheck,
  crown: Crown,
  building: Building,
  briefcase: Briefcase,
  lightbulb: Lightbulb,
  target: Target,
  heart: Heart,
  globe: Globe,
  server: Server,
  cpu: Cpu,
  "hard-drive": HardDrive,
  clock: Clock,
  table: TableIcon,
  code: Code,
  chart: BarChart,
  search: Search,
  mail: Mail,
  shield: Shield,
  palette: Palette,
  wrench: Wrench,
  package: Package,
  "shield-user": ShieldUser,
  calculator: Calculator,
  cog: Cog,
  megaphone: Megaphone,
  box: Box,
  "trending-up": TrendingUp,
  "user-plus": UserPlus,
  "pen-tool": PenTool,
  radio: Radio,
  layers: Layers,
  monitor: Monitor,
  phone: Phone,
  "clipboard-list": ClipboardList,
  camera: Camera,
  film: Film,
  zap: Zap,
  "pie-chart": PieChart,
  "graduation-cap": GraduationCap,
  award: Award,
  headphones: HeadphonesIcon,
  truck: Truck,
  warehouse: Warehouse,
  factory: Factory,
  "dollar-sign": DollarSign,
  "file-text": FileText,
  lock: Lock,
  key: Key,
  cloud: CloudIcon,
  bell: Bell,
  microscope: Microscope,
  stethoscope: Stethoscope,
  hammer: Hammer,
  plane: Plane,
  newspaper: Newspaper,
  music: Music,
  "book-open": BookOpen,
  "shopping-cart": ShoppingCart,
};

/** Render the finite, persisted diagram icon vocabulary. */
export function getDiagramIconByName(
  name: string | undefined,
): React.ReactNode {
  if (name === "none") return null;
  const Icon =
    DIAGRAM_ICON_COMPONENTS[name as Exclude<DiagramIconName, "none">] ?? Square;
  return <Icon className="h-4 w-4" />;
}

// Utility function to format diagram type names nicely
export const formatDiagramType = (type: string): string => {
  const typeMap: Record<string, string> = {
    flowchart: "Flow Chart",
    mindmap: "Mind Map",
    orgchart: "Organizational Chart",
    network: "Network Diagram",
    system: "System Architecture",
    process: "Process Flow",
    pedigree: "Family Pedigree",
    timeline: "Timeline",
    erd: "Entity Relationship Diagram",
    sequence: "Sequence Diagram",
  };

  return typeMap[type] || type.charAt(0).toUpperCase() + type.slice(1);
};

// Function to get customized icons for organizational chart roles
export const getOrgChartRoleIcon = (
  label: string,
  description?: string,
  details?: string,
): React.ReactNode => {
  // Combine all text fields to search for keywords
  const searchText = [label, description, details]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Define role patterns and their corresponding icons
  const rolePatterns = [
    // Executive roles
    {
      keywords: ["ceo", "chief executive", "founder"],
      icon: <Crown className="h-4 w-4" />,
    },
    {
      keywords: ["president", "vp", "vice president"],
      icon: <ShieldUser className="h-4 w-4" />,
    },
    {
      keywords: ["cfo", "chief financial", "finance director"],
      icon: <Calculator className="h-4 w-4" />,
    },
    {
      keywords: ["cto", "chief technology", "tech director"],
      icon: <Code className="h-4 w-4" />,
    },
    {
      keywords: ["coo", "chief operating", "operations director"],
      icon: <Cog className="h-4 w-4" />,
    },
    {
      keywords: ["cmo", "chief marketing", "marketing director"],
      icon: <Megaphone className="h-4 w-4" />,
    },
    {
      keywords: ["cpo", "chief product", "product director"],
      icon: <Box className="h-4 w-4" />,
    },
    {
      keywords: ["ciso", "chief information security", "security director"],
      icon: <Shield className="h-4 w-4" />,
    },
    {
      keywords: ["chro", "chief hr", "chief people"],
      icon: <UserCheck className="h-4 w-4" />,
    },

    // Sales & Business Development
    {
      keywords: [
        "sales",
        "business development",
        "revenue",
        "account executive",
      ],
      icon: <TrendingUp className="h-4 w-4" />,
    },
    {
      keywords: ["account manager", "client relations", "relationship manager"],
      icon: <UserPlus className="h-4 w-4" />,
    },
    {
      keywords: ["sales operations", "sales ops"],
      icon: <BarChart className="h-4 w-4" />,
    },

    // Marketing & Communications
    {
      keywords: ["marketing", "brand", "growth"],
      icon: <Megaphone className="h-4 w-4" />,
    },
    {
      keywords: ["content", "copywriter", "writer"],
      icon: <PenTool className="h-4 w-4" />,
    },
    {
      keywords: ["social media", "community"],
      icon: <Globe className="h-4 w-4" />,
    },
    {
      keywords: ["pr", "public relations", "communications"],
      icon: <Radio className="h-4 w-4" />,
    },
    {
      keywords: ["seo", "sem", "digital marketing"],
      icon: <Search className="h-4 w-4" />,
    },
    {
      keywords: ["email marketing", "campaign"],
      icon: <Mail className="h-4 w-4" />,
    },

    // Product Management
    {
      keywords: ["product manager", "product owner"],
      icon: <Lightbulb className="h-4 w-4" />,
    },
    { keywords: ["product marketing"], icon: <Target className="h-4 w-4" /> },
    { keywords: ["product design"], icon: <Layers className="h-4 w-4" /> },

    // Engineering & Development
    {
      keywords: ["developer", "engineer", "programmer", "software"],
      icon: <Code className="h-4 w-4" />,
    },
    {
      keywords: ["frontend", "front-end", "front end"],
      icon: <Monitor className="h-4 w-4" />,
    },
    {
      keywords: ["backend", "back-end", "back end"],
      icon: <Server className="h-4 w-4" />,
    },
    {
      keywords: ["fullstack", "full-stack", "full stack"],
      icon: <Layers className="h-4 w-4" />,
    },
    {
      keywords: ["mobile", "ios", "android"],
      icon: <Phone className="h-4 w-4" />,
    },
    {
      keywords: ["devops", "site reliability", "sre"],
      icon: <Cog className="h-4 w-4" />,
    },
    {
      keywords: ["qa", "quality assurance", "test"],
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      keywords: ["architect", "principal engineer", "staff engineer"],
      icon: <GitBranch className="h-4 w-4" />,
    },

    // Design
    {
      keywords: ["designer", "ui", "ux", "design"],
      icon: <Palette className="h-4 w-4" />,
    },
    {
      keywords: ["graphic", "visual design"],
      icon: <Camera className="h-4 w-4" />,
    },
    { keywords: ["motion", "animation"], icon: <Film className="h-4 w-4" /> },

    // Data & Analytics
    {
      keywords: ["data scientist", "machine learning", "ml", "ai"],
      icon: <Zap className="h-4 w-4" />,
    },
    {
      keywords: ["data analyst", "analyst", "analytics"],
      icon: <BarChart className="h-4 w-4" />,
    },
    {
      keywords: ["data engineer", "database"],
      icon: <Database className="h-4 w-4" />,
    },
    {
      keywords: ["business intelligence", "bi"],
      icon: <PieChart className="h-4 w-4" />,
    },

    // HR & People Operations
    {
      keywords: ["hr", "human resources", "people", "talent"],
      icon: <UserCheck className="h-4 w-4" />,
    },
    {
      keywords: ["recruiter", "recruiting", "talent acquisition"],
      icon: <UserPlus className="h-4 w-4" />,
    },
    {
      keywords: ["learning", "training", "development"],
      icon: <GraduationCap className="h-4 w-4" />,
    },
    {
      keywords: ["compensation", "benefits"],
      icon: <Award className="h-4 w-4" />,
    },

    // Customer Success & Support
    {
      keywords: ["customer success", "csm"],
      icon: <Heart className="h-4 w-4" />,
    },
    {
      keywords: ["support", "customer service", "help desk"],
      icon: <HeadphonesIcon className="h-4 w-4" />,
    },
    {
      keywords: ["technical support", "tech support"],
      icon: <Wrench className="h-4 w-4" />,
    },

    // Operations
    { keywords: ["operations", "ops"], icon: <Settings className="h-4 w-4" /> },
    {
      keywords: ["supply chain", "procurement"],
      icon: <Truck className="h-4 w-4" />,
    },
    {
      keywords: ["logistics", "shipping"],
      icon: <Package className="h-4 w-4" />,
    },
    {
      keywords: ["warehouse", "inventory"],
      icon: <Warehouse className="h-4 w-4" />,
    },
    {
      keywords: ["manufacturing", "production"],
      icon: <Factory className="h-4 w-4" />,
    },

    // Finance & Accounting
    {
      keywords: ["finance", "financial"],
      icon: <DollarSign className="h-4 w-4" />,
    },
    {
      keywords: ["accounting", "accountant", "bookkeeping"],
      icon: <Calculator className="h-4 w-4" />,
    },
    {
      keywords: ["controller", "fp&a"],
      icon: <PieChart className="h-4 w-4" />,
    },
    {
      keywords: ["treasury", "payments"],
      icon: <Briefcase className="h-4 w-4" />,
    },

    // Legal & Compliance
    {
      keywords: ["legal", "counsel", "attorney", "lawyer"],
      icon: <Briefcase className="h-4 w-4" />,
    },
    {
      keywords: ["compliance", "regulatory"],
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      keywords: ["contract", "agreements"],
      icon: <FileText className="h-4 w-4" />,
    },

    // Security
    {
      keywords: ["security", "infosec", "cybersecurity"],
      icon: <Shield className="h-4 w-4" />,
    },
    {
      keywords: ["security analyst", "security engineer"],
      icon: <Lock className="h-4 w-4" />,
    },
    { keywords: ["risk", "audit"], icon: <Key className="h-4 w-4" /> },

    // IT & Infrastructure
    {
      keywords: ["it", "information technology"],
      icon: <Monitor className="h-4 w-4" />,
    },
    {
      keywords: ["system", "infrastructure", "network"],
      icon: <Server className="h-4 w-4" />,
    },
    {
      keywords: ["cloud", "aws", "azure", "gcp"],
      icon: <CloudIcon className="h-4 w-4" />,
    },

    // Administrative & Facilities
    {
      keywords: ["facilities", "facility"],
      icon: <Building className="h-4 w-4" />,
    },
    {
      keywords: ["admin", "administrative", "office manager"],
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      keywords: ["reception", "receptionist"],
      icon: <Bell className="h-4 w-4" />,
    },

    // Specialized roles
    {
      keywords: ["research", "scientist"],
      icon: <Microscope className="h-4 w-4" />,
    },
    {
      keywords: ["medical", "healthcare", "clinical"],
      icon: <Stethoscope className="h-4 w-4" />,
    },
    {
      keywords: ["construction", "builder"],
      icon: <Hammer className="h-4 w-4" />,
    },
    { keywords: ["travel", "tourism"], icon: <Plane className="h-4 w-4" /> },
    {
      keywords: ["editorial", "editor", "publishing"],
      icon: <Newspaper className="h-4 w-4" />,
    },
    {
      keywords: ["music", "audio", "sound"],
      icon: <Music className="h-4 w-4" />,
    },
    {
      keywords: ["education", "teacher", "instructor"],
      icon: <BookOpen className="h-4 w-4" />,
    },
    {
      keywords: ["e-commerce", "ecommerce", "retail"],
      icon: <ShoppingCart className="h-4 w-4" />,
    },
  ];

  // Find the first matching pattern
  for (const pattern of rolePatterns) {
    if (pattern.keywords.some((keyword) => searchText.includes(keyword))) {
      return pattern.icon;
    }
  }

  // Default fallback icon for org charts
  return <Users className="h-4 w-4" />;
};
