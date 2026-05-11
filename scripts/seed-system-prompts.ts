/**
 * Seed System Prompts
 *
 * Creates placeholder system prompts for all known menu items, buttons, and cards.
 * These will show as "Coming Soon" until actual prompts are assigned.
 */

import { createClient } from "@supabase/supabase-js";

interface SystemPromptSeed {
  system_prompt_id: string;
  name: string;
  description: string;
  placement_type: "context-menu" | "card" | "button" | "modal" | "link";
  functionality_id: string;
  category: string;
  subcategory?: string;
  sort_order: number;
  placement_settings?: any;
  display_config?: any;
  status: "draft" | "published";
  is_active: boolean;
}

const SYSTEM_PROMPT_SEEDS: SystemPromptSeed[] = [
  // ===== CONTEXT MENU: STANDALONE (Top-level) =====
  {
    system_prompt_id: "explain-standalone",
    name: "Explain",
    description: "Explain the selected text in simple terms",
    placement_type: "context-menu",
    functionality_id: "explain-text",
    category: "standalone",
    sort_order: 10,
    placement_settings: { requiresSelection: false },
    display_config: { icon: "MessageSquare" },
    status: "draft",
    is_active: false,
  },
  {
    system_prompt_id: "summarize-standalone",
    name: "Summarize",
    description: "Create a concise summary",
    placement_type: "context-menu",
    functionality_id: "summarize-text",
    category: "standalone",
    sort_order: 20,
    placement_settings: { requiresSelection: false, minSelectionLength: 50 },
    display_config: { icon: "FileText" },
    status: "draft",
    is_active: false,
  },
  {
    system_prompt_id: "extract-key-points-standalone",
    name: "Extract Key Points",
    description: "Extract the main points from text",
    placement_type: "context-menu",
    functionality_id: "extract-key-points",
    category: "standalone",
    sort_order: 30,
    placement_settings: { requiresSelection: false, minSelectionLength: 50 },
    display_config: { icon: "ListChecks" },
    status: "draft",
    is_active: false,
  },
  {
    system_prompt_id: "improve-standalone",
    name: "Improve",
    description: "Improve the writing quality",
    placement_type: "context-menu",
    functionality_id: "improve-writing",
    category: "standalone",
    sort_order: 40,
    placement_settings: { requiresSelection: false, minSelectionLength: 10 },
    display_config: { icon: "Hammer" },
    status: "draft",
    is_active: false,
  },
  {
    system_prompt_id: "get-ideas-standalone",
    name: "Get Ideas",
    description: "Generate ideas related to the topic",
    placement_type: "context-menu",
    functionality_id: "get-ideas",
    category: "standalone",
    sort_order: 50,
    display_config: { icon: "Lightbulb" },
    status: "draft",
    is_active: false,
  },
  {
    system_prompt_id: "search-web-standalone",
    name: "Search Web",
    description: "Search the web for this topic",
    placement_type: "context-menu",
    functionality_id: "search-web",
    category: "standalone",
    sort_order: 60,
    display_config: { icon: "Search" },
    status: "draft",
    is_active: false,
  },

  // ===== CONTEXT MENU: MATRX CREATE =====
  {
    system_prompt_id: "create-flashcards",
    name: "Create Flashcards",
    description: "Generate flashcards from content",
    placement_type: "context-menu",
    functionality_id: "create-flashcards",
    category: "matrx-create",
    subcategory: "study-tools",
    sort_order: 10,
    display_config: { icon: "Layers" },
    status: "draft",
    is_active: false,
  },
  {
    system_prompt_id: "create-quiz",
    name: "Create Quiz",
    description: "Generate quiz questions",
    placement_type: "context-menu",
    functionality_id: "create-quiz",
    category: "matrx-create",
    subcategory: "study-tools",
    sort_order: 20,
    display_config: { icon: "HelpCircle" },
    status: "draft",
    is_active: false,
  },

  // ===== CONTEXT MENU: TRANSLATION =====
  {
    system_prompt_id: "translate-spanish",
    name: "Translate to Spanish",
    description: "Translate selected text to Spanish",
    placement_type: "context-menu",
    functionality_id: "translate-text",
    category: "translation",
    sort_order: 10,
    placement_settings: { requiresSelection: true, minSelectionLength: 1 },
    display_config: { icon: "Languages" },
    status: "draft",
    is_active: false,
  },
  {
    system_prompt_id: "translate-french",
    name: "Translate to French",
    description: "Translate selected text to French",
    placement_type: "context-menu",
    functionality_id: "translate-text",
    category: "translation",
    sort_order: 20,
    placement_settings: { requiresSelection: true, minSelectionLength: 1 },
    display_config: { icon: "Languages" },
    status: "draft",
    is_active: false,
  },
  {
    system_prompt_id: "translate-german",
    name: "Translate to German",
    description: "Translate selected text to German",
    placement_type: "context-menu",
    functionality_id: "translate-text",
    category: "translation",
    sort_order: 30,
    placement_settings: { requiresSelection: true, minSelectionLength: 1 },
    display_config: { icon: "Languages" },
    status: "draft",
    is_active: false,
  },
  {
    system_prompt_id: "translate-persian",
    name: "Translate to Persian",
    description: "Translate selected text to Persian",
    placement_type: "context-menu",
    functionality_id: "translate-text",
    category: "translation",
    sort_order: 40,
    placement_settings: { requiresSelection: true, minSelectionLength: 1 },
    display_config: { icon: "Languages" },
    status: "draft",
    is_active: false,
  },

  // ===== CONTEXT MENU: TEXT FORMATTING =====
  {
    system_prompt_id: "make-shorter",
    name: "Make Shorter",
    description: "Condense text while keeping meaning",
    placement_type: "context-menu",
    functionality_id: "custom",
    category: "formatting",
    subcategory: "length",
    sort_order: 10,
    placement_settings: { requiresSelection: true },
    display_config: { icon: "Minimize2" },
    status: "draft",
    is_active: false,
  },
  {
    system_prompt_id: "make-longer",
    name: "Make Longer",
    description: "Expand text with more detail",
    placement_type: "context-menu",
    functionality_id: "custom",
    category: "formatting",
    subcategory: "length",
    sort_order: 20,
    placement_settings: { requiresSelection: true },
    display_config: { icon: "Maximize2" },
    status: "draft",
    is_active: false,
  },
  {
    system_prompt_id: "simplify-language",
    name: "Simplify Language",
    description: "Make text easier to understand",
    placement_type: "context-menu",
    functionality_id: "custom",
    category: "formatting",
    subcategory: "style",
    sort_order: 30,
    placement_settings: { requiresSelection: true },
    display_config: { icon: "Type" },
    status: "draft",
    is_active: false,
  },

  // ===== CONTEXT MENU: CODE TOOLS =====
  {
    system_prompt_id: "analyze-code-menu",
    name: "Analyze Code",
    description: "Analyze code for improvements",
    placement_type: "context-menu",
    functionality_id: "analyze-code",
    category: "code-tools",
    sort_order: 10,
    placement_settings: { requiresSelection: false },
    display_config: { icon: "Code2" },
    status: "draft",
    is_active: false,
  },
  {
    system_prompt_id: "fix-code-menu",
    name: "Fix Code",
    description: "Fix issues in code",
    placement_type: "context-menu",
    functionality_id: "fix-code",
    category: "code-tools",
    sort_order: 20,
    placement_settings: { requiresSelection: false },
    display_config: { icon: "Wrench" },
    status: "draft",
    is_active: false,
  },
  {
    system_prompt_id: "refactor-code-menu",
    name: "Refactor Code",
    description: "Improve code structure",
    placement_type: "context-menu",
    functionality_id: "refactor-code",
    category: "code-tools",
    sort_order: 30,
    display_config: { icon: "RefreshCw" },
    status: "draft",
    is_active: false,
  },

  // ===== CARDS =====
  {
    system_prompt_id: "content-expander-educational",
    name: "Educational Content Expander",
    description: "Expand on educational concepts with full context",
    placement_type: "card",
    functionality_id: "content-expander-card",
    category: "educational",
    sort_order: 10,
    placement_settings: { allowChat: true, allowInitialMessage: false },
    display_config: { icon: "BookOpen" },
    status: "draft",
    is_active: false,
  },

  // ===== BUTTONS =====
  {
    system_prompt_id: "quick-summarize-button",
    name: "Quick Summarize",
    description: "Quickly summarize content",
    placement_type: "button",
    functionality_id: "summarize-text",
    category: "quick-actions",
    sort_order: 10,
    placement_settings: { variant: "outline", size: "sm" },
    display_config: { icon: "FileText", showIcon: true },
    status: "draft",
    is_active: false,
  },
  {
    system_prompt_id: "quick-explain-button",
    name: "Quick Explain",
    description: "Quickly explain content",
    placement_type: "button",
    functionality_id: "explain-text",
    category: "quick-actions",
    sort_order: 20,
    placement_settings: { variant: "outline", size: "sm" },
    display_config: { icon: "MessageSquare", showIcon: true },
    status: "draft",
    is_active: false,
  },
];

