// features/mandates/feature-intelligence/feature-icons.ts
//
// The icon each registry Feature (and each Domain's "not yet assigned" group)
// wears on the /intelligence directory — the same mark the app uses for that
// part of the product where one exists (nav-data). A feature missing here
// falls back to its Domain's icon, then the neutral Boxes icon. Never
// INTELLIGENCE_ICON (reserved for Intelligence itself).

import {
  AppWindow,
  Archive,
  AudioLines,
  BadgeCheck,
  BookA,
  BookOpen,
  Boxes,
  CalendarDays,
  Camera,
  ClipboardCheck,
  Clapperboard,
  Code2,
  Database,
  Eye,
  Factory,
  FileSearch,
  FileText,
  FlaskConical,
  FolderKanban,
  Gamepad2,
  Globe,
  GraduationCap,
  Handshake,
  Headphones,
  History,
  Image,
  Images,
  Laptop,
  Layers,
  Library,
  Lightbulb,
  ListChecks,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquareQuote,
  MessagesSquare,
  Mic,
  Network,
  Newspaper,
  NotepadText,
  PackagePlus,
  PanelsTopLeft,
  PhoneCall,
  Plug,
  Puzzle,
  Radar,
  Repeat,
  ScanText,
  Scale,
  Search,
  Send,
  Server,
  Shapes,
  Share2,
  Smartphone,
  SquareTerminal,
  Swords,
  Table,
  TrendingUp,
  Users,
  Video,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { AGENT_ICON, INTELLIGENCE_ICON } from "@/components/icons/domain-icons";

/** Registry Feature id → icon. */
const FEATURE_ICONS: Readonly<Record<string, LucideIcon>> = {
  // Agents
  "applets": Puzzle,
  "agent-memory": Archive,
  "agent-studio": Factory,
  "agent-tools": Wrench,
  chat: MessageCircle,
  "execution-runtime": Network,
  orchestras: Network,
  voice: Mic,
  // Clients
  desktop: Laptop,
  extension: AppWindow,
  // Code
  "code-workspace": Code2,
  "coding-session-bridge": SquareTerminal,
  // Communications
  meet: Video,
  messaging: Mail,
  "messaging-channels": Smartphone,
  "personal-staff": Users,
  "voice-calls": PhoneCall,
  // Content IR
  "kind-authoring": Shapes,
  // CRM
  party: Handshake,
  // Education
  "ai-tutor": GraduationCap,
  "classes-and-creators": Users,
  "education-games": Gamepad2,
  "flashcard-images": Image,
  flashcards: Layers,
  "learn-content": BookOpen,
  "planner-and-progress": CalendarDays,
  "quizzes-and-tests": ListChecks,
  "study-kit": Lightbulb,
  "study-media": Headphones,
  // Improvement
  "agent-iteration": Repeat,
  feedback: MessageSquareQuote,
  hindsight: History,
  judges: ClipboardCheck,
  "pattern-patrols": Radar,
  // Integrations
  google: Search,
  // Intelligence
  mandates: Plug,
  // Knowledge
  "document-intelligence": ScanText,
  ingestion: ScanText,
  "knowledge-graph": Share2,
  rag: Database,
  research: FileSearch,
  scraper: Globe,
  // Marketing
  commerce: PackagePlus,
  "competitor-classification": Swords,
  "content-planning": CalendarDays,
  "growth-loop": Repeat,
  outreach: Send,
  "public-relations": Megaphone,
  seo: TrendingUp,
  "websites-and-brands": Globe,
  // Masterwork
  "agent-creation-studio": Factory,
  distillation: FlaskConical,
  rulebooks: BookA,
  "vision-interview": Lightbulb,
  // Media
  "audio-tts": AudioLines,
  images: Images,
  "media-source-catalog": Library,
  pdf: FileText,
  podcasts: Headphones,
  "product-capture": Camera,
  transcription: AudioLines,
  // Platform
  dictionary: BookA,
  observability: Eye,
  "proof-runs": BadgeCheck,
  "purpose-registry": ClipboardCheck,
  surfaces: PanelsTopLeft,
  // Website Platform
  cms: Newspaper,
  // Workflows
  "plan-nodes": Workflow,
  "workflow-authoring": Workflow,
  "workflow-runtime": Workflow,
  // Content, Data, Board, Projects
  "lists-and-workbooks": Table,
  notes: NotepadText,
  "tasks-and-projects": FolderKanban,
  "war-room": Swords,
};

/** Registry Domain id → icon (a Domain's "not yet assigned" group wears it). */
const DOMAIN_ICONS: Readonly<Record<string, LucideIcon>> = {
  agents: AGENT_ICON,
  chat: MessageCircle,
  clients: Laptop,
  code: Code2,
  files: FileText,
  audio: AudioLines,
  content: NotepadText,
  data: Table,
  board: Swords,
  projects: FolderKanban,
  web: Globe,
  publish: Newspaper,
  commerce: Camera,
  communications: MessagesSquare,
  "content-ir": Shapes,
  crm: Handshake,
  education: GraduationCap,
  "human-resources": Users,
  improvement: Repeat,
  infrastructure: Server,
  integrations: Plug,
  intelligence: INTELLIGENCE_ICON,
  knowledge: Library,
  legal: Scale,
  marketing: TrendingUp,
  masterwork: BookOpen,
  media: Clapperboard,
  platform: Boxes,
  "public-web": Globe,
  "scopes-context": Layers,
  "website-platform": Newspaper,
  workflows: Workflow,
};

/**
 * A registry Domain's icon (the settings nav's Configuration folders wear it),
 * or the neutral Boxes icon for a domain not listed — never a gear, which
 * would make every domain look the same.
 */
export function domainIcon(domain: string): LucideIcon {
  return DOMAIN_ICONS[domain] ?? Boxes;
}

export function featureIcon(
  feature: string,
  domain?: string | null,
): LucideIcon {
  return (
    FEATURE_ICONS[feature] ??
    (domain ? DOMAIN_ICONS[domain] : undefined) ??
    Boxes
  );
}
