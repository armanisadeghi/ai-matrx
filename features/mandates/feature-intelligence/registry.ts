// features/mandates/feature-intelligence/registry.ts
//
// EVERY FEATURE WITH AN INTELLIGENCE PAGE — the declared places maps, one per
// feature, each kept true by a test that reads its call sites
// (`__tests__/declared-places.test.ts`, plus flashcards' and research's own).
// Pure data: the service, the places resolver and the /intelligence index all
// read it. Add a feature here beside its map.

import { FLASHCARDS_PLACES } from "@/features/flashcards/data/intelligence-places";
import { RESEARCH_PLACES } from "@/features/research/components/intelligence/places";
import { CHAT_PLACES } from "@/features/agents/components/chat/intelligence-places";
import { NOTES_PLACES } from "@/features/notes/intelligence-places";
import { DATA_PLACES } from "@/features/data-tables/intelligence-places";
import { SMS_PLACES } from "@/features/sms/intelligence-places";
import { WAR_ROOM_PLACES } from "@/features/war-room/intelligence-places";
import { SCRAPER_PLACES } from "@/features/scraper/intelligence-places";
import { VOICE_PLACES } from "@/features/voice-agent/intelligence-places";
import { TRANSCRIPT_STUDIO_PLACES } from "@/features/transcript-studio/intelligence-places";
import { CRM_PLACES } from "@/features/crm/intelligence-places";
import { CONTENT_PLAN_PLACES } from "@/features/marketing/content-plan/intelligence-places";
import { MARKETING_PLACES } from "@/features/marketing/intelligence-places";
import { PODCAST_PLACES } from "@/features/podcasts/intelligence-places";
import { EDUCATION_PLACES } from "@/features/education/intelligence-places";
import { MASTERWORK_PLACES } from "@/features/masterwork/intelligence-places";
import { COMMERCE_INTAKE_PLACES } from "@/features/commerce-intake/intelligence-places";
import { PRODUCT_CAPTURE_PLACES } from "@/features/product-capture/intelligence-places";
import { PERSONAL_STAFF_PLACES } from "@/features/personal-staff/intelligence-places";
import { TASKS_PLACES } from "@/features/tasks/intelligence-places";
import { PROJECTS_PLACES } from "@/features/projects/intelligence-places";
import { SURFACES_CLIENT_PLACES } from "@/features/surfaces/intelligence-places";
import { MANDATES_PLACES } from "@/features/bindings/intelligence-places";
import { CONTENT_IR_PLACES } from "@/features/content-ir/intelligence-places";
import { AGENT_APPS_PLACES } from "@/features/agent-apps/intelligence-places";
import { CODE_EDITOR_PLACES } from "@/features/code-editor/intelligence-places";
import { MESSAGING_PLACES } from "@/features/messaging/intelligence-places";
import { CONVERSATION_PLACES } from "@/features/ai-work/intelligence-places";
import { AMBIENT_PLACES } from "@/features/agents/components/ambient-assistant/intelligence-places";
import { ALCHEMY_PLACES } from "@/components/agent-copy/intelligence-places";
import { DICTIONARY_PLACES } from "@/features/dictionary/intelligence-places";
import { TOOL_VIZ_PLACES } from "@/features/tool-call-visualization/intelligence-places";
import { ORCHESTRAS_PLACES } from "@/features/agents/orchestras/intelligence-places";
import { WORKFLOW_PLACES } from "@/features/workflow-runtime/intelligence-places";
import { GROWTH_LOOP_PLACES } from "@/features/growth-loop/intelligence-places";
import { MEDIA_PLACES } from "@/features/education/onboard/intelligence-places";
import { RAG_PLACES } from "@/features/rag/intelligence-places";
import { KNOWLEDGE_PLACES } from "@/features/knowledge/intelligence-places";
import { PDF_PLACES } from "@/features/pdf-extractor/intelligence-places";
import { VISION_INTERVIEW_PLACES } from "@/features/vision-interview/intelligence-places";
import { HINDSIGHT_PLACES } from "@/features/hindsight/intelligence-places";
import { MEET_PLACES } from "@/features/meet/intelligence-places";
import { CODING_SESSION_PLACES } from "@/features/ai-work/conversations/intelligence-places";
import { PROOF_RUNS_PLACES } from "@/features/proof-runs/intelligence-places";
import { DISTILLATION_PLACES } from "@/features/masterwork/distillation-intelligence-places";
import type { FeaturePlaces } from "./types";

