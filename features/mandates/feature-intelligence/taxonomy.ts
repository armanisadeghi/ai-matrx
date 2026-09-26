// features/mandates/feature-intelligence/taxonomy.ts
//
// THE REGISTRY, as the /intelligence directory reads it: every Domain and its
// Features, ids and names exactly as `platform.taxonomy_node` holds them
// (common-docs/systems/platform/vocabulary/FEATURE.md: the DB is the source;
// never coin or rename). Snapshot taken 2026-09-26 from the live DB — when a
// node is added or renamed there, update this list (the guard in
// `__tests__/placement.test.ts` fails when a placement names a node missing here).
// `proposed: true` marks nodes Arman has not ratified yet; they still place jobs.

export interface RegistryFeature {
  id: string;
  name: string;
  proposed?: true;
}

export interface RegistryDomain {
  id: string;
  name: string;
  features: readonly RegistryFeature[];
}

export const REGISTRY_DOMAINS: readonly RegistryDomain[] = [
  {
    id: "agents",
    name: "Agents",
    features: [
      { id: "agent-apps", name: "Agent Apps" },
      { id: "agent-context-binding", name: "Agent Context Binding" },
      { id: "agent-design", name: "Agent Design", proposed: true },
      { id: "agent-memory", name: "Agent Memory" },
      { id: "agent-picker", name: "Agent Picker", proposed: true },
      { id: "agent-samples", name: "Agent Samples", proposed: true },
      { id: "agent-skills", name: "Agent Skills" },
      { id: "agent-studio", name: "Agent Studio" },
      { id: "agent-tools", name: "Agent Tools" },
      {
        id: "agent-variable-binding",
        name: "Agent Variable Binding",
        proposed: true,
      },
      { id: "ai-models", name: "Ai Models" },
      { id: "batch-runs", name: "Batch Runs" },
      { id: "chat", name: "Chat" },
      {
        id: "conversation-start-contract",
        name: "Conversation Start Contract",
        proposed: true,
      },
      { id: "execution-runtime", name: "Execution Runtime" },
      { id: "orchestras", name: "Orchestras" },
      { id: "prompts", name: "Prompts" },
      { id: "typed-messages", name: "Typed Messages", proposed: true },
      { id: "voice", name: "Voice" },
    ],
  },
  {
    id: "clients",
    name: "Clients",
    features: [
      { id: "client-distribution", name: "Client Distribution" },
      { id: "client-sync", name: "Client Sync" },
      {
        id: "client-tool-delegation",
        name: "Client Tool Delegation",
        proposed: true,
      },
      { id: "desktop", name: "Desktop" },
      { id: "extension", name: "Extension" },
      {
        id: "matrx-authenticator",
        name: "Matrx Authenticator",
        proposed: true,
      },
      { id: "native-apps", name: "Native Apps", proposed: true },
      { id: "on-device-ai", name: "On Device Ai" },
      { id: "remote-catalogs", name: "Remote Catalogs", proposed: true },
      { id: "web-data-extraction", name: "Web Data Extraction" },
    ],
  },
  {
    id: "coding",
    name: "Coding",
    features: [
      { id: "agent-fs", name: "Agent Fs" },
      { id: "code-workspace", name: "Code Workspace" },
      { id: "coding-session-bridge", name: "Coding Session Bridge" },
      { id: "ide-plugins", name: "Ide Plugins" },
      { id: "vscode-extension", name: "Vscode Extension" },
    ],
  },
  {
    id: "communications",
    name: "Communications",
    features: [
      { id: "internal-messaging", name: "Internal Messaging" },
      { id: "meet", name: "Meet", proposed: true },
      { id: "message-templates", name: "Message Templates" },
      { id: "messaging", name: "Messaging", proposed: true },
      { id: "messaging-channels", name: "Messaging Channels" },
      { id: "notifications", name: "Notifications" },
      { id: "personal-staff", name: "Personal Staff", proposed: true },
      { id: "voice-calls", name: "Voice Calls" },
    ],
  },
  {
    id: "content-ir",
    name: "Content IR",
    features: [
      { id: "kind-authoring", name: "Kind Authoring" },
      { id: "kind-registry", name: "Kind Registry" },
      { id: "matrx-envelope", name: "Matrx Envelope" },
      { id: "render-blocks", name: "Render Blocks" },
    ],
  },
  {
    id: "crm",
    name: "CRM",
    features: [
      { id: "contact-import", name: "Contact Import" },
      { id: "crm-inbox", name: "Crm Inbox" },
      { id: "deals", name: "Deals" },
      { id: "party", name: "Party" },
    ],
  },
  {
    id: "education",
    name: "Education",
    features: [
      { id: "ai-tutor", name: "Ai Tutor" },
      { id: "child-safety", name: "Child Safety" },
      { id: "classes-and-creators", name: "Classes And Creators" },
      { id: "education-games", name: "Education Games" },
      { id: "flashcard-images", name: "Flashcard Images", proposed: true },
      { id: "flashcards", name: "Flashcards" },
      { id: "learn-content", name: "Learn Content" },
      { id: "planner-and-progress", name: "Planner And Progress" },
      { id: "quizzes-and-tests", name: "Quizzes And Tests" },
      { id: "study-kit", name: "Study Kit (universal ingest)" },
      { id: "study-media", name: "Study Media" },
    ],
  },
  {
    id: "human-resources",
    name: "Human Resources",
    features: [
      {
        id: "employee-performance-reviews",
        name: "Employee Performance Reviews",
      },
      {
        id: "hr-compliance",
        name: "HR Compliance & Jurisdiction Rules",
        proposed: true,
      },
      {
        id: "hr-documents-and-forms",
        name: "Documents & Forms",
        proposed: true,
      },
      { id: "hr-employees", name: "Employees", proposed: true },
      { id: "hr-hiring", name: "Hiring", proposed: true },
      { id: "hr-leave", name: "Leave & PTO", proposed: true },
      { id: "hr-onboarding", name: "Onboarding & Offboarding", proposed: true },
      { id: "hr-scheduling", name: "Scheduling", proposed: true },
      {
        id: "hr-time-and-attendance",
        name: "Time & Attendance",
        proposed: true,
      },
      { id: "hr-training", name: "Training", proposed: true },
      { id: "hr-workflow-inbox", name: "HR Workflow Inbox", proposed: true },
    ],
  },
  {
    id: "improvement",
    name: "Improvement",
    features: [
      { id: "agent-iteration", name: "Agent Iteration" },
      { id: "feedback", name: "Feedback" },
      { id: "hindsight", name: "Hindsight" },
      { id: "judges", name: "Judges" },
      { id: "pattern-patrols", name: "Pattern Patrols" },
      { id: "producer-yield", name: "Producer Yield" },
      { id: "work-loop", name: "Autonomous Work Loop", proposed: true },
    ],
  },
  {
    id: "infrastructure",
    name: "Infrastructure",
    features: [
      {
        id: "agent-machine-setup",
        name: "Agent Machine Setup",
        proposed: true,
      },
      { id: "compute-targets", name: "Compute Targets" },
      { id: "deploy-control-plane", name: "Deploy Control Plane" },
      { id: "mcp-hosting", name: "Generated MCP Hosting", proposed: true },
      { id: "persistent-cloud-browser", name: "Persistent Cloud Browser" },
      { id: "production-infra", name: "Production Infra" },
      { id: "sandboxes", name: "Sandboxes" },
    ],
  },
  {
    id: "integrations",
    name: "Integrations",
    features: [
      { id: "bing", name: "Bing" },
      { id: "github", name: "Github" },
      { id: "google", name: "Google" },
      { id: "mcp-connections", name: "Mcp Connections" },
      { id: "provider-access", name: "Provider Access" },
      { id: "third-party-apis", name: "Third Party Apis" },
    ],
  },
  {
    id: "intelligence",
    name: "Intelligence",
    features: [{ id: "mandates", name: "Mandates" }],
  },
  {
    id: "knowledge",
    name: "Knowledge",
    features: [
      { id: "document-intelligence", name: "Document Intelligence" },
      { id: "ingestion", name: "Ingestion" },
      { id: "knowledge-graph", name: "Knowledge Graph" },
      { id: "rag", name: "Rag" },
      { id: "research", name: "Research" },
      { id: "scraper", name: "Scraper" },
      { id: "web-search", name: "Web Search", proposed: true },
    ],
  },
  {
    id: "legal",
    name: "Legal",
    features: [
      { id: "legal-search", name: "Legal Search" },
      { id: "wc-ratings", name: "Wc Ratings" },
    ],
  },
  {
    id: "marketing",
    name: "Marketing",
    features: [
      { id: "ads", name: "Ads" },
      { id: "ai-matrx-internal-seo", name: "AI Matrx Internal SEO" },
      { id: "commerce", name: "Commerce", proposed: true },
      {
        id: "competitor-classification",
        name: "Competitor Classification",
        proposed: true,
      },
      { id: "content-planning", name: "Content Planning" },
      { id: "content-studio", name: "Content Studio" },
      { id: "free-seo-tools", name: "Free Seo Tools" },
      { id: "growth-loop", name: "Growth Loop" },
      { id: "local-listings", name: "Local Listings" },
      { id: "marketing-analytics", name: "Marketing Analytics" },
      { id: "outreach", name: "Outreach" },
      { id: "outreach-data", name: "Outreach Data", proposed: true },
      { id: "public-relations", name: "Public Relations" },
      { id: "seo", name: "Seo" },
      { id: "social", name: "Social" },
      {
        id: "url-change-discovery",
        name: "URL Change Discovery",
        proposed: true,
      },
      { id: "websites-and-brands", name: "Websites And Brands" },
    ],
  },
  {
    id: "masterwork",
    name: "Masterwork",
    features: [
      { id: "agent-creation-studio", name: "Agent Creation Studio" },
      { id: "distillation", name: "Distillation" },
      { id: "encore", name: "Encore" },
      { id: "engram", name: "Engram", proposed: true },
      { id: "rulebooks", name: "Rulebooks" },
      { id: "vision-interview", name: "Vision Interview" },
    ],
  },
  {
    id: "media",
    name: "Media",
    features: [
      { id: "audio-tts", name: "Audio Tts" },
      { id: "file-service", name: "File Service" },
      { id: "images", name: "Images" },
      { id: "media-capture", name: "Media Capture" },
      { id: "media-durability", name: "Media Durability", proposed: true },
      {
        id: "media-source-catalog",
        name: "Media Source Catalog",
        proposed: true,
      },
      { id: "pdf", name: "Pdf" },
      { id: "podcasts", name: "Podcasts" },
      { id: "printing", name: "Printing" },
      { id: "product-capture", name: "Product Capture", proposed: true },
      { id: "transcription", name: "Transcription" },
    ],
  },
  {
    id: "platform",
    name: "Platform",
    features: [
      { id: "access", name: "Access" },
      { id: "admin-console-shell", name: "Admin Console Shell" },
      {
        id: "agent-credential-entry",
        name: "Agent Credential Entry",
        proposed: true,
      },
      { id: "app-config", name: "App Config" },
      { id: "assists", name: "Assists" },
      { id: "associations", name: "Associations" },
      { id: "auth", name: "Auth" },
      {
        id: "client-packages",
        name: "Client Packages (@ai-matrx/*)",
        proposed: true,
      },
      {
        id: "configuration-equivalence",
        name: "Configuration Equivalence",
        proposed: true,
      },
      { id: "continued-access", name: "Continued Access", proposed: true },
      { id: "custom-data", name: "Custom Data", proposed: true },
      { id: "data-lifecycle", name: "Data Lifecycle" },
      { id: "db-rules", name: "DB Rules", proposed: true },
      { id: "dictionary", name: "Custom Dictionary" },
      { id: "docs-system", name: "Docs System" },
      { id: "entitlements-knobs", name: "Entitlements Knobs" },
      {
        id: "entity-content-role",
        name: "Entity Content Role",
        proposed: true,
      },
      { id: "esign", name: "E-signature", proposed: true },
      { id: "feature-knobs", name: "Feature Knobs", proposed: true },
      {
        id: "frontend-federation",
        name: "Frontend Federation",
        proposed: true,
      },
      { id: "gamification", name: "Gamification" },
      { id: "library", name: "Library", proposed: true },
      { id: "observability", name: "Observability" },
      {
        id: "optimistic-concurrency",
        name: "Optimistic Concurrency",
        proposed: true,
      },
      { id: "organizations", name: "Organizations" },
      { id: "orm-persistence", name: "Orm Persistence" },
      { id: "platform-spend", name: "Platform Spend", proposed: true },
      { id: "proof-runs", name: "Proof Runs", proposed: true },
      { id: "provenance", name: "Provenance" },
      { id: "purpose-registry", name: "Purpose Registry" },
      { id: "question-desk", name: "Question Desk", proposed: true },
      { id: "realtime", name: "Realtime", proposed: true },
      {
        id: "request-attribution",
        name: "Request Attribution",
        proposed: true,
      },
      {
        id: "residential-egress",
        name: "Residential egress (Home connections)",
        proposed: true,
      },
      { id: "route-liveness", name: "Route Liveness" },
      { id: "runtime-continuity", name: "Runtime Continuity", proposed: true },
      { id: "runtime-spine", name: "Runtime Spine" },
      { id: "scheduling", name: "Scheduling" },
      { id: "setting-doors", name: "Setting Doors", proposed: true },
      { id: "settings", name: "Settings" },
      { id: "sharing", name: "Sharing" },
      { id: "short-links", name: "Short Links", proposed: true },
      { id: "streaming", name: "Streaming" },
      { id: "surfaces", name: "Surfaces" },
      { id: "token-broker", name: "Token Broker" },
      { id: "vault-secrets", name: "Vault Secrets" },
      { id: "versioning", name: "Versioning", proposed: true },
      { id: "vocabulary", name: "Vocabulary", proposed: true },
    ],
  },
  {
    id: "public-web",
    name: "Public Web",
    features: [
      { id: "download", name: "Download" },
      { id: "landing-pages", name: "Landing Pages" },
      { id: "legal-pages", name: "Legal Pages" },
      { id: "og-cards", name: "Og Cards" },
      { id: "pricing", name: "Pricing" },
      { id: "share-viewers", name: "Share Viewers" },
    ],
  },
  {
    id: "scopes-context",
    name: "Scopes & Context",
    features: [
      { id: "context-delivery", name: "Context Delivery" },
      { id: "context-policies", name: "Context Policies" },
      { id: "scope-types", name: "Scope Types" },
      { id: "scopes", name: "Scopes" },
    ],
  },
  {
    id: "website-platform",
    name: "Website Platform",
    features: [
      { id: "cms", name: "Cms" },
      { id: "html-pages", name: "Html Pages" },
      { id: "site-publishing", name: "Site Publishing" },
    ],
  },
  {
    id: "workflows",
    name: "Workflows",
    features: [
      { id: "plan-nodes", name: "Plan Nodes" },
      { id: "workflow-authoring", name: "Workflow Authoring" },
      { id: "workflow-engine", name: "Workflow Engine" },
      { id: "workflow-runtime", name: "Workflow Runtime" },
      { id: "workflow-triggers", name: "Workflow Triggers" },
    ],
  },
  {
    id: "workspace",
    name: "Workspace",
    features: [
      { id: "artifacts-canvas", name: "Artifacts Canvas" },
      { id: "dashboard", name: "Dashboard" },
      { id: "documents", name: "Documents" },
      { id: "lists-and-workbooks", name: "Lists And Workbooks" },
      { id: "notes", name: "Notes" },
      { id: "tasks-and-projects", name: "Tasks And Projects" },
      { id: "visual-maps", name: "Visual Maps" },
      { id: "war-room", name: "War Room" },
    ],
  },
];

const DOMAIN_BY_ID = new Map(
  REGISTRY_DOMAINS.map((domain) => [domain.id, domain]),
);
const FEATURE_BY_ID = new Map(
  REGISTRY_DOMAINS.flatMap((domain) =>
    domain.features.map(
      (feature) => [feature.id, { ...feature, domain: domain.id }] as const,
    ),
  ),
);

export function registryDomain(id: string): RegistryDomain | null {
  return DOMAIN_BY_ID.get(id) ?? null;
}

export function registryFeature(
  id: string,
): (RegistryFeature & { domain: string }) | null {
  return FEATURE_BY_ID.get(id) ?? null;
}
