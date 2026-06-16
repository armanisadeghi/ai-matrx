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
 * The eight system agents that drive the research pipeline. Each role has a
 * canonical "system default" agent — the one the platform ships and the one a
 * user-supplied agent must conform to.
 *
 * Source: `Research System — Agent Setup Guide` (May 2026 edition).
 *
 * NOTE: `suggest` is intentionally NOT keyed under AGENT_CONFIG_KEYS — it's
 * resolved through the module-level `GENERIC_SUGGEST_AGENT_ID` constant on the
 * Python side, not via `rs_topic.agent_config`. We surface it here as a
 * read-only role so users can see the full pipeline at a glance.
 */
export const SYSTEM_AGENT_UUIDS: Record<AgentConfigKey, string> = {
  page_summary_agent_id: "7e021d98-5ea7-4ff1-b295-1c941312439d",
  keyword_synthesis_agent_id: "7294348e-160b-4622-b38c-f6d50e73c1f1",
  research_report_agent_id: "7a90bace-1c2b-4d40-829d-b6d875573324",
  updater_agent_id: "6e8c33ce-6a62-44b3-bc3a-57c9579b9ed2",
  consolidation_agent_id: "3fc601a6-a085-4432-a8d4-de0719aec70e",
  auto_tagger_agent_id: "dee57c6c-bd06-45ee-9a9d-c9d9b4f2cfe5",
  document_assembly_agent_id: "2e081af2-713a-4e1c-85d9-606325c6c80f",
};

export const SUGGEST_AGENT_UUID = "4f802fd1-2132-4347-a598-ef01febbcf2c";

/**
 * The PINNED `agx_version` the server actually runs for each role.
 *
 * CRITICAL: aidream `research/agents.py` pins these via
 * `declare_pinned_agent(version_id=…)` → `AgentRecordSource(is_version=True)`.
 * The server runs the VERSION SNAPSHOT, not the live master row above — and for
 * Tag Consolidation + Auto-Tagger the pinned version is deliberately NOT the
 * master (later master versions were corrupted by a 2026-03-31 batch migration).
 * "Copy & Update" must therefore fork the VERSION (via `agx_duplicate_version`),
 * or the user gets a different/corrupted agent than the one that runs.
 *
 * Keep in lockstep with aidream `research/agents.py`. If a pin changes there,
 * update it here. (Durable follow-up: expose the pin map from the backend so
 * this can't drift.)
 */
export const SYSTEM_AGENT_VERSION_UUIDS: Record<AgentConfigKey, string> = {
  page_summary_agent_id: "17bceb8d-b3dc-4b3b-b860-319d981bb9a0", // v6
  keyword_synthesis_agent_id: "fd13758e-b5e5-4840-8059-b48fe5ff4a2d", // v5
  research_report_agent_id: "faf63fa3-e9de-4ef6-86ab-3315b558e58d", // v2
  updater_agent_id: "bf9c2101-51e6-4d32-a8c9-3ba12ad769d9", // v2
  consolidation_agent_id: "dbe2f6d1-f7d6-4437-a113-815469c2ca36", // v1 (master v2/v3 corrupted)
  auto_tagger_agent_id: "550b8d0e-7d3f-426b-b873-b8d103e7266b", // v4 (master v2/v3 corrupted)
  document_assembly_agent_id: "92cdbe93-3da2-4647-84cf-3bb8f892c4f3", // v5
};

export const SUGGEST_AGENT_VERSION_UUID =
  "f7555ac0-8bb1-4934-a90c-1a59b813c6bf"; // v14

export interface AgentRoleDefinition {
  /** JSONB key in `rs_topic.agent_config`. `null` for system-only roles. */
  configKey: AgentConfigKey | null;
  label: string;
  description: string;
  usedBy: string;
  /** Master agx_agent row — the role's "current" record (may have drifted). */
  systemAgentId: string;
  /** The PINNED agx_version the server runs — what "Copy & Update" must fork. */
  systemVersionId: string;
  icon: LucideIcon;
  /** True when the role can't be overridden via `rs_topic.agent_config`. */
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
export const AGENT_ROLES: AgentRoleDefinition[] = AGENT_CONFIG_KEYS.map(
  (key) => ({
    configKey: key,
    label: AGENT_CONFIG_META[key].label,
    description: AGENT_CONFIG_META[key].description,
    usedBy: AGENT_CONFIG_META[key].usedBy,
    systemAgentId: SYSTEM_AGENT_UUIDS[key],
    systemVersionId: SYSTEM_AGENT_VERSION_UUIDS[key],
    icon: ICONS[key],
    systemOnly: false,
  }),
).concat([
  {
    configKey: null,
    label: "Research Setup Suggest Agent",
    description:
      "Suggests a topic title, description, keywords, and initial insights from a free-form subject input.",
    usedBy: "analysis.py → suggest_research_setup()",
    systemAgentId: SUGGEST_AGENT_UUID,
    systemVersionId: SUGGEST_AGENT_VERSION_UUID,
    icon: Compass,
    systemOnly: true,
  },
]);

/** UUID v4-ish format check — matches the format Supabase RPC expects. */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