export const DECLARED_FEATURES: readonly FeaturePlaces[] = [
  CHAT_PLACES,
  NOTES_PLACES,
  RESEARCH_PLACES,
  FLASHCARDS_PLACES,
  EDUCATION_PLACES,
  PODCAST_PLACES,
  MARKETING_PLACES,
  CONTENT_PLAN_PLACES,
  DATA_PLACES,
  CRM_PLACES,
  SMS_PLACES,
  WAR_ROOM_PLACES,
  SCRAPER_PLACES,
  VOICE_PLACES,
  TRANSCRIPT_STUDIO_PLACES,
  MASTERWORK_PLACES,
  COMMERCE_INTAKE_PLACES,
  PRODUCT_CAPTURE_PLACES,
  PERSONAL_STAFF_PLACES,
  TASKS_PLACES,
  PROJECTS_PLACES,
  SURFACES_CLIENT_PLACES,
  MANDATES_PLACES,
  CONTENT_IR_PLACES,
  AGENT_APPS_PLACES,
  CODE_EDITOR_PLACES,
  MESSAGING_PLACES,
  CONVERSATION_PLACES,
  AMBIENT_PLACES,
  ALCHEMY_PLACES,
  DICTIONARY_PLACES,
  TOOL_VIZ_PLACES,
  ORCHESTRAS_PLACES,
  WORKFLOW_PLACES,
  GROWTH_LOOP_PLACES,
  MEDIA_PLACES,
  RAG_PLACES,
  KNOWLEDGE_PLACES,
  PDF_PLACES,
  VISION_INTERVIEW_PLACES,
  HINDSIGHT_PLACES,
  MEET_PLACES,
  CODING_SESSION_PLACES,
  PROOF_RUNS_PLACES,
  DISTILLATION_PLACES,
];

export function declaredPlacesFor(feature: string): FeaturePlaces | null {
  return DECLARED_FEATURES.find((entry) => entry.feature === feature) ?? null;
}

/** The key prefixes a feature's page covers — its own, plus any it declares. */
export function featurePrefixes(feature: string): readonly string[] {
  const declared = declaredPlacesFor(feature);
  return [feature, ...(declared?.extraPrefixes ?? [])];
}

/** The feature whose page shows this key (an extra prefix maps to its owner). */
export function featureForKey(mandateKey: string): string {
  const dot = mandateKey.indexOf(".");
  const prefix = dot === -1 ? mandateKey : mandateKey.slice(0, dot);
  const owner = DECLARED_FEATURES.find((entry) => entry.extraPrefixes?.includes(prefix));
  return owner?.feature ?? prefix;
}

/** The page a feature slug lands on — an extra prefix (`seo`) opens its owner (`marketing`). */
export function canonicalFeature(feature: string): string {
  return featureForKey(`${feature}.`);
}

/**
 * Display names for key prefixes that have jobs but no places map yet. A raw
 * prefix ("ner", "kg", "rag_kinds") is never shown to a person; a prefix
 * missing here falls back to its humanized form — add it here when it shows up.
 */
const UNDECLARED_FEATURE_LABELS: Readonly<Record<string, string>> = {
  shortcut: "Shortcuts",
  app: "Agent apps",
  local: "Matrx Local",
  ner: "Entity extraction",
  masterworks: "Masterworks",
  cms: "Website content",
  iteration: "Iteration",
  extend: "Browser extension",
  google: "Google",
  image_pipeline: "Image pipeline",
  transcripts: "Transcripts",
  audio: "Audio",
  evaluators: "Evaluators",
  kg: "Knowledge graph",
  mandate_outcome: "Job outcomes",
  memory: "Memory",
  observability: "Observability",
  agent_factory: "Agent factory",
  content_gate: "Content gate",
  docproc: "Document processing",
  feedback: "Feedback",
  foundry: "Foundry",
  human_decisions: "Human decisions",
  image: "Images",
  mandate: "Mandates",
  media_catalog: "Media catalog",
  mermaid: "Mermaid diagrams",
  orchestration: "Orchestration",
  patrol: "Patrol",
  purpose: "Purpose",
  rag_kinds: "Knowledge base types",
  records: "Records",
  tools: "Tools",
  web: "Web",
};

/**
 * Prefixes that exist only for tests and parity fixtures (`zzz.*`,
 * `wfparity.*`, `test_*`). Hidden from non-admins; admins see them labeled.
 */
export function isFixtureFeature(feature: string): boolean {
  return (
    feature === "zzz" ||
    feature === "wfparity" ||
    /^(test|fixture|e2e)(_|$)/.test(feature)
  );
}

function humanizeFeature(feature: string): string {
  const words = feature.split(/[_-]+/).filter(Boolean).join(" ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : feature;
}

/** The name a person reads for a feature slug — never the raw prefix. */
export function featureDisplayName(feature: string): string {
  const declared = declaredPlacesFor(feature)?.label;
  if (declared) return declared;
  const known = UNDECLARED_FEATURE_LABELS[feature];
  if (known) return known;
  if (isFixtureFeature(feature)) return `Test fixture (${feature})`;
  return humanizeFeature(feature);
}
