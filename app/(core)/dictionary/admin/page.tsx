// app/(core)/dictionary/admin/page.tsx
//
// Per-feature admin map for the Custom Dictionary system. Renders via the
// platform primitive <FeatureAdminPage> (super-admin gated, utilitarian). The
// Dictionary has no standalone user route — it's embedded in user settings and
// every org/scope edit flow — so this admin map is its connective index across
// the settings tab, the entity-editor sections, the compact selector window,
// the consuming surfaces, the system agents/skills/tool, and the DB layer.
// When you add a dictionary resource anywhere, update this file.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const DICTIONARY_ADMIN_MAP: FeatureAdminMap = {
  name: "Custom Dictionary",
  slug: "dictionary",
  description:
    "Terminology + pronunciation entries attachable at four owner levels (user / organization / scope type / scope). Improves transcription accuracy (Whisper keyterm biasing + cleanup-agent context) and speech playback (TTS pronunciation). Merged + de-duplicated at use time (most-specific level wins). Managed from user settings and every entity edit flow; consumed automatically by surfaces flagged supports_dictionary.",
  docs: [{ label: "Dictionary FEATURE.md", href: "/features/dictionary/FEATURE.md" }],

  routes: [
    {
      url: "/user-settings/voice.dictionary",
      label: "Personal dictionary (settings tab)",
      description:
        "The user's own dictionary, under Settings → Voice → Dictionary. Full CRUD + import/export + inline-policy override + AI assistant launch.",
      filePath: "features/settings/tabs/DictionaryTab.tsx",
      status: "Live",
    },
    {
      url: "/organizations/[orgId]/settings#dictionary",
      label: "Organization dictionary",
      description:
        "Embedded in OrgManage as the Dictionary section. Any org member can read+edit.",
      filePath: "features/organizations/components/OrgManage.tsx",
      status: "Live",
    },
    {
      url: "/organizations/[orgId]/scopes/[typeId]/edit",
      label: "Scope-type dictionary",
      description: "Dictionary section in the scope-type editor (ScopeTypeEditView).",
      filePath: "features/scope-system/components/ScopeTypeEditView.tsx",
      status: "Live",
    },
    {
      url: "/organizations/[orgId]/scopes/[typeId]/[scopeId]/edit",
      label: "Scope dictionary",
      description: "Dictionary section in the scope editor (ScopeEditView).",
      filePath: "features/scope-system/components/ScopeEditView.tsx",
      status: "Live",
    },
  ],

  windowPanels: [
    {
      overlayId: "dictionarySelectorWindow",
      description:
        "Compact, non-blocking selector for transcription/TTS surfaces. Pick personal + orgs + scope types + scopes; selection persists per user per surface (user_surface_state) and the surface re-resolves automatically.",
      status: "Live",
    },
  ],

  components: [
    {
      name: "DictionaryManager",
      filePath: "features/dictionary/components/DictionaryManager.tsx",
      description:
        "The reusable CRUD surface used at all four levels — table, search, bulk delete, import/export, inline-policy override, AI assistant launch.",
      tier: "internal",
    },
    {
      name: "DictionarySection",
      filePath: "features/dictionary/components/DictionarySection.tsx",
      description: "Collapsible wrapper embedding the manager into entity edit flows.",
      tier: "internal",
    },
    {
      name: "DictionaryContextCard",
      filePath: "features/dictionary/components/DictionaryContextCard.tsx",
      description:
        "Full merged-dictionary view (source-level badges) for the transcript cleanup page.",
      tier: "internal",
    },
    {
      name: "DictionaryIndicatorButton",
      filePath: "features/dictionary/components/DictionaryIndicatorButton.tsx",
      description:
        "Compact icon + active-count badge that opens the selector window. Mounted on transcript studio; reusable on any transcription/TTS surface.",
      tier: "internal",
    },
    {
      name: "DictionaryImportDialog",
      filePath: "features/dictionary/components/DictionaryImportDialog.tsx",
      description: "CSV/JSON import with preview + a downloadable CSV template.",
      tier: "internal",
    },
    {
      name: "InlinePolicyControl",
      filePath: "features/agents/components/context-slots-management/InlinePolicyControl.tsx",
      description:
        "Shared three-mode inline-policy editor (default 200 / custom ceiling / never). Used by both the dictionary manager and the agent context-slot builder.",
      tier: "internal",
    },
  ],

  reduxSlices: [
    {
      name: "dictionary",
      filePath: "features/dictionary/redux/dictionarySlice.ts",
      description:
        "Owners catalogue, per-owner entry cache, and per-surface resolved consumption (entries + sttPrompt + ttsAliases + contextBlock). In-flight dedup + TTL.",
    },
    {
      name: "surfaceUserState",
      filePath: "features/surfaces/user-state/slice.ts",
      description:
        "Generic per-user, per-surface state store (the Level-3 preferences primitive). Holds the dictionary selection per surface; reusable by any feature.",
    },
  ],

  relatedFeatures: [
    {
      name: "Transcripts / Studio / Scribe",
      adminUrl: "/transcripts/admin",
      description:
        "Consuming surfaces. STT keyterm biasing rides the existing Whisper `prompt`; LLM cleanup context is auto-injected server-side when the surface is flagged supports_dictionary.",
    },
    {
      name: "Agents",
      adminUrl: "/agents/admin",
      description:
        "Three builtin agents (Dictionary Assistant, Terminology Curator, Pronunciation Coach) + two skills (dictionary-management, pronunciation-authoring) drive the `dictionary` tool. The inline-policy control is shared with the agent context-slot builder.",
    },
    {
      name: "Podcasts",
      adminUrl: "/podcast/admin",
      description:
        "Podcast generation accepts a resolved dictionary; script agents spell terms correctly and audio agents pronounce them (Gemini via directive, ElevenLabs via text substitution).",
    },
  ],
};

export default function DictionaryAdminPage() {
  return <FeatureAdminPage map={DICTIONARY_ADMIN_MAP} />;
}
