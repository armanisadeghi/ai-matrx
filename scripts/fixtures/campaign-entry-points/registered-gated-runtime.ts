/**
 * FIXTURE — not real code. What a correct `runtime` entry point looks like: it imports a
 * campaign module and is on the register. The guard must NOT report this file. (Until
 * 2026-10-03 it also had to call the store switch; the store is never off, so no switch exists.)
 */
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";

export async function loadCustomEntities(): Promise<string[]> {
    void UNIFIED_DATA_CAMPAIGN.FEATURE;
    return ["would read platform.custom_entity_definition here"];
}