export async function seedSystemPrompts() {
  // Create Supabase client for script.
  // API keys: ONLY sb_secret_*. The legacy JWT-based SUPABASE_SERVICE_ROLE_KEY
  // is DEPRECATED and BANNED in this repo — ESLint will block it.
  // Docs: https://supabase.com/docs/guides/getting-started/api-keys
  // This script performs INSERTs, so it must use the admin/secret key.
  // The anon key would be silently rejected by RLS and produce confusing failures.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!supabaseKey) {
    throw new Error(
      "Missing SUPABASE_SECRET_KEY (admin key required for INSERTs)",
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(
    `🌱 Seeding ${SYSTEM_PROMPT_SEEDS.length} system prompt placeholders...`,
  );

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const seed of SYSTEM_PROMPT_SEEDS) {
    try {
      // Check if already exists
      const { data: existing } = await supabase
        .from("system_prompts")
        .select("id")
        .eq("system_prompt_id", seed.system_prompt_id)
        .single();

      if (existing) {
        console.log(`⏭️  Skipped: ${seed.name} (already exists)`);
        skipped++;
        continue;
      }

      // Create placeholder prompt snapshot (empty until admin assigns a real prompt)
      const promptSnapshot = {
        name: seed.name,
        description: seed.description,
        messages: [],
        settings: {},
        placeholder: true, // Flag to indicate this needs a real prompt
      };

      // Insert
      const { error } = await supabase.from("system_prompts").insert({
        system_prompt_id: seed.system_prompt_id,
        name: seed.name,
        description: seed.description,
        placement_type: seed.placement_type,
        functionality_id: seed.functionality_id,
        category: seed.category,
        subcategory: seed.subcategory,
        sort_order: seed.sort_order,
        placement_settings: seed.placement_settings || {},
        display_config: seed.display_config || {},
        prompt_snapshot: promptSnapshot,
        status: seed.status,
        is_active: seed.is_active,
        version: 1,
      });

      if (error) {
        console.error(`❌ Error creating ${seed.name}:`, error.message);
        errors++;
      } else {
        console.log(
          `✅ Created: ${seed.name} (${seed.placement_type} → ${seed.category}${seed.subcategory ? ` → ${seed.subcategory}` : ""})`,
        );
        created++;
      }
    } catch (error) {
      console.error(`❌ Error processing ${seed.name}:`, error);
      errors++;
    }
  }

  console.log("\n📊 Summary:");
  console.log(`   ✅ Created: ${created}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`\n💡 Next steps:`);
  console.log(
    `   1. Go to /ai/prompts and create prompts with the required variables`,
  );
  console.log(`   2. Click "Make Global System Prompt" on each prompt`);
  console.log(`   3. Match it to one of these placeholders`);
  console.log(`   4. Set is_active = true to enable it`);
}

// Run if called directly
if (require.main === module) {
  seedSystemPrompts()
    .then(() => {
      console.log("\n✨ Seeding complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Seeding failed:", error);
      process.exit(1);
    });
}
