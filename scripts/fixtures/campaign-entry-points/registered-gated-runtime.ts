/**
 * FIXTURE — not real code. What a correct `runtime` entry point looks like:
 * registered, and every path through it asks the switch first. The guard must
 * NOT report this file.
 */
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";

export async function loadCustomEntities(): Promise<string[]> {
    if (!(await UNIFIED_DATA_CAMPAIGN.enabled())) return [];
    return ["would read platform.custom_entity_definition here"];
}
