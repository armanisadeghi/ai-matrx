import { lazy } from "react";
import {
  Palette,
  Bell,
  Keyboard,
  Code,
  Brain,
  Mic,
  Volume2,
  Mail,
  Video,
  Image as ImageIcon,
  Type,
  BookOpen,
  Cpu,
  ShieldCheck,
  User,
  Database,
  Globe,
  Sun,
  Layers,
  Eye,
  Settings as SettingsIcon,
  MessageSquare,
  Camera,
  AppWindow,
  Activity,
  Building2,
  Plug,
  HardDrive,
  Chrome,
  MessageSquareMore,
  FileText,
  IdCard,
  Phone,
  Truck,
  ShieldAlert,
  Briefcase,
} from "lucide-react";
import type { SettingsTabDef, ResolvedSettingsTab } from "./types";
import type { SettingsTreeNode } from "@/components/official/settings/tree/types";

/**
 * Single source of truth for every settings tab.
 *
 * Adding a setting? See .cursor/skills/settings-system/SKILL.md once Phase 9 lands.
 *
 * NOTE: tabs are typed permissively because they're lazy-loaded and have no
 * props at the call site — `ComponentType<Record<string, never>>` means "no
 * required props" but structurally any tab that uses `useSetting` internally
 * is assignable.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lazyTab = (importer: () => Promise<{ default: any }>): any =>
  lazy(importer);

// ── Placeholder (used only for category-only nodes) ──────────────────────────
const Placeholder = lazyTab(() => import("./tabs/PlaceholderTab"));

// ── Real tabs ───────────────────────────────────────────────────────────────
const MessagingTab = lazyTab(() => import("./tabs/MessagingTab"));
const AppearanceTab = lazyTab(() => import("./tabs/AppearanceTab"));
const VoiceTab = lazyTab(() => import("./tabs/VoiceTab"));
const TextToSpeechTab = lazyTab(() => import("./tabs/TextToSpeechTab"));
const AssistantTab = lazyTab(() => import("./tabs/AssistantTab"));
const EmailTab = lazyTab(() => import("./tabs/EmailTab"));
const TextGenerationTab = lazyTab(() => import("./tabs/TextGenerationTab"));
const ImageGenerationTab = lazyTab(() => import("./tabs/ImageGenerationTab"));
const PhotoEditingTab = lazyTab(() => import("./tabs/PhotoEditingTab"));
const VideoConferenceTab = lazyTab(() => import("./tabs/VideoConferenceTab"));
const CodingTab = lazyTab(() => import("./tabs/CodingTab"));
const CodeWorkspaceTab = lazyTab(() => import("./tabs/CodeWorkspaceTab"));
const FlashcardsTab = lazyTab(() => import("./tabs/FlashcardsTab"));
const AiModelsTab = lazyTab(() => import("./tabs/AiModelsTab"));
const AdminServerTab = lazyTab(() => import("./tabs/AdminServerTab"));
const LayoutTab = lazyTab(() => import("./tabs/LayoutTab"));
const WindowsTab = lazyTab(() => import("./tabs/WindowsTab"));
const SystemTab = lazyTab(() => import("./tabs/SystemTab"));
const LanguageTab = lazyTab(() => import("./tabs/LanguageTab"));
const PrivacyTab = lazyTab(() => import("./tabs/PrivacyTab"));
const ProfileTab = lazyTab(() => import("./tabs/ProfileTab"));
const ProfileIdentityTab = lazyTab(() => import("./tabs/ProfileIdentityTab"));
const ProfileContactTab = lazyTab(() => import("./tabs/ProfileContactTab"));
const ProfileAddressesTab = lazyTab(() => import("./tabs/ProfileAddressesTab"));
const ProfileWorkTab = lazyTab(() => import("./tabs/ProfileWorkTab"));
const ProfileEmergencyTab = lazyTab(() => import("./tabs/ProfileEmergencyTab"));
const OrganizationsTab = lazyTab(() => import("./tabs/OrganizationsTab"));
const IntegrationsTab = lazyTab(() => import("./tabs/IntegrationsTab"));
const SandboxStorageTab = lazyTab(() => import("./tabs/SandboxStorageTab"));
const FeedbackTab = lazyTab(() => import("./tabs/FeedbackTab"));
const ExtensionTab = lazyTab(() => import("./tabs/ExtensionTab"));
const ContentTemplatesTab = lazyTab(() => import("./tabs/ContentTemplatesTab"));
const VoiceMicTab = lazyTab(() => import("./tabs/VoiceMicTab"));
const TranscriptionTab = lazyTab(() => import("./tabs/TranscriptionTab"));
const MemoryTab = lazyTab(() => import("./tabs/MemoryTab"));

export const settingsRegistry: SettingsTabDef[] = [
  // ── General ───────────────────────────────────────────────────────────────
  {
    id: "general",
    label: "General",
    icon: SettingsIcon,
    description: "Foundational preferences for the app.",
    component: Placeholder,
    persistence: "synced",
  },
  {
    id: "general.notifications",
    label: "Notifications",
    icon: Bell,
    parentId: "general",
    description: "Desktop notifications, volume, alerts.",
    searchKeywords: ["alerts", "sound", "ping"],
    component: MessagingTab, // shares the messaging implementation
    persistence: "synced",
  },
  {
    id: "general.language",
    label: "Language & Region",
    icon: Globe,
    parentId: "general",
    description: "Per-feature language defaults.",
    searchKeywords: ["locale", "region", "language"],
    component: LanguageTab,
    persistence: "synced",
  },
  {
    id: "general.privacy",
    label: "Privacy",
    icon: ShieldCheck,
    parentId: "general",
    description: "Data capture and telemetry preferences.",
    searchKeywords: ["telemetry", "tracking", "watching"],
    component: PrivacyTab,
    persistence: "synced",
  },
  {
    id: "general.system",
    label: "System",
    icon: Activity,
    parentId: "general",
    description: "Internal counters and onboarding state.",
    component: SystemTab,
    persistence: "synced",
  },

  // ── Appearance (theme slice + display module) ─────────────────────────────
  {
    id: "appearance",
    label: "Appearance",
    icon: Palette,
    description: "Theme, density, accent color.",
    searchKeywords: ["dark", "light", "mode", "theme", "layout"],
    component: AppearanceTab,
    persistence: "synced",
  },
  {
    id: "appearance.theme",
    label: "Theme",
    icon: Sun,
    parentId: "appearance",
    description: "Light, dark, accent variants.",
    searchKeywords: ["dark mode", "light mode"],
    component: AppearanceTab,
    persistence: "synced",
  },
  {
    id: "appearance.density",
    label: "Density",
    icon: Layers,
    parentId: "appearance",
    component: AppearanceTab,
    persistence: "synced",
  },
  {
    id: "appearance.accent",
    label: "Accent color",
    icon: Eye,
    parentId: "appearance",
    component: AppearanceTab,
    persistence: "synced",
  },
  {
    id: "appearance.layout",
    label: "Shell layout",
    icon: Layers,
    parentId: "appearance",
    description: "How the shell chrome arranges around content.",
    searchKeywords: ["window", "frame", "chrome"],
    component: LayoutTab,
    persistence: "local-only",
  },
  {
    id: "appearance.windows",
    label: "Windows",
    icon: AppWindow,
    parentId: "appearance",
    description: "Actions for floating panels on this screen.",
    searchKeywords: ["minimize", "restore", "hide"],
    component: WindowsTab,
    persistence: "session",
  },

  // ── AI & Models ───────────────────────────────────────────────────────────
  {
    id: "ai",
    label: "AI & Models",
    icon: Brain,
    description: "Models, generation, assistants.",
    component: Placeholder,
    persistence: "synced",
  },
  {
    id: "ai.models",
    label: "Models",
    icon: Cpu,
    parentId: "ai",
    description: "Choose which models appear in pickers.",
    searchKeywords: ["gpt", "claude", "llm", "provider"],
    component: AiModelsTab,
    persistence: "synced",
  },
  {
    id: "ai.assistants",
    label: "Assistants",
    icon: Brain,
    parentId: "ai",
    description: "Default assistant behaviour.",
    component: AssistantTab,
    persistence: "synced",
  },
  {
    id: "ai.memory",
    label: "Memory",
    icon: Brain,
    parentId: "ai",
    description:
      "Cross-project notes your agents read and write — shared across every conversation and sandbox.",
    searchKeywords: [
      "memory",
      "notes",
      "preferences",
      "remember",
      "context",
      "sandbox",
    ],
    component: MemoryTab,
    persistence: "synced",
  },
  {
    id: "ai.textGeneration",
    label: "Text generation",
    icon: Type,
    parentId: "ai",
    component: TextGenerationTab,
    persistence: "synced",
  },
  {
    id: "ai.imageGeneration",
    label: "Image generation",
    icon: ImageIcon,
    parentId: "ai",
    component: ImageGenerationTab,
    persistence: "synced",
  },
  {
    id: "ai.photoEditing",
    label: "Photo editing",
    icon: Camera,
    parentId: "ai",
    component: PhotoEditingTab,
    persistence: "synced",
  },

  // ── Editor ────────────────────────────────────────────────────────────────
  {
    id: "editor",
    label: "Editor",
    icon: Code,
    component: Placeholder,
    persistence: "synced",
  },
  {
    id: "editor.coding",
    label: "Coding",
    icon: Code,
    parentId: "editor",
    component: CodingTab,
    persistence: "synced",
  },
  {
    id: "editor.codeWorkspace",
    label: "Code workspace",
    icon: MessageSquare,
    parentId: "editor",
    description:
      "Which agents appear in the /code chat and how history is grouped.",
    searchKeywords: [
      "agents",
      "filter",
      "tags",
      "categories",
      "chat",
      "history",
      "conversations",
      "favorites",
    ],
    component: CodeWorkspaceTab,
    persistence: "synced",
  },
  {
    id: "editor.keybindings",
    label: "Keybindings",
    icon: Keyboard,
    parentId: "editor",
    component: Placeholder,
    persistence: "synced",
  },

  // ── Voice & Audio ─────────────────────────────────────────────────────────
  {
    id: "voice",
    label: "Voice & Audio",
    icon: Mic,
    component: Placeholder,
    persistence: "synced",
  },
  {
    id: "voice.input",
    label: "Voice input",
    icon: Mic,
    parentId: "voice",
    description: "Microphone, wake word, speech speed.",
    component: VoiceTab,
    persistence: "synced",
  },
  {
    id: "voice.tts",
    label: "Text-to-speech",
    icon: Volume2,
    parentId: "voice",
    description: "Voice used to read responses aloud.",
    component: TextToSpeechTab,
    persistence: "synced",
  },
  {
    id: "voice.diagnostics",
    label: "Mic diagnostics",
    icon: Mic,
    parentId: "voice",
    description: "Test your microphone and troubleshoot input issues.",
    searchKeywords: ["microphone", "test", "troubleshoot", "permissions"],
    component: VoiceMicTab,
    persistence: "local-only",
  },
  {
    id: "voice.transcription",
    label: "Transcription cleaners",
    icon: FileText,
    parentId: "voice",
    description:
      "Add custom AI agents to the Transcription Cleanup window's picker.",
    searchKeywords: [
      "transcription",
      "cleanup",
      "voice pad ai",
      "agents",
      "custom",
    ],
    component: TranscriptionTab,
    persistence: "synced",
  },

  // ── Communication ─────────────────────────────────────────────────────────
  {
    id: "communication.email",
    label: "Email",
    icon: Mail,
    component: EmailTab,
    persistence: "local-only", // stored via separate API, not unified sync yet
  },
  {
    id: "communication.video",
    label: "Video conference",
    icon: Video,
    component: VideoConferenceTab,
    persistence: "synced",
  },
  {
    id: "communication.messaging",
    label: "Messaging",
    icon: MessageSquare,
    description: "Notification sounds and desktop alerts.",
    searchKeywords: ["notifications", "sound", "volume", "alerts", "banner"],
    component: MessagingTab,
    persistence: "synced",
  },

  // ── Learning ──────────────────────────────────────────────────────────────
  {
    id: "learning.flashcards",
    label: "Flashcards",
    icon: BookOpen,
    component: FlashcardsTab,
    persistence: "synced",
  },

  // ── Profile / Account ─────────────────────────────────────────────────────
  //
  // The five sub-tabs all render the same UserProfilePage; each just scrolls
  // to its section on mount. Persistence model:
  //   • "Profile" itself (parent) saves to auth.users.user_metadata + public.profiles
  //     via /api/user/profile (custom Supabase write, not the unified sync engine).
  //   • All children save to public.user_form_profile via /api/user/form-profile.
  // We mark them all "synced" because saved data lives in Supabase and is
  // available across all the user's devices.
  {
    id: "account",
    label: "Profile",
    icon: User,
    description: "Your profile, account info, and connected providers.",
    searchKeywords: ["account", "name", "email", "avatar", "profile"],
    component: ProfileTab,
    persistence: "synced",
  },
  {
    id: "account.identity",
    label: "Identity",
    icon: IdCard,
    parentId: "account",
    description:
      "Legal name, pronouns, and date of birth — used by agents acting on your behalf.",
    searchKeywords: [
      "legal name",
      "first name",
      "last name",
      "middle name",
      "preferred name",
      "pronouns",
      "date of birth",
      "dob",
      "birthday",
      "suffix",
    ],
    component: ProfileIdentityTab,
    persistence: "synced",
  },
  {
    id: "account.contact",
    label: "Contact",
    icon: Phone,
    parentId: "account",
    description: "Phones, additional emails, social handles, and website.",
    searchKeywords: [
      "phone",
      "telephone",
      "mobile",
      "email addresses",
      "social",
      "twitter",
      "linkedin",
      "github",
      "website",
      "url",
    ],
    component: ProfileContactTab,
    persistence: "synced",
  },
  {
    id: "account.addresses",
    label: "Addresses",
    icon: Truck,
    parentId: "account",
    description: "Shipping and billing addresses for forms and deliveries.",
    searchKeywords: [
      "shipping",
      "billing",
      "address",
      "postal",
      "zip",
      "country",
      "state",
      "city",
    ],
    component: ProfileAddressesTab,
    persistence: "synced",
  },
  {
    id: "account.work",
    label: "Work",
    icon: Briefcase,
    parentId: "account",
    description: "Company and job title — used for signatures and forms.",
    searchKeywords: [
      "company",
      "employer",
      "job",
      "title",
      "occupation",
      "work",
    ],
    component: ProfileWorkTab,
    persistence: "synced",
  },
  {
    id: "account.emergency",
    label: "Emergency contacts",
    icon: ShieldAlert,
    parentId: "account",
    description:
      "People to reach if something goes wrong. Visible only to you.",
    searchKeywords: ["emergency", "contact", "next of kin", "icoe", "ice"],
    component: ProfileEmergencyTab,
    persistence: "synced",
  },

  // ── Organizations ─────────────────────────────────────────────────────────
  {
    id: "organizations",
    label: "Organizations",
    icon: Building2,
    description: "Manage organizations you belong to and create new ones.",
    searchKeywords: ["org", "orgs", "team", "teams", "workspace", "members"],
    component: OrganizationsTab,
    persistence: "synced",
  },

  // ── Templates ─────────────────────────────────────────────────────────────
  {
    id: "templates",
    label: "Content templates",
    icon: FileText,
    description: "Reusable content templates for your prompts and responses.",
    searchKeywords: ["template", "content", "snippets", "saved"],
    component: ContentTemplatesTab,
    persistence: "synced",
  },

  // ── Integrations ──────────────────────────────────────────────────────────
  {
    id: "integrations",
    label: "Integrations",
    icon: Plug,
    description: "Connect MCP servers and external tools to your agents.",
    searchKeywords: [
      "mcp",
      "integration",
      "connect",
      "tools",
      "github",
      "slack",
      "linear",
    ],
    component: IntegrationsTab,
    persistence: "synced",
  },

  // ── Sandbox storage ───────────────────────────────────────────────────────
  {
    id: "sandboxStorage",
    label: "Sandbox storage",
    icon: HardDrive,
    description: "Persistent storage for your Matrx sandboxes.",
    searchKeywords: ["sandbox", "storage", "volume", "wipe", "persist"],
    component: SandboxStorageTab,
    persistence: "synced",
  },

  // ── Feedback ──────────────────────────────────────────────────────────────
  {
    id: "feedback",
    label: "My feedback",
    icon: MessageSquareMore,
    description: "Track the bugs, features, and suggestions you've reported.",
    searchKeywords: ["bugs", "feature requests", "issues", "report"],
    component: FeedbackTab,
    persistence: "synced",
  },

  // ── Chrome extension ──────────────────────────────────────────────────────
  {
    id: "extension",
    label: "Chrome extension",
    icon: Chrome,
    description:
      "Generate codes to authenticate the AI Matrx Chrome extension.",
    searchKeywords: ["chrome", "browser", "extension", "auth", "code"],
    component: ExtensionTab,
    persistence: "local-only",
  },

  // ── Admin (admin-gated) ───────────────────────────────────────────────────
  {
    id: "admin",
    label: "Admin",
    icon: ShieldCheck,
    description: "Admin-only overrides.",
    requiresAdmin: true,
    component: Placeholder,
    persistence: "local-only",
  },
  {
    id: "admin.server",
    label: "Server environment",
    icon: Database,
    parentId: "admin",
    description: "Override the backend host for API calls.",
    searchKeywords: ["url", "endpoint", "localhost", "staging"],
    requiresAdmin: true,
    component: AdminServerTab,
    persistence: "local-only",
  },
];

/** Returns the registry filtered by visibility rules. */
export function getVisibleTabs(isAdmin: boolean): SettingsTabDef[] {
  return settingsRegistry.filter((t) => {
    if (t.requiresAdmin && !isAdmin) return false;
    return true;
  });
}

/** Returns the registry organized as a hierarchical array for the tree. */
export function getTabTree(isAdmin: boolean): ResolvedSettingsTab[] {
  const visible = getVisibleTabs(isAdmin);
  const byId = new Map(
    visible.map((t) => [t.id, { ...t } as ResolvedSettingsTab]),
  );
  const roots: ResolvedSettingsTab[] = [];
  for (const t of byId.values()) {
    if (t.parentId) {
      const parent = byId.get(t.parentId);
      if (parent) {
        (parent.children ??= []).push(t);
      } else {
        roots.push(t);
      }
    } else {
      roots.push(t);
    }
  }
  return roots;
}

/** Returns the registry as SettingsTreeNode[], ready for the tree components. */
export function getTabTreeNodes(isAdmin: boolean): SettingsTreeNode[] {
  const toNode = (t: ResolvedSettingsTab): SettingsTreeNode => ({
    id: t.id,
    label: t.label,
    icon: t.icon,
    description: t.description,
    searchKeywords: t.searchKeywords,
    children: t.children?.map(toNode),
  });
  return getTabTree(isAdmin).map(toNode);
}

/** Find one tab by id. */
export function findTab(id: string): SettingsTabDef | undefined {
  return settingsRegistry.find((t) => t.id === id);
}
