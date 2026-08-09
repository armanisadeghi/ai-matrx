import {
  FileText,
  Layers,
  BookMarked,
  RefreshCw,
  Combine,
  Tag,
  FileStack,
  Compass,
  type LucideIcon,
} from "lucide-react";
import { AGENT_CONFIG_KEYS, AGENT_CONFIG_META } from "../../admin/types";
import type { AgentConfigKey } from "../../admin/types";

/**
 * The system agents that drive the research pipeline, one AGENT SLOT per
 * role. The system default (master agent + pinned version) is DB-truth on
 * `agent.slot_definition` — repin from /administration/agents/slots — and is
 * fetched at render time via `useResearchAgentRoles`, so this file can never
 * drift from what the server actually runs (the pre-slot hardcoded UUID maps
 * here drifted on all 7 roles).
 *
 * NOTE: `page_summary_agent_id` maps to `research.structured_page_summary` —
 * the structured agent RETIRED the legacy page-summary agent; the override
 * key kept its historical name but the stage it feeds is the structured one.
 *
 * `suggest` is intentionally NOT keyed under AGENT_CONFIG_KEYS — it's
 * pre-topic (no `rs_topic.agent_config` entry) and surfaced read-only.
 */
export const ROLE_SLOT_KEYS: Record<AgentConfigKey, string> = {
  page_summary_agent_id: "research.structured_page_summary",
  keyword_synthesis_agent_id: "research.keyword_synthesis",
  research_report_agent_id: "research.report",
  updater_agent_id: "research.report_updater",
  consolidation_agent_id: "research.tag_consolidation",
  auto_tagger_agent_id: "research.auto_tagger",
  document_assembly_agent_id: "research.document_assembly",
};

export const SUGGEST_SLOT_KEY = "research.suggest_setup";

export interface AgentRoleDefinition {
  /** JSONB key in `rs_topic.agent_config`. `null` for system-only roles. */
  configKey: AgentConfigKey | null;
  /** The agent slot backing this role (`agent.slot_definition.slot_key`). */
  slotKey: string;
  label: string;
  description: string;
  usedBy: string;
  /** Master agx_agent row of the system default (DB-truth from the slot). */
  systemAgentId: string;
  /**
   * The PINNED agx_version the server runs — what "Copy & Update" must fork.
   * `null` for FLOATING slots (the server runs the latest master version, so
   * forking the master row IS forking what runs).
   */
  systemVersionId: string | null;
  icon: LucideIcon;
  /** True when the role can't be overridden via `rs_topic.agent_config`. */
  systemOnly: boolean;
}

/** Static role metadata; ids come from the slot registry at render time. */
export interface AgentRoleTemplate {
  configKey: AgentConfigKey | null;
  slotKey: string;
  label: string;
  description: string;
  usedBy: string;
  icon: LucideIcon;
  systemOnly: boolean;
}

const ICONS: Record<AgentConfigKey, LucideIcon> = {
  page_summary_agent_id: FileText,
  keyword_synthesis_agent_id: Layers,
  research_report_agent_id: BookMarked,
  updater_agent_id: RefreshCw,
  consolidation_agent_id: Combine,
  auto_tagger_agent_id: Tag,
  document_assembly_agent_id: FileStack,
};

/** All agent roles, in pipeline order, with their UI metadata. */
export const AGENT_ROLE_TEMPLATES: AgentRoleTemplate[] = [
  ...AGENT_CONFIG_KEYS.map((key) => ({
    configKey: key,
    slotKey: ROLE_SLOT_KEYS[key],
    label: AGENT_CONFIG_META[key].label,
    description: AGENT_CONFIG_META[key].description,
    usedBy: AGENT_CONFIG_META[key].usedBy,
    icon: ICONS[key],
    systemOnly: false,
  })),
  {
    configKey: null,
    slotKey: SUGGEST_SLOT_KEY,
    label: "Research Setup Suggest Agent",
    description:
      "Suggests a topic title, description, keywords, and initial insights from a free-form subject input.",
    usedBy: "analysis.py → suggest_research_setup()",
    icon: Compass,
    systemOnly: true,
  },
];

/** UUID v4-ish format check — matches the format Supabase RPC expects. */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
